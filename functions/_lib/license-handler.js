import { NotaryError } from "./notary.js";

// Corpo comune delle tre funzioni del notaio: solo POST con JSON piccolo, mai
// in cache e senza registrare nulla (le richieste contengono chiavi di licenza).

const MAX_BODY = 4096;
const headers = { "Cache-Control": "no-store" };

export function licenseHandler(action) {
  return {
    async onRequestPost({ request, env }) {
      const reply = (body, status = 200) => Response.json(body, { status, headers });
      if (!(request.headers.get("Content-Type") ?? "").startsWith("application/json")) {
        return reply({ error: "invalidInput" }, 415);
      }
      const text = await request.text();
      if (text.length > MAX_BODY) return reply({ error: "invalidInput" }, 413);
      let input;
      try {
        input = JSON.parse(text);
      } catch {
        return reply({ error: "invalidInput" }, 400);
      }
      try {
        return reply(await action(input, env));
      } catch (error) {
        if (error instanceof NotaryError) return reply({ error: error.code }, error.status);
        // Mai dettagli: la richiesta contiene una chiave di licenza.
        return reply({ error: "internal" }, 500);
      }
    },
    onRequest: () => new Response(null, { status: 405, headers: { Allow: "POST" } }),
  };
}
