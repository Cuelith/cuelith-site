import { loadModules } from "../_lib/sources.js";

// Plugin disponibili nel marketplace, per aggiornare la pagina senza ricostruire il sito.
export async function onRequestGet() {
  const modules = await loadModules();
  if (modules === undefined) {
    return Response.json(
      { modules: [] },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    { modules },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } },
  );
}
