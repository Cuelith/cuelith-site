// Il percorso intero (decisione 0013): un autore invia la proposta, il fondatore
// la vede nel pannello protetto, l'analizza e la approva, e nasce la pull request
// nel registry. Funzioni vere del sito, con KV, Access, Turnstile, pacchetto e
// GitHub finti.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { forgetAccessKeys } from "../functions/_lib/access.js";
import { packageSignatureMessage } from "../functions/_lib/crypto.js";
import { MAX_PENDING } from "../functions/_lib/store.js";
import { onRequest as admin } from "../functions/api/marketplace/admin/[action].js";
import { onRequestPost as submit } from "../functions/api/marketplace/submit.js";
import {
  accessToken,
  ed25519Pair,
  fakeNetwork,
  FakeKv,
  makeZip,
  manifestOf,
  rsaJwk,
  rsaPair,
  signPackage,
} from "./helpers.mjs";

const TEAM = "cuelith.cloudflareaccess.com";
const AUD = "aud-di-prova";
const PACKAGE = "https://downloads.acme.example/lyrics-pro-1.2.0.cpkg";
const REPO = "https://api.github.com/repos/Cuelith/cuelith-registry";
const TURNSTILE = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const EMAIL = "autore.segreto@acme.example";

const rsa = await rsaPair();
const realFetch = globalThis.fetch;
let kv;
let env;
let network;
let githubWrites;

const json = (value, status = 200) => Response.json(value, { status });

function routes({ zip = makeZip(), turnstile = true, existing = {} } = {}) {
  return [
    [
      TURNSTILE,
      async (_url, init) =>
        json({
          success: turnstile && init.body.get("response") === "valido",
          hostname: "cuelith.test",
        }),
    ],
    [PACKAGE, () => new Response(zip.slice(), { status: 200 })],
    [`https://${TEAM}/cdn-cgi/access/certs`, async () => json({ keys: [await rsaJwk(rsa)] })],
    [
      (u, i) => u === `${REPO}/git/ref/heads/main` && (i.method ?? "GET") === "GET",
      json({ object: { sha: "abc123" } }),
    ],
    [(u, i) => u === `${REPO}/git/refs` && i.method === "POST", json({}, 201)],
    [
      (u, i) => u.startsWith(`${REPO}/contents/`) && (i.method ?? "GET") === "GET",
      (u) => {
        const path = decodeURIComponent(u.slice(`${REPO}/contents/`.length).split("?")[0]);
        return path in existing
          ? json({
              sha: "s",
              content: Buffer.from(JSON.stringify(existing[path])).toString("base64"),
            })
          : json({ message: "Not Found" }, 404);
      },
    ],
    [
      (u, i) => u.startsWith(`${REPO}/contents/`) && i.method === "PUT",
      (_u, i) => {
        githubWrites.push(JSON.parse(i.body));
        return json({}, 201);
      },
    ],
    [
      (u, i) => u === `${REPO}/pulls` && i.method === "POST",
      (_u, i) => {
        githubWrites.push(JSON.parse(i.body));
        return json(
          {
            number: 9,
            html_url: "https://github.com/Cuelith/cuelith-registry/pull/9",
            node_id: "PR9",
          },
          201,
        );
      },
    ],
    [
      "https://api.github.com/graphql",
      json({ data: { enablePullRequestAutoMerge: { pullRequest: { number: 9 } } } }),
    ],
  ];
}

function install(options) {
  network = fakeNetwork(routes(options));
  globalThis.fetch = network.fetcher;
}

beforeEach(() => {
  forgetAccessKeys();
  kv = new FakeKv();
  githubWrites = [];
  env = {
    SUBMISSIONS: kv,
    TURNSTILE_SECRET: "turnstile-secret",
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    ADMIN_EMAIL: "fondatore@example.com",
    GITHUB_TOKEN: "ghp_segreto",
  };
  install();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const body = (extra = {}) => ({
  kind: "free",
  name: "Lyrics Pro",
  id: "acme.lyrics-pro",
  description: "Testi avanzati con piu' stili.",
  publisher: "Acme Studio",
  license: "Proprietaria (EULA)",
  packageUrl: PACKAGE,
  contact: EMAIL,
  confirm: { noMalware: true, permissions: true, licence: true, name: true },
  turnstileToken: "valido",
  ...extra,
});
const send = (data, headers = {}) =>
  submit({
    env,
    request: new Request("https://cuelith.test/api/marketplace/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.7",
        ...headers,
      },
      body: JSON.stringify(data),
    }),
  });

