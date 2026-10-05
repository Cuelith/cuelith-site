// Turnstile (Cloudflare, gratis): la prova che chi invia il modulo e' una persona.
// Il controllo si fa qui, sul server, con la chiave segreta: la pagina da sola
// non basta.

export const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Vero solo se Turnstile conferma. Se non risponde, o la risposta non e'
 * chiara, e' falso: nel dubbio non si accetta.
 */
export async function verifyTurnstile(token, { secret, ip, hostname, fetcher = fetch }) {
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;
  if (!secret) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const response = await fetcher(TURNSTILE_VERIFY, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const result = await response.json();
    if (result.success !== true) return false;
    // La prova deve essere nata su questo sito, non su un altro.
    return hostname === undefined || result.hostname === undefined || result.hostname === hostname;
  } catch {
    return false;
  }
}
