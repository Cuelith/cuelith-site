// Worker del controllo di vita degli autori (vedi logic.js). Gira una volta al giorno.
// Collegamenti e segreti: KV (lo stesso dei contatti del sito), RESEND_API_KEY,
// MAIL_FROM, SITE_ORIGIN. Senza RESEND_API_KEY non fa nulla, e lo stato non avanza
// mai se l'email non e' partita davvero.
import {
  afterConfirm,
  afterDormant,
  afterRemind,
  decide,
  emailFor,
  freshRecord,
} from "./logic.js";

const page = (title, body, status = 200) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><body style="font:16px system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem"><h1>${title}</h1>${body}`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

async function sendMail(env, to, { subject, text }, fetchImpl) {
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, reply_to: env.MAIL_FROM }),
  });
  return response.ok;
}

const link = (env, record) =>
  `${env.SITE_ORIGIN}/confirm?p=${encodeURIComponent(record.pluginId)}&n=${record.nonce}`;

/** Un giro: per ogni contatto decide e, se serve, manda l'email prima di salvare lo stato. */
export async function sweep(env, now = new Date(), fetchImpl = fetch) {
  if (!env.RESEND_API_KEY) return { sent: 0, skipped: "no-mail-key" };
  let sent = 0;
  const { keys } = await env.KV.list({ prefix: "contact:", limit: 500 });
  for (const key of keys) {
    const contact = key.metadata;
    if (contact?.pluginId === undefined || contact.email === undefined) continue;
    const stored = await env.KV.get(`alive:${contact.pluginId}`, "json");
    // L'indirizzo puo' cambiare nel tempo: vale sempre il piu' recente.
    const record = { ...(stored ?? freshRecord(contact)), email: contact.email, name: contact.name };
    const todo = decide(record, now);
    if (todo.action === "none") {
      if (stored === null) await env.KV.put(`alive:${record.pluginId}`, JSON.stringify(record));
      continue;
    }
    const mail = emailFor(todo.action === "dormant" ? "dormant" : "remind", record, link(env, record));
    if (!(await sendMail(env, record.email, mail, fetchImpl))) continue;
    sent += 1;
    const next = todo.action === "dormant" ? afterDormant(record, now) : afterRemind(record, now);
    await env.KV.put(`alive:${record.pluginId}`, JSON.stringify(next));
  }
  return { sent };
}

export async function handle(request, env, now = new Date()) {
  const url = new URL(request.url);
  if (url.pathname === "/status.json") {
    const { keys } = await env.KV.list({ prefix: "alive:", limit: 500 });
    const dormant = [];
    for (const key of keys) {
      const record = await env.KV.get(key.name, "json");
      if (record?.dormant === true) dormant.push(record.pluginId);
    }
    return new Response(JSON.stringify({ dormant: dormant.sort() }), {
      headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
    });
  }
  if (url.pathname === "/confirm") {
    const id = url.searchParams.get("p") ?? "";
    const nonce = url.searchParams.get("n") ?? "";
    const record = await env.KV.get(`alive:${id}`, "json");
    if (record === null || nonce === "" || nonce !== record.nonce) {
      return page(
        "This link is no longer valid",
        "<p>Please use the link in the most recent email, or write to us.</p>",
        404,
      );
    }
    // Aprire il collegamento non conferma nulla (i programmi che controllano la posta
    // lo aprono da soli): serve il pulsante, cioe' una richiesta POST.
    if (request.method === "POST") {
      await env.KV.put(`alive:${id}`, JSON.stringify(afterConfirm(record, now)));
      return page(
        "Thank you",
        `<p>${escapeHtml(record.name)} is confirmed as maintained.${record.dormant ? " It is available again in the marketplace." : ""}</p>`,
      );
    }
    return page(
      "Confirm your plugin",
      `<p>Is <strong>${escapeHtml(record.name)}</strong> still maintained?</p><form method="post"><button style="font:inherit;padding:.6rem 1.2rem">Yes, it is</button></form>`,
    );
  }
  return new Response("Not found", { status: 404 });
}

export default {
  fetch: (request, env) => handle(request, env),
  scheduled: (_event, env, ctx) => {
    ctx.waitUntil(sweep(env));
  },
};
