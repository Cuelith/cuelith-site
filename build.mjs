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
import { document, renderPage } from "./src/page.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, "src");
const dist = path.join(root, "dist");
const single = process.argv.includes("--single");
const offline = process.argv.includes("--offline");
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

// ---- immagini: ogni schermata in due larghezze, WebP ----
const shotsDir = path.join(src, "assets", "shots");
const shots = {};
const inline = {};
for (const file of readdirSync(shotsDir).filter((name) => name.endsWith(".png"))) {
  const name = file.slice(0, -4);
  const image = sharp(path.join(shotsDir, file));
  const meta = await image.metadata();
  const widths = meta.width > 1000 ? [900, 1600] : [Math.min(meta.width, 560)];
  const files = [];
  for (const width of widths.filter((w) => w <= meta.width)) {
    const target = `assets/shots/${name}-${String(width)}.webp`;
    const data = await sharp(path.join(shotsDir, file))
      .resize({ width })
      .webp({ quality: 82 })
      .toBuffer();
    writeFileSync(path.join(dist, target), data);
    files.push({ src: `/${target}`, width });
    if (width === widths[0]) inline[name] = `data:image/webp;base64,${data.toString("base64")}`;
  }
  shots[name] = { width: meta.width, height: meta.height, files };
}
// Immagine per le anteprime dei link (social): la regia, 1200x630.
await sharp(path.join(shotsDir, "regia.png"))
  .resize({ width: 1200, height: 630, fit: "cover", position: "top" })
  .jpeg({ quality: 84 })
  .toFile(path.join(dist, "assets", "social.jpg"));

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
writeFileSync(path.join(dist, "assets", "site.css"), css);
writeFileSync(path.join(dist, "assets", "site.js"), script);
cpSync(path.join(src, "assets", "cuelith-logo.png"), path.join(dist, "assets", "cuelith-logo.png"));
cpSync(path.join(src, "assets", "cuelith-icon.svg"), path.join(dist, "assets", "cuelith-icon.svg"));

// ---- pagine ----
const catalog = json("data/plugins.json");
delete catalog.comment;
const assets = {
  logo: "/assets/cuelith-logo.png",
  icon: "/assets/cuelith-icon.svg",
  social: "/assets/social.jpg",
  styles: `<link rel="preload" href="/assets/fonts/${FONTS[0][1]}" as="font" type="font/woff2" crossorigin>\n<link rel="stylesheet" href="/assets/site.css?v=${stamp(css)}">`,
  script: `<script src="/assets/site.js?v=${stamp(script)}" defer></script>`,
};
for (const lang of ["it", "en"]) {
  const content = json(`content/${lang}.json`);
  const html = document(renderPage({ content, releases, modules, catalog, shots, assets }), lang);
  const dir = path.join(dist, content.path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.html"), html);
}

// ---- file di servizio ----
writeFileSync(
  path.join(dist, "_headers"),
  `/*
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/assets/*
  Cache-Control: public, max-age=604800
`,
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
</urlset>
`,
);
console.log("dist/ pronto");

// ---- anteprima in un file solo (per farla vedere prima di pubblicare) ----
if (single) {
  const out = path.join(root, "dist-single");
  mkdirSync(out, { recursive: true });
  const b64 = (file) => readFileSync(path.join(src, "assets", file)).toString("base64");
  const inlineShots = Object.fromEntries(
    Object.entries(shots).map(([name, image]) => [
      name,
      { ...image, files: [{ src: inline[name], width: image.files[0].width }] },
    ]),
  );
  const singleCss = `${fontFaces((file) => `data:font/woff2;base64,${b64(`fonts/${file}`)}`)}\n${read("styles.css")}`;
  for (const lang of ["it", "en"]) {
    const content = json(`content/${lang}.json`);
    const { head, body } = renderPage({
      content,
      releases,
      modules,
      catalog,
      shots: inlineShots,
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
      `${title}\n<style>\n${singleCss}\n</style>\n${body}\n`,
    );
  }
  console.log("dist-single/ pronto");
}
