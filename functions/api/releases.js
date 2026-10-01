import { loadReleases } from "../_lib/sources.js";

// Versioni pubblicate, per aggiornare la pagina senza ricostruire il sito.
export async function onRequestGet() {
  const releases = await loadReleases();
  if (releases === undefined) {
    return Response.json(
      { releases: [] },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    { releases },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } },
  );
}