const asAdmin = async (action, data, { email = "fondatore@example.com", method } = {}) => {
  const verb = method ?? (data === undefined ? "GET" : "POST");
  const token = await accessToken(rsa, { team: TEAM, aud: AUD, email });
  return admin({
    env,
    params: { action },
    request: new Request(`https://cuelith.test/api/marketplace/admin/${action}`, {
      method: verb,
      headers: {
        "Cf-Access-Jwt-Assertion": token,
        ...(verb === "POST"
          ? {
              "X-Cuelith-Admin": "1",
              Origin: "https://cuelith.test",
              "Content-Type": "application/json",
            }
          : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
  });
};

const pendingId = async () => (await (await asAdmin("pending")).json()).pending[0].id;

// ---- invio ----

test("invio: una proposta valida con Turnstile si conserva in attesa, con scadenza e metadati", async () => {
  const response = await send(body());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const [key] = [...kv.data.keys()].filter((k) => k.startsWith("sub:"));
  const put = kv.puts.find((p) => p.key === key);
  assert.equal(put.options.expirationTtl, 60 * 24 * 60 * 60);
  assert.equal(put.options.metadata.pluginId, "acme.lyrics-pro");
  const record = JSON.parse(kv.data.get(key).value);
  assert.equal(record.submission.contact, EMAIL);
  assert.equal(
    record.submission.turnstileToken,
    undefined,
    "il token di Turnstile non si conserva",
  );
  // L'indirizzo di chi invia non e' mai conservato in chiaro.
  assert.ok(
    ![...kv.data.entries()].some(
      ([k, v]) => k.includes("203.0.113.7") || v.value.includes("203.0.113.7"),
    ),
  );
});

test("invio: senza Turnstile valido 403, senza configurazione 503, proposta non valida 400", async () => {
  assert.equal((await send(body({ turnstileToken: "falso" }))).status, 403);
  assert.equal((await send(body({ turnstileToken: undefined }))).status, 403);
  assert.equal(kv.data.size, 0);
  for (const missing of ["SUBMISSIONS", "TURNSTILE_SECRET"]) {
    const saved = env[missing];
    delete env[missing];
    assert.equal((await send(body())).status, 503, missing);
    env[missing] = saved;
  }
  const invalid = await send(body({ id: "cuelith.bible" }));
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).errors.id, "reservedId");
  // Turnstile non si interroga neppure se la proposta non e' valida.
  const asked = () => network.calls.filter((c) => c.url === TURNSTILE).length;
  const before = asked();
  await send(body({ id: "core.x" }));
  assert.equal(asked(), before);
});

test("invio: il segreto di Turnstile può chiamarsi anche TURNSTILE_SECRET_KEY", async () => {
  env.TURNSTILE_SECRET_KEY = env.TURNSTILE_SECRET;
  delete env.TURNSTILE_SECRET;
  assert.equal((await send(body())).status, 200);
});

test("invio: al massimo 5 proposte al giorno per indirizzo, poi 429; un altro indirizzo passa", async () => {
  for (let i = 0; i < 5; i += 1) assert.equal((await send(body())).status, 200, String(i));
  assert.equal((await send(body())).status, 429);
  assert.equal((await send(body(), { "CF-Connecting-IP": "198.51.100.9" })).status, 200);
});

test("invio: troppe proposte in attesa = riprova piu' tardi", async () => {
  for (let i = 0; i < MAX_PENDING; i += 1)
    await kv.put(`sub:${String(i).padStart(32, "0")}`, "{}", {});
  const response = await send(body());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "busy");
});

// ---- pannello ----

test("pannello: senza il token di Access o con quello di un altro, niente", async () => {
  await send(body());
  const none = await admin({
    env,
    params: { action: "pending" },
    request: new Request("https://cuelith.test/x"),
  });
  assert.equal(none.status, 401);
  const other = await asAdmin("pending", undefined, { email: "altro@example.com" });
  assert.equal(other.status, 403);
  // Senza intestazione propria una modifica e' rifiutata anche per l'amministratore.
  const token = await accessToken(rsa, { team: TEAM, aud: AUD, email: "fondatore@example.com" });
  const csrf = await admin({
    env,
    params: { action: "reject" },
    request: new Request("https://cuelith.test/api/marketplace/admin/reject", {
      method: "POST",
      headers: { "Cf-Access-Jwt-Assertion": token, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "x" }),
    }),
  });
  assert.equal(csrf.status, 403);
  const unknown = await asAdmin("distruggi", {});
  assert.equal(unknown.status, 404);
  env.ADMIN_EMAIL = "";
  assert.equal((await asAdmin("pending")).status, 503);
});

