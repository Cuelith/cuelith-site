import {
  MARKETPLACE_PATHS,
  PAGE_PATHS,
  PRIVACY_PATHS,
  SUBMIT_PATHS,
  TERMS_PATHS,
  siteFooter,
  siteHeader,
} from "./page.mjs";
import { esc, fill, formatDate, pluginList, storeTiles } from "./shared.js";
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
export function shell({ c, page, assets, single, body, strings, extraScripts = "", alt }) {
  const url = `${SITE}${page.path}`;
  const alternates =
    alt !== undefined
      ? alt
      : page === c.marketplace
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

  const current = page === c.privacy ? "" : "marketplace";
  const full = `${siteHeader(c, assets, { single, current, alternate: page.alternate })}

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
    base: MARKETPLACE_PATHS[c.lang],
    groups: c.plugins.filters,
  };
  const plugins = pluginList(modules, catalog, c.lang).filter((p) => p.status !== "soon");
  const hasPaid = plugins.some((p) => p.access === "paid");
  const hasFree = plugins.some((p) => p.access !== "paid");
  const hidden = (show) => (show ? "" : " hidden");
  const chips = Object.keys(m.filters)
    .map(
      (group) =>
        `<button type="button" class="chip" data-filter="${group}" aria-pressed="${group === "all" ? "true" : "false"}"${hidden(group === "all" || (group === "paid" ? hasPaid : hasFree))}>${esc(m.filters[group])}</button>`,
    )
    .join("\n      ");
  const count = (n) => (n === 1 ? m.countOne : fill(m.count, { n: String(n) }));

  const body = `<section class="section subpage">
  <div class="wrap">
    <p class="eyebrow">${esc(m.eyebrow)}</p>
    <h1 class="subpage__title">${esc(m.title)}</h1>
    <p class="lead lead--section" data-lead="free"${hidden(!hasPaid)}>${esc(m.leadFree)}</p>
    <p class="lead lead--section" data-lead="mixed"${hidden(hasPaid)}>${esc(m.leadMixed)}</p>
    <div class="store__tools">
      <label class="store__search">
        <span class="sr-only">${esc(m.searchLabel)}</span>
        <input type="search" id="store-search" data-search placeholder="${esc(m.searchPlaceholder)}" autocomplete="off" enterkeyhint="search">
      </label>
      <div class="filters" role="group" aria-label="${esc(m.filterLabel)}" data-filters${hidden(hasPaid)}>
        <span class="filters__label">${esc(m.filterLabel)}</span>
        ${chips}
      </div>
      <p class="store__count" data-count aria-live="polite">${esc(count(plugins.length))}</p>
    </div>
    <div data-market>
      ${
        plugins.length === 0
          ? `<p class="plugins__note">${esc(m.empty)}</p>`
          : `<ul class="apps">\n${storeTiles(plugins, strings)}\n</ul>`
      }
    </div>
    <p class="plugins__note" data-empty hidden>${esc(m.noResults)}</p>
    <p class="plugins__note">${esc(m.installNote)}</p>
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

// ---- la scheda di un plugin ----

/**
 * Un intervallo di versioni in parole: ">=0.1.0 <1.0.0" diventa "dalla 0.1.0 alla 1.0.0 (esclusa)",
 * "^1.6.0" diventa "1.6.0 e successive della serie 1.x". Quel che non si riconosce resta com'e'.
 */
export function rangeText(range, st) {
  const text = String(range ?? "").trim();
  if (text.startsWith(">=") && text.includes(" <")) {
    const [from, to] = text.slice(2).split(" <");
    if (from && to && !to.includes(" ")) return fill(st.rangeBetween, { from, to });
  }
  if (text.startsWith("^") && text.length > 1 && !text.includes(" ")) {
    const version = text.slice(1);
    const [major, minor] = version.split(".");
    // Prima della 1.0 il segno ^ vale solo per la serie 0.x (es. ^0.1.0 = la 0.1.x).
    return fill(major === "0" ? st.rangeZero : st.rangeCaret, {
      version,
      major,
      minor: minor ?? "0",
    });
  }
  return text;
}

/** Un permesso in parole semplici (lo stesso testo del programma). */
function permissionLine(permission, texts) {
  if (permission.startsWith("network:")) {
    return fill(texts.networkHost, { host: permission.slice(8) });
  }
  return texts[permission] ?? permission;
}

const initialsOf = (name) =>
  name
    .split(/[\s,]+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

/**
 * La scheda di un plugin: cosa fa, chi lo scrive, quanto costa, cosa puo' fare sul
 * computer, con quali versioni di Cuelith funziona e come si installa. Sul telefono
 * dice che si installa solo su computer. `plugin` e' una voce di pluginList().
 */
export function renderPluginDetail({ content: c, plugin, assets, single = false }) {
  const st = c.store;
  const m = c.marketplace;
  const paid = plugin.access === "paid";
  const base = MARKETPLACE_PATHS[c.lang];
  const here = `${base}${plugin.id}/`;
  const other = c.lang === "it" ? "en" : "it";
  const alt = {
    it: `${MARKETPLACE_PATHS.it}${plugin.id}/`,
    en: `${MARKETPLACE_PATHS.en}${plugin.id}/`,
  };
  const latest = plugin.versions[0];
  const range = (text) => rangeText(text, st);
  const icon = plugin.icon
    ? `<img class="app-head__icon" src="${esc(plugin.icon)}" alt="" width="96" height="96">`
    : `<span class="app-head__icon app-head__icon--text" aria-hidden="true">${esc(initialsOf(plugin.name))}</span>`;
  const trust = plugin.verified ? m.trust.verified : m.trust.unverified;
  const price = paid ? plugin.price || m.badges.paid : st.free;
  const group = c.plugins.filters[plugin.group] ?? "";
  const perms =
    plugin.permissions.length === 0
      ? [c.plugins.permissions.none]
      : plugin.permissions.map((p) => permissionLine(p, c.plugins.permissions));
  const steps = (paid ? st.buySteps : st.installSteps).map((step) =>
    fill(step, { name: plugin.name }),
  );
  const row = (label, value) =>
    value === "" ? "" : `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  const support =
    typeof plugin.support === "string" && plugin.support !== ""
      ? `<div><dt>${esc(st.support)}</dt><dd><a href="${esc(plugin.support)}" rel="noopener nofollow">${esc(
          plugin.support.startsWith("mailto:")
            ? plugin.support.slice(7)
            : plugin.support.replace(/^https:\/\//, ""),
        )}</a></dd></div>`
      : "";
  const when = (iso) => (iso ? formatDate(iso, c.locale) : "");

  const cta = paid
    ? plugin.buyable
      ? `<a class="button button--primary button--big" href="/marketplace/buy/${esc(plugin.id)}" rel="nofollow"><span><strong>${esc(m.buy)} · ${esc(price)}</strong><small>${esc(m.buyHint)}</small></span></a>`
      : `<p class="plugin__soon">${esc(m.notBuyable)}</p>`
    : "";

  // Immagine di copertina e guida d'uso (protocollo 1.19), se il plugin le ha: dati gia' controllati.
  const cover =
    typeof plugin.image === "string" && plugin.image !== ""
      ? `<img class="store-cover" src="${esc(plugin.image)}" alt="${esc(plugin.name)}" width="960" height="540" loading="lazy">`
      : "";
  const guideSteps = plugin.guide?.[c.lang] ?? plugin.guide?.it ?? plugin.guide?.en ?? [];
  const guide =
    guideSteps.length === 0
      ? ""
      : `<section class="store-block">
      <h2>${esc(st.guideTitle)}</h2>
      <ol class="store-steps store-guide">${guideSteps
        .map((step) => `<li><strong>${esc(step.title)}</strong> ${esc(step.body)}</li>`)
        .join("")}</ol>
    </section>`;

  const body = `<section class="section subpage store-detail">
  <div class="wrap wrap--narrow">
    <p class="store__back"><a class="link" href="${single ? "#" : base}">← ${esc(st.back)}</a></p>
    <header class="app-head">
      ${icon}
      <div class="app-head__text">
        <h1>${esc(plugin.name)}</h1>
        <p class="app-head__by">${esc(plugin.publisher ? fill(st.by, { publisher: plugin.publisher }) : "")}<span class="app__trust${plugin.verified ? " app__trust--ok" : ""}">${esc(trust)}</span></p>
        <p class="app-head__meta"><span class="badge ${paid ? "badge--paid" : "badge--available"}">${esc(price)}</span>${plugin.version ? `<span>${esc(fill(c.plugins.version, { version: plugin.version }))}</span>` : ""}${plugin.license ? `<span>${esc(m.licenseLabel)}: ${esc(plugin.license)}</span>` : ""}</p>
      </div>
      <div class="app-head__cta">${cta}</div>
    </header>

    <div class="notice phone-note">
      <h2 class="notice__title">${esc(st.phoneTitle)}</h2>
      <p>${esc(st.phoneText)}</p>
      <a class="link" href="${single ? "#" : PAGE_PATHS.download[c.lang]}">${esc(st.phoneLink)}</a>
    </div>

    ${cover}
    <section class="store-block">
      <h2>${esc(st.whatTitle)}</h2>
      <p class="lead lead--section">${esc(plugin.text)}</p>
    </section>

    ${guide}

    <section class="store-block">
      <h2>${esc(st.installTitle)}</h2>
      <ol class="store-steps">${steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>
      ${paid ? `<p class="plugin__note">${esc(fill(m.soldBy, { publisher: plugin.publisher || "?" }))} ${esc(st.priceNote)}</p>` : ""}
    </section>

    <section class="store-block">
      <h2>${esc(st.permissionsTitle)}</h2>
      <p class="plugin__note">${esc(st.permissionsLead)}</p>
      <ul class="store-perms">${perms.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    </section>

    ${
      latest === undefined || (latest.cuelith === "" && latest.protocol === "")
        ? ""
        : `<section class="store-block">
      <h2>${esc(st.compatTitle)}</h2>
      <p>${esc(fill(st.compat, { cuelith: range(latest.cuelith), protocol: range(latest.protocol) }))}</p>
    </section>`
    }

    <section class="store-block">
      <h2>${esc(st.detailsTitle)}</h2>
      <dl class="store-facts">
        ${row(st.publisher, plugin.publisher)}
        ${row(st.license, plugin.license)}
        ${support}
        ${row(st.version, plugin.version)}
        ${row(st.updated, when(plugin.published))}
        ${row(st.category, group)}
        ${row(st.origin, trust)}
      </dl>
    </section>

    ${
      plugin.versions.length === 0
        ? ""
        : `<section class="store-block">
      <h2>${esc(st.versionsTitle)}</h2>
      <ul class="store-versions">${plugin.versions
        .map(
          (v) =>
            `<li><strong>${esc(fill(st.versionLine, { version: v.version }))}</strong>${v.published ? `<span>${esc(when(v.published))}</span>` : ""}${v.cuelith ? `<span>Cuelith ${esc(v.cuelith)}</span>` : ""}</li>`,
        )
        .join("")}</ul>
    </section>`
    }
  </div>
</section>`;
  const page = {
    path: here,
    alternate: alt[other],
    eyebrow: m.eyebrow,
    meta: {
      title: `${plugin.name} · ${m.eyebrow} · Cuelith`,
      description:
        plugin.text.length > 0
          ? plugin.text
          : fill(st.description, { name: plugin.name, publisher: plugin.publisher }),
    },
  };
  return shell({ c, page, assets, single, body, strings: { lang: c.lang, market: { base } }, alt });
}

/** Il plugin che non c'e': stessa pagina del marketplace, con un avviso e il ritorno all'elenco. */
export function renderPluginNotFound({ content: c, id, assets }) {
  const st = c.store;
  const base = MARKETPLACE_PATHS[c.lang];
  const alt = {
    it: `${MARKETPLACE_PATHS.it}${id}/`,
    en: `${MARKETPLACE_PATHS.en}${id}/`,
  };
  const other = c.lang === "it" ? "en" : "it";
  const body = `<section class="section subpage">
  <div class="wrap wrap--narrow">
    <h1 class="subpage__title">${esc(st.notFoundTitle)}</h1>
    <p class="lead lead--section">${esc(st.notFoundText)}</p>
    <p><a class="button" href="${base}">${esc(st.back)}</a></p>
  </div>
</section>`;
  const page = {
    path: base,
    alternate: alt[other],
    eyebrow: c.marketplace.eyebrow,
    meta: { title: `${st.notFoundTitle} · Cuelith`, description: st.notFoundText },
  };
  return shell({
    c,
    page,
    assets,
    single: false,
    body,
    strings: { lang: c.lang, market: { base } },
    alt,
  });
}
