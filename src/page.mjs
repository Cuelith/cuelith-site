import { esc, fill, formatDate, pluginCards, pluginList, versionList } from "./shared.js";

// Le pagine di Cuelith, per una lingua. Ricevono i testi (content), i dati del
// momento (versioni, plugin) e le immagini preparate, e restituiscono l'HTML.
// La home e' breve; funzioni, plugin, download, domande e contatti hanno la
// loro pagina, tutte con la stessa testata, lo stesso menu e lo stesso piede.

const SITE = "https://cuelith.lzrhive.it";
// Gli unici due indirizzi esterni della pagina: il sostegno (Ko-fi) e l'hub dei
// progetti. Cambiano qui e in test/site.test.mjs.
const KOFI = "https://ko-fi.com/mlhive";
const HUB = "https://lzrhive.it/";

/** Una schermata del programma, nella misura giusta per lo schermo di chi guarda. */
function shot(image, alt, { eager = false, sizes = "(min-width: 1100px) 620px, 92vw" } = {}) {
  const srcset = image.files.map((file) => `${file.src} ${String(file.width)}w`).join(", ");
  const fallback = image.files.at(-1);
  return `<img src="${fallback.src}" srcset="${srcset}" sizes="${sizes}" width="${String(image.width)}" height="${String(image.height)}" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}>`;
}

const arrow =
  '<svg viewBox="0 0 20 20" aria-hidden="true" width="18" height="18"><path d="M10 3v10m0 0 4-4m-4 4-4-4M4 16.5h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Gli indirizzi delle pagine, per lingua. Le chiavi sono quelle del menu. */
export const MARKETPLACE_PATHS = { it: "/marketplace/", en: "/en/marketplace/" };
export const SUBMIT_PATHS = { it: "/marketplace/submit/", en: "/en/marketplace/submit/" };
export const TERMS_PATHS = { it: "/marketplace/condizioni/", en: "/en/marketplace/terms/" };
export const PRIVACY_PATHS = { it: "/privacy/", en: "/en/privacy/" };
export const PAGE_PATHS = {
  features: { it: "/funzioni/", en: "/en/features/" },
  plugins: { it: "/plugin/", en: "/en/plugins/" },
  download: { it: "/scarica/", en: "/en/download/" },
  faq: { it: "/domande/", en: "/en/faq/" },
  contact: { it: "/contatti/", en: "/en/contact/" },
};
/** Le voci del menu, in ordine: la chiave dice anche quale testo (nav.<chiave>) e quale indirizzo. */
const MENU = ["home", "features", "plugins", "marketplace", "faq"];
const HOME_PATHS = { it: "/", en: "/en/" };
const pathOf = (key, lang) =>
  (key === "home" ? HOME_PATHS : key === "marketplace" ? MARKETPLACE_PATHS : PAGE_PATHS[key])[lang];

/**
 * Il piede della pagina, uguale in tutte le pagine del sito. `alternate` e'
 * l'indirizzo della stessa pagina nell'altra lingua.
 */
export function siteFooter(c, assets, { single = false, alternate }) {
  const to = (path) => (single ? "#" : path);
  return `<footer class="foot">
  <div class="wrap foot__row">
    <div>
      <img src="${assets.logo}" alt="Cuelith" width="120" height="32" loading="lazy">
      <p>${esc(c.footer.tagline)}</p>
    </div>
    <ul>
      <li><a href="/download/source">${esc(c.footer.source)}</a></li>
      <li><a href="${to(PAGE_PATHS.contact[c.lang])}">${esc(c.footer.contact)}</a></li>
      <li><a href="${to(MARKETPLACE_PATHS[c.lang])}">${esc(c.footer.marketplace)}</a></li>
      <li><a href="${to(SUBMIT_PATHS[c.lang])}">${esc(c.footer.submit)}</a></li>
      <li><a href="${to(TERMS_PATHS[c.lang])}">${esc(c.footer.terms)}</a></li>
      <li><a href="${to(PRIVACY_PATHS[c.lang])}">${esc(c.footer.privacyLink)}</a></li>
      <li><a href="${KOFI}" target="_blank" rel="noopener">${esc(c.footer.kofi)}</a></li>
      <li><a href="${c.lang === "it" ? HUB : `${HUB}en`}" target="_blank" rel="noopener">${esc(c.footer.hub)}</a></li>
      <li><a href="${to(alternate)}" lang="${c.lang === "it" ? "en" : "it"}">${esc(c.nav.language)}</a></li>
      <li><a href="#contenuto">${esc(c.footer.top)}</a></li>
    </ul>
    <p class="foot__small">${esc(c.footer.license)}<br>${esc(c.footer.privacy)}</p>
  </div>
</footer>`;
}

