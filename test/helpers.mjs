// Strumenti comuni delle prove del backend: KV finto, pacchetti veri (zip),
// rete finta a percorsi e chiavi vere (Ed25519 e RSA) generate al volo.
import { strToU8, zipSync } from "fflate";
import { b64uEncode } from "../functions/_lib/crypto.js";

/** Cloudflare KV in memoria, con scadenze e metadati come quello vero (list, get, put, delete). */
export class FakeKv {
  data = new Map();
  puts = [];

  async get(key, type) {
    const item = this.data.get(key);
    if (item === undefined) return null;
    return type === "json" ? JSON.parse(item.value) : item.value;
  }

  async put(key, value, options = {}) {
    this.puts.push({ key, options });
    this.data.set(key, { value, metadata: options.metadata });
  }

  async delete(key) {
    this.data.delete(key);
  }

  async list({ prefix = "", limit = 1000 } = {}) {
    const keys = [...this.data.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .slice(0, limit)
      .map(([name, item]) => ({ name, metadata: item.metadata }));
    return { keys, list_complete: true };
  }
}

export const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4"/></svg>';

export const manifestOf = (extra = {}) => ({
  id: "acme.lyrics-pro",
  name: "Lyrics Pro",
  description: "Testi avanzati.",
  version: "1.2.0",
  publisher: "Acme Studio",
  license: "Proprietaria (EULA)",
  repository: "https://github.com/acme/lyrics-pro",
  family: "function",
  engines: { cuelith: ">=0.2.0 <1.0.0", protocol: "^1.14.0" },
  runtime: { type: "none" },
  icon: "icon.svg",
  permissions: ["storage"],
  ...extra,
});

/** Un pacchetto .cpkg vero: uno zip con il manifest, l'icona e altri file. */
export function makeZip({ manifest = manifestOf(), icon = SVG, extra = {} } = {}) {
  const files = {
    "cuelith-plugin.json": strToU8(JSON.stringify(manifest)),
    "locales/it.json": strToU8("{}"),
  };
  if (icon !== undefined) files["icon.svg"] = strToU8(icon);
  for (const [name, content] of Object.entries(extra)) files[name] = strToU8(content);
  return zipSync(files);
}

/**
 * Rete finta: un elenco di [prova, risposta]. `prova` e' un testo (inizio dell'indirizzo)
 * o una funzione (url, init) -> vero/falso; `risposta` e' una Response o una funzione.
 * Registra ogni richiesta in `calls`.
 */
export function fakeNetwork(routes) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const address = String(url);
    calls.push({ url: address, init });
    for (const [match, reply] of routes) {
      const hit = typeof match === "function" ? match(address, init) : address.startsWith(match);
      if (hit) return typeof reply === "function" ? reply(address, init) : reply.clone();
    }
    return new Response("nessuna risposta prevista per " + address, { status: 599 });
  };
  return { fetcher, calls };
}

export async function ed25519Pair() {
  const pair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  return {
    publicKey: b64uEncode(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))),
    privatePkcs8: Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString(
      "base64",
    ),
    privateKey: pair.privateKey,
  };
}

export async function signPackage(pair, message) {
  const signature = await crypto.subtle.sign(
    "Ed25519",
    pair.privateKey,
    new TextEncoder().encode(message),
  );
  return b64uEncode(new Uint8Array(signature));
}

export const rsaPair = () =>
  crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );

export async function accessToken(pair, { team, aud, email, kid = "k1", exp } = {}) {
  const enc = new TextEncoder();
  const part = (value) => b64uEncode(enc.encode(JSON.stringify(value)));
  const h = part({ alg: "RS256", kid, typ: "JWT" });
  const p = part({
    iss: `https://${team}`,
    aud: [aud],
    email,
    exp: exp ?? Math.floor(Date.now() / 1000) + 600,
  });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    enc.encode(`${h}.${p}`),
  );
  return `${h}.${p}.${b64uEncode(new Uint8Array(signature))}`;
}

export const rsaJwk = async (pair, kid = "k1") => ({
  ...(await crypto.subtle.exportKey("jwk", pair.publicKey)),
  kid,
  alg: "RS256",
  use: "sig",
});
