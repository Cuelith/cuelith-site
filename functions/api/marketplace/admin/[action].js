import { requireAdmin } from "../../../_lib/access.js";
import { GitHubError } from "../../../_lib/github.js";
import { approveSubmission, reviewSubmission } from "../../../_lib/review.js";
import {
  deleteContact,
  deleteSubmission,
  getSubmission,
  listContacts,
  listOutcomes,
  listPending,
  saveContact,
  saveOutcome,
} from "../../../_lib/store.js";

// Pannello del fondatore (dietro Cloudflare Access): elenco delle proposte,
// analisi, approvazione e rifiuto. Ogni richiesta verifica il token di Access
// (vedi _lib/access.js); le modifiche chiedono anche l'intestazione propria e
// l'origine del sito.

const headers = { "Cache-Control": "no-store" };
const reply = (body, status = 200) => Response.json(body, { status, headers });
const SHOP = /^https:\/\/(?:[a-z0-9-]+\.)*lemonsqueezy\.com(?:[/?#]|$)/;

async function readJson(request) {
  const text = await request.text();
  if (text.length > 4096) return undefined;
  try {
    const value = JSON.parse(text);
    return value !== null && typeof value === "object" ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function onRequest({ request, env, params }) {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  if (!env.SUBMISSIONS) return reply({ error: "not_configured" }, 503);
  const kv = env.SUBMISSIONS;
  const action = Array.isArray(params.action) ? params.action[0] : params.action;

  if (action === "pending") {
    if (request.method !== "GET") return reply({ error: "method" }, 405);
    return reply({
      pending: await listPending(kv),
      done: await listOutcomes(kv),
      contacts: await listContacts(kv),
    });
  }
  if (action === "forget") {
    if (request.method !== "POST") return reply({ error: "method" }, 405);
    const data = await readJson(request);
    const pluginId = typeof data?.pluginId === "string" ? data.pluginId : "";
    if (!/^[a-z0-9]+(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/.test(pluginId)) {
      return reply({ error: "not_found" }, 404);
    }
    await deleteContact(kv, pluginId);
    return reply({ ok: true });
  }
  if (!["analyze", "approve", "reject"].includes(action)) return reply({ error: "not_found" }, 404);
  if (request.method !== "POST") return reply({ error: "method" }, 405);

  const input = await readJson(request);
  const record = input === undefined ? undefined : await getSubmission(kv, String(input.id ?? ""));
  if (record === undefined) return reply({ error: "not_found" }, 404);
  const { submission } = record;

  if (action === "reject") {
    await saveOutcome(kv, {
      id: record.id,
      pluginId: submission.id,
      name: submission.name,
      result: "rejected",
    });
    await deleteSubmission(kv, record.id);
    return reply({ ok: true });
  }

  // L'indirizzo di acquisto da pubblicare (quello con il link di affiliazione) lo sceglie il fondatore.
  let checkoutUrl;
  if (typeof input.checkoutUrl === "string" && input.checkoutUrl.trim() !== "") {
    checkoutUrl = input.checkoutUrl.trim();
    if (checkoutUrl.length > 2048 || !SHOP.test(checkoutUrl)) {
      return reply({ error: "invalid", errors: { checkoutUrl: "notShop" } }, 400);
    }
  }

  if (action === "analyze") {
    const { report } = await reviewSubmission(record, env, { checkoutUrl });
    return reply({ id: record.id, receivedAt: record.receivedAt, submission, report });
  }

  // approve
  try {
    const pr = await approveSubmission(record, env, { checkoutUrl });
    await saveOutcome(kv, {
      id: record.id,
      pluginId: pr.id,
      name: pr.name,
      version: pr.version,
      result: "approved",
      prUrl: pr.url,
      autoMerge: pr.autoMerge,
    });
    await saveContact(kv, { pluginId: pr.id, name: pr.name, email: submission.contact });
    await deleteSubmission(kv, record.id);
    return reply({ ok: true, pr: { number: pr.number, url: pr.url, autoMerge: pr.autoMerge } });
  } catch (error) {
    if (error?.code === "notOk") return reply({ error: "notOk", report: error.report }, 422);
    if (error instanceof GitHubError) {
      return reply({ error: "github", step: error.step, status: error.status }, 502);
    }
    throw error;
  }
}
