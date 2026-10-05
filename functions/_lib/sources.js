// Da dove arrivano file e dati del sito. Il visitatore non vede mai questi
// indirizzi: le funzioni del sito li leggono e consegnano il risultato dal
// dominio di Cuelith. Lo stesso codice gira anche durante la costruzione del
// sito, per scrivere nelle pagine i dati del momento.

const CORE = "https://github.com/Cuelith/cuelith-core";
export const RELEASES_FEED = `${CORE}/releases.atom`;
export const LATEST_MANIFEST = `${CORE}/releases/latest/download/latest.yml`;
export const SOURCE_ARCHIVE =
  "https://codeload.github.com/Cuelith/cuelith-core/zip/refs/heads/main";
export const MODULES_INDEX = "https://cuelith.github.io/cuelith-registry/index.json";

/** Versioni nel formato 1.2.3 (con eventuale suffisso): niente altro entra in un indirizzo. */
export const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;

/** I sistemi per cui esiste un installatore, con il nome del file per una versione. */
export const PLATFORMS = {
  windows: {
    file: (version) => `Cuelith-Setup-${version}.exe`,
    type: "application/vnd.microsoft.portable-executable",
  },
  linux: {
    file: (version) => `Cuelith-${version}-x86_64.AppImage`,
    type: "application/octet-stream",
  },
};

export const assetUrl = (version, file) => `${CORE}/releases/download/v${version}/${file}`;

/** Versione piu' recente, dal file che accompagna ogni rilascio. */
export function parseLatest(manifest) {
  const version = /^version:\s*['"]?([^'"\s]+)['"]?\s*$/m.exec(manifest)?.[1];
  return version !== undefined && VERSION.test(version) ? version : undefined;
}

const decode = (text) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

/** Solo questi elementi restano nelle note di una versione; i link diventano testo. */
const ALLOWED = new Set(["p", "ul", "ol", "li", "h2", "h3", "h4", "strong", "em", "code", "br"]);

/**
 * Note di versione sicure da mettere nella pagina: si tengono paragrafi,
 * elenchi, titoli e grassetti; tutto il resto (link, immagini, attributi,
 * script) sparisce e resta solo il testo.
 */
export function cleanNotes(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?([a-zA-Z0-9]+)(?:\s[^>]*)?>/g, (tag, name) => {
      const element = name.toLowerCase();
      if (!ALLOWED.has(element)) return "";
      return tag.startsWith("</") ? `</${element}>` : `<${element}>`;
    })
    .trim();
}

/**
 * Le note di una versione nelle due lingue. Nel testo pubblicato una riga di
 * separazione (---) divide l'italiano, che viene prima, dall'inglese; senza
 * separazione c'e' solo l'italiano e la pagina inglese mostra quello.
 */
export function splitNotes(html) {
  const [it, en] = html.split(/<hr\s*\/?>/i);
  const english = en === undefined ? "" : cleanNotes(en);
  return english === "" ? { it: cleanNotes(it) } : { it: cleanNotes(it), en: english };
}

/** Le versioni pubblicate, dalla piu' recente: numero, data e note per lingua. */
export function parseReleases(feed) {
  const releases = [];
  for (const [, entry] of feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const tag = /<link[^>]*href="[^"]*\/releases\/tag\/v([^"]+)"/.exec(entry)?.[1];
    const date = /<updated>([^<]+)<\/updated>/.exec(entry)?.[1];
    const content = /<content[^>]*>([\s\S]*?)<\/content>/.exec(entry)?.[1] ?? "";
    if (tag === undefined || !VERSION.test(tag) || date === undefined) continue;
    // Il feed elenca anche i tag senza release (titolo = nome del tag, nessun installatore): non sono versioni.
    const title = /<title>([^<]*)<\/title>/.exec(entry)?.[1]?.trim();
    if (title === `v${tag}`) continue;
    releases.push({ version: tag, date, notes: splitNotes(decode(content)) });
  }
  return releases;
}

/**
 * I plugin del marketplace, con quanto serve per presentarli. Indirizzi dei
 * pacchetti e dei repository non escono: si installano dal programma.
 */
export function publicModules(index) {
  return (index?.plugins ?? []).map((plugin) => {
    const latest = plugin.versions?.[0] ?? {};
    return {
      id: String(plugin.id),
      name: String(plugin.name),
      description: String(plugin.description ?? ""),
      family: String(plugin.family ?? "function"),
      verified: plugin.verified === true,
      icon:
        typeof plugin.icon === "string" && plugin.icon.startsWith("data:image/svg+xml;base64,")
          ? plugin.icon
          : undefined,
      version: String(latest.version ?? ""),
      published: String(latest.published ?? ""),
      permissions: Array.isArray(latest.permissions) ? latest.permissions.map(String) : [],
    };
  });
}

/** Legge un indirizzo come testo; undefined se non risponde bene (il sito resta in piedi). */
export async function readText(url, fetcher = fetch) {
  try {
    const response = await fetcher(url, { headers: { "User-Agent": "cuelith-site" } });
    return response.ok ? await response.text() : undefined;
  } catch {
    return undefined;
  }
}

export async function loadReleases(fetcher = fetch) {
  const feed = await readText(RELEASES_FEED, fetcher);
  return feed === undefined ? undefined : parseReleases(feed);
}

export async function loadModules(fetcher = fetch) {
  const text = await readText(MODULES_INDEX, fetcher);
  if (text === undefined) return undefined;
  try {
    return publicModules(JSON.parse(text));
  } catch {
    return undefined;
  }
}
