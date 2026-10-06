// Costruisce il sito in dist/: due pagine (italiano e inglese) con i dati del
// momento gia' scritti dentro, immagini ridotte, stile e script.
//   node build.mjs            sito completo
//   node build.mjs --single   in piu', un'anteprima in un file solo (dist-single/)
//   node build.mjs --offline  non legge versioni e plugin dalla rete: usa l'ultima copia
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadModules, loadReleases } from "./functions/_lib/sources.js";
import { ADMIN_PATH, renderAdmin } from "./src/admin.mjs";
import { renderMarketplace, renderPrivacy, renderSubmit, renderTerms } from "./src/market.mjs";
import {
  document,
  PAGE_PATHS,
  renderContact,
  renderDownload,
  renderFaq,
  renderFeatures,
  renderPage,
  renderPlugins,
} from "./src/page.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, "src");
const dist = path.join(root, "dist");
const single = process.argv.includes("--single");
const offline = process.argv.includes("--offline");
// Chiave PUBBLICA di Turnstile (il controllo "sei una persona" del modulo di proposta):
// si passa alla costruzione, non e' un segreto. Senza, il modulo non mostra il controllo
// e le proposte non si accettano (vedi MARKETPLACE_SETUP.md).
const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY ?? "";
// Indirizzo email di contatto del progetto (segnalazioni, reclami, privacy): compare nelle
// condizioni e nell'informativa. Si passa alla costruzione, cosi' non sta nel codice.
// Con --production senza indirizzo la costruzione si ferma: non si pubblica senza.
const contactEmail = (process.env.CONTACT_EMAIL ?? "").trim();
if (contactEmail === "") {
  const message =
    "CONTACT_EMAIL non impostata: le condizioni e l'informativa non hanno un indirizzo di contatto.";
  if (process.argv.includes("--production")) {
    console.error("ERRORE: " + message);
    process.exit(1);
  }
  console.warn("Attenzione: " + message);
}
const read = (file) => readFileSync(path.join(src, file), "utf8");
const json = (file) => JSON.parse(read(file));

// ---- dati: versioni e plugin del momento, con una copia per quando la rete manca ----
const snapshotFile = path.join(src, "data", "snapshot.json");
const snapshot = existsSync(snapshotFile) ? JSON.parse(readFileSync(snapshotFile, "utf8")) : {};
const releases = (offline ? undefined : await loadReleases()) ?? snapshot.releases ?? [];
const modules = (offline ? undefined : await loadModules()) ?? snapshot.modules ?? [];
if (!offline && releases.length > 0 && modules.length > 0) {
  writeFileSync(snapshotFile, `${JSON.stringify({ releases, modules }, null, 2)}\n`);
}
console.log(
  `versioni: ${String(releases.length)} · plugin del marketplace: ${String(modules.length)}`,
);

rmSync(dist, { recursive: true, force: true });
mkdirSync(path.join(dist, "assets", "shots"), { recursive: true });
mkdirSync(path.join(dist, "assets", "fonts"), { recursive: true });

// ---- immagini: ogni schermata in due larghezze, WebP, una serie per lingua ----
// Le schermate inglesi (programma in inglese, show in inglese) stanno in shots/en.
const LANGS = ["it", "en"];
const shots = {};
const inline = {};
for (const lang of LANGS) {
  const sub = lang === "it" ? "" : `${lang}/`;
  const shotsDir = path.join(src, "assets", "shots", sub);
  mkdirSync(path.join(dist, "assets", "shots", sub), { recursive: true });
  shots[lang] = {};
  inline[lang] = {};
  for (const file of readdirSync(shotsDir).filter((name) => name.endsWith(".png"))) {
    const name = file.slice(0, -4);
    const meta = await sharp(path.join(shotsDir, file)).metadata();
    const widths = meta.width > 1000 ? [900, 1600] : [Math.min(meta.width, 560)];
    const files = [];
    for (const width of widths.filter((w) => w <= meta.width)) {
      const target = `assets/shots/${sub}${name}-${String(width)}.webp`;
      const data = await sharp(path.join(shotsDir, file))
        .resize({ width })
        .webp({ quality: 82 })
        .toBuffer();
      writeFileSync(path.join(dist, target), data);
      files.push({ src: `/${target}`, width });
      if (width === widths[0]) {
        inline[lang][name] = `data:image/webp;base64,${data.toString("base64")}`;
      }
    }
    shots[lang][name] = { width: meta.width, height: meta.height, files };
  }
  // Immagine per le anteprime dei link (social): la regia, 1200x630.
  await sharp(path.join(shotsDir, "regia.png"))
    .resize({ width: 1200, height: 630, fit: "cover", position: "top" })
    .jpeg({ quality: 84 })
    .toFile(path.join(dist, "assets", `social-${lang}.jpg`));
}

// ---- caratteri, stile, script ----
const FONTS = [
  ["Fraunces", "fraunces-latin-opsz-normal.woff2", "100 900"],
  ["Schibsted Grotesk", "schibsted-grotesk-latin-wght-normal.woff2", "400 900"],
  ["JetBrains Mono", "jetbrains-mono-latin-wght-normal.woff2", "100 800"],
];
const fontFaces = (url) =>
  FONTS.map(
    ([family, file, weight]) =>
      `@font-face{font-family:"${family}";font-style:normal;font-display:swap;font-weight:${weight};src:url(${url(file)}) format("woff2")}`,
  ).join("\n");
