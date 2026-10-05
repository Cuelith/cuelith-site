import { sha256Hex } from "./crypto.js";

// Le proposte in attesa stanno in Cloudflare KV (gratis), mai in un database:
// una chiave per proposta, con scadenza (si cancellano da sole), e tutto cio'
// che serve per l'elenco nei "metadati" della chiave, cosi' l'elenco non
// richiede una lettura per ogni proposta. Chi ha deciso non resta: dopo
// l'approvazione o il rifiuto la proposta sparisce e resta solo un breve
// promemoria del risultato (senza email).

const PENDING_DAYS = 60;
const DONE_DAYS = 14;
const DAY = 24 * 60 * 60;
/** Quante proposte in attesa al massimo: oltre, il modulo risponde "riprova piu' tardi". */
export const MAX_PENDING = 100;
/** Quante proposte da uno stesso indirizzo in un giorno. */
export const MAX_PER_DAY = 5;

export const newId = () => crypto.randomUUID().replaceAll("-", "");

/** Impronta di un indirizzo IP, per contare senza conservarlo. */
export async function ipFingerprint(ip, salt) {
  return (await sha256Hex(new TextEncoder().encode(`${salt}|${ip}`))).slice(0, 24);
}

/** Conta una proposta per questo indirizzo oggi; vero se e' ancora entro il limite. */
export async function allowSubmission(kv, fingerprint, now = new Date()) {
  const key = `rl:${fingerprint}:${now.toISOString().slice(0, 10)}`;
  const count = Number((await kv.get(key)) ?? "0");
  if (count >= MAX_PER_DAY) return false;
  await kv.put(key, String(count + 1), { expirationTtl: DAY + 3600 });
  return true;
}

export async function pendingCount(kv) {
  const { keys } = await kv.list({ prefix: "sub:", limit: MAX_PENDING + 1 });
  return keys.length;
}

/** Conserva una proposta valida. */
export async function saveSubmission(kv, submission, now = new Date()) {
  const id = newId();
  const record = { id, receivedAt: now.toISOString(), submission };
  await kv.put(`sub:${id}`, JSON.stringify(record), {
    expirationTtl: PENDING_DAYS * DAY,
    metadata: {
      id,
      receivedAt: record.receivedAt,
      pluginId: submission.id,
      name: submission.name,
      kind: submission.kind,
    },
  });
  return id;
}

export async function listPending(kv) {
  const { keys } = await kv.list({ prefix: "sub:", limit: MAX_PENDING });
  return keys
    .map((key) => key.metadata)
    .filter((meta) => meta !== undefined && meta !== null)
    .sort((a, b) => String(a.receivedAt).localeCompare(String(b.receivedAt)));
}

export async function getSubmission(kv, id) {
  if (!/^[0-9a-f]{32}$/.test(id)) return undefined;
  return (await kv.get(`sub:${id}`, "json")) ?? undefined;
}

export const deleteSubmission = (kv, id) => kv.delete(`sub:${id}`);

/** Promemoria di cosa e' successo (senza dati di chi ha proposto). */
export async function saveOutcome(kv, outcome, now = new Date()) {
  await kv.put(`done:${outcome.id}`, JSON.stringify({ ...outcome, at: now.toISOString() }), {
    expirationTtl: DONE_DAYS * DAY,
    metadata: { ...outcome, at: now.toISOString() },
  });
}

export async function listOutcomes(kv) {
  const { keys } = await kv.list({ prefix: "done:", limit: 50 });
  return keys
    .map((key) => key.metadata)
    .filter((meta) => meta !== undefined && meta !== null)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
