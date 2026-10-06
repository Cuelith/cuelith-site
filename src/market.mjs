import {
  MARKETPLACE_PATHS,
  PRIVACY_PATHS,
  SUBMIT_PATHS,
  TERMS_PATHS,
  siteFooter,
} from "./page.mjs";
import { esc, fill, marketCards, pluginList } from "./shared.js";
import { CONFIRMATIONS, LIMITS } from "./submission.js";

// Le pagine /marketplace e /marketplace/submit, per una lingua. Come la pagina
// principale ricevono i testi (content), i dati del momento e le immagini, e
// restituiscono l'HTML. Sono pagine semplici: niente animazioni d'ingresso.

const SITE = "https://cuelith.lzrhive.it";
/**
 * Per chi sviluppa: la guida e il modello stanno nei repository del progetto.
 * Sono gli unici collegamenti esterni di queste pagine, oltre a quelli del
 * piede (Ko-fi e hub): cambiano qui e in test/market.test.mjs.
 */
export const DEV_LINKS = {
  guide: {
    it: "https://github.com/Cuelith/.github/blob/main/DEVELOPERS.it.md",
    en: "https://github.com/Cuelith/.github/blob/main/DEVELOPERS.md",
  },
  template: "https://github.com/Cuelith/plugin-template",
};

/** Intestazione, barra in alto e piede: uguali per le due pagine. */
function shell({ c, page, assets, single, body, strings, extraScripts = "" }) {
  const url = `${SITE}${page.path}`;
  const other = c.lang === "it" ? "en" : "it";
  const alternates =
    page === c.marketplace
      ? MARKETPLACE_PATHS
      : page === c.terms
        ? TERMS_PATHS
        : page === c.privacy
          ? PRIVACY_PATHS
          : SUBMIT_PATHS;
  const head = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.meta.title)}</title>
<meta name="description" content="${esc(page.meta.description)}">
<meta name="theme-color" content="#0B0C0E">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="it" href="${SITE}${alternates.it}">
<link rel="alternate" hreflang="en" href="${SITE}${alternates.en}">
<link rel="alternate" hreflang="x-default" href="${SITE}${alternates.en}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Cuelith">
<meta property="og:title" content="${esc(page.meta.title)}">
<meta property="og:description" content="${esc(page.meta.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}${assets.social}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${assets.icon}" type="image/svg+xml">
${assets.styles}`;

  const current = (path) => (path === page.path ? ' aria-current="page"' : "");
  const full = `<a class="skip" href="#contenuto">${esc(page.eyebrow)}</a>
<header class="top">
  <div class="wrap top__row">
    <a class="brand" href="${single ? "#" : c.path}" aria-label="Cuelith"><img src="${assets.logo}" alt="Cuelith" width="150" height="40"></a>
    <nav aria-label="${esc(c.nav.label)}" class="top__nav">
      <a href="${single ? "#" : MARKETPLACE_PATHS[c.lang]}"${current(MARKETPLACE_PATHS[c.lang])}>${esc(c.nav.marketplace)}</a>
      <a href="${single ? "#" : SUBMIT_PATHS[c.lang]}"${current(SUBMIT_PATHS[c.lang])}>${esc(c.footer.submit)}</a>
    </nav>
    <a class="top__lang" href="${single ? "#" : page.alternate}" lang="${other}" aria-label="${esc(c.nav.languageLabel)}">${esc(c.nav.language)}</a>
    <a class="button button--primary button--small" href="${single ? "#" : c.path}#download">${esc(c.nav.download)}</a>
  </div>
</header>

<main id="contenuto">
${body}
</main>

