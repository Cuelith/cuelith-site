// Controllo di una proposta di plugin (/marketplace/submit): lo usa la pagina,
// per dire subito cosa non va, e la funzione che riceve la proposta, che non si
// fida mai della pagina. Funzione pura: stessi dati, stesso risultato.
// Gli errori sono chiavi, mai testo: i messaggi stanno nei testi del sito.

/** Identificatore in dominio inverso (come nel protocollo), es. "acme.lyrics-pro". */
const PLUGIN_ID = /^[a-z0-9]+(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
/** Chiave pubblica Ed25519: 32 byte in base64url, senza riempimento. */
const AUTHOR_KEY = /^[A-Za-z0-9_-]{43}$/;
/** Negozio ammesso: solo il rivenditore registrato che sappiamo verificare (vedi registry). */
const SHOP_HOST = /^(?:[a-z0-9-]+\.)*lemonsqueezy\.com$/;
/** Firma Ed25519 del pacchetto: 64 byte in base64url, senza riempimento. */
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Nomi che solo il progetto puo' usare: chi li usasse si farebbe passare per il progetto. */
const RESERVED = ["core", "cuelith"];

export const LIMITS = {
  name: [2, 60],
  description: [10, 300],
  publisher: [2, 60],
  license: [2, 80],
  price: [1, 40],
  contact: [5, 120],
};

/** Conferme da dare per ogni tipo di proposta (le chiavi dei testi stanno in submit.checklist). */
export const CONFIRMATIONS = {
  free: ["noMalware", "permissions", "licence", "name", "terms"],
  paid: [
    "noMalware",
    "permissions",
    "licence",
    "name",
    "terms",
    "merchant",
    "devices",
    "affiliate",
  ],
};

const str = (value) => (typeof value === "string" ? value.trim() : "");

/** Un indirizzo https senza utente e password; con `host` anche il nome del sito e' controllato. */
function httpsUrl(value, host) {
  if (value.length === 0) return "required";
  if (value.length > 2048) return "tooLong";
  let url;
  try {
    url = new URL(value);
  } catch {
    return "invalidUrl";
  }
  if (url.protocol !== "https:") return "notHttps";
  if (url.username !== "" || url.password !== "" || !url.hostname.includes(".")) {
    return "invalidUrl";
  }
  if (host !== undefined && !host.test(url.hostname)) return "notShop";
  return undefined;
}

function withinLength(value, [min, max]) {
  if (value.length === 0) return "required";
  if (value.length < min) return "tooShort";
  if (value.length > max) return "tooLong";
  return undefined;
}

function wholeNumber(value) {
  if (value.length === 0) return ["required", undefined];
  if (!/^\d{1,12}$/.test(value)) return ["notInteger", undefined];
  const number = Number(value);
  return number > 0 ? [undefined, number] : ["notInteger", undefined];
}

/**
 * Controlla una proposta. Restituisce { ok: true, value } con i dati ripuliti,
 * oppure { ok: false, errors } con una chiave di errore per ogni campo.
 */
export function parseSubmission(input) {
  const raw = input !== null && typeof input === "object" ? input : {};
  const errors = {};
  const check = (field, error) => {
    if (error !== undefined) errors[field] = error;
  };

  // Campo trappola, invisibile a chi usa la pagina: se e' pieno e' un programma.
  if (str(raw.company) !== "") errors.company = "spam";

  const kind = raw.kind === "paid" ? "paid" : raw.kind === "free" ? "free" : undefined;
  if (kind === undefined) errors.kind = "required";

  const value = {
    name: str(raw.name),
    id: str(raw.id),
    description: str(raw.description),
    publisher: str(raw.publisher),
    license: str(raw.license),
    eulaUrl: str(raw.eulaUrl),
    packageUrl: str(raw.packageUrl),
    repositoryUrl: str(raw.repositoryUrl),
    authorKey: str(raw.authorKey),
    signature: str(raw.signature),
    contact: str(raw.contact),
  };
  check("name", withinLength(value.name, LIMITS.name));
  check("description", withinLength(value.description, LIMITS.description));
  check("publisher", withinLength(value.publisher, LIMITS.publisher));
  check("license", withinLength(value.license, LIMITS.license));
  check("contact", withinLength(value.contact, LIMITS.contact));
  if (errors.contact === undefined && !EMAIL.test(value.contact)) errors.contact = "invalidEmail";

  if (value.id.length === 0) errors.id = "required";
  else if (value.id.length > 80 || !PLUGIN_ID.test(value.id)) errors.id = "invalidId";
  else if (RESERVED.includes(value.id.split(".")[0])) errors.id = "reservedId";

  check("packageUrl", httpsUrl(value.packageUrl));
  if (value.repositoryUrl !== "") check("repositoryUrl", httpsUrl(value.repositoryUrl));
  if (value.eulaUrl !== "") check("eulaUrl", httpsUrl(value.eulaUrl));
  if (value.authorKey !== "" && !AUTHOR_KEY.test(value.authorKey)) errors.authorKey = "invalidKey";
  // Con la chiave d'autore il pacchetto va firmato (pnpm sign); senza chiave la firma non serve.
  if (value.authorKey !== "") {
    if (value.signature === "") errors.signature = "required";
    else if (!SIGNATURE.test(value.signature)) errors.signature = "invalidSignature";
  }

  const result = { kind, ...value, signature: value.authorKey === "" ? "" : value.signature };
  if (kind === "paid") {
    // La chiave dell'autore serve a un plugin a pagamento: lega il pacchetto a chi lo vende.
    if (value.authorKey === "") errors.authorKey = "required";
    const price = str(raw.price);
    const checkoutUrl = str(raw.checkoutUrl);
    const affiliateUrl = str(raw.affiliateUrl);
    check("price", withinLength(price, LIMITS.price));
    check("checkoutUrl", httpsUrl(checkoutUrl, SHOP_HOST));
    check("affiliateUrl", httpsUrl(affiliateUrl, SHOP_HOST));
    const [storeError, storeId] = wholeNumber(str(raw.storeId));
    const [productError, productId] = wholeNumber(str(raw.productId));
    check("storeId", storeError);
    check("productId", productError);
    Object.assign(result, { price, checkoutUrl, affiliateUrl, storeId, productId });
  }

  // Ogni conferma e' obbligatoria: la checklist non si salta.
  const confirmed = raw.confirm !== null && typeof raw.confirm === "object" ? raw.confirm : {};
  const missing = (CONFIRMATIONS[kind ?? "free"] ?? []).filter((key) => confirmed[key] !== true);
  if (missing.length > 0) errors.confirm = "mustConfirm";

  return Object.keys(errors).length === 0 ? { ok: true, value: result } : { ok: false, errors };
}