for (const [, file] of FONTS) {
  cpSync(path.join(src, "assets", "fonts", file), path.join(dist, "assets", "fonts", file));
}
const css = `${fontFaces((file) => `/assets/fonts/${file}`)}\n${read("styles.css")}`;
// Le funzioni condivise entrano nello script del browser senza "export".
const script = `(() => {\n"use strict";\n${read("shared.js").replace(/^export /gm, "")}\n${read("app.js")}\n})();\n`;
const stamp = (text) => createHash("sha256").update(text).digest("hex").slice(0, 10);
// Script delle pagine del marketplace: stesse funzioni condivise, il controllo
// delle proposte (lo stesso del server) e gli aiuti della pagina.
const marketScript = `(() => {\n"use strict";\n${["shared.js", "submission.js"]
  .map((file) => read(file).replace(/^export /gm, ""))
  .join("\n")}\n${read("market-client.js")}\n})();\n`;
writeFileSync(path.join(dist, "assets", "site.css"), css);
writeFileSync(path.join(dist, "assets", "site.js"), script);
writeFileSync(path.join(dist, "assets", "market.js"), marketScript);
// Pannello del fondatore: uno script suo, senza le funzioni della pagina pubblica.
const adminScript = `(() => {\n"use strict";\n${read("admin-client.js")}\n})();\n`;
writeFileSync(path.join(dist, "assets", "admin.js"), adminScript);
// Piccolo e caricato per primo: decide se le animazioni d'ingresso sono attive.
const flag = read("motion-flag.js");
writeFileSync(path.join(dist, "assets", "motion-flag.js"), flag);
cpSync(path.join(src, "assets", "cuelith-logo.png"), path.join(dist, "assets", "cuelith-logo.png"));
cpSync(path.join(src, "assets", "cuelith-icon.svg"), path.join(dist, "assets", "cuelith-icon.svg"));

