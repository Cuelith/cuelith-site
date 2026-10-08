// Da dove arrivano file e dati del sito. Il visitatore non vede mai questi
// indirizzi: le funzioni del sito li leggono e consegnano il risultato dal
// dominio di Cuelith. Lo stesso codice gira anche durante la costruzione del
// sito, per scrivere nelle pagine i dati del momento.

const CORE = "https://github.com/Cuelith/cuelith-core";
export const RELEASES_FEED = `${CORE}/releases.atom`;
export const LATEST_MANIFEST = `${CORE}/releases/latest/download/latest.yml`;
export const SOURCE_ARCHIVE =
  "https://codeload.github.com/Cuelith/cuelith-core/zip/refs/heads/main";
/** Indice con tutti i plugin, anche a pagamento (schema 2); l'indice 1 e' il ripiego. */
export const MODULES_INDEX_V2 = "https://cuelith.github.io/cuelith-registry/index-2.json";
export const MODULES_INDEX = "https://cuelith.github.io/cuelith-registry/index.json";
/** Dove chiedere aiuto per ogni plugin (scritto dagli autori; non e' nell'indice che leggono le app). */
export const SUPPORT_INDEX = "https://cuelith.github.io/cuelith-registry/support.json";
/** Immagini di copertina e guide d'uso dei plugin (protocollo 1.19). */
export const EXTRAS_INDEX = "https://cuelith.github.io/cuelith-registry/extras.json";

/** Solo una pagina https o un indirizzo di posta: niente altro diventa un collegamento. */
export const isSupportLink = (value) =>
  typeof value === "string" &&
  value.length <= 300 &&
  (/^https:\/\/[^\s@]+$/i.test(value) || /^mailto:[^\s@,;?]+@[^\s@,;?]+$/i.test(value));

/** Licenze di tutti i plugin a pagamento, anche ritirati dalla vetrina: lo legge solo il Notaio. */
export const LICENSES_INDEX = "https://cuelith.github.io/cuelith-registry/licenses.json";

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
      publisher: String(plugin.publisher ?? ""),
      license: String(plugin.license ?? ""),
      // Solo "paid" e' a pagamento: tutto il resto e' gratuito (indice 1, voci vecchie).
      access: plugin.access === "paid" ? "paid" : "free",
      price: plugin.access === "paid" ? String(plugin.price ?? "") : "",
      // L'indirizzo dell'acquisto non esce: si arriva al negozio da /marketplace/buy/<id>.
      buyable: plugin.access === "paid" && checkoutOf(plugin) !== undefined,
      icon:
        typeof plugin.icon === "string" && plugin.icon.startsWith("data:image/svg+xml;base64,")
          ? plugin.icon
          : undefined,
      version: String(latest.version ?? ""),
      published: String(latest.published ?? ""),
      permissions: Array.isArray(latest.permissions) ? latest.permissions.map(String) : [],
      // Le versioni, per la scheda del plugin: numero, data, compatibilita' e permessi (mai gli indirizzi).
      versions: (plugin.versions ?? []).slice(0, 12).map((v) => ({
        version: String(v.version ?? ""),
        published: String(v.published ?? ""),
        cuelith: String(v.engines?.cuelith ?? ""),
        protocol: String(v.engines?.protocol ?? ""),
        permissions: Array.isArray(v.permissions) ? v.permissions.map(String) : [],
      })),
    };
  });
}

/** Pagina di acquisto ammessa: solo il negozio di un rivenditore registrato, in https. */
export const CHECKOUT_HOST = /^(?:[a-z0-9-]+\.)*lemonsqueezy\.com$/;

/** L'indirizzo di acquisto di un plugin a pagamento, se e' uno ammesso. */
export function checkoutOf(plugin) {
  if (plugin?.access !== "paid" || typeof plugin.checkoutUrl !== "string") return undefined;
  try {
    const url = new URL(plugin.checkoutUrl);
    const ok =
      url.protocol === "https:" &&
      CHECKOUT_HOST.test(url.hostname) &&
      url.username === "" &&
      url.password === "";
    return ok ? url.href : undefined;
  } catch {
    return undefined;
  }
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

/** Dove chiedere aiuto, per id di plugin. Se il file non risponde, nessuno: il sito resta in piedi. */
export async function loadSupport(fetcher = fetch) {
  const text = await readText(SUPPORT_INDEX, fetcher);
  if (text === undefined) return {};
  try {
    const found = JSON.parse(text).support ?? {};
    return Object.fromEntries(Object.entries(found).filter(([, link]) => isSupportLink(link)));
  } catch {
    return {};
  }
}

const COVER = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const isStep = (step) =>
  step !== null &&
  typeof step === "object" &&
  typeof step.title === "string" &&
  step.title.length > 0 &&
  step.title.length <= 80 &&
  typeof step.body === "string" &&
  step.body.length > 0 &&
  step.body.length <= 600;

/**
 * Immagine e guida d'uso per id di plugin. Quello che non ha la forma giusta si scarta (il
 * sito mostra solo dati controllati); se il file non risponde, nessuno: il sito resta in piedi.
 */
export async function loadExtras(fetcher = fetch) {
  const text = await readText(EXTRAS_INDEX, fetcher);
  if (text === undefined) return {};
  try {
    const plugins = JSON.parse(text).plugins ?? {};
    const out = {};
    for (const [id, extra] of Object.entries(plugins)) {
      const image =
        typeof extra?.image === "string" && extra.image.length < 210_000 && COVER.test(extra.image)
          ? extra.image
          : undefined;
      const guide = {};
      for (const [lang, steps] of Object.entries(extra?.guide ?? {})) {
        if (
          /^[a-z]{2}$/.test(lang) &&
          Array.isArray(steps) &&
          steps.length <= 8 &&
          steps.every(isStep)
        ) {
          guide[lang] = steps.map(({ title, body }) => ({ title, body }));
        }
      }
      if (image !== undefined || Object.keys(guide).length > 0) {
        out[id] = {
          ...(image === undefined ? {} : { image }),
          ...(Object.keys(guide).length === 0 ? {} : { guide }),
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** I plugin del marketplace: dall'indice 2, e se non risponde dall'indice 1. */
export async function loadModules(fetcher = fetch) {
  for (const url of [MODULES_INDEX_V2, MODULES_INDEX]) {
    const text = await readText(url, fetcher);
    if (text === undefined) continue;
    try {
      return publicModules(JSON.parse(text));
    } catch {
      // Indice illeggibile: si prova il successivo.
    }
  }
  return undefined;
}

/** Dove porta "Acquista" per un plugin: l'indirizzo del suo negozio, se ammesso. */
export async function loadCheckout(id, fetcher = fetch) {
  const text = await readText(MODULES_INDEX_V2, fetcher);
  if (text === undefined) return undefined;
  try {
    const plugin = (JSON.parse(text).plugins ?? []).find((p) => p?.id === id);
    return checkoutOf(plugin);
  } catch {
    return undefined;
  }
}
