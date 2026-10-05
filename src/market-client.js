// Piccoli aiuti delle pagine /marketplace e /marketplace/submit: il filtro e
// l'aggiornamento delle schede senza ricostruire il sito, e il modulo di
// proposta. Senza JavaScript la pagina del marketplace resta completa (le
// schede sono gia' scritte); il modulo invece ha bisogno dello script.
// (Le funzioni di shared.js e di submission.js sono incluse qui sopra.)

const pageStrings = JSON.parse(document.getElementById("strings").textContent);

// ---- marketplace: filtro e dati del momento ----
const market = document.querySelector("[data-market]");
if (market && pageStrings.market) {
  const chips = [...document.querySelectorAll("[data-filter]")];
  const filters = document.querySelector("[data-filters]");
  const notice = document.querySelector("[data-notice]");
  const leads = [...document.querySelectorAll("[data-lead]")];

  const applyFilter = (group) => {
    for (const chip of chips)
      chip.setAttribute("aria-pressed", String(chip.dataset.filter === group));
    for (const card of market.querySelectorAll("[data-group]")) {
      card.hidden = group !== "all" && card.dataset.group !== group;
    }
  };
  for (const chip of chips) chip.addEventListener("click", () => applyFilter(chip.dataset.filter));

  /** Mostra filtri, spiegazione dell'acquisto e introduzione solo se c'e' un plugin a pagamento. */
  const showPaid = (hasPaid, hasFree) => {
    if (filters) filters.hidden = !hasPaid;
    if (notice) notice.hidden = !hasPaid;
    for (const lead of leads) lead.hidden = (lead.dataset.lead === "mixed") !== hasPaid;
    for (const chip of chips) {
      chip.hidden =
        chip.dataset.filter === "paid"
          ? !hasPaid
          : chip.dataset.filter === "free"
            ? !hasFree
            : false;
    }
  };

  (async () => {
    if (!location.protocol.startsWith("http")) return;
    try {
      const response = await fetch("/api/modules", { headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const { modules } = await response.json();
      if (!Array.isArray(modules) || modules.length === 0) return;
      const plugins = pluginList(modules, pageStrings.catalog, pageStrings.lang).filter(
        (plugin) => plugin.status === "available",
      );
      if (plugins.length === 0) return;
      const active = chips.find((chip) => chip.getAttribute("aria-pressed") === "true");
      market.innerHTML = `<ul class="plugins">\n${marketCards(plugins, pageStrings.market)}\n</ul>`;
      showPaid(
        plugins.some((plugin) => plugin.access === "paid"),
        plugins.some((plugin) => plugin.access !== "paid"),
      );
      applyFilter(active && !active.hidden ? active.dataset.filter : "all");
    } catch {
      // Restano le schede scritte nella pagina.
    }
  })();
}

// ---- proposta di un plugin ----
const form = document.getElementById("proposal");
if (form && pageStrings.submit) {
  const { result, errors: messages } = pageStrings.submit;
  const status = form.querySelector("[data-status]");
  const button = form.querySelector('button[type="submit"]');
  const kindOf = () => form.elements.kind.value;

  const paidParts = () => [...form.querySelectorAll("[data-only]")];
  const applyKind = () => {
    const paid = kindOf() === "paid";
    for (const part of paidParts()) {
      part.hidden = !paid;
      // Cio' che e' nascosto non e' obbligatorio e non si invia.
      for (const control of part.querySelectorAll("input, textarea")) {
        control.disabled = !paid;
        control.required = paid && control.dataset.optional !== "true";
      }
    }
    // La chiave dell'autore e' obbligatoria solo a pagamento.
    const key = form.elements.authorKey;
    if (key) key.required = paid;
  };
  for (const radio of form.elements.kind) radio.addEventListener("change", applyKind);
  applyKind();

  const clearErrors = () => {
    for (const el of form.querySelectorAll(".field__error")) {
      el.hidden = true;
      el.textContent = "";
    }
    for (const el of form.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
  };

  /** Mostra un errore sotto il campo, o sotto la checklist. */
  const showError = (name, key) => {
    const message = messages[key] ?? messages.required;
    if (name === "confirm") {
      const el = form.querySelector('[data-error="confirm"]');
      el.textContent = message;
      el.hidden = false;
      return null;
    }
    const wrapper = form.querySelector(`[data-field="${name}"]`);
    if (!wrapper) return null;
    const el = wrapper.querySelector(".field__error");
    el.textContent = message;
    el.hidden = false;
    const control = wrapper.querySelector("input, textarea");
    control.setAttribute("aria-invalid", "true");
    return control;
  };

  const collect = () => {
    const data = { kind: kindOf(), confirm: {} };
    for (const control of form.querySelectorAll("input, textarea")) {
      if (control.disabled || !control.name || control.name === "kind") continue;
      if (control.type === "checkbox") {
        data.confirm[control.name.replace(/^confirm\./, "")] = control.checked;
      } else {
        data[control.name] = control.value;
      }
    }
    return data;
  };

  const say = (text, bad) => {
    status.textContent = text;
    status.classList.toggle("form__status--bad", bad);
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();
    say("", false);
    const checked = parseSubmission(collect());
    if (!checked.ok) {
      let first = null;
      for (const [name, key] of Object.entries(checked.errors)) {
        const control = showError(name, key);
        first ??= control;
      }
      say(pageStrings.submit.result.invalid, true);
      first?.focus();
      return;
    }
    button.disabled = true;
    say(pageStrings.submit.sending, false);
    try {
      const response = await fetch("/api/marketplace/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(collect()),
      });
      if (response.ok) {
        form.reset();
        applyKind();
        say(result.ok, false);
      } else if (response.status === 400) {
        // Il server controlla di nuovo: se non e' d'accordo, mostra i suoi errori.
        const body = await response.json().catch(() => ({}));
        for (const [name, key] of Object.entries(body.errors ?? {})) showError(name, key);
        say(result.invalid, true);
      } else {
        say(result.unavailable, true);
      }
    } catch {
      say(result.network, true);
    } finally {
      button.disabled = false;
    }
  });
}
