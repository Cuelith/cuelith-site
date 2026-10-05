import { b64uDecode } from "./crypto.js";

// Il pannello del fondatore sta dietro Cloudflare Access (codice via email).
// Access mette in ogni richiesta un token firmato (Cf-Access-Jwt-Assertion);
// qui lo si verifica davvero, senza fidarsi di nient'altro: firma RS256 con le
// chiavi pubbliche del team, scadenza, emittente, "audience" dell'applicazione
// e indirizzo email dell'amministratore. Senza configurazione la risposta e'
// "servizio non disponibile", mai un accesso libero.

const decoder = new TextDecoder();
const json = (part) => JSON.parse(decoder.decode(b64uDecode(part)));

/** Chiavi pubbliche del team, per un po' in memoria: Access le ruota raramente. */
const certCache = new Map();
const CERT_TTL_MS = 10 * 60 * 1000;

async function certKeys(teamDomain, fetcher, now, force) {
  const cached = certCache.get(teamDomain);
  if (!force && cached !== undefined && now - cached.at < CERT_TTL_MS) return cached.keys;
  const response = await fetcher(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error("certs");
  const { keys } = await response.json();
  if (!Array.isArray(keys)) throw new Error("certs");
  certCache.set(teamDomain, { at: now, keys });
  return keys;
}

/** Dimentica le chiavi in memoria (per le prove). */
export const forgetAccessKeys = () => certCache.clear();

/**
 * Verifica il token di Access. Restituisce i dati del token (email compresa) o
 * undefined se qualcosa non torna.
 */
export async function verifyAccessJwt(
  token,
  { teamDomain, aud, fetcher = fetch, now = Date.now() },
) {
  try {
    const [h, p, s, extra] = String(token).split(".");
    if (h === undefined || p === undefined || s === undefined || extra !== undefined)
      return undefined;
    const header = json(h);
    const claims = json(p);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return undefined;

    const seconds = Math.floor(now / 1000);
    if (typeof claims.exp !== "number" || claims.exp <= seconds) return undefined;
    if (typeof claims.nbf === "number" && claims.nbf > seconds + 60) return undefined;
    if (claims.iss !== `https://${teamDomain}`) return undefined;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(aud)) return undefined;

    let keys = await certKeys(teamDomain, fetcher, now, false);
    let jwk = keys.find((k) => k.kid === header.kid);
    if (jwk === undefined) {
      // Una chiave nuova: si rilegge l'elenco una volta sola.
      keys = await certKeys(teamDomain, fetcher, now, true);
      jwk = keys.find((k) => k.kid === header.kid);
    }
    if (jwk === undefined || jwk.kty !== "RSA") return undefined;
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64uDecode(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    return valid ? claims : undefined;
  } catch {
    return undefined;
  }
}

const reply = (status, error) =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Controlla che la richiesta arrivi dall'amministratore. Per le richieste che
 * modificano qualcosa (non GET) serve anche un'intestazione propria e
 * l'origine del sito, contro i moduli di altri siti.
 * Restituisce { email } oppure una Response di errore.
 */
export async function requireAdmin(request, env, fetcher = fetch) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL) {
    return reply(503, "not_configured");
  }
  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ??
    /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get("Cookie") ?? "")?.[1];
  if (token === undefined || token === null) return reply(401, "unauthorized");
  const claims = await verifyAccessJwt(token, {
    teamDomain: env.ACCESS_TEAM_DOMAIN,
    aud: env.ACCESS_AUD,
    fetcher,
  });
  if (claims === undefined) return reply(401, "unauthorized");
  if (String(claims.email ?? "").toLowerCase() !== env.ADMIN_EMAIL.trim().toLowerCase()) {
    // Access ha riconosciuto chi e': si dice con quale indirizzo e' entrato (il suo), cosi' si capisce lo scarto.
    return Response.json(
      { error: "forbidden", email: String(claims.email ?? "") },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("Origin");
    if (
      request.headers.get("X-Cuelith-Admin") !== "1" ||
      origin === null ||
      origin !== new URL(request.url).origin
    ) {
      return reply(403, "forbidden");
    }
  }
  return { email: claims.email };
}
