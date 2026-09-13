/**
 * Lighthouse guard.
 *
 * The site scores 100 across the board today. The point of this script is that
 * it keeps doing so as posts get added — a single unsized image, a stray
 * third-party script or an oversized stylesheet is enough to drop it, and none
 * of those are visible in a diff.
 *
 *   npm run audit              # build, serve, audit, tear down
 *   npm run audit -- --view    # also write HTML reports to lighthouse/
 *
 * Runs Lighthouse's default mobile preset (4x CPU throttle, slow 4G) — the
 * harsher of the two, and the one that matches how most people arrive.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const PREFERRED_PORT = 4399;

/** One per template, not one per page — pages of a kind share their fate. */
const ROUTES = [
  ["homepage", "/"],
  ["paginated", "/page/2/"],
  ["post", "/good-taste/"],
  ["post w/ images", "/miura-fold-map-of-san-francisco/"],
  ["contact", "/contact/"],
];

const THRESHOLDS = {
  performance: 100,
  accessibility: 100,
  "best-practices": 100,
  seo: 100,
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Astro quietly takes the next free port when the preferred one is busy, so
 * trust the URL it prints rather than the one we asked for — otherwise the
 * audit sits waiting on a port nothing is listening on.
 */
function serverUrl(proc, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let log = "";
    const timer = setTimeout(
      () => reject(new Error("preview never announced a URL:\n" + log)),
      timeoutMs,
    );
    const onData = (chunk) => {
      log += chunk;
      const found = log.match(/http:\/\/localhost:(\d+)\//);
      if (found) {
        clearTimeout(timer);
        resolve(`http://localhost:${found[1]}`);
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`preview exited with ${code}:\n` + log));
    });
  });
}

function build() {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["astro", "build"], { stdio: "ignore" });
    proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("build failed"))));
  });
}

async function main() {
  const writeReports = process.argv.includes("--view");

  console.log("  building…");
  await build();

  const server = spawn("npx", ["astro", "preview", "--port", String(PREFERRED_PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless", "--disable-gpu", "--no-first-run"],
  });

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    server.kill("SIGKILL");
    chrome.kill();
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(130); });

  try {
    const base = await serverUrl(server);
    await wait(300);

    const rows = [];
    for (const [name, path] of ROUTES) {
      process.stdout.write(`  auditing ${path} …\r`);
      const result = await lighthouse(base + path, {
        port: chrome.port,
        output: writeReports ? "html" : "json",
        logLevel: "error",
      });
      const { categories, audits } = result.lhr;
      rows.push({
        name,
        scores: Object.fromEntries(
          Object.entries(categories).map(([k, c]) => [
            k, c.score == null ? null : Math.round(c.score * 100),
          ]),
        ),
        lcp: audits["largest-contentful-paint"]?.displayValue ?? "—",
        tbt: audits["total-blocking-time"]?.displayValue ?? "—",
        cls: audits["cumulative-layout-shift"]?.displayValue ?? "—",
      });

      if (writeReports) {
        await mkdir("lighthouse", { recursive: true });
        await writeFile(`lighthouse/${name.replace(/\W+/g, "-")}.html`, result.report);
      }
    }

    const cols = Object.keys(THRESHOLDS);
    const width = Math.max(...rows.map((r) => r.name.length), 5);
    const head = cols.map((c) => (c === "best-practices" ? "bp" : c.slice(0, 4)).padStart(6)).join("");

    console.log(`\n  ${"route".padEnd(width)}${head}${"LCP".padStart(9)}${"TBT".padStart(8)}${"CLS".padStart(7)}`);
    let failed = 0;
    for (const r of rows) {
      const cells = cols.map((c) => String(r.scores[c] ?? "—").padStart(6)).join("");
      const below = cols.filter((c) => (r.scores[c] ?? 0) < THRESHOLDS[c]);
      if (below.length) failed++;
      console.log(
        `  ${r.name.padEnd(width)}${cells}${r.lcp.padStart(9)}${r.tbt.padStart(8)}${r.cls.padStart(7)}` +
        (below.length ? `   ← below target: ${below.join(", ")}` : ""),
      );
    }

    console.log(
      failed
        ? `\n  ${failed}/${rows.length} routes below target.`
        : `\n  ${rows.length}/${rows.length} routes at target.`,
    );
    if (failed) process.exitCode = 1;
    if (writeReports) console.log("  reports written to lighthouse/");
  } finally {
    cleanup();
  }
}

await main();