/**
 * La barra in alto, uguale in tutte le pagine: logo, menu, lingua e Download.
 * Sul telefono il menu diventa un pulsante che apre l'elenco (un <details>,
 * senza script). `current` e' la chiave della pagina che si sta leggendo.
 */
export function siteHeader(
  c,
  assets,
  { single = false, current = "", alternate, progress = false },
) {
  const to = (path) => (single ? "#" : path);
  const other = c.lang === "it" ? "en" : "it";
  const mark = (key) => (key === current ? ' aria-current="page"' : "");
  const download = to(PAGE_PATHS.download[c.lang]);
  return `<a class="skip" href="#contenuto">${esc(c.nav.skip)}</a>
<header class="top">
  <div class="wrap top__row">
    <a class="brand" href="${to(c.path)}" aria-label="Cuelith"><img src="${assets.logo}" alt="Cuelith" width="150" height="40"></a>
    <nav aria-label="${esc(c.nav.label)}" class="top__nav">
      ${MENU.map((key) => `<a href="${to(pathOf(key, c.lang))}"${mark(key)}>${esc(c.nav[key])}</a>`).join("\n      ")}
    </nav>
    <a class="top__lang" href="${to(alternate)}" lang="${other}" aria-label="${esc(c.nav.languageLabel)}">${esc(c.nav.language)}</a>
    <a class="button button--primary button--small top__download" href="${download}"${mark("download")}>${esc(c.nav.download)}</a>
    <details class="menu">
      <summary><span>${esc(c.nav.menu)}</span><i aria-hidden="true"></i></summary>
      <nav class="menu__panel" aria-label="${esc(c.nav.label)}">
        ${MENU.map((key) => `<a href="${to(pathOf(key, c.lang))}"${mark(key)}>${esc(c.nav[key])}</a>`).join("\n        ")}
        <a href="${to(PAGE_PATHS.contact[c.lang])}"${mark("contact")}>${esc(c.nav.contact)}</a>
        <a class="button button--primary" href="${download}">${esc(c.nav.download)}</a>
      </nav>
    </details>
  </div>${progress ? '\n  <span class="top__progress" aria-hidden="true"></span>' : ""}
</header>`;
}

/**
 * Intestazione del documento, testata, contenuto, piede e script: uguali per
 * tutte le pagine. `page` porta `path` e `meta`; `alt` gli indirizzi nelle due
 * lingue; `jsonLd` e' facoltativo (solo la home descrive il programma).
 */
function pageShell({ c, page, alt, current, body, assets, single, strings, jsonLd = "" }) {
  const url = `${SITE}${page.path}`;
  const head = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.meta.title)}</title>
<meta name="description" content="${esc(page.meta.description)}">
<meta name="theme-color" content="#0B0C0E">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="it" href="${SITE}${alt.it}">
<link rel="alternate" hreflang="en" href="${SITE}${alt.en}">
<link rel="alternate" hreflang="x-default" href="${SITE}${alt.en}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Cuelith">
<meta property="og:title" content="${esc(page.meta.title)}">
<meta property="og:description" content="${esc(page.meta.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}${assets.social}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${assets.icon}" type="image/svg+xml">
${single ? "" : jsonLd}
${assets.flag ?? ""}
${assets.styles}`;

  const html = `${siteHeader(c, assets, { single, current, alternate: alt[c.lang === "it" ? "en" : "it"], progress: true })}

