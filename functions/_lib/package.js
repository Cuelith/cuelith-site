import { strFromU8, unzipSync } from "fflate";
import { sha256Hex } from "./crypto.js";

// Analisi di un pacchetto .cpkg proposto da un autore: lo scarica con dei
// limiti, ne calcola impronta e dimensione, e ne legge SOLO il manifest e
// l'icona (due voci dello zip: il resto non viene mai decompresso, cosi' un
// pacchetto malevolo non puo' consumare memoria o tempo). I controlli completi
// (schema del manifest, permessi, icona unica) li fa la CI del registry prima
// di pubblicare: questa e' la prima verifica, per far vedere al fondatore cosa
// sta approvando.

/** Stessi limiti del programma e del registry. */
export const LIMITS = {
  maxPackage: 25 * 1024 * 1024,
  maxManifest: 256 * 1024,
  maxIcon: 40 * 1024,
  /** Immagine di copertina (protocollo 1.19): stesso limite del registry. */
  maxImage: 150 * 1024,
  /** Controllo delle condizioni (vetrina): file di testo letti dal pacchetto, con tetti. */
  maxTextFile: 128 * 1024,
  maxTextFiles: 40,
  maxTextTotal: 1024 * 1024,
  timeoutMs: 20_000,
};

export class PackageError extends Error {
  constructor(code, detail = "") {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

/** Solo https, senza utente e password, e con un nome di sito vero (niente indirizzi numerici ne' nomi interni). */
export function checkPackageUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new PackageError("badUrl");
  }
  const host = url.hostname.toLowerCase();
  const numeric = /^\d+(?:\.\d+){3}$/.test(host) || host.includes(":") || host.startsWith("[");
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    numeric ||
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new PackageError("badUrl");
  }
  return url;
}

/** Legge il corpo di una risposta fermandosi al limite: non si scarica oltre. */
async function readLimited(response, max) {
  const declared = Number(response.headers.get("Content-Length") ?? "0");
  if (declared > max) throw new PackageError("tooLarge");
  if (response.body === null) throw new PackageError("download");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      reader.cancel().catch(() => undefined);
      throw new PackageError("tooLarge");
    }
    chunks.push(value);
  }
  const data = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}

const TEXT_FILE = /\.(?:json|md|txt|html?|m?js|cjs)$/i;

/**
 * File di testo del pacchetto, per cercare inviti ad acquistare altrove. Solo
 * file piccoli, pochi e con un tetto sul totale; se qualcosa non va si lascia
 * stare (e' un avviso in piu', non un controllo che blocca).
 */
function readTexts(data, limits) {
  let total = 0;
  let count = 0;
  try {
    const files = unzipSync(data, {
      filter: (file) => {
        if (!TEXT_FILE.test(file.name) || file.name === "cuelith-plugin.json") return false;
        if (file.originalSize > limits.maxTextFile) return false;
        if (count >= limits.maxTextFiles || total + file.originalSize > limits.maxTextTotal)
          return false;
        count += 1;
        total += file.originalSize;
        return true;
      },
    });
    return Object.entries(files).map(([name, bytes]) => ({ name, text: strFromU8(bytes) }));
  } catch {
    return [];
  }
}

/** Percorso relativo dentro il pacchetto: niente "..", niente percorsi assoluti. */
const safeRelative = (path) =>
  typeof path === "string" &&
  path.length > 0 &&
  path.length < 200 &&
  !path.startsWith("/") &&
  !path.includes("\\") &&
  !path.split("/").includes("..");

/** Come in validate.mjs del registry: SVG semplice, senza script ne' risorse esterne. */
function checkIcon(svg) {
  if (!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/.test(svg)) return false;
  return !/<script|<foreignObject|\son[a-z]+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|data:)/i.test(
    svg,
  );
}

/** Che immagine e' davvero, dai primi byte (non dal nome): "png", "jpeg", "webp" o niente. */
export function imageKind(bytes) {
  const at = (i) => bytes[i];
  if (
    bytes.length > 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => at(i) === b)
  ) {
    return "png";
  }
  if (bytes.length > 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "jpeg";
  const word = (from, to) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length > 12 && word(0, 4) === "RIFF" && word(8, 12) === "WEBP") return "webp";
  return undefined;
}

const IMAGE_NAME = /\.(png|jpe?g|webp)$/i;

/**
 * Guida d'uso (protocollo 1.19): i passi della guida al primo uso del plugin (`onboarding`),
 * con i testi presi dai suoi cataloghi di lingua. Una lingua entra solo se tutti i passi si
 * leggono per intero e rientrano nei limiti del registry; il resto si scarta senza fare rumore.
 */
