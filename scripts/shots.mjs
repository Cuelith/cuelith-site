// Copia nel sito le schermate fatte dal programma vero.
// Prima, nel repo affiancato cuelith-core: `pnpm build` e `pnpm -C e2e run site:shots`.
import { cpSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.resolve(root, "../cuelith-core/e2e/screenshots/site");
if (!existsSync(from)) {
  console.error(`Mancano le schermate in ${from}`);
  process.exit(1);
}
const wanted = ["regia", "uscita-sala", "uscita-palco", "band", "telecomando", "risorse"];
for (const name of wanted) {
  cpSync(path.join(from, `${name}.png`), path.join(root, "src", "assets", "shots", `${name}.png`));
}
console.log(`copiate ${String(wanted.length)} schermate di ${String(readdirSync(from).length)}`);
