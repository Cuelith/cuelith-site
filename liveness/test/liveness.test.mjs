import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHECK_EVERY_DAYS,
  DAY,
  afterConfirm,
  afterDormant,
  afterRemind,
  decide,
  emailFor,
  freshRecord,
} from "../logic.js";
import { handle, sweep } from "../worker.js";

const at = (iso) => new Date(iso);
const contact = {
  pluginId: "acme.lyrics",
  name: "Lyrics",
  email: "a@example.com",
  since: "2026-01-01T00:00:00.000Z",
};

function fakeKv(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get(key, type) {
      const item = data.get(key);
      if (item === undefined) return Promise.resolve(null);
      return Promise.resolve(type === "json" ? JSON.parse(item.value) : item.value);
    },
    put(key, value, options) {
      data.set(key, { value, metadata: options?.metadata });
      return Promise.resolve();
    },
    list({ prefix }) {
      const keys = [...data]
        .filter(([name]) => name.startsWith(prefix))
        .map(([name, item]) => ({ name, metadata: item.metadata }));
      return Promise.resolve({ keys });
    },
  };
}

const env = (kv, key = "k") => ({
  KV: kv,
  RESEND_API_KEY: key,
  MAIL_FROM: "Cuelith <contact@lzrhive.it>",
  SITE_ORIGIN: "https://w.example",
});
const contactKv = () =>
  fakeKv({ "contact:acme.lyrics": { value: JSON.stringify(contact), metadata: contact } });
const stored = (kv) => JSON.parse(kv.data.get("alive:acme.lyrics").value);

test("nessuna azione prima del termine, poi la prima richiesta", () => {
  const record = freshRecord(contact, "n1");
  assert.equal(decide(record, at("2026-03-01T00:00:00Z")).action, "none");
  const due = new Date(Date.parse(contact.since) + CHECK_EVERY_DAYS * DAY);
  assert.deepEqual(decide(record, due), { action: "remind", number: 1 });
});

test("tre email a distanza di 14 giorni, poi dormiente, poi niente piu'", () => {
  let record = freshRecord(contact, "n1");
  let now = new Date(Date.parse(contact.since) + CHECK_EVERY_DAYS * DAY);
  record = afterRemind(record, now);
  assert.equal(decide(record, new Date(now.getTime() + 13 * DAY)).action, "none");
  now = new Date(now.getTime() + 14 * DAY);
  assert.deepEqual(decide(record, now), { action: "remind", number: 2 });
  record = afterRemind(record, now);
  now = new Date(now.getTime() + 14 * DAY);
  assert.deepEqual(decide(record, now), { action: "remind", number: 3 });
  record = afterRemind(record, now);
  now = new Date(now.getTime() + 14 * DAY);
  assert.equal(decide(record, now).action, "dormant");
  record = afterDormant(record, now);
  assert.equal(record.dormant, true);
  assert.equal(decide(record, new Date(now.getTime() + 400 * DAY)).action, "none");
});

test("la conferma azzera tutto, anche da dormiente", () => {
  const dormant = afterDormant(
    afterRemind(freshRecord(contact, "n1"), at("2026-08-01T00:00:00Z")),
    at("2026-09-12T00:00:00Z"),
  );
  const back = afterConfirm(dormant, at("2026-10-01T00:00:00Z"), "n2");
  assert.deepEqual([back.dormant, back.reminders, back.lastSent, back.nonce], [false, 0, null, "n2"]);
  assert.equal(decide(back, at("2026-10-02T00:00:00Z")).action, "none");
});

test("le email hanno il collegamento, spiegano le conseguenze e non promettono sicurezza", () => {
  const record = freshRecord(contact, "n1");
  for (const kind of ["remind", "dormant"]) {
    const mail = emailFor(kind, record, "https://x/confirm?p=1");
    assert.ok(mail.text.includes("https://x/confirm?p=1"));
    assert.doesNotMatch(mail.text + mail.subject, /sicur|\bsafe/i);
  }
  const dormant = emailFor("dormant", record, "L");
  assert.match(dormant.text, /already installed keep working/);
  assert.match(dormant.text, /licences already sold/);
});

