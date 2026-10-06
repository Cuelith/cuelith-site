// Funzioni usate sia quando si costruisce il sito sia nel browser (finiscono
// dentro app.js): cosi' l'elenco dei plugin e delle versioni si disegna nello
// stesso modo quando la pagina si aggiorna da sola.

export const esc = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const fill = (template, values) =>
  String(template).replace(/\{(\w+)\}/g, (_, key) => (key in values ? values[key] : ""));

export function formatDate(iso, locale) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(
    date,
  );
}

/** Un permesso in parole semplici. */
function permissionText(permission, strings) {
  if (permission.startsWith("network:")) {
    return fill(strings.permissions.networkHost, { host: permission.slice(8) });
  }
  return strings.permissions[permission] ?? permission;
}

/**
 * Plugin del marketplace e plugin presentati dal sito (inclusi e in arrivo)
 * in un elenco solo: prima quelli che si possono usare oggi.
 */
export function pluginList(modules, catalog, lang) {
  const pick = (value, fallback) => (value && (value[lang] ?? value.it)) || fallback;
  const fromMarket = modules.map((module) => {
    const override = catalog.overrides?.[module.id] ?? {};
    return {
      id: module.id,
      status: "available",
      group: override.group ?? catalog.groups[module.family] ?? "content",
      kind: override.kind ?? catalog.kinds[module.family] ?? "tool",
      name: pick(override.name, module.name),
      text: pick(override.text, module.description),
      icon: module.icon,
      version: module.version,
      verified: module.verified,
      permissions: module.permissions,
      publisher: module.publisher ?? "",
      license: module.license ?? "",
      access: module.access === "paid" ? "paid" : "free",
      price: module.price ?? "",
      buyable: module.buyable === true,
    };
  });
  const known = new Set(fromMarket.map((plugin) => plugin.id));
  const fromSite = catalog.items
    .filter((item) => !known.has(item.id))
    .map((item) => ({
      id: item.id,
      status: item.status,
      group: item.group,
      kind: item.kind,
      name: pick(item.name, item.id),
      text: pick(item.text, ""),
    }));
  const order = { available: 0, included: 1, soon: 2 };
  return [...fromMarket, ...fromSite].sort((a, b) => order[a.status] - order[b.status]);
}

