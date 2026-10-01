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

// ---- movimento ----
// Ogni sezione entra con un suo ritmo quando arriva sullo schermo, e alcune
// parti seguono lo scorrimento (la scena d'apertura, le schermate, la linea
// sotto la barra). Lo decide motion-flag.js: con le animazioni ridotte non
// succede nulla e la pagina e' gia' tutta visibile.
const root = document.documentElement;
const moving = root.classList.contains("js-motion");
window.CUELITH_MOTION = true;

/** Un numero che sale fino al suo valore, una volta sola. */
function countUp(el) {
  const text = el.textContent;
  const match = /\d+/.exec(text);
  if (match === null || Number(match[0]) < 10) return;
  const target = Number(match[0]);
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 900);
    el.textContent = text.replace(match[0], String(Math.round(target * (1 - (1 - t) ** 3))));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const seen = moving
  ? new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          seen.unobserve(entry.target);
          const counter = entry.target.querySelector("[data-count]");
          if (counter) countUp(counter);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    )
  : undefined;

/** Mette in fila gli elementi di ogni gruppo e li tiene d'occhio finche' non entrano. */
function scan() {
  if (seen === undefined) return;
  for (const group of document.querySelectorAll("[data-stagger]")) {
    let index = 0;
    for (const el of group.querySelectorAll("[data-reveal]")) {
      if (el.closest("[data-stagger]") !== group) continue;
      el.style.setProperty("--i", String(Math.min(index++, 7)));
    }
  }
  for (const el of document.querySelectorAll("[data-reveal]:not(.is-in)")) seen.observe(el);
}

if (moving) {
  const scene = document.querySelector("[data-scene]");
  const near = new Set();
  const watch = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) near.add(entry.target);
        else near.delete(entry.target);
      }
    },
    { rootMargin: "20% 0px" },
  );
  for (const el of document.querySelectorAll("[data-parallax]")) watch.observe(el);

  let queued = false;
  const frame = () => {
    queued = false;
    const height = window.innerHeight;
    const max = root.scrollHeight - height;
    root.style.setProperty("--page", max > 0 ? (window.scrollY / max).toFixed(4) : "0");
    if (scene) scene.style.setProperty("--s", Math.min(1, window.scrollY / height).toFixed(3));
    for (const el of near) {
      const box = el.getBoundingClientRect();
      const offset = (box.top + box.height / 2 - height / 2) / height;
      el.style.setProperty("--p", Math.max(-1, Math.min(1, offset)).toFixed(3));
    }
  };
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  frame();
  scan();
}

// La voce del menu della sezione che si sta leggendo.
if ("IntersectionObserver" in window) {
  const links = new Map(
    [...document.querySelectorAll('.top__nav a[href^="#"]')].map((link) => [
      link.getAttribute("href").slice(1),
      link,
    ]),
  );
  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const link = links.get(entry.target.id);
        if (entry.isIntersecting) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      }
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );
  for (const id of links.keys()) {
    const section = document.getElementById(id);
    if (section) spy.observe(section);
  }
}

/**
 * Sostituisce un elenco con i dati del momento. Se chi legge c'e' gia' arrivato
 * il nuovo contenuto compare fermo, senza rifare l'ingresso.
 */
function swap(container, html) {
  const reached = container.getBoundingClientRect().top < window.innerHeight;
  container.innerHTML = html;
  if (reached) {
    for (const el of container.querySelectorAll("[data-reveal]")) el.classList.add("is-in");
  }
  scan();
}

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
      swap(
        document.querySelector("[data-versions]"),
        versionList(releases, strings.versions, strings.locale),
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
      swap(
        document.querySelector("[data-plugins]"),
        pluginCards(pluginList(modules, strings.catalog, strings.lang), strings.plugins),
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