test("pannello: l'elenco mostra le proposte in attesa con i soli metadati", async () => {
  await send(body());
  const list = await (await asAdmin("pending")).json();
  assert.equal(list.pending.length, 1);
  assert.deepEqual(Object.keys(list.pending[0]).sort(), [
    "id",
    "kind",
    "name",
    "pluginId",
    "receivedAt",
  ]);
  assert.deepEqual(list.done, []);
});

test("percorso intero: invio, analisi, approvazione e pull request, senza dati personali su GitHub", async () => {
  await send(body());
  const id = await pendingId();

  const analysis = await (await asAdmin("analyze", { id })).json();
  assert.equal(analysis.report.ok, true, JSON.stringify(analysis.report.checks));
  assert.equal(analysis.report.summary.version, "1.2.0");
  assert.equal(analysis.submission.contact, EMAIL, "il fondatore vede come rispondere");
  assert.equal(githubWrites.length, 0, "analizzare non scrive nulla");

  const approved = await asAdmin("approve", { id });
  assert.equal(approved.status, 200);
  assert.deepEqual((await approved.json()).pr, {
    number: 9,
    url: "https://github.com/Cuelith/cuelith-registry/pull/9",
    autoMerge: true,
  });

  // La voce e l'icona sono nella pull request, e di chi ha proposto non c'e' traccia.
  const files = githubWrites.filter((w) => w.content !== undefined);
  assert.equal(files.length, 2);
  const entry = JSON.parse(Buffer.from(files[0].content, "base64").toString());
  assert.equal(entry.id, "acme.lyrics-pro");
  assert.equal(entry.verified, false);
  assert.equal(entry.versions[0].version, "1.2.0");
  assert.match(files[0].branch, /^submission\/acme\.lyrics-pro-1\.2\.0$/);
  assert.ok(!JSON.stringify(githubWrites).includes(EMAIL));
  assert.ok(!JSON.stringify(githubWrites).includes("autore.segreto"));

  // La proposta sparisce dall'attesa; resta un promemoria breve, senza email.
  assert.ok(![...kv.data.keys()].some((k) => k.startsWith("sub:")));
  const list = await (await asAdmin("pending")).json();
  assert.equal(list.pending.length, 0);
  assert.equal(list.done[0].result, "approved");
  assert.equal(list.done[0].prUrl, "https://github.com/Cuelith/cuelith-registry/pull/9");
  assert.ok(![...kv.data.values()].some((v) => v.value.includes(EMAIL)));
});

