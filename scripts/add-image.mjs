/**
 * Put an image on the site.
 *
 *   npm run image -- ~/Desktop/screenshot.png
 *   npm run image -- shot.png --name=miura-fold-detail --title="The fold, up close"
 *   npm run image -- *.jpg
 *
 * Uploads to R2, records the intrinsic size so the article does not reflow as
 * it loads, and prints the shortcode line to paste. Nothing is resized or
 * re-encoded here — Cloudflare transforms from the original at the edge, on
 * first request, so one upload serves every screen.
 *
 * R2 speaks the S3 API, so this is the same SDK pointed at a different
 * endpoint with `region: "auto"`.
 *
 * Credentials come from the environment and are never stored in the repo:
 *
 *   export R2_ACCESS_KEY_ID=...
 *   export R2_SECRET_ACCESS_KEY=...
 *
 * Put them in ~/.zshenv, not ~/.zshrc — zsh only reads .zshrc for interactive
 * shells, so anything in there is invisible to tooling.
 *
 * The 83 images already on S3 stay where they are and keep working; this is
 * only for new ones.
 *
 * Uploads are marked immutable, which is right for content that never changes
 * under a given name — but it means replacing an image at an existing key
 * would otherwise stay invisible behind the edge cache forever. `--force`
 * purges the URL it overwrote, when the deploy token happens to be available.
 */
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "aa013509bb961ffe11eae498fb5b1252";
const BUCKET = "aenism-media";
const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

/**
 * The bucket's custom domain. A subdomain of the site's own zone, which is
 * what lets Cloudflare transform these images without an allowlist entry —
 * same-zone sources are permitted by default.
 */
const PUBLIC_BASE = "https://media.aenism.com";

const SIZES_FILE = "src/data/image-sizes.json";

const TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/* ── dimension readers: the same parsers measure-images.mjs uses ─────────── */

function pngSize(b) {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

function gifSize(b) {
  if (b.length < 10 || b.toString("ascii", 0, 3) !== "GIF") return null;
  return [b.readUInt16LE(6), b.readUInt16LE(8)];
}

function jpegSize(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = b.readUInt16BE(i + 2);
    const isSOF =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}

function webpSize(b) {
  if (b.length < 30 || b.toString("ascii", 0, 4) !== "RIFF") return null;
  if (b.toString("ascii", 8, 12) !== "WEBP") return null;
  const fmt = b.toString("ascii", 12, 16);
  if (fmt === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (fmt === "VP8L") {
    const n = b.readUInt32LE(21);
    return [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1];
  }
  if (fmt === "VP8X") {
    return [
      1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
      1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
    ];
  }
  return null;
}

const measure = (buf) => pngSize(buf) ?? gifSize(buf) ?? jpegSize(buf) ?? webpSize(buf);

/* ── helpers ─────────────────────────────────────────────────────────────── */

/**
 * Keys are flat and lowercase in this bucket, and they end up in public URLs —
 * so no spaces, no punctuation to percent-encode, nothing that reads badly in
 * a link.
 */
function keyFor(file, override) {
  const ext = path.extname(file).toLowerCase();
  const stem = override ?? path.basename(file, path.extname(file));
  const slug = stem
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "image"}${ext}`;
}

function parseArgs(argv) {
  const flags = {};
  const files = [];
  for (const arg of argv) {
    const m = arg.match(/^--([a-z]+)(?:=(.*))?$/i);
    if (m) flags[m[1].toLowerCase()] = m[2] ?? true;
    else files.push(arg);
  }
  return { files, flags };
}

const esc = (s) => String(s).replace(/"/g, "&quot;");
const kb = (n) => (n / 1024).toFixed(0);

/**
 * Drop a replaced URL from Cloudflare's cache. Uses the same credentials the
 * deploy script does; without them the upload still succeeds and says what did
 * not happen, because a missing purge is a stale image rather than a lost one.
 */
async function purge(urls) {
  const zone = process.env.CLOUDFLARE_ZONE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!zone || !token) {
    console.log("\n  Replaced an existing image, but CLOUDFLARE_ZONE_ID /");
    console.log("  CLOUDFLARE_API_TOKEN are not set, so the edge still has the old one.");
    console.log("  Purge it by hand, or the change will not show.");
    return;
  }
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ files: urls }),
      },
    );
    const body = await res.json();
    console.log(body.success ? "\n  Purged the replaced URL from the edge." : `\n  Purge rejected: ${JSON.stringify(body.errors)}`);
  } catch (err) {
    console.log(`\n  Purge failed (${err.message}); the edge still has the old image.`);
  }
}

/* ── main ────────────────────────────────────────────────────────────────── */

async function main() {
  const { files, flags } = parseArgs(process.argv.slice(2));

  if (!files.length) {
    console.error('  Usage: npm run image -- <file…> [--name=slug] [--title="Caption"] [--force]');
    process.exit(1);
  }
  if (flags.name && files.length > 1) {
    console.error("  --name only makes sense with a single file.");
    process.exit(1);
  }
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    console.error("  R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not set.");
    console.error("  Add them to ~/.zshenv — .zshrc is not read by non-interactive shells.");
    console.error("  Create the token under R2 > Account Details > Manage API Tokens,");
    console.error(`  scoped to "Object Read & Write" on ${BUCKET} only.`);
    process.exit(1);
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: ENDPOINT,
    credentials: { accessKeyId, secretAccessKey },
    // R2 rejects the trailing-checksum framing the SDK adds by default.
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  const sizes = JSON.parse(await readFile(SIZES_FILE, "utf8"));
  const lines = [];
  const purged = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const contentType = TYPES[ext];
    if (!contentType) {
      console.error(`  ${file}: unsupported type ${ext || "(none)"} — skipped`);
      continue;
    }

    const body = await readFile(file);
    const dims = measure(body);
    if (!dims) {
      console.error(`  ${file}: could not read dimensions — skipped`);
      continue;
    }

    const key = keyFor(file, flags.name);
    const url = `${PUBLIC_BASE}/${key}`;

    // Keys are flat, so a collision silently replaces someone else's image.
    let replaced = false;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
      replaced = true;
    } catch (err) {
      if (err?.$metadata?.httpStatusCode !== 404 && err?.name !== "NotFound") throw err;
    }
    if (replaced && !flags.force) {
      console.error(`  ${key} already exists. Use --name= to rename, or --force to replace.`);
      continue;
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Cloudflare caches the transformed variants; this is for the original,
        // which is only ever fetched by the transformation pipeline itself.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    sizes[url] = dims;
    const { size } = await stat(file);
    console.log(`  ${key}  ${dims[0]}x${dims[1]}  ${kb(size)} KB`);

    if (replaced) purged.push(url);

    const title = typeof flags.title === "string" ? flags.title : "";
    lines.push(`{{%figure src="${url}" title="${esc(title)}"%}}`);
  }

  if (!lines.length) process.exit(1);

  await writeFile(SIZES_FILE, JSON.stringify(sizes, null, 0) + "\n");

  console.log("\n  Paste into the post:\n");
  for (const line of lines) console.log(`    ${line}`);
  console.log("\n  Dimensions recorded. No need to run images:measure.");

  if (purged.length) await purge(purged);
}

await main();