<main id="contenuto">
${body}
</main>

${siteFooter(c, assets, { single, alternate: alt[c.lang === "it" ? "en" : "it"] })}
<script type="application/json" id="strings">${JSON.stringify(strings).replace(/</g, "\\u003c")}</script>
${assets.script}`;
  return { head, body: html };
}

// ---- le sezioni, una per una: ogni pagina ne sceglie alcune ----

/** Il titolo di una sezione: h1 quando la sezione apre la pagina, h2 altrimenti. */
const heading = (first, text, motion = "up") =>
  first
    ? `<h1 data-reveal="${motion}">${esc(text)}</h1>`
    : `<h2 data-reveal="${motion}">${esc(text)}</h2>`;
/** Le sezioni che aprono una pagina (senza la grande testata della home) hanno piu' aria sopra. */
const opening = (first) => (first ? " section--first" : "");

function heroSection({ c, shots, heroMeta, single }) {
  return `<section class="hero">
  <div class="wrap hero__grid">
    <div class="hero__text" data-stagger>
      <p class="eyebrow" data-reveal="up">${esc(c.hero.eyebrow)}</p>
      <h1 data-reveal="up">${esc(c.hero.title)}</h1>
      <p class="lead" data-reveal="up">${esc(c.hero.lead)}</p>
      <div class="hero__actions" data-reveal="up">
        <a class="button button--primary" href="/download/windows" data-download>${arrow}<span data-download-label>${esc(c.hero.primaryGeneric)}</span></a>
        <a class="button" href="${single ? "#" : PAGE_PATHS.features[c.lang]}">${esc(c.hero.secondary)}</a>
      </div>
      <p class="hero__meta" data-hero-meta data-reveal="fade">${esc(heroMeta)}</p>
    </div>
    <div class="scene" role="img" aria-label="${esc(c.hero.shotAlt)}" data-scene>
      <div class="scene__piece scene__room">
        <figure class="window window--live" data-reveal="right">${shot(shots["uscita-sala"], "", { eager: true, sizes: "(min-width: 1000px) 480px, 76vw" })}<figcaption>${esc(c.hero.scene.room)}</figcaption></figure>
      </div>
      <div class="scene__piece scene__desk">
        <figure class="window" data-reveal="up">${shot(shots.regia, "", { eager: true, sizes: "(min-width: 1000px) 420px, 66vw" })}<figcaption>${esc(c.hero.scene.desk)}</figcaption></figure>
      </div>
      <div class="scene__piece scene__phone">
        <figure class="window window--phone" data-reveal="right">${shot(shots.telecomando, "", { eager: true, sizes: "130px" })}<figcaption>${esc(c.hero.scene.remote)}</figcaption></figure>
      </div>
    </div>
  </div>
</section>`;
}

function factsSection(c) {
  return `<section class="facts" aria-label="${esc(c.facts.label)}">
  <div class="wrap">
    <dl class="facts__grid" data-stagger>
      ${c.facts.items.map((fact) => `<div data-reveal="scale"><dt data-count>${esc(fact.value)}</dt><dd>${esc(fact.label)}</dd></div>`).join("\n      ")}
    </dl>
    <p class="facts__note" data-reveal="fade">${esc(c.facts.note)}</p>
  </div>
</section>`;
}

function pillarsSection(c) {
  return `<section class="section">
  <div class="wrap">
    <p class="eyebrow" data-reveal="fade">${esc(c.pillars.eyebrow)}</p>
    <h2 data-reveal="up">${esc(c.pillars.title)}</h2>
    <ol class="pillars" data-stagger>
      ${c.pillars.items
        .map(
          (item) => `<li data-reveal="draw">
        <span class="pillars__tag">${esc(item.tag)}</span>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.text)}</p>
      </li>`,
        )
        .join("\n      ")}
    </ol>
  </div>
