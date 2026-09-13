/**
 * Gesture probe — the half of the contract the headless tests cannot see.
 *
 * field.test.ts exercises the solver with no DOM, so it is blind to how a
 * gesture reaches a card. That blindness already cost us once: matter calls
 * preventDefault() on touchstart and touchend, which cancels the click the
 * browser would otherwise synthesise, so every tap on a phone went nowhere
 * while every desktop click worked fine.
 *
 * This drives a real Chrome over the DevTools Protocol and checks the four
 * gesture paths plus the hover pull.
 *
 *   npm run preview          # in another shell
 *   npm run test:gestures
 *
 * Needs Google Chrome installed. Exits non-zero on any failure.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "http://localhost:4321";
const PORT = 9333;
const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "aenism-probe-"));
const chrome = spawn(CHROME, [
  "--headless", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`,
  "--window-size=430,930", BASE,
], { stdio: "ignore" });

const cleanup = () => {
  chrome.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
};
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
let ws;
for (let i = 0; i < 40 && !ws; i++) {
  try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
        ws = l.find(t => t.type === "page")?.webSocketDebuggerUrl; } catch {}
  if (!ws) await wait(400);
}
const sock = new WebSocket(ws);
await new Promise(r => (sock.onopen = r));
let id = 0; const pending = new Map();
sock.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(res => { const n = ++id; pending.set(n, res); sock.send(JSON.stringify({ id: n, method: m, params: p })); });
const ev = async x => (await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Runtime.enable"); await send("Page.enable");
const reset = async (touch) => {
  await send("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: touch ? 5 : 0 });
  await send("Page.navigate", { url: `${BASE}/?g=` + Date.now() });
  await wait(2600);
};
const card = async () => JSON.parse(await ev(`(() => {
  const c = [...document.querySelectorAll('.field .card')].find(c => !c.classList.contains('card--nav'));
  const r = c.getBoundingClientRect();
  return JSON.stringify({ href: c.getAttribute('href'), x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2) });
})()`));
const where = async () => await ev(`location.pathname`);
const tp = (x, y) => [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }];
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });

const results = [];

// 1 — touch tap
await reset(true);
let c = await card();
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(c.x, c.y) });
await wait(90);
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await wait(1000);
results.push(["touch tap", (await where()) === c.href ? "navigated" : "stayed", "navigated"]);

// 2 — touch drag (a fling must not open the card)
await reset(true);
c = await card();
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(c.x, c.y) });
for (let i = 1; i <= 8; i++) {
  await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp(c.x + i * 14, c.y + i * 6) });
  await wait(16);
}
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await wait(1000);
results.push(["touch drag", (await where()) === "/" ? "stayed" : "navigated", "stayed"]);

// 3 — mouse click
await reset(false);
c = await card();
await mouse("mousePressed", c.x, c.y); await wait(70); await mouse("mouseReleased", c.x, c.y);
await wait(1000);
results.push(["mouse click", (await where()) === c.href ? "navigated" : "stayed", "navigated"]);

// 4 — mouse drag
await reset(false);
c = await card();
await mouse("mousePressed", c.x, c.y);
for (let i = 1; i <= 8; i++) { await mouse("mouseMoved", c.x + i * 16, c.y + i * 8); await wait(16); }
await mouse("mouseReleased", c.x + 128, c.y + 64);
await wait(1000);
results.push(["mouse drag", (await where()) === "/" ? "stayed" : "navigated", "stayed"]);

// 5 — hover pull
await reset(false);
c = await card();
await mouse("mouseMoved", c.x, c.y);
await wait(350);
const scaled = await ev(`(() => {
  const el = document.querySelector('.field .card.is-hover');
  return el ? getComputedStyle(el).scale : 'no .is-hover';
})()`);
results.push(["hover scale", String(scaled), "~1.055"]);
const ring = await ev(`(() => {
  const el = document.querySelector('.field .card.is-hover');
  return el ? getComputedStyle(el).boxShadow : 'n/a';
})()`);
results.push(["hover ring", String(ring), "none"]);

const w = Math.max(...results.map(r => r[0].length));
let failed = 0;
for (const [name, got, want] of results) {
  const ok = String(got).startsWith(want.replace("~", "")) || got === want;
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(w)}  got: ${got}   want: ${want}`);
}
console.log(`\n  ${results.length - failed}/${results.length} passed`);
sock.close();
process.exit(failed ? 1 : 0);