test("il giro manda l'email e solo dopo salva lo stato; se l'invio fallisce non avanza", async () => {
  const kv = contactKv();
  const late = new Date(Date.parse(contact.since) + 200 * DAY);
  const failing = () => Promise.resolve({ ok: false });
  assert.equal((await sweep(env(kv), late, failing)).sent, 0);
  assert.equal(kv.data.has("alive:acme.lyrics"), false, "nessuno stato salvato se l invio fallisce");
  const sent = [];
  const working = (_url, init) => {
    sent.push(JSON.parse(init.body));
    return Promise.resolve({ ok: true });
  };
  assert.equal((await sweep(env(kv), late, working)).sent, 1);
  assert.equal(sent[0].to[0], "a@example.com");
  assert.equal(stored(kv).reminders, 1);
  assert.equal((await sweep(env(kv), late, working)).sent, 0, "lo stesso giorno non ne parte un'altra");
});

test("un ciclo completo senza risposta porta al dormiente con la quarta email", async () => {
  const kv = contactKv();
  const mails = [];
  const working = (_url, init) => {
    mails.push(JSON.parse(init.body).subject);
    return Promise.resolve({ ok: true });
  };
  let now = new Date(Date.parse(contact.since) + 200 * DAY);
  for (let i = 0; i < 4; i += 1) {
    await sweep(env(kv), now, working);
    now = new Date(now.getTime() + 15 * DAY);
  }
  assert.equal(mails.length, 4);
  assert.match(mails[3], /dormant/);
  assert.equal(stored(kv).dormant, true);
  await sweep(env(kv), new Date(now.getTime() + 500 * DAY), working);
  assert.equal(mails.length, 4);
});

test("senza chiave di posta non fa nulla", async () => {
  const kv = contactKv();
  const result = await sweep({ ...env(kv), RESEND_API_KEY: "" }, new Date("2030-01-01"));
  assert.deepEqual(result, { sent: 0, skipped: "no-mail-key" });
  assert.equal(kv.data.has("alive:acme.lyrics"), false);
});

test("conferma: il GET mostra il pulsante e non cambia nulla, il POST conferma, un codice vecchio no", async () => {
  const kv = contactKv();
  const late = new Date(Date.parse(contact.since) + 200 * DAY);
  await sweep(env(kv), late, () => Promise.resolve({ ok: true }));
  const url = `https://w.example/confirm?p=acme.lyrics&n=${stored(kv).nonce}`;
  const view = await handle(new Request(url), env(kv), late);
  assert.equal(view.status, 200);
  assert.match(await view.text(), /<form method="post">/);
  assert.equal(stored(kv).reminders, 1);
  const done = await handle(new Request(url, { method: "POST" }), env(kv), late);
  assert.match(await done.text(), /confirmed/);
  assert.equal(stored(kv).reminders, 0);
  assert.equal((await handle(new Request(url, { method: "POST" }), env(kv), late)).status, 404);
  const wrong = "https://w.example/confirm?p=acme.lyrics&n=sbagliato";
  assert.equal((await handle(new Request(wrong), env(kv), late)).status, 404);
});

test("status.json elenca solo i dormienti", async () => {
  const kv = contactKv();
  await kv.put("alive:acme.lyrics", JSON.stringify({ ...freshRecord(contact, "n"), dormant: true }));
  const other = { ...contact, pluginId: "acme.other" };
  await kv.put("alive:acme.other", JSON.stringify(freshRecord(other, "n")));
  const body = await (await handle(new Request("https://w.example/status.json"), env(kv))).json();
  assert.deepEqual(body, { dormant: ["acme.lyrics"] });
});
