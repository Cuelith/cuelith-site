// Marketplace e proposta di un plugin: le pagine nelle due lingue, il controllo
// delle proposte e le due funzioni (acquisto e invio). Niente rete: i dati sono
// finti e la rete e' sostituita.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { onRequestGet as buy } from "../functions/marketplace/buy/[id].js";
import {
  onRequest as submitAny,
  onRequestPost as submit,
} from "../functions/api/marketplace/submit.js";
import {
  checkoutOf,
  loadCheckout,
  loadModules,
  MODULES_INDEX,
  MODULES_INDEX_V2,
  publicModules,
} from "../functions/_lib/sources.js";
import { DEV_LINKS, renderMarketplace, renderSubmit, renderTerms } from "../src/market.mjs";
import { document } from "../src/page.mjs";
import { CONFIRMATIONS, parseSubmission } from "../src/submission.js";

const json = (file) => JSON.parse(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"));
const snapshot = json("data/snapshot.json");
const catalog = json("data/plugins.json");
const assets = {
  logo: "/logo.png",
  icon: "/icon.svg",
  social: "/social.jpg",
  styles: "",
  script: "",
};

const paidModule = {
  id: "acme.lyrics-pro",
  name: "Lyrics Pro",
  description: "Testi avanzati.",
  family: "function",
  verified: false,
  publisher: "Acme",
  license: "Proprietaria (EULA)",
  access: "paid",
  price: "9 €",
  buyable: true,
  version: "1.2.0",
  published: "2026-10-05T10:00:00.000Z",
  permissions: [],
};

const market = (lang, modules) =>
  document(
    renderMarketplace({ content: json(`content/${lang}.json`), modules, catalog, assets }),
    lang,
  );
const submitPage = (lang) =>
  document(renderSubmit({ content: json(`content/${lang}.json`), assets }), lang);

// Solo indirizzi veri (con un nome di sito): la frase «inizia con https://.» nei messaggi non lo e'.
const externals = (html) => [...html.matchAll(/https?:\/\/[a-z0-9][^"'\s<)]*/gi)].map((m) => m[0]);
/** Indirizzi esterni ammessi nelle nuove pagine: sostegno, hub, dati strutturati e (solo per chi sviluppa) guida e modello. */
const COMMON = ["https://cuelith.lzrhive.it", "https://ko-fi.com/mlhive", "https://lzrhive.it/"];
const isAllowed = (url, extra = []) => [...COMMON, ...extra].some((start) => url.startsWith(start));

for (const lang of ["it", "en"]) {
  test(`marketplace ${lang}: solo plugin gratuiti, senza filtri, senza spiegazione dell'acquisto`, () => {
    const html = market(lang, snapshot.modules);
    assert.doesNotMatch(html, /github/i);
    assert.deepEqual(
      externals(html).filter((url) => !isAllowed(url)),
      [],
    );
    assert.ok(html.includes('<li class="plugin" data-group="free"'));
    assert.ok(!html.includes('data-group="paid"'));
    assert.doesNotMatch(html, /\/marketplace\/buy\//);
    // Senza plugin a pagamento filtri e spiegazione ci sono ma nascosti.
    assert.match(html, /data-filters hidden/);
    assert.match(html, /data-notice hidden/);
    assert.match(html, /data-lead="mixed" hidden/);
    assert.doesNotMatch(html, /data-lead="free" hidden/);
  });

  test(`marketplace ${lang}: un plugin a pagamento ha prezzo, Acquista e avviso sull'affiliazione`, () => {
    const html = market(lang, [...snapshot.modules, paidModule]);
    assert.ok(html.includes('href="/marketplace/buy/acme.lyrics-pro"'));
    assert.ok(html.includes('data-group="paid"'));
    assert.ok(html.includes("9 €"));
    const text = json(`content/${lang}.json`).marketplace;
    assert.ok(html.includes(text.affiliateNote.replace(/&/g, "&amp;")), "avviso nella scheda");
    // Filtri e spiegazione sono visibili: l'avviso sull'affiliazione sta anche nella spiegazione.
    assert.doesNotMatch(html, /data-filters hidden/);
    assert.doesNotMatch(html, /data-notice hidden/);
    assert.ok(html.includes(text.how.items[1]));
    // L'indirizzo del negozio non e' mai nella pagina: si passa da /marketplace/buy/.
    assert.doesNotMatch(html, /lemonsqueezy/i);
    assert.deepEqual(
      externals(html).filter((url) => !isAllowed(url)),
      [],
    );
  });

  test(`marketplace ${lang}: un plugin a pagamento senza indirizzo valido non si puo' acquistare`, () => {
    const html = market(lang, [{ ...paidModule, buyable: false }]);
    assert.doesNotMatch(html, /\/marketplace\/buy\//);
    assert.ok(html.includes(json(`content/${lang}.json`).marketplace.notBuyable));
    assert.doesNotMatch(html, /plugin__note/);
  });

  test(`proposta ${lang}: modulo completo, checklist e istruzioni di vendita`, () => {
    const html = submitPage(lang);
    // L'infrastruttura non si nomina, tranne Turnstile (controllo anti-spam) nell'informativa.
    assert.doesNotMatch(html.replace(/Cloudflare \(Turnstile\)/g, ""), /Cloudflare|KV/);
    assert.match(html, /Turnstile/);
    // Condizioni di elencazione: commissione fissa e vendita libera fuori dal marketplace.
    assert.match(html, /id="condizioni"/);
    assert.match(html, /10%/);
    assert.doesNotMatch(html, /\{percent\}/);
    const allowed = [DEV_LINKS.guide[lang], DEV_LINKS.template];
    assert.deepEqual(
      externals(html).filter((url) => !isAllowed(url, allowed)),
      [],
    );
    for (const name of [
      "name",
      "id",
      "description",
      "publisher",
      "license",
      "eulaUrl",
      "packageUrl",
      "repositoryUrl",
      "authorKey",
      "price",
      "checkoutUrl",
      "storeId",
      "productId",
      "affiliateUrl",
      "contact",
      "signature",
    ]) {
      assert.ok(html.includes(`data-field="${name}"`), name);
    }
    // Ogni conferma ha la sua casella; quelle a pagamento stanno in un blocco nascosto.
    for (const key of CONFIRMATIONS.paid) {
      assert.ok(html.includes(`name="confirm.${key}"`), key);
    }
    assert.match(html, /data-only="paid" hidden/);
    // Il progetto chiede una commissione con il programma affiliati del negozio.
    assert.match(html, /10%/);
    assert.match(html, /Lemon Squeezy/);
    // Il campo trappola esiste e il modulo non si invia da solo (la pagina usa lo script).
    assert.ok(html.includes('name="company"'));
    assert.doesNotMatch(html, /<form[^>]*action=/);
  });
}

// ---- controllo delle proposte ----

const free = () => ({
  kind: "free",
  name: "Mio plugin",
  id: "acme.lyrics",
  description: "Mostra i testi in modo migliore.",
  publisher: "Acme",
  license: "MIT",
  packageUrl: "https://example.com/acme.lyrics-1.0.0.cpkg",
  contact: "dev@example.com",
  confirm: Object.fromEntries(CONFIRMATIONS.free.map((key) => [key, true])),
});
const paid = () => ({
  ...free(),
  kind: "paid",
  id: "acme.lyrics-pro",
  authorKey: "A".repeat(43),
  signature: "B".repeat(86),
  price: "9 €",
  checkoutUrl: "https://acme.lemonsqueezy.com/checkout/buy/abc",
  affiliateUrl: "https://acme.lemonsqueezy.com/affiliates",
  storeId: "123",
  productId: "456",
  confirm: Object.fromEntries(CONFIRMATIONS.paid.map((key) => [key, true])),
});
const errorsOf = (input) => {
  const result = parseSubmission(input);
  assert.equal(result.ok, false);
  return result.errors;
};

test("una proposta gratuita e una a pagamento valide passano, con i dati ripuliti", () => {
  const a = parseSubmission(free());
  assert.equal(a.ok, true);
  assert.equal(a.value.id, "acme.lyrics");
  const b = parseSubmission({ ...paid(), name: "  Lyrics Pro  " });
  assert.equal(b.ok, true);
  assert.equal(b.value.name, "Lyrics Pro");
  assert.equal(b.value.storeId, 123);
  assert.equal(b.value.productId, 456);
});

test("serve una conferma per ogni voce della checklist", () => {
  for (const key of CONFIRMATIONS.paid) {
    const input = paid();
    input.confirm[key] = false;
    assert.equal(errorsOf(input).confirm, "mustConfirm", key);
  }
  // Per un plugin gratuito le voci a pagamento non servono.
  assert.equal(parseSubmission(free()).ok, true);
});

test("identificativo: formato, lunghezza e nomi riservati al progetto", () => {
  for (const id of [
    "",
    "Acme.Lyrics",
    "acme",
    "acme..x",
    "acme.lyrics_pro",
    "a b.c",
    `x.${"a".repeat(90)}`,
  ]) {
    assert.ok(errorsOf({ ...free(), id }).id, id);
  }
  assert.equal(errorsOf({ ...free(), id: "cuelith.bible" }).id, "reservedId");
  assert.equal(errorsOf({ ...free(), id: "core.thing" }).id, "reservedId");
});

test("indirizzi: solo https, senza utente e password, e per il negozio solo il dominio ammesso", () => {
  for (const packageUrl of [
    "http://a.it/x.cpkg",
    "ftp://a.it/x",
    "javascript:alert(1)",
    "https://u:p@a.it/x",
    "https://localhost/x",
    "non un indirizzo",
    "",
  ]) {
    assert.ok(errorsOf({ ...free(), packageUrl }).packageUrl, packageUrl);
  }
  for (const checkoutUrl of [
    "https://evil.example/buy",
    "https://lemonsqueezy.com.evil.example/buy",
    "https://lemonsqueezyXcom/buy",
    "http://acme.lemonsqueezy.com/buy",
  ]) {
    assert.ok(errorsOf({ ...paid(), checkoutUrl }).checkoutUrl, checkoutUrl);
  }
  assert.equal(
    parseSubmission({ ...paid(), checkoutUrl: "https://lemonsqueezy.com/buy/x" }).ok,
    true,
  );
});

test("a pagamento: prezzo, negozio, prodotto, affiliati e chiave d'autore sono obbligatori", () => {
  for (const field of [
    "price",
    "checkoutUrl",
    "affiliateUrl",
    "storeId",
    "productId",
    "authorKey",
  ]) {
    assert.equal(errorsOf({ ...paid(), [field]: "" })[field], "required", field);
  }
  for (const storeId of ["0", "-1", "1.5", "abc", "99999999999999"]) {
    assert.equal(errorsOf({ ...paid(), storeId }).storeId, "notInteger", storeId);
  }
  // La chiave e' facoltativa per un plugin gratuito, ma se c'e' deve essere valida.
  assert.equal(parseSubmission({ ...free(), authorKey: "" }).ok, true);
  assert.equal(errorsOf({ ...free(), authorKey: "troppo corta" }).authorKey, "invalidKey");
  // Con la chiave d'autore serve anche la firma del pacchetto; senza chiave la firma non serve.
  assert.equal(errorsOf({ ...paid(), signature: "" }).signature, "required");
  assert.equal(errorsOf({ ...paid(), signature: "corta" }).signature, "invalidSignature");
  assert.equal(parseSubmission({ ...free(), signature: "ignorata" }).ok, true);
  assert.equal(
    parseSubmission({ ...free(), authorKey: "A".repeat(43), signature: "B".repeat(86) }).ok,
    true,
  );
});

test("lunghezze, email e campo trappola", () => {
  assert.equal(errorsOf({ ...free(), name: "A" }).name, "tooShort");
  assert.equal(errorsOf({ ...free(), name: "A".repeat(61) }).name, "tooLong");
  assert.equal(errorsOf({ ...free(), description: "corta" }).description, "tooShort");
  assert.equal(errorsOf({ ...free(), contact: "senza chiocciola" }).contact, "invalidEmail");
  assert.equal(errorsOf({ ...free(), company: "Spam SRL" }).company, "spam");
  assert.deepEqual(Object.keys(errorsOf(null)).includes("kind"), true);
  assert.equal(errorsOf({ ...free(), kind: "altro" }).kind, "required");
});

// ---- le funzioni ----

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
const indexWith = (...plugins) =>
  JSON.stringify({ schema: 2, generatedAt: "2026-10-05T10:00:00.000Z", plugins });
const stubIndex = (body) => {
  globalThis.fetch = async (url) =>
    String(url) === MODULES_INDEX_V2 && body !== undefined
      ? new Response(body)
      : new Response("no", { status: 404 });
};
const entry = (extra = {}) => ({
  id: "acme.lyrics-pro",
  name: "Lyrics Pro",
  description: "x",
  family: "function",
  verified: false,
  access: "paid",
  price: "9 €",
  checkoutUrl: "https://acme.lemonsqueezy.com/checkout/buy/abc?aff=cuelith",
  versions: [{ version: "1.0.0", permissions: [] }],
  ...extra,
});

test("Acquista porta al negozio dell'autore, scelto dal catalogo e mai dal visitatore", async () => {
  stubIndex(indexWith(entry()));
  const response = await buy({ params: { id: "acme.lyrics-pro" } });
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    "https://acme.lemonsqueezy.com/checkout/buy/abc?aff=cuelith",
  );
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("Acquista: 404 per un plugin gratuito, sconosciuto, con id strano o con negozio non ammesso", async () => {
  stubIndex(
    indexWith(
      entry({ id: "acme.free", access: "free", checkoutUrl: undefined }),
      entry({ id: "acme.evil", checkoutUrl: "https://evil.example/buy" }),
      entry({ id: "acme.http", checkoutUrl: "http://acme.lemonsqueezy.com/buy" }),
      entry({ id: "acme.creds", checkoutUrl: "https://u:p@acme.lemonsqueezy.com/buy" }),
      entry({ id: "acme.nourl", checkoutUrl: undefined }),
    ),
  );
  for (const id of [
    "acme.free",
    "acme.evil",
    "acme.http",
    "acme.creds",
    "acme.nourl",
    "acme.missing",
    "../x",
    "ACME",
    "",
    "a".repeat(200),
  ]) {
    assert.equal((await buy({ params: { id } })).status, 404, id);
  }
  stubIndex(undefined);
  assert.equal(
    (await buy({ params: { id: "acme.lyrics-pro" } })).status,
    404,
    "catalogo non raggiungibile",
  );
});

test("l'indirizzo di acquisto ammesso: https, dominio del negozio, niente utente e password", () => {
  assert.ok(checkoutOf({ access: "paid", checkoutUrl: "https://a.lemonsqueezy.com/x" }));
  assert.equal(
    checkoutOf({ access: "free", checkoutUrl: "https://a.lemonsqueezy.com/x" }),
    undefined,
  );
  assert.equal(
    checkoutOf({ access: "paid", checkoutUrl: "https://lemonsqueezyXcom/x" }),
    undefined,
  );
  assert.equal(checkoutOf(undefined), undefined);
});

test("i plugin pubblici portano tipo, prezzo e se si puo' acquistare, mai l'indirizzo", () => {
  const [paidOne, freeOne] = publicModules({
    plugins: [
      entry({ publisher: "Acme", license: "EULA" }),
      { ...entry({ id: "cuelith.songs" }), access: "free", price: "1 €" },
    ],
  });
  assert.equal(paidOne.access, "paid");
  assert.equal(paidOne.price, "9 €");
  assert.equal(paidOne.buyable, true);
  assert.equal(paidOne.publisher, "Acme");
  assert.equal(freeOne.access, "free");
  assert.equal(freeOne.price, "");
  assert.equal(freeOne.buyable, false);
  assert.doesNotMatch(JSON.stringify([paidOne, freeOne]), /lemonsqueezy|checkout/i);
});

test("i plugin si leggono dall'indice 2 e, se non risponde o e' illeggibile, dall'indice 1", async () => {
  const v1 = JSON.stringify({
    plugins: [{ id: "cuelith.songs", name: "Canti", versions: [{ version: "1.0.0" }] }],
  });
  const fetcher = (v2) => async (url) => {
    if (url === MODULES_INDEX_V2)
      return v2 === undefined ? new Response("no", { status: 404 }) : new Response(v2);
    if (url === MODULES_INDEX) return new Response(v1);
    throw new Error(url);
  };
  assert.deepEqual(
    (await loadModules(fetcher(indexWith(entry())))).map((m) => m.id),
    ["acme.lyrics-pro"],
  );
  assert.deepEqual(
    (await loadModules(fetcher(undefined))).map((m) => m.id),
    ["cuelith.songs"],
  );
  assert.deepEqual(
    (await loadModules(fetcher("non json"))).map((m) => m.id),
    ["cuelith.songs"],
  );
  assert.equal(await loadModules(async () => new Response("no", { status: 500 })), undefined);
  assert.equal(
    (await loadCheckout("acme.lyrics-pro", fetcher(indexWith(entry())))) !== undefined,
    true,
  );
});

const post = (body, headers = { "Content-Type": "application/json" }) =>
  submit({
    request: new Request("https://x.test/api/marketplace/submit", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  });

test("invio: controlla tipo, forma e contenuto; una proposta valida riceve 503 finche' non c'e' dove conservarla", async () => {
  assert.equal((await post(free(), { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await post("{non json")).status, 400);
  const bad = await post({ ...free(), id: "cuelith.x" });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).errors.id, "reservedId");
  assert.equal((await post("x".repeat(20_000))).status, 413);
  const ok = await post(free());
  assert.equal(ok.status, 503);
  assert.equal((await ok.json()).error, "unavailable");
  assert.equal(ok.headers.get("Cache-Control"), "no-store");
  assert.equal(submitAny({}).status, 405);
});

// ---- Turnstile e pannello ----

import { renderAdmin } from "../src/admin.mjs";
import { TURNSTILE_SCRIPT } from "../src/market.mjs";

for (const lang of ["it", "en"]) {
  test(`proposta ${lang}: il controllo Turnstile c'e' solo con la chiave pubblica, e il suo script solo allora`, () => {
    const content = json(`content/${lang}.json`);
    const without = document(renderSubmit({ content, assets }), lang);
    assert.doesNotMatch(without, /cf-turnstile|challenges\.cloudflare\.com/);
    const withKey = document(
      renderSubmit({ content, assets, turnstileSiteKey: "1x00000000000000000000AA" }),
      lang,
    );
    assert.ok(withKey.includes('class="cf-turnstile" data-sitekey="1x00000000000000000000AA"'));
    assert.ok(withKey.includes(`<script src="${TURNSTILE_SCRIPT}" async defer></script>`));
    // Il controllo sta dentro il modulo, e i messaggi per i suoi errori esistono.
    assert.ok(withKey.indexOf("cf-turnstile") > withKey.indexOf('id="proposal"'));
    assert.ok(
      content.submit.form.result.captcha.length > 0 && content.submit.form.result.rate.length > 0,
    );
    // Una chiave strana non puo' uscire dall'attributo.
    const evil = document(
      renderSubmit({ content, assets, turnstileSiteKey: '"><script>x</script>' }),
      lang,
    );
    assert.doesNotMatch(evil, /<script>x<\/script>/);
  });
}

test("pannello: non si indicizza, non ha collegamenti esterni e la pagina e' vuota (la riempie lo script)", () => {
  const { head, body } = renderAdmin({
    assets: { ...assets, script: '<script src="/assets/admin.js" defer></script>' },
  });
  const html = document({ head, body }, "it");
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(html, /canonical|hreflang|og:/);
  assert.deepEqual(externals(html), []);
  assert.ok(html.includes("data-pending") && html.includes("data-done"));
  assert.ok(html.includes('src="/assets/admin.js"'));
});

// ---- condizioni del marketplace ----

const termsPage = (lang) =>
  document(renderTerms({ content: json(`content/${lang}.json`), assets }), lang);

test("condizioni: le undici sezioni nelle due lingue, con la commissione al posto giusto e nessun segnaposto", () => {
  const [it, en] = [json("content/it.json").terms, json("content/en.json").terms];
  assert.equal(it.sections.length, 11);
  assert.equal(en.sections.length, 11);
  // Stessa struttura nelle due lingue: stesso numero di paragrafi ed elenchi per sezione.
  assert.deepEqual(
    it.sections.map((s) => [s.paragraphs.length, s.items?.length ?? 0, s.after !== undefined]),
    en.sections.map((s) => [s.paragraphs.length, s.items?.length ?? 0, s.after !== undefined]),
  );
  assert.deepEqual(Object.keys(it).sort(), Object.keys(en).sort());
  for (const lang of ["it", "en"]) {
    const html = termsPage(lang);
    assert.match(html, /10%/);
    assert.doesNotMatch(html, /\{percent\}/);
    assert.equal((html.match(/<h2>\d+\. /g) ?? []).length, 11);
    assert.doesNotMatch(html.replace(/Cloudflare \(Turnstile\)/g, ""), /Cloudflare|KV/);
    assert.match(html, new RegExp(`<html lang="${lang}">`));
    assert.match(
      html,
      new RegExp(
        `hreflang="${lang === "it" ? "en" : "it"}" href="https://cuelith.lzrhive.it${lang === "it" ? "/en/marketplace/terms/" : "/marketplace/condizioni/"}"`,
      ),
    );
    // Gli unici collegamenti esterni sono quelli fissi del piede.
    assert.deepEqual(
      externals(html).filter((url) => !isAllowed(url, [DEV_LINKS.template])),
      [],
    );
  }
});

test("condizioni: dicono quello che il software fa (vendita libera altrove, licenze esistenti, nessuna penale)", () => {
  const html = termsPage("it");
  for (const phrase of [
    "non costituisce un accordo di esclusiva",
    "non toglie la licenza a chi ha già acquistato",
    "Nessuna penale",
    "ordine alfabetico",
    "14 giorni",
    "disattiva o la abbassa",
  ]) {
    assert.ok(html.includes(phrase), phrase);
  }
  const en = termsPage("en");
  for (const phrase of [
    "not an exclusivity agreement",
    "does not take away the licence",
    "No penalty",
    "alphabetical",
    "14 days",
  ]) {
    assert.ok(en.includes(phrase), phrase);
  }
});

test("condizioni: la pagina di proposta le richiama, la casella e' obbligatoria e il piede porta il collegamento", () => {
  for (const lang of ["it", "en"]) {
    const path = json(`content/${lang}.json`).terms.path;
    const submitHtml = submitPage(lang);
    assert.ok(submitHtml.includes(`href="${path}"`));
    assert.match(submitHtml, /name="confirm\.terms" value="1" required/);
    assert.ok(market(lang, [paidModule]).includes(`href="${path}"`), "piede del marketplace");
  }
  // L'invio senza la conferma delle condizioni e' rifiutato dal server.
  const input = free();
  input.confirm.terms = false;
  assert.equal(errorsOf(input).confirm, "mustConfirm");
  assert.ok(CONFIRMATIONS.free.includes("terms") && CONFIRMATIONS.paid.includes("terms"));
});
