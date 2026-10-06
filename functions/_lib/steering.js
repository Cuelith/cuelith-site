// Condizioni del marketplace, "Uso corretto della vetrina": la scheda e il pacchetto
// non devono invitare ad acquistare altrove. Qui si cercano i SEGNALI (link a
// negozi e codici sconto) e si mostrano al fondatore come avvisi: non bloccano
// nulla, perche' un link a un negozio puo' essere una pagina informativa lecita
// e la decisione spetta a una persona. Non si guarda nulla dei siti degli autori.

/** Negozi e servizi di pagamento: un link di questi nomi in una scheda merita uno sguardo. */
export const SHOP_HOSTS = [
  "lemonsqueezy.com",
  "gumroad.com",
  "paddle.com",
  "buy.stripe.com",
  "checkout.stripe.com",
  "paypal.com",
  "paypal.me",
  "payhip.com",
  "fastspring.com",
  "myshopify.com",
  "sellfy.io",
  "itch.io",
  "ko-fi.com",
];

const URL_PATTERN = /https?:\/\/([a-z0-9.-]+)[^\s"'<>)\]]*/gi;
/** Codici sconto e simili, in italiano e in inglese. */
const DISCOUNT =
  /\b(?:coupon|promo(?:tion(?:al)?)?\s+code|discount(?:\s+code)?|codice\s+sconto|sconto)\b|\d+\s*%\s*(?:off|di\s+sconto)/i;

const hostIsShop = (host) => SHOP_HOSTS.some((shop) => host === shop || host.endsWith(`.${shop}`));

/** Nomi dei negozi (senza doppioni) citati in un testo. */
export function shopHostsIn(text) {
  const found = new Set();
  for (const match of String(text).matchAll(URL_PATTERN)) {
    const host = match[1].toLowerCase().replace(/\.$/, "");
    if (hostIsShop(host)) found.add(host);
  }
  return [...found];
}

/**
 * Avvisi per il fondatore. `texts` sono i file di testo del pacchetto
 * ({ name, text }); `submission` e `manifest` portano scheda e descrizione.
 */
export function steeringWarnings({ submission, manifest, texts = [] }) {
  const warnings = [];
  const add = (message) => {
    if (!warnings.includes(message) && warnings.length < 12) warnings.push(message);
  };
  const free = submission.kind !== "paid";

  const fields = [
    ["descrizione del modulo", submission.description],
    ["descrizione nel manifesto", manifest.description],
    ["pagina della licenza (EULA)", submission.eulaUrl],
    ["pagina del progetto", submission.repositoryUrl],
    ["repository nel manifesto", manifest.repository],
  ];
  for (const [where, value] of fields) {
    if (typeof value !== "string") continue;
    for (const host of shopHostsIn(value)) {
      add(
        `vetrina (art. 4): link a ${host} in ${where}: controlla che non inviti ad acquistare fuori dal marketplace`,
      );
    }
    if (DISCOUNT.test(value)) {
      add(
        `vetrina (art. 4): ${where} parla di sconti o codici promozionali: controlla che non spinga ad acquistare altrove`,
      );
    }
  }
  for (const { name, text } of texts) {
    for (const host of shopHostsIn(text)) {
      add(
        `vetrina (art. 4): il pacchetto cita ${host} in ${name}: controlla che non sia un invito ad acquistare altrove`,
      );
    }
    if (!/\.m?js$/i.test(name) && DISCOUNT.test(text)) {
      add(`vetrina (art. 4): ${name} nel pacchetto parla di sconti o codici promozionali`);
    }
  }
  if (free && warnings.length > 0) {
    add(
      "vetrina (art. 4, d): plugin gratuito con segnali di acquisto: verifica che le funzioni principali non richiedano un pagamento fuori dal marketplace (art. 4, d)",
    );
  }
  return warnings;
}