// ---- pagine ----
const catalog = json("data/plugins.json");
delete catalog.comment;
const assets = {
  logo: "/assets/cuelith-logo.png",
  icon: "/assets/cuelith-icon.svg",
  styles: `<link rel="preload" href="/assets/fonts/${FONTS[0][1]}" as="font" type="font/woff2" crossorigin>\n<link rel="stylesheet" href="/assets/site.css?v=${stamp(css)}">`,
  flag: `<script src="/assets/motion-flag.js?v=${stamp(flag)}"></script>`,
  script: `<script src="/assets/site.js?v=${stamp(script)}" defer></script>`,
};
// Le pagine disegnate al momento dalle funzioni del sito (la scheda di un plugin) leggono da
// qui lo stile e il resto: i nomi dei file cambiano a ogni costruzione.
writeFileSync(
  path.join(dist, "assets", "manifest.json"),
  JSON.stringify({
    logo: assets.logo,
    icon: assets.icon,
    styles: assets.styles,
    script: "",
    social: Object.fromEntries(LANGS.map((lang) => [lang, `/assets/social-${lang}.jpg`])),
  }),
);
/** Quale pagina (chiave di PAGE_PATHS) produce ogni funzione. */
const pageDirs = new Map([
  [renderFeatures, "features"],
  [renderPlugins, "plugins"],
  [renderDownload, "download"],
  [renderFaq, "faq"],
  [renderContact, "contact"],
]);
for (const lang of LANGS) {
  const content = json(`content/${lang}.json`);
  const html = document(
    renderPage({
      content,
      releases,
      modules,
      catalog,
      shots: shots[lang],
      assets: { ...assets, social: `/assets/social-${lang}.jpg` },
    }),
    lang,
  );
  const dir = path.join(dist, content.path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.html"), html);

  // Le pagine del sito (funzioni, plugin, download, domande, contatti): stesso stile e stesse
  // animazioni della home, con i dati del momento gia' scritti dentro.
  for (const [render, extra] of [
    [renderFeatures, {}],
    [renderPlugins, {}],
    [renderDownload, {}],
    [renderFaq, {}],
    [renderContact, { contact: contactEmail }],
  ]) {
    const page = render({
      content,
      releases,
      modules,
      catalog,
      shots: shots[lang],
      assets: { ...assets, social: `/assets/social-${lang}.jpg` },
      ...extra,
    });
    const target = pageDirs.get(render);
    const dir2 = path.join(dist, PAGE_PATHS[target][lang]);
    mkdirSync(dir2, { recursive: true });
    writeFileSync(path.join(dir2, "index.html"), document(page, lang));
  }

  // Marketplace e proposta di un plugin: pagine semplici, senza animazioni d'ingresso.
  const subAssets = {
    ...assets,
    flag: "",
    social: `/assets/social-${lang}.jpg`,
    script: `<script src="/assets/market.js?v=${stamp(marketScript)}" defer></script>`,
  };
  for (const [render, page, extra] of [
    [renderMarketplace, content.marketplace, { modules, catalog }],
    [renderSubmit, content.submit, { turnstileSiteKey }],
    [renderTerms, content.terms, { contact: contactEmail }],
    [renderPrivacy, content.privacy, { contact: contactEmail }],
  ]) {
    const sub = document(render({ content, assets: subAssets, ...extra }), lang);
    const subDir = path.join(dist, page.path);
    mkdirSync(subDir, { recursive: true });
    writeFileSync(path.join(subDir, "index.html"), sub);
  }
}

// Pannello delle proposte: una pagina sola, in italiano, fuori da ogni elenco.
{
  const { head, body } = renderAdmin({
    assets: {
      ...assets,
      script: `<script src="/assets/admin.js?v=${stamp(adminScript)}" defer></script>`,
    },
  });
  const adminDir = path.join(dist, ADMIN_PATH);
  mkdirSync(adminDir, { recursive: true });
  writeFileSync(path.join(adminDir, "index.html"), document({ head, body }, "it"));
}

// ---- file di servizio ----
const CSP = (extra = {}) =>
  [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self'",
    `script-src 'self'${extra.script ?? ""}`,
    "font-src 'self'",
    "connect-src 'self'",
    ...(extra.frame ? [`frame-src ${extra.frame}`] : []),
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
// Solo con una chiave Turnstile la pagina di proposta ammette il suo script e la sua cornice:
// le regole della pagina sostituiscono quelle generali ("! Intestazione" le toglie prima).
const turnstileRules =
  turnstileSiteKey === ""
    ? ""
    : `${LANGS.map((lang) => json(`content/${lang}.json`).submit.path)
        .map(
          (p) =>
            `${p}*\n  ! Content-Security-Policy\n  Content-Security-Policy: ${CSP({ script: " https://challenges.cloudflare.com", frame: "https://challenges.cloudflare.com" })}\n`,
        )
        .join("")}`;
writeFileSync(
  path.join(dist, "_headers"),
  `/*
  Content-Security-Policy: ${CSP()}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/assets/*
  Cache-Control: public, max-age=604800
${ADMIN_PATH}*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
${turnstileRules}`,
);
writeFileSync(
  path.join(dist, "robots.txt"),
  "User-agent: *\nAllow: /\nSitemap: https://cuelith.lzrhive.it/sitemap.xml\n",
);
writeFileSync(
  path.join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://cuelith.lzrhive.it/</loc></url>
  <url><loc>https://cuelith.lzrhive.it/en/</loc></url>
  <url><loc>https://cuelith.lzrhive.it/marketplace/</loc></url>
  <url><loc>https://cuelith.lzrhive.it/en/marketplace/</loc></url>
  <url><loc>https://cuelith.lzrhive.it/marketplace/submit/</loc></url>
  <url><loc>https://cuelith.lzrhive.it/en/marketplace/submit/</loc></url>
  <url><loc>https://cuelith.lzrhive.it/marketplace/condizioni/</loc></url>
  <url><loc>https://cuelith.lzrhive.it/en/marketplace/terms/</loc></url>
  ${Object.values(PAGE_PATHS)
    .flatMap((paths) => [paths.it, paths.en])
    .map((p) => `<url><loc>https://cuelith.lzrhive.it${p}</loc></url>`)
    .join("\n  ")}
  <url><loc>https://cuelith.lzrhive.it/privacy/</loc></url>
  <url><loc>https://cuelith.lzrhive.it/en/privacy/</loc></url>
</urlset>
`,
);
console.log("dist/ pronto");

// ---- anteprima in un file solo (per farla vedere prima di pubblicare) ----
if (single) {
  const out = path.join(root, "dist-single");
  mkdirSync(out, { recursive: true });
  const b64 = (file) => readFileSync(path.join(src, "assets", file)).toString("base64");
  const inlineShots = (lang) =>
    Object.fromEntries(
      Object.entries(shots[lang]).map(([name, image]) => [
        name,
        { ...image, files: [{ src: inline[lang][name], width: image.files[0].width }] },
      ]),
    );
  const singleCss = `${fontFaces((file) => `data:font/woff2;base64,${b64(`fonts/${file}`)}`)}\n${read("styles.css")}`;
  for (const lang of LANGS) {
    const content = json(`content/${lang}.json`);
    const { head, body } = renderPage({
      content,
      releases,
      modules,
      catalog,
      shots: inlineShots(lang),
      single: true,
      assets: {
        logo: `data:image/png;base64,${b64("cuelith-logo.png")}`,
        icon: "",
        social: "",
        styles: "",
        script: `<script>window.CUELITH_STATIC = true;</script>\n<script>\n${script}</script>`,
      },
    });
    // Per l'anteprima bastano titolo e stile: il resto dell'intestazione vale solo online.
    void head;
    const title = `<title>Bozzetto sito Cuelith${lang === "it" ? "" : " (EN)"}</title>`;
    writeFileSync(
      path.join(out, `cuelith-${lang}.html`),
      `${title}\n<style>\n${singleCss}\n</style>\n<script>\n${flag}</script>\n${body}\n`,
    );
  }
  console.log("dist-single/ pronto");
}
