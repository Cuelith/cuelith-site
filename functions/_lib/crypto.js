// Funzioni di crittografia condivise dalle funzioni del sito: base64url, SHA-256
// e firme Ed25519 con WebCrypto (la stessa interfaccia in Cloudflare e in Node).

export const b64uEncode = (bytes) => {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const b64uDecode = (text) => {
  const base = text.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base + "=".repeat((4 - (base.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const encoder = new TextEncoder();

export async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Testo firmato dall'autore per ogni pacchetto: identico a
 * packageSignatureMessage di @cuelith/protocol (la prova con l'SDK affiancato
 * lo verifica). Lega la firma a id, versione e impronta.
 */
export const packageSignatureMessage = (id, version, sha256) =>
  ["cuelith-package-v1", id, version, sha256].join("\n");

/** Verifica una firma Ed25519: chiave pubblica e firma in base64url, messaggio in testo. */
export async function verifyEd25519(publicKey, message, signature) {
  try {
    const key = await crypto.subtle.importKey("raw", b64uDecode(publicKey), "Ed25519", false, [
      "verify",
    ]);
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      b64uDecode(signature),
      encoder.encode(message),
    );
  } catch {
    return false;
  }
}

/** Firma un testo con una chiave privata Ed25519 (PKCS8 in base64): restituisce la firma in base64url. */
export async function signEd25519(privateKeyPkcs8, message) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(privateKeyPkcs8), (c) => c.charCodeAt(0)),
    "Ed25519",
    false,
    ["sign"],
  );
  return b64uEncode(
    new Uint8Array(await crypto.subtle.sign("Ed25519", key, encoder.encode(message))),
  );
}

/** Confronto di testi in tempo costante rispetto al contenuto. */
export function sameText(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
