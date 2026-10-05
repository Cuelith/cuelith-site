import { parseSubmission } from "../../../src/submission.js";

// Proposta di un plugin dal modulo del sito. Oggi la proposta viene solo
// controllata: la conservazione e l'approvazione sono la fase 3 della
// decisione 0013. Finche' non esistono, una proposta valida riceve 503
// "unavailable" e la pagina lo dice: non si finge di averla presa in carico.

const MAX_BODY = 16 * 1024;
const headers = { "Cache-Control": "no-store" };
const reply = (body, status) => Response.json(body, { status, headers });

export async function onRequestPost({ request }) {
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
  return reply({ error: "unavailable" }, 503);
}

/** Qualsiasi altro metodo non e' ammesso. */
export const onRequest = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
