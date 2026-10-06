import { esc } from "./shared.js";

// Pannello del fondatore per le proposte di plugin: /marketplace/dashboard-admin/.
// Sta dietro Cloudflare Access (le funzioni verificano il token) ed e' solo in
// italiano: e' uno strumento interno, non una pagina del sito. Non e' indicizzata
// (noindex) e non compare in nessun elenco. La pagina e' vuota: la riempie lo
// script con i dati delle funzioni protette, usando solo textContent.

export const ADMIN_PATH = "/marketplace/dashboard-admin/";

export function renderAdmin({ assets }) {
  const head = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Proposte dei plugin · Cuelith</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#0B0C0E">
<link rel="icon" href="${esc(assets.icon)}" type="image/svg+xml">
${assets.styles}`;

  const body = `<header class="top">
  <div class="wrap top__row">
    <span class="brand"><img src="${esc(assets.logo)}" alt="Cuelith" width="150" height="40"></span>
    <span class="top__lang">Riservato</span>
  </div>
</header>

<main id="contenuto">
<section class="section subpage">
  <div class="wrap">
    <p class="eyebrow">Marketplace · pannello</p>
    <h1 class="subpage__title">Proposte in attesa</h1>
    <p class="lead lead--section">Analizza una proposta per vedere cosa contiene il pacchetto; approvala per aprire la pull request nel registry (si unisce da sola a controlli verdi) oppure rifiutala.</p>
    <p class="admin__status" role="status" aria-live="polite" data-admin-status>Caricamento…</p>
    <div class="admin__list" data-pending></div>
    <h2 class="admin__title">Esiti recenti</h2>
    <div class="admin__done" data-done></div>
    <h2 class="admin__title">Autori dei plugin pubblicati</h2>
    <p class="plugins__note">L'indirizzo resta solo finché il plugin è nel marketplace: serve ad avvisare per iscritto se le condizioni non sono rispettate. Quando un plugin esce, premi «Dimentica».</p>
    <div class="admin__done" data-contacts></div>
  </div>
</section>
</main>
${assets.script}`;
  return { head, body };
}
