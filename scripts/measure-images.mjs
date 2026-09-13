/**
 * Record the intrinsic size of every remote image the posts reference.
 *
 * Images live on S3, so the build has no way to know their dimensions — which
 * means every <img> ships without width/height and the page reflows as each
 * one arrives. Measuring them here, once, lets the markdown pipeline emit real
 * dimensions and hold the layout still.
 *
 * The result is committed to src/data/image-sizes.json so builds stay offline.
 * Re-run after adding posts:
 *
 *   npm run images:measure
 *
 * Only the first bytes of each file are fetched — enough for the header.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";

const POSTS = "src/content/post";
const OUT = "src/data/image-sizes.json";
const HEAD_BYTES = 65536;
const CONCURRENCY = 8;

/** Both `{{%figure src="…"%}}` and raw <img src="…"> in the markdown. */
const IMAGE_RE =
  /(?:src\s*=\s*")(https?:\/\/[^"]+?\.(?:png|jpe?g|gif|webp))(?:"|\?)/gi;

/**
 * Embeds become facades with the video's own thumbnail as the poster, so those
 * thumbnails need measuring like any other image — and four of this site's
 * videos have since been deleted, taking their thumbnails with them. An entry
 * here is what tells the facade plugin a poster is worth emitting.
 */
const YOUTUBE_RE = /(?:youtube\.com\/embed\/|youtu\.be\/|[?&]v=)([A-Za-z0-9_-]{6,})/gi;
const poster = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

function pngSize(b) {
  if (b.length < 24) return null;
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
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
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = b.readUInt16BE(i + 2);
    const isSOF =
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
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

const measure = (buf) =>
  pngSize(buf) ?? gifSize(buf) ?? jpegSize(buf) ?? webpSize(buf);

async function head(url) {
  const res = await fetch(url, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` } });
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function collectUrls() {
  const files = (await readdir(POSTS)).filter((f) => f.endsWith(".md"));
  const urls = new Set();
  for (const f of files) {
    const text = await readFile(path.join(POSTS, f), "utf8");
    for (const m of text.matchAll(IMAGE_RE)) urls.add(m[1]);
    for (const m of text.matchAll(YOUTUBE_RE)) urls.add(poster(m[1]));
  }
  return [...urls].sort();
}

async function main() {
  const urls = await collectUrls();

  let existing = {};
  try {
    existing = JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    /* first run */
  }

  const force = process.argv.includes("--force");
  const todo = urls.filter((u) => force || !existing[u]);
  console.log(`  ${urls.length} images referenced, ${todo.length} to measure`);

  const sizes = force ? {} : { ...existing };
  const failed = [];
  let done = 0;

  const queue = [...todo];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const url = queue.shift();
        try {
          const dims = measure(await head(url));
          if (dims && dims[0] > 0 && dims[1] > 0) sizes[url] = dims;
          else failed.push([url, "unrecognised header"]);
        } catch (err) {
          failed.push([url, err.message]);
        }
        if (++done % 10 === 0) console.log(`    ${done}/${todo.length}`);
      }
    }),
  );

  // Drop entries for images no longer referenced anywhere.
  const live = new Set(urls);
  for (const key of Object.keys(sizes)) if (!live.has(key)) delete sizes[key];

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(sizes, null, 0) + "\n");

  console.log(`  measured ${Object.keys(sizes).length}/${urls.length}`);
  if (failed.length) {
    console.log(`  ${failed.length} could not be measured:`);
    for (const [u, why] of failed) console.log(`    ${why}  ${u}`);
  }
  console.log(`  -> ${OUT}`);
}

await main();
