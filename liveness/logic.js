// Controllo di vita degli autori: logica pura, senza rete ne' orologio proprio.
//
// Ogni plugin con un contatto ha una scheda `alive:<id>`. Ogni CHECK_EVERY_DAYS
// l'autore riceve una richiesta di conferma (un collegamento). Senza risposta:
// promemoria dopo 14 e 28 giorni (3 email in tutto), poi, dopo altri 14 giorni,
// il plugin diventa "dormiente" (non piu' installabile; le copie gia' installate e
// le licenze gia' vendute non cambiano) e parte una quarta email che spiega cosa e'
// successo e come rimediare. Una conferma, anche dopo, rimette tutto a posto.

export const DAY = 86_400_000;
export const CHECK_EVERY_DAYS = 180;
export const REMINDER_GAP_DAYS = 14;
export const MAX_REMINDERS = 3;

export const newNonce = () => crypto.randomUUID().replaceAll("-", "");

/** Scheda di un plugin appena conosciuto: parte da quando e' stato pubblicato. */
export function freshRecord(contact, nonce = newNonce()) {
  return {
    pluginId: contact.pluginId,
    name: contact.name,
    email: contact.email,
    lastConfirmed: contact.since,
    reminders: 0,
    lastSent: null,
    dormant: false,
    nonce,
  };
}

/** Cosa fare adesso con questa scheda: "none", "remind" o "dormant". */
export function decide(record, now) {
  const t = now.getTime();
  if (record.dormant) return { action: "none" };
  if (record.reminders === 0) {
    return t - Date.parse(record.lastConfirmed) >= CHECK_EVERY_DAYS * DAY
      ? { action: "remind", number: 1 }
      : { action: "none" };
  }
  if (t - Date.parse(record.lastSent) < REMINDER_GAP_DAYS * DAY) return { action: "none" };
  return record.reminders >= MAX_REMINDERS
    ? { action: "dormant" }
    : { action: "remind", number: record.reminders + 1 };
}

export const afterRemind = (record, now) => ({
  ...record,
  reminders: record.reminders + 1,
  lastSent: now.toISOString(),
});

export const afterDormant = (record, now) => ({
  ...record,
  dormant: true,
  lastSent: now.toISOString(),
});

/** Conferma dell'autore: ricomincia il giro e, se era dormiente, il plugin torna attivo. */
export const afterConfirm = (record, now, nonce = newNonce()) => ({
  ...record,
  lastConfirmed: now.toISOString(),
  reminders: 0,
  lastSent: null,
  dormant: false,
  nonce,
});

/** Il testo delle quattro email (in inglese). `link` porta alla pagina di conferma. */
export function emailFor(kind, record, link) {
  const name = record.name;
  const sign = "\n\nThe Cuelith project\nIf you have questions, just reply to this email.";
  if (kind === "dormant") {
    return {
      subject: `${name}: your plugin is now marked dormant on Cuelith`,
      text:
        `We asked you three times to confirm that your plugin "${name}" is still maintained, and we did not hear back.` +
        `\n\nWhat this means: the plugin is marked "dormant" in the Cuelith marketplace, so new users cannot install it for now. ` +
        `Copies already installed keep working and licences already sold stay valid. Nothing is deleted.` +
        `\n\nTo bring it back, confirm here (one click): ${link}` +
        `\nIf you want the plugin withdrawn instead, reply to this email and say so.` +
        sign,
    };
  }
  const n = record.reminders + 1;
  return {
    subject:
      n === 1
        ? `${name}: is your Cuelith plugin still maintained? (one click)`
        : `${name}: reminder ${String(n)} of ${String(MAX_REMINDERS)} - please confirm your Cuelith plugin`,
    text:
      `Twice a year we check that the plugins in the Cuelith marketplace still have someone looking after them.` +
      `\n\nPlease confirm that "${name}" is still maintained: ${link}` +
      `\n\nIt takes one click. If we do not hear back, after a few more reminders the plugin is marked "dormant": ` +
      `new users could no longer install it, while installed copies and sold licences are not affected.` +
      (n > 1 ? `\n\nThis is reminder ${String(n)} of ${String(MAX_REMINDERS)}.` : "") +
      sign,
  };
}
