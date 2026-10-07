// Lo store: la scheda di ogni plugin (cosa fa, chi lo scrive, prezzo, permessi, compatibilita',
// come si installa) e la funzione che la disegna al momento. Niente rete: tutto finto.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { pluginPage } from "../functions/_lib/plugin-page.js";
import { MODULES_INDEX_V2, MODULES_INDEX, publicModules } from "../functions/_lib/sources.js";
import { document } from "../src/page.mjs";
import { rangeText, renderPluginDetail, renderPluginNotFound } from "../src/market.mjs";
import { pluginList } from "../src/shared.js";
import { fakeNetwork } from "./helpers.mjs";

const json = (file) => JSON.parse(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"));
const catalog = json("data/plugins.json");
const assets = {
  logo: "/logo.png",
  icon: "/icon.svg",
  social: "/social.jpg",
  styles: "",
  script: "",
};
const SVG = `data:image/svg+xml;base64,${Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>").toString("base64")}`;

const entry = (extra = {}) => ({
  id: "acme.lyrics-pro",
  name: "Lyrics Pro",
  description: "Testi avanzati con più stili.",
  family: "function",
  publisher: "Acme Studio",
  license: "Proprietaria (EULA)",
  verified: false,
  icon: SVG,
  versions: [
    {
      version: "1.2.0",
      published: "2026-10-05T10:00:00.000Z",
      engines: { cuelith: ">=0.2.0 <1.0.0", protocol: "^1.14.0" },
      url: "https://downloads.acme.example/lyrics-pro-1.2.0.cpkg",
      sha256: "a".repeat(64),
      size: 1000,
      permissions: ["storage", "network:api.acme.example"],
    },
    {
      version: "1.1.0",
      published: "2026-09-01T10:00:00.000Z",
      engines: { cuelith: ">=0.2.0 <1.0.0", protocol: "^1.14.0" },
      url: "https://downloads.acme.example/lyrics-pro-1.1.0.cpkg",
      sha256: "b".repeat(64),
      size: 900,
      permissions: [],
    },
  ],
  ...extra,
});
const paidEntry = (extra = {}) =>
  entry({
    access: "paid",
    price: "9 €",
    checkoutUrl: "https://acme.lemonsqueezy.com/checkout/buy/abc",
    licensing: { provider: "lemonsqueezy", storeId: 1, productId: 2 },
    ...extra,
  });

const plugin = (raw, lang) => {
  const list = pluginList(publicModules({ plugins: [raw] }), catalog, lang);
  return list.find((p) => p.id === raw.id);
};
const detail = (raw, lang = "it") =>
  document(
    renderPluginDetail({
      content: json(`content/${lang}.json`),
      plugin: plugin(raw, lang),
      assets,
    }),
    lang,
  );

for (const lang of ["it", "en"]) {
  test(`${lang}: scheda di un plugin gratuito: tutto quello che serve a sapere prima di installarlo`, () => {
    const c = json(`content/${lang}.json`);
    const html = detail(entry(), lang);
    const base = lang === "it" ? "/marketplace/" : "/en/marketplace/";
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
    assert.match(html, /<h1>Lyrics Pro<\/h1>/);
    assert.ok(html.includes("Acme Studio"), "chi lo scrive");
    assert.ok(html.includes(c.marketplace.trust.unverified), "origine");
    assert.ok(html.includes(`>${c.store.free}<`), "gratuito");
    assert.ok(html.includes("Testi avanzati con più stili."), "cosa fa");
    // Come si installa, con il nome del plugin.
    assert.ok(html.includes(c.store.installSteps[2].replace("{name}", "Lyrics Pro")));
    // Permessi in parole, uno per riga, con l'indirizzo a cui si collega.
    assert.ok(html.includes(c.plugins.permissions.storage));
    assert.ok(
      html.includes(c.plugins.permissions.networkHost.replace("{host}", "api.acme.example")),
    );
    // Compatibilita' in parole, non solo come intervallo di versioni.
    assert.ok(html.includes(rangeText(">=0.2.0 <1.0.0", c.store)));
    assert.doesNotMatch(html, />=0\.2\.0 <1\.0\.0/, "l'intervallo grezzo non compare");
    // Informazioni e versioni.
    for (const label of [
      c.store.publisher,
      c.store.license,
      c.store.version,
      c.store.updated,
      c.store.origin,
    ]) {
      assert.ok(html.includes(label), label);
    }
    assert.equal((html.match(/<li><strong>/g) ?? []).length, 2, "due versioni");
    // Il telefono non installa Cuelith: lo dice, con il collegamento al download.
    assert.ok(html.includes(c.store.phoneTitle));
    assert.ok(html.includes(lang === "it" ? 'href="/scarica/"' : 'href="/en/download/"'));
    // Nessun acquisto, nessun indirizzo del pacchetto o del negozio.
    assert.doesNotMatch(html, /\/marketplace\/buy\/|lemonsqueezy|downloads\.acme\.example|\.cpkg/);
    // Ritorno all'elenco, e indirizzi nelle due lingue.
    assert.ok(html.includes(`href="${base}">← ${c.store.back}`));
    assert.ok(
      html.includes('hreflang="it" href="https://cuelith.lzrhive.it/marketplace/acme.lyrics-pro/"'),
    );
    assert.ok(
      html.includes(
        'hreflang="en" href="https://cuelith.lzrhive.it/en/marketplace/acme.lyrics-pro/"',
      ),
    );
    assert.ok(
      html.includes(
        `<link rel="canonical" href="https://cuelith.lzrhive.it${base}acme.lyrics-pro/">`,
      ),
    );
    assert.match(html, /<title>Lyrics Pro · Marketplace · Cuelith<\/title>/);
  });

  test(`${lang}: scheda di un plugin a pagamento: prezzo, Acquista, chiave e chi vende`, () => {
    const c = json(`content/${lang}.json`);
    const html = detail(paidEntry(), lang);
    assert.ok(html.includes('href="/marketplace/buy/acme.lyrics-pro"'), "Acquista");
    assert.ok(html.includes("9 €"));
    assert.ok(html.includes(c.store.buySteps[2].replace("{name}", "Lyrics Pro")), "chiave");
    assert.ok(html.includes(c.marketplace.soldBy.replace("{publisher}", "Acme Studio")));
    assert.ok(html.includes(c.store.priceNote));
    // L'indirizzo del negozio non e' mai nella pagina: si passa da /marketplace/buy/.
    assert.doesNotMatch(html, /lemonsqueezy/i);
    assert.doesNotMatch(html, /affiliaz|affiliate|referral/i);
    // Non acquistabile (negozio non ammesso): compare ugualmente, senza pulsante.
    const closed = detail(paidEntry({ checkoutUrl: "https://evil.example/x" }), lang);
    assert.doesNotMatch(closed, /\/marketplace\/buy\//);
    assert.ok(closed.includes(c.marketplace.notBuyable));
  });

  test(`${lang}: scheda di un plugin senza permessi, senza icona e senza versioni`, () => {
    const c = json(`content/${lang}.json`);
    const html = detail(
      entry({ icon: undefined, versions: [{ version: "1.0.0", engines: {}, permissions: [] }] }),
      lang,
    );
    assert.ok(html.includes(c.plugins.permissions.none));
    assert.match(html, /app-head__icon--text/);
    assert.match(html, />LP</, "iniziali");
    assert.ok(
      !html.includes(c.store.compatTitle),
      "nessuna compatibilita' dichiarata, nessuna sezione",
    );
    const bare = detail(entry({ versions: [] }), lang);
    assert.ok(!bare.includes(c.store.versionsTitle));
  });

  test(`${lang}: la pagina di un plugin che non c'e' lo dice e riporta all'elenco`, () => {
    const c = json(`content/${lang}.json`);
    const html = document(renderPluginNotFound({ content: c, id: "nope.plugin", assets }), lang);
    assert.ok(html.includes(c.store.notFoundTitle));
    assert.ok(html.includes(lang === "it" ? 'href="/marketplace/"' : 'href="/en/marketplace/"'));
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
  });
}

test("scheda: quello che arriva dal catalogo non diventa mai codice nella pagina", () => {
  const html = detail(
    entry({
      name: "<script>alert(1)</script>",
      publisher: '"><img src=x onerror=alert(2)>',
      description: "<b>grassetto</b> & <i>corsivo</i>",
      license: "<svg onload=alert(3)>",
      icon: "javascript:alert(4)",
    }),
  );
  assert.doesNotMatch(
    html,
    /<script>alert|<img src=x|<svg onload|<b>grassetto|<i>corsivo|javascript:/,
  );
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  // Nel codice per lo store entra solo un'icona SVG in base64, mai un indirizzo qualsiasi.
  const [clean] = publicModules({ plugins: [entry({ icon: "https://evil.example/x.png" })] });
  assert.equal(clean.icon, undefined);
});

test("scheda: i dati pubblici delle versioni non portano indirizzi, impronte ne' dimensioni", () => {
  const [module] = publicModules({ plugins: [entry()] });
  assert.equal(module.versions.length, 2);
  assert.deepEqual(Object.keys(module.versions[0]).sort(), [
    "cuelith",
    "permissions",
    "protocol",
    "published",
    "version",
  ]);
  assert.doesNotMatch(
    JSON.stringify(module),
    /downloads\.acme|\.cpkg|sha256|"url"|checkoutUrl|lemonsqueezy/,
  );
  // Al massimo dodici versioni.
  const many = entry({
    versions: Array.from({ length: 30 }, (_, i) => ({
      version: `1.0.${String(i)}`,
      engines: {},
      permissions: [],
    })),
  });
  assert.equal(publicModules({ plugins: [many] })[0].versions.length, 12);
});

test("intervalli di versioni in parole", () => {
  const st = json("content/it.json").store;
  const en = json("content/en.json").store;
  assert.equal(rangeText(">=0.2.0 <1.0.0", st), "dalla 0.2.0 alla 1.0.0 (esclusa)");
  assert.equal(rangeText(">=0.2.0 <1.0.0", en), "from 0.2.0 up to 1.0.0 (excluded)");
  assert.equal(rangeText("^1.6.0", st), "1.6.0 e successive della serie 1.x");
  assert.equal(rangeText("^0.1.0", st), "la serie 0.1.x (da 0.1.0)");
  assert.equal(rangeText("~2.0", st), "~2.0");
  assert.equal(rangeText(">=1.0.0 <2.0.0 || 3", st), ">=1.0.0 <2.0.0 || 3");
  assert.equal(rangeText("", st), "");
  assert.equal(rangeText(undefined, st), "");
});

// ---- la funzione che disegna la scheda al momento ----

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
const MANIFEST = {
  logo: "/assets/cuelith-logo.png",
  icon: "/assets/cuelith-icon.svg",
  styles: '<link rel="stylesheet" href="/assets/site.css?v=abc">',
  script: "",
  social: { it: "/assets/social-it.jpg", en: "/assets/social-en.jpg" },
};
const context = ({
  id,
  manifest = MANIFEST,
  next = () => new Response("pagina fissa", { status: 200 }),
}) => ({
  params: { id },
  request: new Request("https://cuelith.test/marketplace/x/"),
  env: {
    ASSETS: {
      fetch: async () =>
        manifest === null ? new Response("no", { status: 404 }) : Response.json(manifest),
    },
  },
  next,
});
const registry = (plugins, ok = true) => {
  globalThis.fetch = fakeNetwork([
    [
      MODULES_INDEX_V2,
      ok ? Response.json({ schema: 2, plugins }) : new Response("giu", { status: 500 }),
    ],
    [
      MODULES_INDEX,
      ok ? Response.json({ schema: 1, plugins }) : new Response("giu", { status: 500 }),
    ],
  ]).fetcher;
};

test("funzione: la scheda di un plugin del catalogo, con stile del sito e senza memorizzare nulla di sbagliato", async () => {
  registry([entry(), paidEntry({ id: "acme.premium", name: "Premium" })]);
  const response = await pluginPage(context({ id: "acme.lyrics-pro" }), "it");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /^text\/html/);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=300");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  const html = await response.text();
  assert.match(html, /<h1>Lyrics Pro<\/h1>/);
  assert.ok(
    html.includes('<link rel="stylesheet" href="/assets/site.css?v=abc">'),
    "stile dal manifest",
  );
  assert.ok(html.includes('<html lang="it">'));

  const paid = await pluginPage(context({ id: "acme.premium" }), "en");
  const paidHtml = await paid.text();
  assert.equal(paid.status, 200);
  assert.ok(paidHtml.includes('<html lang="en">'));
  assert.ok(paidHtml.includes('href="/marketplace/buy/acme.premium"'));
  assert.ok(
    paidHtml.includes(
      'rel="canonical" href="https://cuelith.lzrhive.it/en/marketplace/acme.premium/"',
    ),
  );
});

test("funzione: le pagine fisse sotto /marketplace/ passano oltre (proposta, condizioni, acquisto)", async () => {
  registry([entry()]);
  for (const id of [
    "submit",
    "condizioni",
    "terms",
    "buy",
    "Acme.X",
    "..",
    "a.",
    ".a",
    "acme..x",
    "a.b/c",
    "",
  ]) {
    const response = await pluginPage(context({ id }), "it");
    assert.equal(await response.text(), "pagina fissa", `id "${id}"`);
  }
  assert.equal(
    await (await pluginPage({ ...context({ id: "x" }), params: {} }, "it")).text(),
    "pagina fissa",
  );
  assert.equal(
    await (await pluginPage({ ...context({ id: "x" }), params: { id: ["submit"] } }, "it")).text(),
    "pagina fissa",
  );
});

test("funzione: plugin sconosciuto o solo incluso = 404 senza cache; catalogo o stile non disponibili = 503", async () => {
  registry([entry()]);
  const missing = await pluginPage(context({ id: "nope.plugin" }), "it");
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("Cache-Control"), "no-store");
  assert.ok((await missing.text()).includes(json("content/it.json").store.notFoundTitle));

  // Un plugin incluso nel programma (le lingue) ha il suo riquadro ma non una scheda: il suo
  // nome non e' un identificatore di plugin, quindi la pagina passa oltre (e' un 404 del sito).
  const included = catalog.items.find((item) => item.status === "included");
  assert.equal(await (await pluginPage(context({ id: included.id }), "it")).text(), "pagina fissa");

  registry([], false);
  const down = await pluginPage(context({ id: "acme.lyrics-pro" }), "it");
  assert.equal(down.status, 503);
  assert.equal(down.headers.get("Cache-Control"), "no-store");

  registry([entry()]);
  const noStyle = await pluginPage(context({ id: "acme.lyrics-pro", manifest: null }), "it");
  assert.equal(noStyle.status, 503);
});

