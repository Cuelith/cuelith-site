// Copia nel sito le schermate fatte dal programma vero, in italiano e in inglese.
// Prima, nel repo affiancato cuelith-core: `pnpm build` e `pnpm -C e2e run site:shots`.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.resolve(root, "../cuelith-core/e2e/screenshots/site");
const wanted = ["regia", "uscita-sala", "uscita-palco", "band", "telecomando", "risorse"];
for (const sub of ["", "en"]) {
  const source = path.join(from, sub);
  if (!existsSync(source)) {
    console.error(`Mancano le schermate in ${source}`);
    process.exit(1);
  }
  const target = path.join(root, "src", "assets", "shots", sub);
  mkdirSync(target, { recursive: true });
  for (const name of wanted) {
    cpSync(path.join(source, `${name}.png`), path.join(target, `${name}.png`));
  }
}
console.log(`copiate ${String(wanted.length)} schermate per lingua (italiano e inglese)`);
