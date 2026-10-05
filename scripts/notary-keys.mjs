// Crea la coppia di chiavi del Notaio (Ed25519). La chiave PRIVATA firma i
// permessi di licenza: va solo nei segreti di Cloudflare (NOTARY_PRIVATE_KEY),
// mai in un file, in un repository o in una chat. La PUBBLICA, 43 caratteri, e'
// quella che il programma usa per verificare i permessi: si pubblica.
//   node scripts/notary-keys.mjs
// Non scrive nulla su disco: stampa e basta. Se la perdi, ne crei un'altra e
// cambi chiave nel programma (con un nuovo identificativo NOTARY_KEY_ID).
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const secret = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const publicText = publicKey
  .export({ format: "der", type: "spki" })
  .subarray(-32)
  .toString("base64url");

console.log(
  "Chiave PRIVATA del Notaio (segreto NOTARY_PRIVATE_KEY, da incollare in Cloudflare e da nessun'altra parte):",
);
console.log(secret);
console.log("");
console.log(
  "Chiave PUBBLICA del Notaio (si pubblica; la usa il programma per verificare i permessi):",
);
console.log(publicText);
