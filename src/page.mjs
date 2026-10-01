import { esc, fill, formatDate, pluginCards, pluginList, versionList } from "./shared.js";

// La pagina di Cuelith, per una lingua. Riceve i testi (content), i dati del
// momento (versioni, plugin) e le immagini preparate, e restituisce l'HTML.

const SITE = "https://cuelith.lzrhive.it";

/** Una schermata del programma, nella misura giusta per lo schermo di chi guarda. */
function shot(image, alt, { eager = false, sizes = "(min-width: 1100px) 620px, 92vw" } = {}) {
  const srcset = image.files.map((file) => `${file.src} ${String(file.width)}w`).join(", ");
  const fallback = image.files.at(-1);
  return `<img src="${fallback.src}" srcset="${srcset}" sizes="${sizes}" width="${String(image.width)}" height="${String(image.height)}" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}>`;
}

const arrow =
  '<svg viewBox="0 0 20 20" aria-hidden="true" width="18" height="18"><path d="M10 3v10m0 0 4-4m-4 4-4-4M4 16.5h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function renderPage({
  content: c,
  releases,
  modules,
  catalog,
  shots,
  assets,
  single = false,
}) {
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

  const head = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.meta.title)}</title>
<meta name="description" content="${esc(c.meta.description)}">
<meta name="theme-color" content="#0B0C0E">
<link rel="canonical" href="${SITE}${c.path}">
<link rel="alternate" hreflang="it" href="${SITE}/">
<link rel="alternate" hreflang="en" href="${SITE}/en/">
<link rel="alternate" hreflang="x-default" href="${SITE}/en/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Cuelith">
<meta property="og:title" content="${esc(c.meta.title)}">
<meta property="og:description" content="${esc(c.meta.description)}">
<meta property="og:url" content="${SITE}${c.path}">
<meta property="og:image" content="${SITE}${assets.social}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${assets.icon}" type="image/svg+xml">
${assets.styles}`;

  const body = `<a class="skip" href="#contenuto">${esc(c.nav.features)}</a>
<header class="top">
  <div class="wrap top__row">
    <a class="brand" href="${c.path}" aria-label="Cuelith"><img src="${assets.logo}" alt="Cuelith" width="150" height="40"></a>
    <nav aria-label="${esc(c.nav.label)}" class="top__nav">
      <a href="#funzioni">${esc(c.nav.features)}</a>
      <a href="#plugin">${esc(c.nav.plugins)}</a>
      <a href="#versioni">${esc(c.nav.versions)}</a>
      <a href="#domande">${esc(c.nav.faq)}</a>
    </nav>
    <a class="top__lang" href="${single ? "#" : c.alternate}" lang="${c.lang === "it" ? "en" : "it"}" aria-label="${esc(c.nav.languageLabel)}">${esc(c.nav.language)}</a>
    <a class="button button--primary button--small" href="#download">${esc(c.nav.download)}</a>
  </div>
</header>

<main id="contenuto">
<section class="hero">
  <div class="wrap">
    <p class="eyebrow">${esc(c.hero.eyebrow)}</p>
    <h1>${esc(c.hero.title)}</h1>
    <p class="lead">${esc(c.hero.lead)}</p>
    <div class="hero__actions">
      <a class="button button--primary" href="/download/windows" data-download>${arrow}<span data-download-label>${esc(c.hero.primaryGeneric)}</span></a>
      <a class="button" href="#funzioni">${esc(c.hero.secondary)}</a>
    </div>
    <p class="hero__meta" data-hero-meta>${esc(heroMeta)}</p>
    <div class="stage">
      <figure class="window window--main">${shot(shots.regia, c.hero.shotAlt, { eager: true, sizes: "(min-width: 1240px) 1180px, 94vw" })}</figure>
      <figure class="window window--output" aria-hidden="true">${shot(shots["uscita-sala"], "", { sizes: "(min-width: 900px) 320px, 40vw" })}</figure>
    </div>
  </div>
</section>

<section class="facts" aria-label="${esc(c.facts.label)}">
  <div class="wrap">
    <dl class="facts__grid">
      ${c.facts.items.map((fact) => `<div><dt>${esc(fact.value)}</dt><dd>${esc(fact.label)}</dd></div>`).join("\n      ")}
    </dl>
    <p class="facts__note">${esc(c.facts.note)}</p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <p class="eyebrow">${esc(c.pillars.eyebrow)}</p>
    <h2>${esc(c.pillars.title)}</h2>
    <ol class="pillars">
      ${c.pillars.items
        .map(
          (item) => `<li>
        <span class="pillars__tag">${esc(item.tag)}</span>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.text)}</p>
      </li>`,
        )
        .join("\n      ")}
    </ol>
  </div>
</section>