${siteFooter(c, assets, { single, alternate: page.alternate })}
<script type="application/json" id="strings">${JSON.stringify(strings).replace(/</g, "\\u003c")}</script>
${extraScripts}
${assets.script}`;
  return { head, body: full };
}

/** Un campo di testo del modulo, con la sua guida e il posto per l'errore. */
function field(f, name, { type = "text", textarea = false, only = "", required = true, rows = 3 }) {
  const t = f[name];
  const limits = LIMITS[name];
  const attrs = [
    `id="f-${name}"`,
    `name="${name}"`,
    textarea ? `rows="${String(rows)}"` : `type="${type}"`,
    required ? "required" : "",
    limits ? `maxlength="${String(limits[1])}"` : "",
    type === "url" ? 'inputmode="url" autocomplete="off"' : "",
    type === "email" ? 'autocomplete="email"' : "",
    `aria-describedby="h-${name}"`,
  ]
    .filter((a) => a !== "")
    .join(" ");
  const control = textarea ? `<textarea ${attrs}></textarea>` : `<input ${attrs}>`;
  return `<div class="field" data-field="${name}"${only === "" ? "" : ` data-only="${only}"`}>
  <label for="f-${name}">${esc(t.label)}</label>
  ${control}
  <p class="field__hint" id="h-${name}">${esc(t.hint)}</p>
  <p class="field__error" role="alert" hidden></p>
