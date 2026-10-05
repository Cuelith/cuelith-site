import { parseSubmission } from "../../../src/submission.js";
import { verifyTurnstile } from "../../_lib/turnstile.js";
import {
  allowSubmission,
  ipFingerprint,
  MAX_PENDING,
  pendingCount,
  saveSubmission,
} from "../../_lib/store.js";

// Proposta di un plugin dal modulo del sito (decisione 0013). In ordine:
// forma e dimensione, contenuto (lo stesso controllo della pagina, che non si
// da' mai per buono), Turnstile, limite per indirizzo, e infine la proposta si
// conserva in KV in attesa del fondatore. Senza Turnstile o KV configurati la
// risposta e' "non disponibile": non si accetta nulla che non si possa
// proteggere.

const MAX_BODY = 16 * 1024;
const headers = { "Cache-Control": "no-store" };
const reply = (body, status) => Response.json(body, { status, headers });

export async function onRequestPost({ request, env = {} }) {
  const type = request.headers.get("Content-Type") ?? "";
  if (!type.startsWith("application/json")) return reply({ error: "type" }, 415);
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > MAX_BODY) return reply({ error: "tooLarge" }, 413);
  const body = await request.text();
  if (body.length > MAX_BODY) return reply({ error: "tooLarge" }, 413);
  let input;
  try {
    input = JSON.parse(body);
  } catch {
    return reply({ error: "json" }, 400);
  }

  const result = parseSubmission(input);
  if (!result.ok) return reply({ error: "invalid", errors: result.errors }, 400);

  if (!env.SUBMISSIONS || !env.TURNSTILE_SECRET) return reply({ error: "unavailable" }, 503);

  const ip = request.headers.get("CF-Connecting-IP") ?? undefined;
  const human = await verifyTurnstile(input.turnstileToken, {
    secret: env.TURNSTILE_SECRET,
    ip,
    hostname: env.TURNSTILE_HOSTNAME || undefined,
  });
  if (!human) return reply({ error: "captcha" }, 403);

  const fingerprint = await ipFingerprint(ip ?? "sconosciuto", env.TURNSTILE_SECRET);
  if (!(await allowSubmission(env.SUBMISSIONS, fingerprint))) return reply({ error: "rate" }, 429);
  if ((await pendingCount(env.SUBMISSIONS)) >= MAX_PENDING) return reply({ error: "busy" }, 503);

  await saveSubmission(env.SUBMISSIONS, result.value);
  return reply({ ok: true }, 200);
}

/** Qualsiasi altro metodo non e' ammesso. */
export const onRequest = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