<section class="section" id="funzioni">
  <div class="wrap">
    <p class="eyebrow">${esc(c.features.eyebrow)}</p>
    <h2>${esc(c.features.title)}</h2>
    ${c.features.rows
      .map(
        (row) => `<article class="feature${row.portrait ? " feature--portrait" : ""}">
      <div class="feature__text">
        <h3>${esc(row.title)}</h3>
        <p>${esc(row.text)}</p>
        <ul>${row.points.map((point) => `<li>${esc(point)}</li>`).join("")}</ul>
      </div>
      <figure class="window${row.portrait ? " window--phone" : ""}">${shot(shots[row.shot], row.alt, row.portrait ? { sizes: "280px" } : undefined)}</figure>
    </article>`,
      )
      .join("\n    ")}
  </div>
</section>

<section class="section section--tint">
  <div class="wrap">
    <p class="eyebrow">${esc(c.audience.eyebrow)}</p>
    <h2>${esc(c.audience.title)}</h2>
    <ul class="audience">
      ${c.audience.items
        .map(
          (item) => `<li>
        <span class="badge badge--${item.status}">${esc(c.plugins.status[item.status])}</span>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.text)}</p>
      </li>`,
        )
        .join("\n      ")}
    </ul>
  </div>
</section>

<section class="section" id="plugin">
  <div class="wrap">
    <p class="eyebrow">${esc(c.plugins.eyebrow)}</p>
    <h2>${esc(c.plugins.title)}</h2>
    <p class="lead lead--section">${esc(c.plugins.lead)}</p>
    <div class="filters" role="group" aria-label="${esc(c.plugins.filterLabel)}">
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
    <p class="plugins__note">${esc(c.plugins.soonNote)}</p>
    <aside class="developers">
      <div>
        <h3>${esc(c.plugins.developers.title)}</h3>
        <p>${esc(c.plugins.developers.text)}</p>
      </div>
      <a class="button" href="/download/source">${arrow}${esc(c.plugins.developers.action)}</a>
    </aside>
  </div>
</section>

<section class="section section--tint" id="download">
  <div class="wrap download">
    <div>
      <p class="eyebrow">${esc(c.download.eyebrow)}</p>
      <h2>${esc(c.download.title)}</h2>
      <p class="lead lead--section">${esc(c.download.lead)}</p>
      <div class="download__buttons">
        <a class="button button--primary button--big" href="/download/windows" data-os="windows">${arrow}<span><strong>${esc(c.download.windows)}</strong><small>${esc(c.download.windowsHint)}</small></span></a>
        <a class="button button--big" href="/download/linux" data-os="linux">${arrow}<span><strong>${esc(c.download.linux)}</strong><small>${esc(c.download.linuxHint)}</small></span></a>
      </div>
      <p class="download__version" data-download-version>${esc(versionLine)}</p>
    </div>
    <div class="download__notes">
      <h3>${esc(c.download.notesTitle)}</h3>
      <ul>${c.download.notes.map((note) => `<li>${esc(note)}</li>`).join("")}</ul>
      <a class="link" href="/download/source">${esc(c.download.source)}</a>
    </div>
  </div>
</section>

<section class="section" id="versioni">
  <div class="wrap wrap--narrow">
    <p class="eyebrow">${esc(c.versions.eyebrow)}</p>
    <h2>${esc(c.versions.title)}</h2>
    <p class="lead lead--section">${esc(c.versions.lead)}</p>
    <div class="versions" data-versions>
${versionList(releases, c.versions, c.locale)}
    </div>
  </div>
</section>

<section class="section section--tint" id="domande">
  <div class="wrap wrap--narrow">
    <p class="eyebrow">${esc(c.faq.eyebrow)}</p>
    <h2>${esc(c.faq.title)}</h2>
    <div class="faq">
      ${c.faq.items.map((item) => `<details><summary>${esc(item.q)}</summary><p>${esc(item.a)}</p></details>`).join("\n      ")}
    </div>
  </div>
</section>
</main>

<footer class="foot">
  <div class="wrap foot__row">
    <div>
      <img src="${assets.logo}" alt="Cuelith" width="120" height="32" loading="lazy">
      <p>${esc(c.footer.tagline)}</p>
    </div>
    <ul>
      <li><a href="/download/source">${esc(c.footer.source)}</a></li>
      <li><a href="${single ? "#" : c.alternate}" lang="${c.lang === "it" ? "en" : "it"}">${esc(c.nav.language)}</a></li>
      <li><a href="#contenuto">${esc(c.footer.top)}</a></li>
    </ul>
    <p class="foot__small">${esc(c.footer.license)}<br>${esc(c.footer.privacy)}</p>
  </div>
</footer>
<script type="application/json" id="strings">${JSON.stringify(strings).replace(/</g, "\\u003c")}</script>
${assets.script}`;

  return { head, body };
}

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
