// Mostra la pagina del marketplace con due plugin a pagamento finti (uno
// acquistabile, uno no), per vedere schede, filtri e spiegazione dell'acquisto
// prima che esista un plugin a pagamento vero. Serve dist/ gia' costruita
// (pnpm build); scrive in una cartella temporanea, mai in dist/.
//   pnpm preview:paid      poi apri http://127.0.0.1:8799/marketplace/ (e /en/marketplace/)
// Il pulsante "Acquista" qui non porta da nessuna parte: l'indirizzo del negozio
// lo risolve la funzione del sito, che in questa anteprima non c'e'.
import {
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(path.join(root, "dist", "marketplace", "index.html"))) {
  console.error("Manca dist/: esegui prima pnpm build.");
  process.exit(1);
}
const demo = mkdtempSync(path.join(os.tmpdir(), "cuelith-anteprima-"));
cpSync(path.join(root, "dist"), demo, { recursive: true });

const { renderMarketplace } = await import(
  pathToFileURL(path.join(root, "src", "market.mjs")).href
);
const { document } = await import(pathToFileURL(path.join(root, "src", "page.mjs")).href);
const json = (file) => JSON.parse(readFileSync(path.join(root, "src", file), "utf8"));
const snapshot = json("data/snapshot.json");
const catalog = json("data/plugins.json");

const paid = {
  id: "acme.lyrics-pro",
  name: "Lyrics Pro",
  description: "Testi avanzati con più stili, transizioni e un archivio di temi.",
  family: "function",
  verified: false,
  publisher: "Acme Studio",
  license: "Proprietaria (EULA)",
  access: "paid",
  price: "9 €",
  buyable: true,
  version: "1.2.0",
  published: "2026-10-05T10:00:00.000Z",
  permissions: ["network:api.acme.example"],
};
const modules = [
  ...snapshot.modules,
  paid,
  { ...paid, id: "acme.other", name: "Plugin senza negozio", price: "5 €", buyable: false },
];
const assets = {
  logo: "/assets/cuelith-logo.png",
  icon: "/assets/cuelith-icon.svg",
  styles: '<link rel="stylesheet" href="/assets/site.css">',
  script: '<script src="/assets/market.js" defer></script>',
};
for (const lang of ["it", "en"]) {
  const content = json(`content/${lang}.json`);
  const html = document(
    renderMarketplace({
      content,
      modules,
      catalog,
      assets: { ...assets, social: `/assets/social-${lang}.jpg` },
    }),
    lang,
  );
  const dir = path.join(demo, content.marketplace.path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.html"), html);
}

const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
};
http
  .createServer((request, response) => {
    let file = path.join(demo, decodeURIComponent(request.url.split("?")[0]));
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!file.startsWith(demo) || !existsSync(file)) {
      response.writeHead(404);
      response.end("404");
      return;
    }
    response.writeHead(200, {
      "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
    });
    createReadStream(file).pipe(response);
  })
  .listen(8799, "127.0.0.1", () => {
    console.log(
      "Anteprima su http://127.0.0.1:8799/marketplace/ e http://127.0.0.1:8799/en/marketplace/ (Ctrl+C per chiudere)",
    );
  });
