// Piccoli aiuti nel browser: il pulsante di download per il sistema di chi
// visita, il filtro dei plugin, e l'aggiornamento di versioni e plugin senza
// ricostruire il sito. Senza JavaScript la pagina resta completa: i dati sono
// gia' scritti nell'HTML. (Le funzioni di shared.js sono incluse qui sopra.)

const strings = JSON.parse(document.getElementById("strings").textContent);

/** Il sistema di chi visita, se e' uno per cui esiste un installatore. */
function visitorSystem() {
  const platform = (navigator.userAgentData?.platform ?? navigator.platform ?? "").toLowerCase();
  const agent = navigator.userAgent.toLowerCase();
  if (agent.includes("android") || /iphone|ipad|ipod/.test(agent)) return undefined;
  if (platform.includes("win")) return "windows";
  if (platform.includes("linux")) return "linux";
  return undefined;
}

const system = visitorSystem();
if (system !== undefined) {
  for (const link of document.querySelectorAll("[data-download]")) {
    link.href = `/download/${system}`;
    const label = link.querySelector("[data-download-label]");
    if (label) label.textContent = fill(strings.hero.primary, { os: strings.os[system] });
  }
  // Nella sezione Download il sistema di chi visita viene per primo.
  const preferred = document.querySelector(`.download__buttons [data-os="${system}"]`);
  if (preferred) {
    for (const button of preferred.parentElement.children) {
      button.classList.toggle("button--primary", button === preferred);
    }
    preferred.parentElement.prepend(preferred);
  }
}

// Filtro dei plugin per bisogno.
const chips = [...document.querySelectorAll("[data-filter]")];
const applyFilter = (group) => {
  for (const chip of chips)
    chip.setAttribute("aria-pressed", String(chip.dataset.filter === group));
  for (const card of document.querySelectorAll("[data-plugins] [data-group]")) {
    card.hidden = group !== "all" && card.dataset.group !== group;
  }
  // Una parte senza nulla da mostrare sparisce col suo titolo.
  for (const part of document.querySelectorAll("[data-plugins] [data-section]")) {
    part.hidden = part.querySelector("[data-group]:not([hidden])") === null;
  }
};
for (const chip of chips) chip.addEventListener("click", () => applyFilter(chip.dataset.filter));

/** Dati del momento dal sito stesso; se non rispondono resta cio' che c'e' nella pagina. */
async function refresh() {
  const read = async (path) => {
    const response = await fetch(path, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  };
  try {
    const { releases } = await read("/api/releases");
    if (Array.isArray(releases) && releases.length > 0) {
      const latest = releases[0];
      document.querySelector("[data-versions]").innerHTML = versionList(
        releases,
        strings.versions,
        strings.locale,
      );
      const meta = document.querySelector("[data-hero-meta]");
      if (meta) meta.textContent = fill(strings.hero.meta, { version: latest.version });
      const line = document.querySelector("[data-download-version]");
      if (line) {
        line.textContent = fill(strings.download.version, {
          version: latest.version,
          date: formatDate(latest.date, strings.locale),
        });
      }
    }
  } catch {
    // Resta l'elenco scritto nella pagina.
  }
  try {
    const { modules } = await read("/api/modules");
    if (Array.isArray(modules) && modules.length > 0) {
      const active = chips.find((chip) => chip.getAttribute("aria-pressed") === "true");
      document.querySelector("[data-plugins]").innerHTML = pluginCards(
        pluginList(modules, strings.catalog, strings.lang),
        strings.plugins,
      );
      applyFilter(active?.dataset.filter ?? "all");
    }
  } catch {
    // Restano i plugin scritti nella pagina.
  }
}

// L'anteprima in un file solo (CUELITH_STATIC) non ha le funzioni del sito dietro.
if (location.protocol.startsWith("http") && window.CUELITH_STATIC !== true) {
  void refresh();
}
