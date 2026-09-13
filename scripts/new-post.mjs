/**
 * Start a post.
 *
 *   npm run post -- "Good taste"
 *   npm run post -- "Miura-fold map of San Francisco" --topic=work --client="The Open Company"
 *
 * The filename *is* the URL, so it is derived from the title the same way Hugo
 * derived it — get this wrong later and an inbound link dies. New posts start
 * as drafts: visible in `npm run dev`, absent from a production build until
 * you remove the flag.
 */
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR = "src/content/post";
const TOPICS = ["design", "idea", "inspiration", "tech", "work"];

/** Hugo's slugifier, near enough: lowercase, strip punctuation, hyphenate. */
function slugify(title) {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (const arg of argv) {
    const m = arg.match(/^--([a-z]+)(?:=(.*))?$/i);
    if (m) flags[m[1].toLowerCase()] = m[2] ?? true;
    else rest.push(arg);
  }
  return { title: rest.join(" ").trim(), flags };
}

const yaml = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

async function main() {
  const { title, flags } = parseArgs(process.argv.slice(2));

  if (!title) {
    console.error('  Usage: npm run post -- "Your title" [--topic=idea] [--client="Name"]');
    console.error(`  Topics: ${TOPICS.join(", ")}`);
    process.exit(1);
  }

  const topic = String(flags.topic ?? "idea").toLowerCase();
  if (!TOPICS.includes(topic)) {
    console.error(`  Unknown topic "${topic}". Pick one of: ${TOPICS.join(", ")}`);
    console.error("  The topic chooses the typeface the post is set in, so it is a fixed list.");
    process.exit(1);
  }

  const slug = slugify(title);
  if (!slug) {
    console.error("  That title does not reduce to a usable slug.");
    process.exit(1);
  }

  const existing = new Set(await readdir(DIR));
  if (existing.has(`${slug}.md`)) {
    console.error(`  ${slug}.md already exists — pick another title, or edit that one.`);
    process.exit(1);
  }

  // Local date, not UTC: a post written late in the evening should not be
  // dated tomorrow.
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  const front = [
    "---",
    `title: ${yaml(title)}`,
    `description: ""`,
    `date: ${date}`,
    `topic: ${topic}`,
    ...(flags.client ? [`client: ${yaml(flags.client)}`] : []),
    "tags: []",
    "draft: true",
    "---",
    "",
    "",
  ].join("\n");

  const file = path.join(DIR, `${slug}.md`);
  await writeFile(file, front, { flag: "wx" });

  console.log(`  ${file}`);
  console.log(`  will publish at /${slug}/`);
  console.log();
  console.log("  It is a draft: visible in `npm run dev`, absent from a build.");
  console.log("  Remove `draft: true` to publish.");
  console.log("  If you add images, run `npm run images:measure` before building.");
}

await main();