/** Iniziali per i plugin senza icona propria. */
const initials = (name) =>
  name
    .split(/[\s,]+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

/**
 * I plugin in due parti: quelli che si usano oggi come schede, quelli in
 * arrivo come tabella di marcia compatta, raggruppata per bisogno.
 */
export function pluginCards(plugins, strings) {
  const ready = plugins.filter((plugin) => plugin.status !== "soon");
  const soon = plugins.filter((plugin) => plugin.status === "soon");
  const groups = Object.keys(strings.filters).filter((group) =>
    soon.some((plugin) => plugin.group === group),
  );
  const roadmap = groups
    .map(
      (group) => `<div class="roadmap__group" data-group="${esc(group)}" data-stagger>
  <h4 data-reveal="up">${esc(strings.filters[group])}</h4>
  <ul>
${soon
  .filter((plugin) => plugin.group === group)
  .map(
    (plugin) =>
      `    <li data-reveal="left"><p class="roadmap__name"><strong>${esc(plugin.name)}</strong><span>${esc(strings.kind[plugin.kind] ?? "")}</span></p><p>${esc(plugin.text)}</p></li>`,
  )
  .join("\n")}
  </ul>
</div>`,
    )
    .join("\n");
  return `${
    ready.length === 0
      ? ""
      : `<div class="plugins__part" data-section>
<h3 class="plugins__title">${esc(strings.sections.ready)}</h3>
<ul class="plugins" data-stagger>
${readyCards(ready, strings)}
</ul>
</div>`
  }
${
  soon.length === 0
    ? ""
    : `<div class="plugins__part" data-section>
<h3 class="plugins__title">${esc(strings.sections.soon)}</h3>
<div class="roadmap">
${roadmap}
</div>
</div>`
}`;
}

function readyCards(plugins, strings) {
  return plugins
    .map((plugin) => {
      const icon = plugin.icon
        ? `<img class="plugin__icon" src="${esc(plugin.icon)}" alt="" width="40" height="40">`
        : `<span class="plugin__icon plugin__icon--text" aria-hidden="true">${esc(initials(plugin.name))}</span>`;
      const permissions =
        plugin.status === "available"
          ? `<p class="plugin__permissions"><span>${esc(strings.permissionsLabel)}:</span> ${esc(
              plugin.permissions.length === 0
                ? strings.permissions.none
                : plugin.permissions.map((p) => permissionText(p, strings)).join(" · "),
            )}</p>`
          : "";
      const version =
        plugin.status === "available" && plugin.version
          ? `<span class="plugin__version">${esc(fill(strings.version, { version: plugin.version }))}</span>`
          : "";
      return `<li class="plugin" data-group="${esc(plugin.group)}" data-reveal="scale">
  <div class="plugin__head">
    ${icon}
    <div>
      <h3>${esc(plugin.name)}</h3>
      <p class="plugin__kind">${esc(strings.kind[plugin.kind] ?? "")}</p>
    </div>
    <span class="badge badge--${esc(plugin.status)}">${esc(strings.status[plugin.status])}</span>
  </div>
  <p class="plugin__text">${esc(plugin.text)}</p>
  ${permissions}
  ${version}
</li>`;
    })
    .join("\n");
}

/** Le note nella lingua della pagina; se mancano in quella lingua, in italiano. */
function notesFor(release, locale) {
  const notes = release.notes;
  if (typeof notes === "string") return notes;
  return notes?.[locale.slice(0, 2)] ?? notes?.it ?? "";
}

/** Le versioni pubblicate: la piu' recente aperta, le altre richiudibili. */
export function versionList(releases, strings, locale) {
  if (releases.length === 0) return `<p class="versions__empty">${esc(strings.empty)}</p>`;
  return releases
    .map((release, index) => {
      const version = esc(release.version);
      return `<details class="version" data-reveal="up"${index === 0 ? " open" : ""}>
  <summary>
    <span class="version__number">${version}</span>
    ${index === 0 ? `<span class="badge badge--available">${esc(strings.latest)}</span>` : ""}
    <time datetime="${esc(release.date)}">${esc(formatDate(release.date, locale))}</time>
  </summary>
  <div class="version__body">
    <div class="version__downloads">
      <a class="button button--small" href="/download/${version}/windows">${esc(strings.windows)}</a>
      <a class="button button--small" href="/download/${version}/linux">${esc(strings.linux)}</a>
    </div>
    <div class="version__notes" aria-label="${esc(strings.notes)}">${notesFor(release, locale)}</div>
  </div>
</details>`;
    })
    .join("\n");
}

/**
 * Le schede del marketplace: i plugin che si possono usare, gratuiti e a
 * pagamento, con chi li scrive, la licenza, cosa possono usare e come si
 * ottengono. `strings` e' la voce `marketplace` dei testi, con in piu'
 * `permissionsLabel`, `permissions` e `version` dei plugin.
 */
export function marketCards(plugins, strings) {
  return plugins
    .filter((plugin) => plugin.status === "available")
    .map((plugin) => {
      const paid = plugin.access === "paid";
      const icon = plugin.icon
        ? `<img class="plugin__icon" src="${esc(plugin.icon)}" alt="" width="40" height="40">`
        : `<span class="plugin__icon plugin__icon--text" aria-hidden="true">${esc(initials(plugin.name))}</span>`;
      const by = plugin.publisher ? fill(strings.by, { publisher: plugin.publisher }) : "";
      const trust = plugin.verified ? strings.trust.verified : strings.trust.unverified;
      const permissions =
        plugin.permissions.length === 0
          ? strings.permissions.none
          : plugin.permissions.map((p) => permissionText(p, strings)).join(" · ");
      const meta = [
        plugin.license ? `${strings.licenseLabel}: ${plugin.license}` : "",
        plugin.version ? fill(strings.version, { version: plugin.version }) : "",
      ]
        .filter((part) => part !== "")
        .join(" · ");
      const action = paid
        ? `<div class="plugin__buy">
    <p class="plugin__price">${esc(plugin.price)}</p>
    ${
      plugin.buyable
        ? `<a class="button button--primary button--small" href="/marketplace/buy/${esc(plugin.id)}" rel="nofollow">${esc(strings.buy)}</a>`
        : `<p class="plugin__soon">${esc(strings.notBuyable)}</p>`
    }
  </div>
  <p class="plugin__note">${esc(fill(strings.soldBy, { publisher: plugin.publisher || "?" }))}${plugin.buyable ? ` ${esc(strings.buyHint)}` : ""}</p>`
        : `<p class="plugin__note">${esc(strings.install)}</p>`;
      return `<li class="plugin" data-group="${paid ? "paid" : "free"}" data-plugin="${esc(plugin.id)}">
  <div class="plugin__head">
    ${icon}
    <div>
      <h3>${esc(plugin.name)}</h3>
      <p class="plugin__kind">${esc(by)}</p>
    </div>
    <span class="badge ${paid ? "badge--paid" : "badge--available"}">${esc(paid ? strings.badges.paid : strings.badges.free)}</span>
  </div>
  <p class="plugin__text">${esc(plugin.text)}</p>
  <p class="plugin__trust">${esc(trust)}</p>
  <p class="plugin__permissions"><span>${esc(strings.permissionsLabel)}:</span> ${esc(permissions)}</p>
  ${meta === "" ? "" : `<p class="plugin__version">${esc(meta)}</p>`}
  ${action}
</li>`;
    })
    .join("\n");
}