</section>`;
}

/** Le porte d'ingresso della home verso le altre pagine. */
function doorsSection(c, single) {
  return `<section class="section section--tint">
  <div class="wrap">
    <p class="eyebrow" data-reveal="fade">${esc(c.doors.eyebrow)}</p>
    <h2 data-reveal="up">${esc(c.doors.title)}</h2>
    <ul class="doors" data-stagger>
      ${c.doors.items
        .map(
          (item) => `<li data-reveal="up">
        <a class="door" href="${single ? "#" : PAGE_PATHS[item.key][c.lang]}">
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.text)}</p>
          <span class="door__go">${esc(item.action)}<svg viewBox="0 0 20 20" aria-hidden="true" width="16" height="16"><path d="M4 10h11m0 0-4-4m4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        </a>
      </li>`,
        )
        .join("\n      ")}
    </ul>
  </div>
</section>`;
}

/** Invito finale al download, in fondo a ogni pagina. */
function downloadBand(c, single) {
  return `<section class="section cta">
  <div class="wrap cta__row" data-stagger>
    <div>
      <h2 data-reveal="land">${esc(c.download.title)}</h2>
      <p class="lead lead--section" data-reveal="up">${esc(c.download.lead)}</p>
    </div>
    <div class="cta__actions" data-reveal="up">
      <a class="button button--primary button--big" href="/download/windows" data-download>${arrow}<span data-download-label>${esc(c.hero.primaryGeneric)}</span></a>
      <a class="link" href="${single ? "#" : PAGE_PATHS.download[c.lang]}">${esc(c.cta.more)}</a>
    </div>
  </div>
</section>`;
}

function featuresSection(c, shots, first) {
  return `<section class="section${opening(first)}" id="funzioni">
  <div class="wrap">
    <p class="eyebrow" data-reveal="fade">${esc(c.features.eyebrow)}</p>
    ${heading(first, c.features.title)}
    ${c.features.rows
      .map((row, index) => {
        // Testo e immagine entrano da lati opposti, alternati riga per riga.
        const textFrom = index % 2 === 0 ? "left" : "right";
        const mediaFrom = index % 2 === 0 ? "right" : "left";
        const inset = row.shot2
          ? `<figure class="window window--inset" data-reveal="up">${shot(shots[row.shot2], "", { sizes: "(min-width: 1100px) 300px, 46vw" })}</figure>`
          : "";
        return `<article class="feature${row.portrait ? " feature--portrait" : ""}">
      <div class="feature__text" data-stagger>
        <h3 data-reveal="${textFrom}">${esc(row.title)}</h3>
        <p data-reveal="${textFrom}">${esc(row.text)}</p>
        <ul>${row.points.map((point) => `<li data-reveal="up">${esc(point)}</li>`).join("")}</ul>
      </div>
      <div class="feature__media${row.shot2 ? " feature__media--pair" : ""}" data-parallax>
        <figure class="window${row.portrait ? " window--phone" : ""}" data-reveal="${mediaFrom}">${shot(shots[row.shot], row.alt, row.portrait ? { sizes: "280px" } : undefined)}</figure>
        ${inset}
      </div>
    </article>`;
      })
      .join("\n    ")}
  </div>
</section>`;
}

function audienceSection(c) {
  return `<section class="section section--tint">
  <div class="wrap">
    <p class="eyebrow" data-reveal="fade">${esc(c.audience.eyebrow)}</p>
    <h2 data-reveal="up">${esc(c.audience.title)}</h2>
    <ul class="audience" data-stagger>
      ${c.audience.items
        .map(
          (item) => `<li data-reveal="down">
        <span class="badge badge--${item.status}">${esc(c.plugins.status[item.status])}</span>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.text)}</p>
      </li>`,
        )
        .join("\n      ")}
    </ul>
  </div>
