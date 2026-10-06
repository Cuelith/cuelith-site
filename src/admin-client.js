// Script del pannello delle proposte (src/admin.mjs). Tutto cio' che arriva da
// una proposta (nomi, descrizioni, indirizzi, email) e' testo di un estraneo:
// si scrive SOLO con textContent e con le proprieta' del DOM, mai come HTML.

const statusLine = document.querySelector("[data-admin-status]");
const pendingBox = document.querySelector("[data-pending]");
const doneBox = document.querySelector("[data-done]");
const contactsBox = document.querySelector("[data-contacts]");

function make(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "text") el.textContent = value;
    else if (key === "class") el.className = value;
    else el[key] = value;
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

const say = (text, bad = false) => {
  statusLine.textContent = text;
  statusLine.classList.toggle("form__status--bad", bad);
};

async function call(action, data) {
  const response = await fetch(`/api/marketplace/admin/${action}`, {
    method: data === undefined ? "GET" : "POST",
    headers:
      data === undefined
        ? { Accept: "application/json" }
        : {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-Cuelith-Admin": "1",
          },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    // risposta senza JSON: resta solo il codice
  }
  return { status: response.status, body };
}

const WHY = {
  401: "Non risulti autenticato: riapri la pagina e accedi con Cloudflare Access.",
  403: "Accesso negato.",
  503: "Il pannello non è configurato (variabili d'ambiente mancanti: vedi MARKETPLACE_SETUP.md).",
};

/** Nomi dei controlli dell'analisi, in parole. */
const CHECK_TEXT = {
  id: "L'identificativo del manifesto è quello della proposta",
  version: "La versione è valida (x.y.z)",
  engines: "Compatibilità dichiarata (cuelith e protocollo)",
  permissions: "Elenco dei permessi valido",
  family: "Famiglia del plugin dichiarata",
  manifestInfo: "Nome, autore e licenza nel manifesto",
  repository: "Indirizzo del progetto (https)",
  signature: "Firma dell'autore sul pacchetto",
  ownership: "Stessa chiave d'autore del plugin già nel registry",
  sameKind: "Stesso tipo (gratuito o a pagamento) del plugin già nel registry",
  versionNew: "Versione non ancora nel registry",
  checkoutUrl: "Pagina di acquisto di un negozio ammesso",
  github: "Lettura del registry su GitHub",
  "package:badUrl": "Indirizzo del pacchetto ammesso",
  "package:download": "Il pacchetto si scarica",
  "package:tooLarge": "Il pacchetto è entro il limite di dimensione",
  "package:notZip": "Il pacchetto è un file zip",
  "package:noManifest": "Il pacchetto contiene cuelith-plugin.json",
  "package:badManifest": "Il manifesto è un JSON valido",
  "package:noIcon": "Il pacchetto contiene l'icona dichiarata",
  "package:badIcon": "L'icona è un SVG semplice, senza script",
};

const row = (label, value) =>
  make("tr", {}, make("th", { text: label, scope: "row" }), make("td", { text: String(value) }));

function renderReport(box, report) {
  box.replaceChildren();
  const list = make("ul", { class: "admin__checks" });
  for (const check of report.checks) {
    const item = make("li", { class: check.ok ? "admin__ok" : "admin__bad" });
    item.append(
      make("strong", { text: check.ok ? "✓ " : "✗ " }),
      document.createTextNode(CHECK_TEXT[check.key] ?? check.key),
    );
    if (check.detail) item.append(make("small", { text: ` — ${check.detail}` }));
    list.append(item);
  }
  box.append(list);
  for (const warning of report.warnings ?? []) {
    box.append(make("p", { class: "plugins__note", text: `Attenzione, ${warning}` }));
  }
  const s = report.summary;
  if (s) {
    const table = make("table", { class: "admin__table" });
    table.append(
      row(
        "Versione",
        `${s.version}${s.isUpdate ? " (aggiornamento di un plugin già nel registry)" : " (plugin nuovo)"}`,
      ),
      row("Dimensione", `${String(s.size)} byte`),
      row("Impronta SHA-256", s.sha256),
      row("Famiglia", s.family),
      row("Compatibilità", `Cuelith ${s.engines.cuelith} · protocollo ${s.engines.protocol}`),
      row("Permessi", s.permissions.length === 0 ? "nessuno" : s.permissions.join(", ")),
    );
    if (s.kind === "paid") {
      table.append(
        row("Prezzo mostrato", s.price),
        row("Link di acquisto che verrà pubblicato", s.checkoutUrl),
      );
    }
    box.append(table);
  }
}

function proposal(meta) {
  const card = make("article", { class: "proposal" });
  const head = make(
    "header",
    { class: "proposal__head" },
    make("h3", { text: meta.name }),
    make("span", {
      class: `badge ${meta.kind === "paid" ? "badge--paid" : "badge--available"}`,
      text: meta.kind === "paid" ? "A pagamento" : "Gratuito",
    }),
  );
  const info = make("p", {
    class: "plugin__kind",
    text: `${meta.pluginId} · ricevuta il ${new Date(meta.receivedAt).toLocaleString("it-IT")}`,
  });
  const details = make("div", { class: "proposal__details", hidden: true });
  const actions = make("div", { class: "proposal__actions" });
  const result = make("p", { class: "form__status", role: "status" });
  card.append(head, info, details, actions, result);

  let checkout = null;
  const analyzeButton = make("button", {
    type: "button",
    class: "button button--small",
    text: "Analizza",
  });
  const approveButton = make("button", {
    type: "button",
    class: "button button--small button--primary",
    text: "Approva",
    disabled: true,
  });
  const rejectButton = make("button", {
    type: "button",
    class: "button button--small",
    text: "Rifiuta",
  });
  actions.append(analyzeButton, approveButton, rejectButton);

  async function analyze() {
    analyzeButton.disabled = true;
    result.textContent = "Analisi in corso…";
    result.classList.remove("form__status--bad");
    const { status, body } = await call("analyze", {
      id: meta.id,
      ...(checkout?.value ? { checkoutUrl: checkout.value } : {}),
    });
    analyzeButton.disabled = false;
    if (status !== 200) {
      result.textContent = body.errors?.checkoutUrl
        ? "Il link di acquisto deve essere di un negozio ammesso (lemonsqueezy.com)."
        : (WHY[status] ?? "Errore nell'analisi.");
      result.classList.add("form__status--bad");
      return;
    }
    result.textContent = "";
    details.hidden = false;
    details.replaceChildren();
    const s = body.submission;
    details.append(
      make("p", { text: s.description }),
      make("p", { class: "plugin__note", text: `Autore: ${s.publisher} · Licenza: ${s.license}` }),
    );
    const contact = make("p", { class: "plugin__note" }, document.createTextNode("Contatto: "));
    const mail = make("a", { class: "link", text: s.contact });
    mail.href = `mailto:${s.contact}`;
    contact.append(mail);
    details.append(contact);
    if (s.kind === "paid") {
      const field = make("div", { class: "field" });
      checkout = make("input", {
        type: "url",
        value: body.report.summary?.checkoutUrl ?? s.checkoutUrl,
        id: `c-${meta.id}`,
      });
      field.append(
        make("label", {
          text: "Link di acquisto da pubblicare",
          htmlFor: `c-${meta.id}`,
        }),
        checkout,
        make("p", {
          class: "field__hint",
          text: "È quello indicato dall'autore. Puoi cambiarlo solo con un altro indirizzo del suo negozio (lemonsqueezy.com).",
        }),
      );
      details.append(field);
    }
    const report = make("div", { class: "admin__report" });
    renderReport(report, body.report);
    details.append(report);
    approveButton.disabled = !body.report.ok;
  }

  analyzeButton.addEventListener("click", analyze);

  approveButton.addEventListener("click", async () => {
    if (!window.confirm(`Approvare «${meta.name}»? Si apre la pull request nel registry.`)) return;
    approveButton.disabled = true;
    const { status, body } = await call("approve", {
      id: meta.id,
      ...(checkout?.value ? { checkoutUrl: checkout.value } : {}),
    });
    if (status === 200) {
      await load(
        `«${meta.name}» approvato: pull request #${String(body.pr.number)} ${body.pr.autoMerge ? "(si unirà da sola a controlli verdi)" : "(unione automatica non attiva: va unita a mano)"}.`,
      );
      return;
    }
    result.classList.add("form__status--bad");
    if (status === 422) {
      result.textContent = "L'analisi non passa: vedi i controlli.";
      details.hidden = false;
      renderReport(details.querySelector(".admin__report") ?? details, body.report);
    } else if (status === 502) {
      result.textContent = `GitHub non ha accettato (passo «${body.step}», codice ${String(body.status)}). La proposta resta in attesa.`;
      approveButton.disabled = false;
    } else {
      result.textContent = WHY[status] ?? "Errore nell'approvazione.";
      approveButton.disabled = false;
    }
  });

  rejectButton.addEventListener("click", async () => {
    if (
      !window.confirm(
        `Rifiutare «${meta.name}»? La proposta e i dati dell'autore vengono cancellati.`,
      )
    )
      return;
    const { status } = await call("reject", { id: meta.id });
    if (status === 200) {
      await load(`«${meta.name}» rifiutato e cancellato.`);
    } else {
      result.textContent = WHY[status] ?? "Errore nel rifiuto.";
      result.classList.add("form__status--bad");
    }
  });
  return card;
}

/** Rilegge l'elenco; `message`, se c'è, resta sopra il conteggio (l'esito dell'ultima azione). */
async function load(message) {
  const { status, body } = await call("pending");
  if (status !== 200) {
    say(
      status === 403 && typeof body.email === "string"
        ? `Accesso negato: sei entrato come «${body.email}», ma il pannello è riservato a un altro indirizzo (variabile ADMIN_EMAIL).`
        : (WHY[status] ?? "Non riesco a leggere le proposte."),
      true,
    );
    return;
  }
  pendingBox.replaceChildren(...body.pending.map(proposal));
  showContacts(Array.isArray(body.contacts) ? body.contacts : []);
  const count =
    body.pending.length === 0
      ? "Nessuna proposta in attesa."
      : `${String(body.pending.length)} in attesa.`;
  say(message === undefined ? count : `${message} ${count}`);
  doneBox.replaceChildren(
    ...(body.done.length === 0
      ? [make("p", { class: "plugins__note", text: "Nessun esito recente." })]
      : body.done.map((d) => {
          const line = make("p", { class: "plugins__note" });
          line.append(
            document.createTextNode(
              `${new Date(d.at).toLocaleString("it-IT")} · ${d.name} · ${d.result === "approved" ? `approvato (${d.version})` : "rifiutato"}`,
            ),
          );
          if (typeof d.prUrl === "string" && d.prUrl.startsWith("https://github.com/")) {
            const link = make("a", {
              class: "link",
              text: " pull request",
              target: "_blank",
              rel: "noopener",
            });
            link.href = d.prUrl;
            line.append(link);
          }
          return line;
        })),
  );
}

/** Autori dei plugin pubblicati: l'indirizzo si conserva finché il plugin è nel marketplace. */
function showContacts(contacts) {
  contactsBox.replaceChildren(
    ...(contacts.length === 0
      ? [make("p", { class: "plugins__note", text: "Nessun contatto conservato." })]
      : contacts.map((c) => {
          const line = make("p", {
            class: "plugins__note",
            text: `${c.name} (${c.pluginId}) · ${c.email} · dal ${new Date(c.since).toLocaleDateString("it-IT")} `,
          });
          const button = make("button", {
            class: "button button--small",
            type: "button",
            text: "Dimentica",
          });
          button.addEventListener("click", async () => {
            if (
              !window.confirm(
                `Dimenticare l'indirizzo di ${c.name}? Fallo solo se il plugin non è più nel marketplace.`,
              )
            )
              return;
            button.disabled = true;
            const { status } = await call("forget", { pluginId: c.pluginId });
            if (status === 200) void load(`Indirizzo di ${c.name} dimenticato.`);
            else {
              button.disabled = false;
              say(WHY[status] ?? "Non riesco a dimenticare l'indirizzo.", true);
            }
          });
          line.append(button);
          return line;
        })),
  );
}

void load();
