// Le schermate per il sito vanno fatte quando il computer sta bene: se il
// semaforo delle risorse nella barra non e' verde, la foto non si usa.
//   node scripts/semaforo.mjs   (legge le schermate nel repo affiancato cuelith-core)
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.resolve(root, "../cuelith-core/e2e/screenshots/site");
let ok = true;
for (const sub of ["", "en"]) {
  for (const name of ["regia", "band"]) {
    const file = path.join(from, sub, `${name}.png`);
    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    // Il pallino sta nella barra in alto, a destra, prima dell'ingranaggio.
    let green = 0;
    let amber = 0;
    for (let y = 0; y < Math.round(info.height * 0.05); y++) {
      for (let x = Math.round(info.width * 0.9); x < Math.round(info.width * 0.96); x++) {
        const at = (y * info.width + x) * info.channels;
        const [r, g, b] = [data[at], data[at + 1], data[at + 2]];
        if (g > 150 && b > 130 && r < 110) green++;
        if (r > 190 && g > 130 && g < 200 && b < 110) amber++;
      }
    }
    const state = amber > green ? "GIALLO" : green > 0 ? "verde" : "non trovato";
    if (state !== "verde") ok = false;
    console.log(`${sub || "it"}/${name}: ${state}`);
  }
}
process.exit(ok ? 0 : 1);