</section>`;
}

function pluginsSection({ c, plugins, groups, strings, single, first }) {
  return `<section class="section${opening(first)}" id="plugin">
  <div class="wrap">
    <p class="eyebrow" data-reveal="fade">${esc(c.plugins.eyebrow)}</p>
    ${heading(first, c.plugins.title)}
    <p class="lead lead--section" data-reveal="up">${esc(c.plugins.lead)}</p>
    <div class="filters" data-reveal="up" role="group" aria-label="${esc(c.plugins.filterLabel)}">
      <span class="filters__label">${esc(c.plugins.filterLabel)}</span>
      ${groups
        .map(
          (group) =>
            `<button type="button" class="chip" data-filter="${group}" aria-pressed="${group === "all" ? "true" : "false"}">${esc(c.plugins.filters[group])}</button>`,
        )
        .join("\n      ")}
    </div>
    <div data-plugins>
${pluginCards(plugins, strings.plugins)}
    </div>
    <p class="plugins__note">${esc(c.plugins.soonNote)} <a class="link" href="${single ? "#" : MARKETPLACE_PATHS[c.lang]}">${esc(c.plugins.marketplaceLink)}</a></p>
    <aside class="developers" data-reveal="up">
      <div>
        <h3>${esc(c.plugins.developers.title)}</h3>
        <p>${esc(c.plugins.developers.text)}</p>
      </div>
      <div class="developers__actions">
        <a class="button" href="/download/source">${arrow}${esc(c.plugins.developers.action)}</a>
        <a class="button" href="${single ? "#" : SUBMIT_PATHS[c.lang]}">${esc(c.plugins.developers.propose)}</a>
      </div>
    </aside>
  </div>
</section>`;
}

function downloadSection({ c, versionLine, first }) {
  return `<section class="section section--tint${opening(first)}" id="download">
  <div class="wrap download">
    <div data-stagger>
      <p class="eyebrow" data-reveal="fade">${esc(c.download.eyebrow)}</p>
      ${heading(first, c.download.title, "land")}
      <p class="lead lead--section" data-reveal="up">${esc(c.download.lead)}</p>
      <div class="download__buttons" data-reveal="up">
        <a class="button button--primary button--big" href="/download/windows" data-os="windows">${arrow}<span><strong>${esc(c.download.windows)}</strong><small>${esc(c.download.windowsHint)}</small></span></a>
        <a class="button button--big" href="/download/linux" data-os="linux">${arrow}<span><strong>${esc(c.download.linux)}</strong><small>${esc(c.download.linuxHint)}</small></span></a>
      </div>
      <p class="download__version" data-download-version data-reveal="fade">${esc(versionLine)}</p>
    </div>
    <div class="download__notes" data-reveal="right">
      <h3>${esc(c.download.notesTitle)}</h3>
      <ul>${c.download.notes.map((note) => `<li>${esc(note)}</li>`).join("")}</ul>
      <a class="link" href="/download/source">${esc(c.download.source)}</a>
    </div>
  </div>
</section>`;
}

function versionsSection({ c, releases }) {
  return `<section class="section" id="versioni">
  <div class="wrap wrap--narrow">
    <p class="eyebrow" data-reveal="fade">${esc(c.versions.eyebrow)}</p>
    <h2 data-reveal="up">${esc(c.versions.title)}</h2>
    <p class="lead lead--section" data-reveal="up">${esc(c.versions.lead)}</p>
    <div class="versions" data-versions data-stagger>
${versionList(releases, c.versions, c.locale)}
    </div>
  </div>
