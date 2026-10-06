// Caricato per primo, prima che la pagina si disegni: dice allo stile che le
// animazioni d'ingresso sono possibili, cosi' nulla compare e poi sparisce.
// Con le animazioni ridotte nelle preferenze del sistema non fa nulla.
(() => {
  // Gli indirizzi di quando la home era una pagina sola (/#download, /#funzioni...) portano
  // alla pagina che ora ha quella parte: i vecchi collegamenti continuano a funzionare.
  const moved = {
    it: {
      download: "/scarica/",
      versioni: "/scarica/#versioni",
      funzioni: "/funzioni/",
      plugin: "/plugin/",
      domande: "/domande/",
    },
    en: {
      download: "/en/download/",
      versioni: "/en/download/#versioni",
      funzioni: "/en/features/",
      plugin: "/en/plugins/",
      domande: "/en/faq/",
    },
  };
  const home = { "/": "it", "/en/": "en" }[location.pathname];
  const target = home === undefined ? undefined : moved[home][location.hash.slice(1)];
  if (target !== undefined) {
    location.replace(target);
    return;
  }
  const root = document.documentElement;
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.classList.add("js-motion");
  // Se lo script principale non arriva, la pagina torna tutta visibile.
  setTimeout(() => {
    if (window.CUELITH_MOTION !== true) root.classList.remove("js-motion");
  }, 4000);
})();
