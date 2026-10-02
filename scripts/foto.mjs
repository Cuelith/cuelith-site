// Fotografa il sito servito in locale (pnpm dev) a pezzi, per controllarlo a
// occhio a ogni larghezza: usa il browser di prova del repo affiancato
// cuelith-core (e2e/browser), cosi' qui non serve installare nulla.
//   node scripts/foto.mjs <indirizzo> <cartella> <larghezza> <altezza> <prefisso> [passo]
// "passo" e' la frazione di schermo tra una foto e l'altra (predefinito 0.85):
// con passi piccoli si vedono gli elementi a meta' del loro movimento.
import { mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const e2e = path.resolve(root, "../cuelith-core/e2e");
const { _electron: electron } = createRequire(path.join(e2e, "package.json"))("@playwright/test");
const electronPath = createRequire(path.resolve(e2e, "../apps/desktop/package.json"))("electron");

const [url, out, width, height, prefix, step = "0.85"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE"),
);
const app = await electron.launch({
  executablePath: electronPath,
  args: [path.join(e2e, "browser")],
  env: {
    ...env,
    CUELITH_BROWSER_PROFILE: mkdtempSync(path.join(os.tmpdir(), "cuelith-sito-")),
    CUELITH_BROWSER_URL: url,
    CUELITH_BROWSER_SIZE: `${width}x${height}`,
  },
});
const page = await app.firstWindow();
const problems = [];
page.on("console", (message) => message.type() === "error" && problems.push(message.text()));
page.on("pageerror", (error) => problems.push(error.message));
await page.waitForLoadState("load");
await page.waitForTimeout(1900);

const measure = () =>
  page.evaluate(() => ({
    total: document.documentElement.scrollHeight,
    view: window.innerHeight,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
/** Elementi animati dentro lo schermo ma non del tutto visibili (in movimento). */
const moving = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("[data-reveal]")].filter((el) => {
        const box = el.getBoundingClientRect();
        const shown = Number(getComputedStyle(el).getPropertyValue("--r") || "1");
        return box.bottom > 80 && box.top < window.innerHeight - 4 && shown < 0.999;
      }).length,
  );

const { total, view, overflow } = await measure();
const atTop = await moving();
let index = 0;
for (let y = 0; y < total; y += Math.round(view * Number(step))) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(out, `${prefix}-${String(index++).padStart(2, "0")}.png`),
  });
}
await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
await page.waitForTimeout(700);
const atBottom = await moving();
// E ritorno: risalendo, in cima tutto deve essere di nuovo al suo posto.
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await page.waitForTimeout(700);
const backAtTop = await moving();
await page.screenshot({ path: path.join(out, `${prefix}-ritorno.png`) });
console.log(
  JSON.stringify({ total, view, parts: index, overflow, atTop, atBottom, backAtTop, problems }),
);
await app.close();