</section>`;
}

/** Le domande, raggruppate per tema (gli indici stanno in faq.groups). */
function faqSection(c, single) {
  const item = (i) => {
    const entry = c.faq.items[i];
    return `<details data-reveal="up"><summary>${esc(entry.q)}</summary><p>${esc(entry.a)}</p></details>`;
  };
  return `<section class="section section--tint section--first" id="domande">
  <div class="wrap wrap--narrow">
    <p class="eyebrow" data-reveal="fade">${esc(c.faq.eyebrow)}</p>
    <h1 data-reveal="up">${esc(c.faq.title)}</h1>
    ${c.faq.groups
      .map(
        (group) => `<div class="faq-group">
      <h2 class="faq-group__title" data-reveal="up">${esc(group.title)}</h2>
      <div class="faq" data-stagger>
        ${group.items.map(item).join("\n        ")}
      </div>
    </div>`,
      )
      .join("\n    ")}
    <p class="faq__more" data-reveal="up">${esc(c.faq.more)} <a class="link" href="${single ? "#" : PAGE_PATHS.contact[c.lang]}">${esc(c.faq.moreLink)}</a></p>
  </div>
</section>`;
}

function supportSection(c) {
  return `<section class="section support" aria-labelledby="sostegno">
  <div class="wrap">
  <div class="support__row">
    <div data-stagger>
      <p class="eyebrow" data-reveal="fade">${esc(c.support.eyebrow)}</p>
      <h2 id="sostegno" data-reveal="up">${esc(c.support.title)}</h2>
      <p class="lead lead--section" data-reveal="up">${esc(c.support.text)}</p>
    </div>
    <div class="support__action" data-stagger>
      <a class="button button--primary" href="${KOFI}" target="_blank" rel="noopener" data-reveal="scale">${esc(c.support.kofi)}</a>
      <p class="support__note" data-reveal="fade">${esc(c.support.note)}</p>
    </div>
  </div>
  </div>
</section>`;
}

/** Contatti: l'indirizzo in chiaro (fuori dall'offuscamento email di Cloudflare) e a cosa serve. */
function contactSection({ c, contact, single }) {
  const mark = String.fromCharCode(1);
  const link =
    contact === ""
      ? esc(c.footer.noContact)
      : `<!--email_off--><a class="link" href="mailto:${esc(contact)}">${esc(contact)}</a><!--/email_off-->`;
  const inline = (text) =>
    esc(fill(text, { contact: mark }))
      .split(mark)
      .join(link);
  const to = (path) => (single ? "#" : path);
  return `<section class="section section--first" id="contatti">
  <div class="wrap wrap--narrow">
    <p class="eyebrow" data-reveal="fade">${esc(c.contact.eyebrow)}</p>
    <h1 data-reveal="up">${esc(c.contact.title)}</h1>
    <p class="lead lead--section" data-reveal="up">${esc(c.contact.lead)}</p>
    <p class="contact__address" data-reveal="up">${link}</p>
    <ul class="contact" data-stagger>
      ${c.contact.items
        .map(
          (item) => `<li data-reveal="up">
        <h3>${esc(item.title)}</h3>
        <p>${inline(item.text)}</p>
      </li>`,
        )
        .join("\n      ")}
    </ul>
    <p class="contact__links" data-reveal="fade">
      <a class="link" href="${to(TERMS_PATHS[c.lang])}">${esc(c.footer.terms)}</a> ·
      <a class="link" href="${to(PRIVACY_PATHS[c.lang])}">${esc(c.footer.privacyLink)}</a> ·
      <a class="link" href="${KOFI}" target="_blank" rel="noopener">${esc(c.footer.kofi)}</a> ·
      <a class="link" href="${c.lang === "it" ? HUB : `${HUB}en`}" target="_blank" rel="noopener">${esc(c.footer.hub)}</a>
    </p>
  </div>