</div>`;
}

export function renderMarketplace({ content: c, modules, catalog, assets, single = false }) {
  const m = c.marketplace;
  const strings = {
    ...m,
    permissionsLabel: c.plugins.permissionsLabel,
    permissions: c.plugins.permissions,
    version: c.plugins.version,
  };
  const plugins = pluginList(modules, catalog, c.lang).filter((p) => p.status === "available");
  const hasPaid = plugins.some((p) => p.access === "paid");
  const hasFree = plugins.some((p) => p.access !== "paid");
  const hidden = (show) => (show ? "" : " hidden");
  const chips = Object.keys(m.filters)
    .map(
      (group) =>
        `<button type="button" class="chip" data-filter="${group}" aria-pressed="${group === "all" ? "true" : "false"}"${hidden(group === "all" || (group === "paid" ? hasPaid : hasFree))}>${esc(m.filters[group])}</button>`,
    )
    .join("\n      ");

  const body = `<section class="section subpage">
  <div class="wrap">
    <p class="eyebrow">${esc(m.eyebrow)}</p>
    <h1 class="subpage__title">${esc(m.title)}</h1>
    <p class="lead lead--section" data-lead="free"${hidden(!hasPaid)}>${esc(m.leadFree)}</p>
    <p class="lead lead--section" data-lead="mixed"${hidden(hasPaid)}>${esc(m.leadMixed)}</p>
    <div class="filters" role="group" aria-label="${esc(m.filterLabel)}" data-filters${hidden(hasPaid)}>
      <span class="filters__label">${esc(m.filterLabel)}</span>
      ${chips}
    </div>
    <div data-market>
      ${
        plugins.length === 0
          ? `<p class="plugins__note">${esc(m.empty)}</p>`
          : `<ul class="plugins">\n${marketCards(plugins, strings)}\n</ul>`
      }
    </div>
    <aside class="notice" data-notice${hidden(hasPaid)}>
      <h2 class="notice__title">${esc(m.how.title)}</h2>
      <ol>${m.how.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ol>
    </aside>
    <aside class="developers">
      <div>
        <h3>${esc(m.authors.title)}</h3>
        <p>${esc(m.authors.text)}</p>
      </div>
      <div class="developers__actions">
        <a class="button" href="${single ? "#" : SUBMIT_PATHS[c.lang]}">${esc(m.authors.action)}</a>
      </div>
    </aside>
  </div>
</section>`;
  return shell({
    c,
    page: m,
    assets,
    single,
    body,
    strings: { lang: c.lang, market: strings, catalog },
  });
}

/**
 * Una pagina di testo legale (condizioni o informativa): una sezione dopo l'altra.
 * `{contact}` e' l'indirizzo email di contatto (variabile di build CONTACT_EMAIL).
 */
function legalPage({ content: c, key, assets, single, contact }) {
  const t = c[key];
  // Cloudflare nasconde da solo gli indirizzi email nelle pagine (li mostra come
  // «[email protected]» e li rimette con uno script): per un contatto legale deve
  // restare in chiaro, quindi lo si esclude con <!--email_off-->.
  const mark = String.fromCharCode(1);
  const link =
    contact === ""
      ? esc(c.footer.noContact)
      : `<!--email_off--><a class="link" href="mailto:${esc(contact)}">${esc(contact)}</a><!--/email_off-->`;
  const inline = (text) =>
    esc(fill(text, { contact: mark }))
      .split(mark)
      .join(link);
  const paragraph = (text) => `<p>${inline(text)}</p>`;
  const section = (s) => `<section class="terms__section">
      <h2>${esc(s.title)}</h2>
      ${s.paragraphs.map(paragraph).join("")}
      ${s.items === undefined ? "" : `<ul class="steps steps--plain">${s.items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`}
      ${s.after === undefined ? "" : paragraph(s.after)}
    </section>`;
  const body = `<section class="section subpage">
  <div class="wrap wrap--narrow">
    <p class="eyebrow">${esc(t.eyebrow)}</p>
    <h1 class="subpage__title">${esc(t.title)}</h1>
    <p class="lead lead--section">${esc(t.lead)}</p>
    <p class="plugins__note">${esc(t.version)}</p>
  </div>
</section>

<section class="section section--tint" id="condizioni">
  <div class="wrap wrap--narrow terms">
    ${t.sections.map(section).join("")}
    <p><a class="link" href="${single ? "#" : SUBMIT_PATHS[c.lang]}">${esc(t.back)}</a></p>
  </div>
</section>`;
  return shell({ c, page: t, assets, single, body, strings: { lang: c.lang } });
}

/** Le condizioni per pubblicare nel marketplace. */
export function renderTerms({ content, assets, single = false, contact = "" }) {
  return legalPage({ content, key: "terms", assets, single, contact });
}

/** L'informativa sulla privacy. */
export function renderPrivacy({ content, assets, single = false, contact = "" }) {
  return legalPage({ content, key: "privacy", assets, single, contact });
}

/** Dove si carica il controllo "sei una persona" (Turnstile): solo la pagina di proposta ne ha bisogno. */
export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";

export function renderSubmit({ content: c, assets, single = false, turnstileSiteKey = "" }) {
  const s = c.submit;
  const f = s.form;
  const check = (key) =>
    `<li><label class="check"><input type="checkbox" name="confirm.${key}" value="1" required><span>${esc(s.checklist.items[key])}${key === "terms" ? ` <a class="link" href="${c.terms.path}" target="_blank" rel="noopener">${esc(s.paid.terms.link)}</a> · <a class="link" href="${c.privacy.path}" target="_blank" rel="noopener">${esc(f.privacyLink)}</a>` : ""}</span></label></li>`;
  const freeChecks = CONFIRMATIONS.free;
  const paidChecks = CONFIRMATIONS.paid.filter((key) => !freeChecks.includes(key));
  const radio = (value) =>
    `<label class="radio"><input type="radio" name="kind" value="${value}"${value === "free" ? " checked" : ""}><span>${esc(f.kind[value])}</span></label>`;

  const body = `<section class="section subpage">
  <div class="wrap wrap--narrow">
    <p class="eyebrow">${esc(s.eyebrow)}</p>
    <h1 class="subpage__title">${esc(s.title)}</h1>
    <p class="lead lead--section">${esc(s.lead)}</p>
  </div>
</section>

<section class="section section--tint">
  <div class="wrap wrap--narrow">
    <h2>${esc(s.steps.title)}</h2>
    <ol class="steps">
      ${s.steps.items.map((item) => `<li><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></li>`).join("\n      ")}
    </ol>
    <p class="docs"><strong>${esc(s.docs.title)}:</strong>
      <a class="link" href="${DEV_LINKS.guide[c.lang]}" target="_blank" rel="noopener">${esc(s.docs.guide)}</a> ·
      <a class="link" href="${DEV_LINKS.template}" target="_blank" rel="noopener">${esc(s.docs.template)}</a></p>
  </div>
</section>

<section class="section">
  <div class="wrap wrap--narrow">
    <h2>${esc(s.paid.title)}</h2>
    <p class="lead lead--section">${esc(s.paid.intro)}</p>
    <div class="notice" id="condizioni">
      <h3 class="notice__title">${esc(s.paid.terms.title)}</h3>
      <p>${esc(s.paid.terms.intro)}</p>
      <ol>
        ${s.paid.terms.items.map((t) => `<li>${esc(t)}</li>`).join("")}
      </ol>
      <p><a class="link" href="${c.terms.path}">${esc(s.paid.terms.link)}</a></p>
    </div>
    <ol class="steps steps--plain">
      ${s.paid.steps.map((step) => `<li>${esc(step)}</li>`).join("\n      ")}
    </ol>
    <p class="plugins__note">${esc(s.paid.refunds)}</p>
    <ul class="steps steps--plain">
      ${s.paid.rules.map((r) => `<li>${esc(r)}</li>`).join("")}
    </ul>
  </div>
</section>

<section class="section section--tint" id="modulo">
  <div class="wrap wrap--narrow">
    <h2>${esc(f.title)}</h2>
    <noscript><p class="notice">${esc(f.needsScript)}</p></noscript>
    <form class="form" id="proposal" novalidate>
      <fieldset class="form__group">
        <legend>${esc(f.kind.label)}</legend>
        <div class="radios">${radio("free")}${radio("paid")}</div>
      </fieldset>

      <fieldset class="form__group">
        <legend>${esc(f.groups.plugin)}</legend>
        ${field(f.fields, "name", {})}
        ${field(f.fields, "id", {})}
        ${field(f.fields, "description", { textarea: true })}
        ${field(f.fields, "publisher", {})}
        ${field(f.fields, "license", {})}
        ${field(f.fields, "eulaUrl", { type: "url", required: false })}
        ${field(f.fields, "packageUrl", { type: "url" })}
        ${field(f.fields, "repositoryUrl", { type: "url", required: false })}
        ${field(f.fields, "authorKey", { required: false })}
        ${field(f.fields, "signature", { required: false })}
      </fieldset>

      <fieldset class="form__group" data-only="paid" hidden>
        <legend>${esc(f.groups.shop)}</legend>
        ${field(f.fields, "price", { only: "paid" })}
        ${field(f.fields, "checkoutUrl", { type: "url", only: "paid" })}
        ${field(f.fields, "storeId", { only: "paid" })}
        ${field(f.fields, "productId", { only: "paid" })}
      </fieldset>

      <fieldset class="form__group">
        <legend>${esc(f.groups.contact)}</legend>
        ${field(f.fields, "contact", { type: "email" })}
      </fieldset>

      <fieldset class="form__group" data-confirm>
        <legend>${esc(s.checklist.title)}</legend>
        <p class="field__hint">${esc(s.checklist.lead)}</p>
        <ul class="checks">${freeChecks.map(check).join("")}</ul>
        <div data-only="paid" hidden>
          <p class="checks__title">${esc(s.checklist.paidTitle)}</p>
          <ul class="checks">${paidChecks.map(check).join("")}</ul>
        </div>
        <p class="field__error" data-error="confirm" role="alert" hidden></p>
      </fieldset>

      <div class="trap" aria-hidden="true"><label>Company<input type="text" name="company" tabindex="-1" autocomplete="off"></label></div>

      ${
        turnstileSiteKey === ""
          ? ""
          : `<div class="cf-turnstile" data-sitekey="${esc(turnstileSiteKey)}" data-theme="dark" data-language="${c.lang}"></div>`
      }
      <div class="form__actions">
        <button type="submit" class="button button--primary">${esc(f.submit)}</button>
        <p class="form__status" role="status" aria-live="polite" data-status></p>
      </div>
      <p class="field__hint">${esc(f.privacy)} <a class="link" href="${c.privacy.path}" target="_blank" rel="noopener">${esc(f.privacyLink)}</a></p>
    </form>
  </div>
</section>`;
  return shell({
    c,
    page: s,
    assets,
    single,
    body,
    extraScripts:
      turnstileSiteKey === "" ? "" : `<script src="${TURNSTILE_SCRIPT}" async defer></script>`,
    strings: {
      lang: c.lang,
      submit: { result: f.result, errors: f.errors, sending: f.sending },
    },
  });
}
