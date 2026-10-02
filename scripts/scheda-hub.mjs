// L'immagine di Cuelith per la scheda sull'hub dei progetti (lzrhive.it): 16:9,
// il logo al centro su fondo pieno dello stesso colore del logo (che ha il suo
// sfondo e non e' trasparente), cosi' non si vede nessun riquadro. Nessun testo:
// vale per ogni lingua.
//   node scripts/scheda-hub.mjs [file di uscita]
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] ?? path.resolve(root, "../cuelith-core/brand/lzrhive-card.jpg");
const source = path.join(root, "src/assets/cuelith-logo.png");

// Il colore di fondo e' quello dell'angolo del logo.
const { data } = await sharp(source)
  .extract({ left: 2, top: 2, width: 1, height: 1 })
  .raw()
  .toBuffer({ resolveWithObject: true });
const [r, g, b] = data;
const logo = await sharp(source).resize({ width: 880 }).toBuffer();
const info = await sharp({
  create: { width: 1280, height: 720, channels: 3, background: { r, g, b } },
})
  .composite([{ input: logo, gravity: "center" }])
  .jpeg({ quality: 90 })
  .toFile(out);
console.log(
  `${out}: ${String(info.width)}x${String(info.height)}, ${String(info.size)} byte, fondo ${String(r)},${String(g)},${String(b)}`,
);