</section>`;
}

// ---- le pagine ----

/** Cio' che serve a ogni pagina (e agli script della pagina) dei dati del momento. */
function context({ content: c, releases, modules, catalog }) {
  const latest = releases[0];
  const version = latest?.version ?? "";
  const plugins = pluginList(modules, catalog, c.lang);
  const groups = Object.keys(c.plugins.filters).filter(
    (group) => group === "all" || plugins.some((plugin) => plugin.group === group),
  );
  const heroMeta = version === "" ? "" : fill(c.hero.meta, { version });
  const versionLine =
    latest === undefined
      ? ""
      : fill(c.download.version, { version, date: formatDate(latest.date, c.locale) });
  const strings = {
    lang: c.lang,
    locale: c.locale,
    os: c.os,
    hero: { primary: c.hero.primary, meta: c.hero.meta },
    download: { version: c.download.version },
    plugins: {
      status: c.plugins.status,
      sections: c.plugins.sections,
      filters: c.plugins.filters,
      kind: c.plugins.kind,
      version: c.plugins.version,
      permissionsLabel: c.plugins.permissionsLabel,
      permissions: c.plugins.permissions,
    },
    versions: c.versions,
    catalog,
  };
  return { plugins, groups, heroMeta, versionLine, strings, version };
}

/** Una pagina che non e' la home: stessi dati, titolo e indirizzi dalla voce `pages.<chiave>`. */
function inner(key, input, build) {
  const { content: c, assets, single = false } = input;
  const page = { ...c.pages[key], path: PAGE_PATHS[key][c.lang] };
  const ctx = context(input);
  const body = build({
    c,
    ctx,
    single,
    shots: input.shots,
    releases: input.releases,
    contact: input.contact ?? "",
  });
  return pageShell({
    c,
    page,
    alt: PAGE_PATHS[key],
    current: key,
    body,
    assets,
    single,
    strings: ctx.strings,
  });
}

export function renderHome(input) {
  const { content: c, shots, assets, single = false } = input;
  const ctx = context(input);
  const jsonLd = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Cuelith",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Windows, Linux",
    description: c.meta.description,
    url: `${SITE}${c.path}`,
    inLanguage: c.lang,
    license: "https://www.gnu.org/licenses/gpl-3.0.html",
    ...(ctx.version === "" ? {} : { softwareVersion: ctx.version }),
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  }).replace(/</g, "\\u003c")}</script>`;
  const body = [
    heroSection({ c, shots, heroMeta: ctx.heroMeta, single }),
    factsSection(c),
    pillarsSection(c),
    doorsSection(c, single),
    downloadBand(c, single),
    supportSection(c),
  ].join("\n\n");
  return pageShell({
    c,
    page: c,
    alt: { it: "/", en: "/en/" },
    current: "home",
    body,
    assets,
    single,
    strings: ctx.strings,
    jsonLd,
  });
}
/** Il nome storico: la home. */
export const renderPage = renderHome;

export const renderFeatures = (input) =>
  inner("features", input, ({ c, shots, single }) =>
    [featuresSection(c, shots, true), audienceSection(c), downloadBand(c, single)].join("\n\n"),
  );

export const renderPlugins = (input) =>
  inner("plugins", input, ({ c, ctx, single }) =>
    [
      pluginsSection({
        c,
        plugins: ctx.plugins,
        groups: ctx.groups,
        strings: ctx.strings,
        single,
        first: true,
      }),
      downloadBand(c, single),
    ].join("\n\n"),
  );

export const renderDownload = (input) =>
  inner("download", input, ({ c, ctx, releases }) =>
    [
      downloadSection({ c, versionLine: ctx.versionLine, first: true }),
      versionsSection({ c, releases }),
    ].join("\n\n"),
  );

export const renderFaq = (input) =>
  inner("faq", input, ({ c, single }) =>
    [faqSection(c, single), downloadBand(c, single)].join("\n\n"),
  );

export const renderContact = (input) =>
  inner("contact", input, ({ c, single, contact }) => contactSection({ c, contact, single }));

/** Documento completo per il sito (l'anteprima in un file solo usa head e body a parte). */
export function document({ head, body }, lang) {
  return `<!doctype html>
<html lang="${lang}">
<head>
${head}
</head>
<body>
${body}
</body>
</html>
`;
}
