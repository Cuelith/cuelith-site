// L'immagine di Cuelith per la scheda sull'hub dei progetti (lzrhive.it): 16:9,
// sfondo scuro con i due aloni del sito e il logo al centro. Nessun testo, cosi'
// vale per ogni lingua.
//   node scripts/scheda-hub.mjs [file di uscita]
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] ?? path.resolve(root, "../cuelith-core/brand/lzrhive-card.jpg");
const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
<defs>
<radialGradient id="a" cx="0.15" cy="0" r="0.8"><stop offset="0" stop-color="#37d1bf" stop-opacity="0.30"/><stop offset="1" stop-color="#37d1bf" stop-opacity="0"/></radialGradient>
<radialGradient id="b" cx="0.85" cy="0.1" r="0.8"><stop offset="0" stop-color="#ff5b3a" stop-opacity="0.28"/><stop offset="1" stop-color="#ff5b3a" stop-opacity="0"/></radialGradient>
</defs>
<rect width="1280" height="720" fill="#0b0c0e"/><rect width="1280" height="720" fill="url(#a)"/><rect width="1280" height="720" fill="url(#b)"/>
</svg>`);
const logo = await sharp(path.join(root, "src/assets/cuelith-logo.png"))
  .resize({ width: 760 })
  .toBuffer();
const info = await sharp(background)
  .composite([{ input: logo, gravity: "center" }])
  .jpeg({ quality: 88 })
  .toFile(out);
console.log(`${out}: ${String(info.width)}x${String(info.height)}, ${String(info.size)} byte`);
