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
// Tutto segue lo scorrimento, in modo continuo e nei due versi: ogni elemento
// entra mentre sale dal bordo basso dello schermo ed esce mentre passa sotto
// la barra in alto, e tornando indietro fa il percorso al contrario. Lo decide
// motion-flag.js: con le animazioni ridotte non succede nulla e la pagina e'
// gia' tutta visibile.
const root = document.documentElement;
const moving = root.classList.contains("js-motion");
window.CUELITH_MOTION = true;

/** Distanza di scorrimento tra un elemento e il successivo dello stesso gruppo. */
const STEP = 22;
const LAST = 6;
const clamp = (value) => Math.max(0, Math.min(1, value));
/** Partenza e arrivo morbidi, senza perdere il legame con lo scorrimento. */
const ease = (t) => t * t * (3 - 2 * t);

/** Gli elementi che si muovono, con la loro posizione nella pagina (senza trasformazioni). */
let items = [];

/** Posizione di un elemento nella pagina come la da' l'impaginazione: le trasformazioni non contano. */
function place(el) {
  let top = 0;
  for (let node = el; node instanceof HTMLElement; node = node.offsetParent) top += node.offsetTop;
  return { top, height: el.offsetHeight };
}

/** Rilegge elementi e gruppi: all'avvio e quando un elenco viene sostituito. */
function collect() {
  if (!moving) return;
  const order = new Map();
  for (const group of document.querySelectorAll("[data-stagger]")) {
    let index = 0;
    for (const el of group.querySelectorAll("[data-reveal]")) {
      if (el.closest("[data-stagger]") !== group) continue;
      order.set(el, Math.min(index++, LAST));
    }
  }
  items = [...document.querySelectorAll("[data-reveal]")].map((el) => {
    const index = order.get(el) ?? 0;
    // Per l'ingresso dell'apertura, che avviene col tempo (vedi lo stile).
    el.style.setProperty("--i", String(index));
    const counter = el.querySelector("[data-count]");
    const text = counter?.dataset.text ?? counter?.textContent ?? "";
    if (counter) counter.dataset.text = text;
    const number = /\d+/.exec(text);
    return {
      el,
      index,
      hero: el.closest(".hero") !== null,
      counter: counter && number && Number(number[0]) >= 10 ? { el: counter, text, number } : null,
      top: 0,
      height: 0,
      shown: -1,
      side: 0,
    };
  });
  measure();
}

/** Le posizioni cambiano quando cambia l'impaginazione: finestra, filtri, domande aperte. */
function measure() {
  for (const item of items) Object.assign(item, place(item.el));
  schedule();
}

const scene = document.querySelector("[data-scene]");
const bar = document.querySelector(".top");
const near = new Set();

function frame() {
  queued = false;
  const view = window.innerHeight;
  const y = window.scrollY;
  const max = Math.max(0, root.scrollHeight - view);
  root.style.setProperty("--page", max > 0 ? (y / max).toFixed(4) : "0");
  if (scene) scene.style.setProperty("--s", Math.min(1, y / view).toFixed(3));
  for (const el of near) {
    const box = el.getBoundingClientRect();
    const offset = (box.top + box.height / 2 - view / 2) / view;
    el.style.setProperty("--p", Math.max(-1, Math.min(1, offset)).toFixed(3));
  }

  const head = bar ? bar.offsetHeight : 0;
  // Quanto scorrimento dura un ingresso (dal basso) e un'uscita (in alto).
  const zoneIn = Math.min(view * 0.28, 260);
  const zoneOut = Math.min(view * 0.18, 160);
  // In fondo alla pagina cio' che non puo' piu' salire si completa comunque;
  // in cima, cio' che sta gia' sotto la barra non parte sbiadito.
  const reach = zoneIn + LAST * STEP;
  const bottomBonus = Math.max(0, reach - (max - y));
  const topBonus = Math.max(0, zoneOut - y);
  for (const item of items) {
    if (item.height === 0) continue;
    const top = item.top - y;
    const bottom = top + item.height;
    const enter = item.hero ? 1 : (view - top - item.index * STEP + bottomBonus) / zoneIn;
    const leave = (bottom - head + topBonus) / zoneOut;
    const shown = Math.round(ease(clamp(Math.min(enter, leave))) * 1000) / 1000;
    const side = enter <= leave ? 1 : -1;
    if (shown === item.shown && side === item.side) continue;
    item.shown = shown;
    item.side = side;
    item.el.style.setProperty("--r", String(shown));
    item.el.style.setProperty("--d", String(side));
    if (item.counter) {
      const { el, text, number } = item.counter;
      el.textContent = text.replace(number[0], String(Math.round(Number(number[0]) * shown)));
    }
  }
}

let queued = false;
function schedule() {
  if (queued || !moving) return;
  queued = true;
  requestAnimationFrame(frame);
}

if (moving) {
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
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", measure);
  window.addEventListener("load", measure);
  // Filtri, domande aperte, caratteri arrivati: ogni cambio di altezza della pagina.
  if ("ResizeObserver" in window) new ResizeObserver(measure).observe(document.body);
  collect();
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
    // Una linea a meta' schermo: la sezione che la attraversa e' quella in lettura.
    { rootMargin: "-50% 0px -50% 0px" },
  );
  for (const id of links.keys()) {
    const section = document.getElementById(id);
    if (section) spy.observe(section);
  }
}

/** Sostituisce un elenco con i dati del momento e ne rilegge gli elementi. */
function swap(container, html) {
  container.innerHTML = html;
  collect();
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
      const versionsBox = document.querySelector("[data-versions]");
      if (versionsBox) swap(versionsBox, versionList(releases, strings.versions, strings.locale));
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
      const pluginsBox = document.querySelector("[data-plugins]");
      if (pluginsBox) {
        swap(
          pluginsBox,
          pluginCards(pluginList(modules, strings.catalog, strings.lang), strings.plugins),
        );
        applyFilter(active?.dataset.filter ?? "all");
      }
    }
  } catch {
    // Restano i plugin scritti nella pagina.
  }
}

// L'anteprima in un file solo (CUELITH_STATIC) non ha le funzioni del sito dietro.
if (location.protocol.startsWith("http") && window.CUELITH_STATIC !== true) {
  void refresh();
}