test("approvazione di un plugin a pagamento: il fondatore sceglie il link con l'affiliazione, e solo di un negozio ammesso", async () => {
  const pair = await ed25519Pair();
  const zip = makeZip();
  install({ zip });
  const analysis = (await import("../functions/_lib/package.js")).analyzePackage;
  const sha = (await analysis(PACKAGE, { fetcher: network.fetcher })).sha256;
  const signature = await signPackage(
    pair,
    packageSignatureMessage("acme.lyrics-pro", "1.2.0", sha),
  );
  await send(
    body({
      kind: "paid",
      authorKey: pair.publicKey,
      signature,
      price: "9 €",
      checkoutUrl: "https://acme.lemonsqueezy.com/checkout/buy/abc",
      affiliateUrl: "https://acme.lemonsqueezy.com/affiliates",
      storeId: "12345",
      productId: "67890",
      confirm: {
        noMalware: true,
        permissions: true,
        licence: true,
        name: true,
        merchant: true,
        devices: true,
        affiliate: true,
      },
    }),
  );
  const id = await pendingId();

  const bad = await asAdmin("approve", { id, checkoutUrl: "https://evil.example/buy" });
  assert.equal(bad.status, 400);
  assert.equal(githubWrites.length, 0);

  const affiliate = "https://acme.lemonsqueezy.com/checkout/buy/abc?aff=cuelith";
  const ok = await asAdmin("approve", { id, checkoutUrl: affiliate });
  assert.equal(ok.status, 200);
  const entry = JSON.parse(
    Buffer.from(githubWrites.find((w) => w.content).content, "base64").toString(),
  );
  assert.equal(entry.access, "paid");
  assert.equal(entry.checkoutUrl, affiliate);
  assert.deepEqual(entry.licensing, { provider: "lemonsqueezy", storeId: 12345, productId: 67890 });
});

test("approvazione: se l'analisi non passa nulla viene scritto e la proposta resta in attesa", async () => {
  const pair = await ed25519Pair();
  // Firma di un altro pacchetto: l'analisi la segnala e l'approvazione si ferma.
  await send(
    body({ authorKey: pair.publicKey, signature: await signPackage(pair, "altro messaggio") }),
  );
  const id = await pendingId();
  const refused = await asAdmin("approve", { id });
  assert.equal(refused.status, 422);
  const result = await refused.json();
  assert.equal(result.error, "notOk");
  assert.deepEqual(
    result.report.checks.filter((c) => !c.ok).map((c) => c.key),
    ["signature"],
  );
  assert.equal(githubWrites.length, 0);
  assert.equal((await (await asAdmin("pending")).json()).pending.length, 1);
});

test("approvazione: pacchetto non scaricabile o manifest di un altro plugin = analisi non riuscita", async () => {
  await send(body());
  const id = await pendingId();
  install({ zip: makeZip({ manifest: manifestOf({ id: "altro.plugin" }) }) });
  const wrong = await (await asAdmin("analyze", { id })).json();
  assert.deepEqual(
    wrong.report.checks.filter((c) => !c.ok).map((c) => c.key),
    ["id"],
  );

  network = fakeNetwork([[PACKAGE, new Response("no", { status: 404 })]]);
  globalThis.fetch = network.fetcher;
  const down = await (await asAdmin("analyze", { id })).json();
  assert.equal(down.report.ok, false);
  assert.equal(down.report.checks[0].key, "package:download");
});

test("approvazione: un errore di GitHub si riporta con il passo, senza ricadere sull'analisi", async () => {
  await send(body());
  const id = await pendingId();
  network = fakeNetwork(
    [
      ...routes(),
      // Il ramo esiste gia': GitHub risponde 422 alla creazione.
    ].map(([match, reply]) =>
      match instanceof Function && String(match).includes("git/refs")
        ? [match, json({ message: "exists" }, 422)]
        : [match, reply],
    ),
  );
  globalThis.fetch = network.fetcher;
  const response = await asAdmin("approve", { id });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "github", step: "branch", status: 422 });
  assert.equal((await (await asAdmin("pending")).json()).pending.length, 1, "resta in attesa");
});

test("rifiuto: la proposta sparisce e non resta nessun dato dell'autore", async () => {
  await send(body());
  const id = await pendingId();
  assert.equal((await asAdmin("reject", { id })).status, 200);
  assert.ok(![...kv.data.keys()].some((k) => k.startsWith("sub:")));
  const list = await (await asAdmin("pending")).json();
  assert.equal(list.done[0].result, "rejected");
  assert.ok(![...kv.data.values()].some((v) => v.value.includes(EMAIL)));
  // Una proposta che non c'e' (o un id inventato) e' 404.
  assert.equal((await asAdmin("reject", { id })).status, 404);
  assert.equal((await asAdmin("analyze", { id: "../../x" })).status, 404);
});