test("assistenza: compare nella scheda come collegamento, solo se e' https o posta; i valori strani sono scartati", async () => {
  const c = json("content/it.json");
  const withSupport = (support) =>
    document(
      renderPluginDetail({ content: c, plugin: { ...plugin(entry(), "it"), support }, assets }),
      "it",
    );
  const web = withSupport("https://example.com/aiuto");
  assert.ok(web.includes(`<dt>${c.store.support}</dt>`));
  assert.ok(web.includes('href="https://example.com/aiuto"'));
  assert.ok(web.includes('rel="noopener nofollow"'));
  assert.ok(withSupport("mailto:aiuto@example.com").includes(">aiuto@example.com</a>"));
  assert.equal(withSupport(undefined).includes(`<dt>${c.store.support}</dt>`), false);
  // Quel che arriva dal registro si filtra di nuovo qui: niente javascript:, niente http, niente credenziali.
  const { isSupportLink, loadSupport, SUPPORT_INDEX } =
    await import("../functions/_lib/sources.js");
  for (const bad of ["javascript:alert(1)", "http://example.com", "https://u@example.com", 7, ""]) {
    assert.equal(isSupportLink(bad), false, String(bad));
  }
  const fetcher = (url) =>
    Promise.resolve(
      url === SUPPORT_INDEX
        ? new Response(
            JSON.stringify({
              support: { "a.b": "https://example.com", "c.d": "javascript:alert(1)" },
            }),
          )
        : new Response("", { status: 404 }),
    );
  assert.deepEqual(await loadSupport(fetcher), { "a.b": "https://example.com" });
  assert.deepEqual(await loadSupport(() => Promise.resolve(new Response("", { status: 500 }))), {});
});
