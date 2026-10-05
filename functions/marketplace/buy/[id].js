import { loadCheckout } from "../../_lib/sources.js";

// "Acquista" di un plugin a pagamento: porta al negozio del suo autore. La
// pagina non contiene indirizzi esterni; qui si legge dal catalogo l'indirizzo
// di acquisto e lo si usa solo se e' di un negozio ammesso (vedi sources.js).
// Cio' che si apre e' scelto dal catalogo, mai da chi visita: niente "redirect
// aperti".

const PLUGIN_ID = /^[a-z0-9]+(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;

const notFound = () =>
  new Response("404", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ params }) {
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  if (typeof id !== "string" || id.length > 80 || !PLUGIN_ID.test(id)) return notFound();
  const checkout = await loadCheckout(id);
  if (checkout === undefined) return notFound();
  return new Response(null, {
    status: 302,
    headers: {
      Location: checkout,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export const onRequestHead = onRequestGet;
