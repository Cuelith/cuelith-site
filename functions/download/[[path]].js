import {
  assetUrl,
  LATEST_MANIFEST,
  parseLatest,
  PLATFORMS,
  readText,
  SOURCE_ARCHIVE,
  VERSION,
} from "../_lib/sources.js";

// Download dal dominio di Cuelith: /download/windows, /download/linux,
// /download/<versione>/windows, /download/source. Il file viene letto da dove
// e' pubblicato e passato al visitatore cosi' com'e', senza mostrarne l'origine.

const notFound = () =>
  new Response("404", { status: 404, headers: { "Cache-Control": "no-store" } });

/** Passa il file a chi scarica, col suo nome e senza toccarne il contenuto. */
async function deliver(url, name, type) {
  const upstream = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "cuelith-site" },
  });
  if (!upstream.ok || upstream.body === null) return notFound();
  const headers = new Headers({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
  });
  const length = upstream.headers.get("Content-Length");
  if (length !== null) headers.set("Content-Length", length);
  return new Response(upstream.body, { status: 200, headers });
}

/** Chi chiede solo le intestazioni (HEAD) riceve le stesse, senza il file. */
export async function onRequestHead(context) {
  const response = await onRequestGet(context);
  await response.body?.cancel();
  return new Response(null, { status: response.status, headers: response.headers });
}

export async function onRequestGet({ params }) {
  const parts = Array.isArray(params.path) ? params.path : [];
  if (parts.length === 1 && parts[0] === "source") {
    return deliver(SOURCE_ARCHIVE, "cuelith-source.zip", "application/zip");
  }
  const [first, second] = parts;
  const explicit = parts.length === 2;
  const platform = PLATFORMS[explicit ? second : first];
  if (platform === undefined || parts.length > 2 || (explicit && !VERSION.test(first)))
    return notFound();

  const version = explicit ? first : parseLatest((await readText(LATEST_MANIFEST)) ?? "");
  if (version === undefined) return notFound();
  const file = platform.file(version);
  return deliver(assetUrl(version, file), file, platform.type);
}
