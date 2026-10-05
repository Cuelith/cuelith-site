// Crea la coppia di chiavi del Notaio (Ed25519). La chiave PRIVATA firma i
// permessi di licenza: va solo nei segreti di Cloudflare (NOTARY_PRIVATE_KEY),
// mai in un repository o in una chat. La PUBBLICA, 43 caratteri, e' quella che
// il programma usa per verificare i permessi: si pubblica.
//
//   node scripts/notary-keys.mjs                  stampa entrambe le chiavi
//   node scripts/notary-keys.mjs --out <file>     scrive la PRIVATA nel file (che non deve
//                                                 esistere) e stampa solo la pubblica
//
// Con --out la chiave privata non compare mai a schermo: si apre il file, si
// copia il testo nel campo NOTARY_PRIVATE_KEY di Cloudflare e poi si cancella il
// file. Il file va fuori da ogni repository. Se perdi la privata, ne crei
// un'altra e cambi chiave nel programma (con un nuovo NOTARY_KEY_ID).
import { generateKeyPairSync } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const at = process.argv.indexOf("--out");
const out = at === -1 ? undefined : process.argv[at + 1];
if (at !== -1 && out === undefined) {
  console.error("Manca il percorso dopo --out.");
  process.exit(1);
}
if (out !== undefined && existsSync(out)) {
  console.error(`${resolve(out)} esiste gia': non lo sovrascrivo.`);
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const secret = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const publicText = publicKey
  .export({ format: "der", type: "spki" })
  .subarray(-32)
  .toString("base64url");

if (out === undefined) {
  console.log(
    "Chiave PRIVATA del Notaio (segreto NOTARY_PRIVATE_KEY, da incollare in Cloudflare e da nessun'altra parte):",
  );
  console.log(secret);
  console.log("");
} else {
  writeFileSync(out, `${secret}\n`, { mode: 0o600, flag: "wx" });
  console.log(
    `Chiave PRIVATA scritta in ${resolve(out)}: incollala in NOTARY_PRIVATE_KEY di Cloudflare e poi cancella il file.`,
  );
}
console.log(
  "Chiave PUBBLICA del Notaio (si pubblica; la usa il programma per verificare i permessi):",
);
console.log(publicText);