export function resolveGuide(manifest, readJson) {
  const steps = manifest.onboarding;
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > 8) return undefined;
  const guide = {};
  for (const locale of (manifest.contributes?.locales ?? []).slice(0, 4)) {
    if (typeof locale?.lang !== "string" || !/^[a-z]{2}$/.test(locale.lang)) continue;
    if (!safeRelative(locale.file) || !locale.file.toLowerCase().endsWith(".json")) continue;
    const catalog = readJson(locale.file);
    if (catalog === undefined) continue;
    const resolved = steps.map((step) => ({
      title: catalog[step?.title],
      body: catalog[step?.body],
    }));
    const fits = resolved.every(
      (step) =>
        typeof step.title === "string" &&
        step.title.length >= 1 &&
        step.title.length <= 80 &&
        typeof step.body === "string" &&
        step.body.length >= 1 &&
        step.body.length <= 600,
    );
    if (fits) guide[locale.lang] = resolved;
  }
  return Object.keys(guide).length === 0 ? undefined : guide;
}

/**
 * Scarica e analizza un pacchetto. Restituisce { sha256, size, manifest,
 * icon, image, guide } (l'icona come testo SVG; immagine e guida se il pacchetto le ha)
 * oppure lancia PackageError con un codice: badUrl, download, tooLarge, notZip, noManifest,
 * badManifest, noIcon, badIcon, noImage, badImage.
 */
export async function analyzePackage(url, { fetcher = fetch, limits = LIMITS } = {}) {
  const checked = checkPackageUrl(url);
  let data;
  try {
    const response = await fetcher(checked.href, {
      redirect: "follow",
      headers: { "User-Agent": "cuelith-marketplace" },
      signal: AbortSignal.timeout(limits.timeoutMs),
    });
    if (!response.ok) throw new PackageError("download", `HTTP ${String(response.status)}`);
    data = await readLimited(response, limits.maxPackage);
  } catch (error) {
    if (error instanceof PackageError) throw error;
    throw new PackageError("download");
  }
  if (data.byteLength === 0) throw new PackageError("notZip");
  const sha256 = await sha256Hex(data);

  const read = (name, max) => {
    let files;
    try {
      files = unzipSync(data, { filter: (file) => file.name === name && file.originalSize <= max });
    } catch {
      throw new PackageError("notZip");
    }
    return files[name];
  };

  const rawManifest = read("cuelith-plugin.json", limits.maxManifest);
  if (rawManifest === undefined) throw new PackageError("noManifest");
  let manifest;
  try {
    manifest = JSON.parse(strFromU8(rawManifest));
  } catch {
    throw new PackageError("badManifest");
  }
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new PackageError("badManifest");
  }

  if (!safeRelative(manifest.icon) || !manifest.icon.toLowerCase().endsWith(".svg")) {
    throw new PackageError("noIcon");
  }
  const rawIcon = read(manifest.icon, limits.maxIcon);
  if (rawIcon === undefined) throw new PackageError("noIcon");
  const icon = strFromU8(rawIcon);
  if (!checkIcon(icon)) throw new PackageError("badIcon");

  // Immagine di copertina (facoltativa): se il manifest la dichiara deve esserci ed essere vera.
  let image;
  if (manifest.image !== undefined) {
    if (!safeRelative(manifest.image) || !IMAGE_NAME.test(manifest.image)) {
      throw new PackageError("badImage");
    }
    const rawImage = read(manifest.image, limits.maxImage);
    if (rawImage === undefined) {
      // Troppo grande si distingue da assente, senza decomprimerla: basta la dimensione dichiarata.
      let declared = 0;
      try {
        unzipSync(data, {
          filter: (file) => {
            if (file.name === manifest.image) declared = file.originalSize;
            return false;
          },
        });
      } catch {
        // Lo zip e' gia' stato letto sopra: qui non cambia nulla.
      }
      throw new PackageError(declared > limits.maxImage ? "badImage" : "noImage");
    }
    const kind = imageKind(rawImage);
    const ext = (IMAGE_NAME.exec(manifest.image)?.[1] ?? "").toLowerCase();
    if (kind === undefined || kind !== (ext === "jpg" ? "jpeg" : ext)) {
      throw new PackageError("badImage");
    }
    image = { ext, bytes: rawImage };
  }

  const guide = resolveGuide(manifest, (file) => {
    const raw = read(file, limits.maxTextFile);
    if (raw === undefined) return undefined;
    try {
      const parsed = JSON.parse(strFromU8(raw));
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : undefined;
    } catch {
      return undefined;
    }
  });

  return {
    sha256,
    size: data.byteLength,
    manifest,
    icon,
    image,
    guide,
    texts: readTexts(data, limits),
  };
}
