// Caricato per primo, prima che la pagina si disegni: dice allo stile che le
// animazioni d'ingresso sono possibili, cosi' nulla compare e poi sparisce.
// Con le animazioni ridotte nelle preferenze del sistema non fa nulla.
(() => {
  const root = document.documentElement;
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.classList.add("js-motion");
  // Se lo script principale non arriva, la pagina torna tutta visibile.
  setTimeout(() => {
    if (window.CUELITH_MOTION !== true) root.classList.remove("js-motion");
  }, 4000);
})();
