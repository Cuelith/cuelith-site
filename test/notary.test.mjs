// Il Notaio (decisione 0013): verifica la chiave presso il fornitore (simulato con
// i dati di prova del negozio: store 12345, prodotto 67890) e firma un permesso
// legato al computer. Chiavi Ed25519 vere, rete finta.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { b64uEncode, sha256Hex } from "../functions/_lib/crypto.js";
import {
  activateLicense,
  deactivateLicense,
  EXPIRES_DAYS,
  refreshLicense,
  RENEW_AFTER_DAYS,
  verifyLicense,
} from "../functions/_lib/notary.js";
import { LICENSES_INDEX, MODULES_INDEX_V2 } from "../functions/_lib/sources.js";
import {
  onRequest as activateAny,
  onRequestPost as activate,
} from "../functions/api/license/activate.js";
import { onRequestPost as refresh } from "../functions/api/license/refresh.js";
import { onRequestPost as deactivate } from "../functions/api/license/deactivate.js";
import { ed25519Pair, fakeNetwork } from "./helpers.mjs";

const STORE = 12345;
const PRODUCT = 67890;
const KEY = "38b1460a-5104-4067-a91d-77b872934d51";
const PLUGIN = "acme.lyrics-pro";
const LS = "https://api.lemonsqueezy.com/v1/licenses";
const json = (value, status = 200) => Response.json(value, { status });

const notary = await ed25519Pair();
const device = await ed25519Pair();
const otherDevice = await ed25519Pair();
const deviceName = async (publicKey) =>
  `cuelith-${(await sha256Hex(new TextEncoder().encode(publicKey))).slice(0, 12)}`;

const catalog = (extra = {}) =>
  json({
    plugins: [
      {
        id: PLUGIN,
        access: "paid",
        licensing: { provider: "lemonsqueezy", storeId: STORE, productId: PRODUCT },
        ...extra,
      },
      { id: "cuelith.songs", access: "free" },
    ],
  });

/** Risposta del fornitore a un'attivazione riuscita, con i valori che vogliamo variare. */
const licenseObject = (over = {}) => ({
  id: 1,
  status: "active",
  key: KEY,
  activation_limit: 3,
  activation_usage: 1,
  test_mode: false,
  ...over,
});
const meta = (over = {}) => ({ store_id: STORE, product_id: PRODUCT, order_id: 1, ...over });

let env;
let ls;
let network;
const realFetch = globalThis.fetch;

/** Rete: catalogo + una funzione per ogni azione del fornitore (registra i parametri ricevuti). */
function install({ catalogReply = catalog(), handlers = {}, licensesReply } = {}) {
  ls = [];
  network = fakeNetwork([
    ...(licensesReply === undefined ? [] : [[LICENSES_INDEX, licensesReply]]),
    [MODULES_INDEX_V2, catalogReply],
    [
      (u) => u.startsWith(`${LS}/`),
      async (u, init) => {
        const action = u.slice(LS.length + 1);
        const params = Object.fromEntries(init.body);
        ls.push({ action, params, headers: init.headers });
        const handler = handlers[action] ?? defaults[action];
        return handler(params);
      },
    ],
  ]);
  globalThis.fetch = network.fetcher;
}

const defaults = {
  activate: async (p) =>
    json({
      activated: true,
      error: null,
      license_key: licenseObject(),
      instance: { id: "inst-0001-aaaa", name: p.instance_name },
      meta: meta(),
    }),
  validate: async (p) =>
    json({
      valid: true,
      error: null,
      license_key: licenseObject(),
      instance: { id: p.instance_id, name: await deviceName(device.publicKey) },
      meta: meta(),
    }),
  deactivate: async () =>
    json({ deactivated: true, error: null, license_key: licenseObject(), meta: meta() }),
};

beforeEach(() => {
  env = { NOTARY_PRIVATE_KEY: notary.privatePkcs8, NOTARY_KEY_ID: "n1" };
  install();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const input = (extra = {}) => ({
  licenseKey: KEY,
  pluginId: PLUGIN,
  devicePublicKey: device.publicKey,
  ...extra,
});
const codeOf = async (promise) => {
  try {
    await promise;
  } catch (error) {
    return error.code;
  }
  return "nessun errore";
};

// ---- attivazione ----

test("attivazione: permesso firmato, legato al computer, con rinnovo a 30 giorni e scadenza a 90", async () => {
  const now = Date.UTC(2026, 9, 6, 10);
  const result = await activateLicense(input(), env, fetch, now);
  assert.equal(result.ok, true);
  assert.equal(result.instanceId, "inst-0001-aaaa");
  const payload = await verifyLicense(result.token, notary.publicKey, now);
  assert.deepEqual(payload, {
    v: 1,
    kid: "n1",
    plugin: PLUGIN,
    device: device.publicKey,
    instance: "inst-0001-aaaa",
    iat: now / 1000,
    renewAfter: now / 1000 + RENEW_AFTER_DAYS * 86400,
    exp: now / 1000 + EXPIRES_DAYS * 86400,
  });
  assert.equal(result.renewAfter, payload.renewAfter);
  assert.equal(result.expires, payload.exp);
  assert.equal(RENEW_AFTER_DAYS, 30);
  assert.equal(EXPIRES_DAYS, 90);
});

test("attivazione: al fornitore va la chiave e un nome anonimo del computer, mai la chiave del computer in chiaro", async () => {
  await activateLicense(input(), env);
  assert.equal(ls.length, 1);
  assert.equal(ls[0].action, "activate");
  assert.equal(ls[0].params.license_key, KEY);
  assert.equal(ls[0].params.instance_name, await deviceName(device.publicKey));
  assert.ok(!JSON.stringify(ls[0].params).includes(device.publicKey));
  assert.match(ls[0].params.instance_name, /^cuelith-[0-9a-f]{12}$/);
});

test("permesso: non si falsifica, non si altera, scade", async () => {
  const now = Date.UTC(2026, 9, 6);
  const { token } = await activateLicense(input(), env, fetch, now);
  const [body, signature] = token.split(".");
  // Firmato da un'altra chiave: no.
  assert.equal(await verifyLicense(token, otherDevice.publicKey, now), undefined);
  // Contenuto alterato (un altro computer) con la firma vecchia: no.
  const altered = JSON.parse(Buffer.from(body, "base64url").toString());
  altered.device = otherDevice.publicKey;
  const forged = `${b64uEncode(new TextEncoder().encode(JSON.stringify(altered)))}.${signature}`;
  assert.equal(await verifyLicense(forged, notary.publicKey, now), undefined);
  assert.equal(
    // Due caratteri cambiati davvero (la firma e' casuale: con "AA" fisso, ogni tanto coincideva).
    await verifyLicense(
      `${body}.${signature.slice(0, -2)}${signature.endsWith("AA") ? "BB" : "AA"}`,
      notary.publicKey,
      now,
    ),
    undefined,
  );
  assert.equal(await verifyLicense("a.b.c", notary.publicKey, now), undefined);
  assert.equal(await verifyLicense("", notary.publicKey, now), undefined);
  // Dopo la scadenza non vale piu'.
  assert.ok(await verifyLicense(token, notary.publicKey, now + 89 * 86400 * 1000));
  assert.equal(await verifyLicense(token, notary.publicKey, now + 91 * 86400 * 1000), undefined);
});

test("attivazione: limite di posti raggiunto, chiave sconosciuta", async () => {
  install({
    handlers: {
      activate: async () =>
        json(
          { activated: false, error: "This license key has reached the activation limit." },
          400,
        ),
    },
  });
  assert.equal(await codeOf(activateLicense(input(), env)), "limit");
  install({
    handlers: {
      activate: async () => json({ activated: false, error: "license_key not found." }, 404),
    },
  });
  assert.equal(await codeOf(activateLicense(input(), env)), "invalidKey");
});

test("attivazione: chiave di un altro prodotto o negozio = rifiutata e il posto preso si libera subito", async () => {
  for (const wrong of [meta({ product_id: 999 }), meta({ store_id: 999 })]) {
    install({
      handlers: {
        activate: async (p) =>
          json({
            activated: true,
            license_key: licenseObject(),
            instance: { id: "inst-0001-aaaa", name: p.instance_name },
            meta: wrong,
          }),
      },
    });
    assert.equal(await codeOf(activateLicense(input(), env)), "wrongProduct");
    assert.deepEqual(
      ls.map((c) => c.action),
      ["activate", "deactivate"],
      "il posto torna libero",
    );
    assert.equal(ls[1].params.instance_id, "inst-0001-aaaa");
  }
});

test("attivazione: il limite deve essere da 1 a 3 posti (niente chiavi illimitate), e si libera il posto", async () => {
  for (const limit of [null, 0, 4, 100, "3"]) {
    install({
      handlers: {
        activate: async (p) =>
          json({
            activated: true,
            license_key: licenseObject({ activation_limit: limit }),
            instance: { id: "inst-0001-aaaa", name: p.instance_name },
            meta: meta(),
          }),
      },
    });
    assert.equal(await codeOf(activateLicense(input(), env)), "badLimit", String(limit));
    assert.deepEqual(
      ls.map((c) => c.action),
      ["activate", "deactivate"],
    );
  }
  for (const limit of [1, 2, 3]) {
    install({
      handlers: {
        activate: async (p) =>
          json({
            activated: true,
            license_key: licenseObject({ activation_limit: limit }),
            instance: { id: "inst-0001-aaaa", name: p.instance_name },
            meta: meta(),
          }),
      },
    });
    assert.equal((await activateLicense(input(), env)).ok, true, String(limit));
  }
});

test("attivazione: le chiavi di prova (test mode) si accettano solo se lo si dice", async () => {
  const testKey = async (p) =>
    json({
      activated: true,
      license_key: licenseObject({ test_mode: true }),
      instance: { id: "inst-0001-aaaa", name: p.instance_name },
      meta: meta(),
    });
  install({ handlers: { activate: testKey } });
  assert.equal(await codeOf(activateLicense(input(), env)), "testMode");
  const allowed = await activateLicense(input(), { ...env, ALLOW_TEST_MODE: "1" });
  const payload = await verifyLicense(allowed.token, notary.publicKey);
  assert.equal(payload.test, true, "il permesso dice che e' di prova");
});

test("attivazione: una chiave disattivata o scaduta non passa", async () => {
  for (const status of ["disabled", "expired"]) {
    install({
      handlers: {
        activate: async (p) =>
          json({
            activated: true,
            license_key: licenseObject({ status }),
            instance: { id: "inst-0001-aaaa", name: p.instance_name },
            meta: meta(),
          }),
      },
    });
    assert.equal(await codeOf(activateLicense(input(), env)), "revoked", status);
  }
});

test("attivazione: plugin non a pagamento o sconosciuto = 404; catalogo o fornitore giu' = 503", async () => {
  assert.equal(await codeOf(activateLicense(input({ pluginId: "cuelith.songs" }), env)), "notPaid");
  assert.equal(await codeOf(activateLicense(input({ pluginId: "altro.plugin" }), env)), "notPaid");
  install({
    catalogReply: catalog({ licensing: { provider: "altro", storeId: 1, productId: 2 } }),
  });
  assert.equal(await codeOf(activateLicense(input(), env)), "notPaid");
  install({ catalogReply: new Response("giu", { status: 500 }) });
  assert.equal(await codeOf(activateLicense(input(), env)), "unavailable");
  for (const status of [500, 502, 429]) {
    install({ handlers: { activate: async () => new Response("x", { status }) } });
    assert.equal(await codeOf(activateLicense(input(), env)), "unavailable", String(status));
  }
  install({ handlers: { activate: async () => new Response("non json", { status: 200 }) } });
  assert.equal(await codeOf(activateLicense(input(), env)), "unavailable");
  assert.equal(
    await codeOf(activateLicense(input(), {})),
    "unavailable",
    "senza chiave del notaio non si firma",
  );
});

test("ingressi: chiave, plugin e chiave del computer devono avere la forma giusta", async () => {
  for (const bad of [
    { licenseKey: "" },
    { licenseKey: "a b c d e f g h" },
    { licenseKey: "x".repeat(100) },
    { pluginId: "NoMaiuscole" },
    { pluginId: "../x" },
    { devicePublicKey: "corta" },
    { devicePublicKey: "!".repeat(43) },
    { licenseKey: 12345678 },
  ]) {
    assert.equal(
      await codeOf(activateLicense(input(bad), env)),
      "invalidInput",
      JSON.stringify(bad),
    );
  }
  assert.equal(await codeOf(activateLicense(null, env)), "invalidInput");
  assert.equal(ls.length, 0, "con ingressi sbagliati il fornitore non viene neppure interrogato");
});

// ---- rinnovo e disattivazione ----

const renewInput = (extra = {}) => input({ instanceId: "inst-0001-aaaa", ...extra });

test("rinnovo: chiave ancora valida e computer giusto = permesso nuovo", async () => {
  const now = Date.UTC(2026, 10, 10);
  const result = await refreshLicense(renewInput(), env, fetch, now);
  assert.equal(result.ok, true);
  const payload = await verifyLicense(result.token, notary.publicKey, now);
  assert.equal(payload.device, device.publicKey);
  assert.equal(payload.instance, "inst-0001-aaaa");
  assert.equal(ls[0].action, "validate");
  assert.equal(ls[0].params.instance_id, "inst-0001-aaaa");
});

test("rinnovo: dopo un rimborso (chiave disattivata) o con posto liberato non si rinnova piu'", async () => {
  for (const reply of [
    async () =>
      json({
        valid: false,
        error: "license_key not found.",
        license_key: licenseObject({ status: "disabled" }),
        meta: meta(),
      }),
    async (p) =>
      json({
        valid: true,
        license_key: licenseObject({ status: "disabled" }),
        instance: { id: p.instance_id, name: await deviceName(device.publicKey) },
        meta: meta(),
      }),
    async (p) =>
      json({
        valid: true,
        license_key: licenseObject({ status: "expired" }),
        instance: { id: p.instance_id, name: await deviceName(device.publicKey) },
        meta: meta(),
      }),
  ]) {
    install({ handlers: { validate: reply } });
    assert.equal(await codeOf(refreshLicense(renewInput(), env)), "revoked");
  }
});

test("rinnovo: il posto e' di un altro computer = rifiutato (un permesso non si sposta)", async () => {
  // Il fornitore dice che il posto e' valido, ma il suo nome e' quello di un altro computer.
  install({
    handlers: {
      validate: async (p) =>
        json({
          valid: true,
          license_key: licenseObject(),
          instance: { id: p.instance_id, name: await deviceName(otherDevice.publicKey) },
          meta: meta(),
        }),
    },
  });
  assert.equal(await codeOf(refreshLicense(renewInput(), env)), "revoked");
  install({
    handlers: {
      validate: async () =>
        json({
          valid: true,
          license_key: licenseObject(),
          instance: { id: "un-altro-posto-1", name: await deviceName(device.publicKey) },
          meta: meta(),
        }),
    },
  });
  assert.equal(await codeOf(refreshLicense(renewInput(), env)), "revoked");
});

test("rinnovo: stesse regole dell'attivazione su prodotto, limite e chiavi di prova", async () => {
  const reply = (extra) => async (p) =>
    json({
      valid: true,
      license_key: licenseObject(extra.license),
      instance: { id: p.instance_id, name: await deviceName(device.publicKey) },
      meta: meta(extra.meta),
    });
  install({ handlers: { validate: reply({ meta: { product_id: 1 } }) } });
  assert.equal(await codeOf(refreshLicense(renewInput(), env)), "wrongProduct");
  install({ handlers: { validate: reply({ license: { activation_limit: null } }) } });
  assert.equal(await codeOf(refreshLicense(renewInput(), env)), "badLimit");
  install({ handlers: { validate: reply({ license: { test_mode: true } }) } });
  assert.equal(await codeOf(refreshLicense(renewInput(), env)), "testMode");
  install({ handlers: { validate: async () => new Response("x", { status: 503 }) } });
  assert.equal(
    await codeOf(refreshLicense(renewInput(), env)),
    "unavailable",
    "fornitore giu': non e' una revoca",
  );
  assert.equal(await codeOf(refreshLicense(input(), env)), "invalidInput", "serve il posto");
});

test("disattivazione: libera il posto; chiave o posto sbagliati = errore", async () => {
  assert.deepEqual(await deactivateLicense(renewInput(), env), { ok: true });
  assert.equal(ls[0].action, "deactivate");
  assert.equal(ls[0].params.instance_id, "inst-0001-aaaa");
  install({
    handlers: { deactivate: async () => json({ deactivated: false, error: "not found" }, 404) },
  });
  assert.equal(await codeOf(deactivateLicense(renewInput(), env)), "invalidKey");
  assert.equal(await codeOf(deactivateLicense(input(), env)), "invalidInput");
});

// ---- plugin ritirati dalla vetrina ----

const licenses = (plugins) => json({ schema: 1, plugins });
const withdrawnEntry = {
  id: PLUGIN,
  withdrawn: true,
  licensing: { provider: "lemonsqueezy", storeId: STORE, productId: PRODUCT },
};
/** Catalogo senza il plugin: come dopo un ritiro dalla vetrina. */
const catalogWithoutIt = () => json({ plugins: [{ id: "cuelith.songs", access: "free" }] });

test("ritirato: chi l'ha comprato attiva, rinnova e disattiva come prima", async () => {
  install({ catalogReply: catalogWithoutIt(), licensesReply: licenses([withdrawnEntry]) });
  const now = Date.UTC(2026, 10, 10);
  const first = await activateLicense(input(), env, fetch, now);
  assert.equal(first.ok, true);
  const again = await refreshLicense(renewInput(), env, fetch, now);
  assert.equal(again.ok, true);
  assert.deepEqual(await deactivateLicense(renewInput(), env), { ok: true });
});

test("ritirato: senza licenses.json (non ancora pubblicato) vale il catalogo, come prima", async () => {
  install({ licensesReply: new Response("non trovato", { status: 404 }) });
  assert.equal((await activateLicense(input(), env)).ok, true);
  install({
    catalogReply: catalogWithoutIt(),
    licensesReply: new Response("non trovato", { status: 404 }),
  });
  assert.equal(await codeOf(activateLicense(input(), env)), "notPaid");
});

test("ritirato: licenses.json non nomina il plugin o non e' del fornitore ammesso = rifiutato; ambedue i file giu' = 503", async () => {
  install({
    catalogReply: catalogWithoutIt(),
    licensesReply: licenses([{ id: "altro.plugin", licensing: withdrawnEntry.licensing }]),
  });
  assert.equal(await codeOf(activateLicense(input(), env)), "notPaid");
  install({
    catalogReply: catalogWithoutIt(),
    licensesReply: licenses([
      { ...withdrawnEntry, licensing: { provider: "altro", storeId: 1, productId: 2 } },
    ]),
  });
  assert.equal(await codeOf(activateLicense(input(), env)), "notPaid");
  install({
    catalogReply: new Response("giu", { status: 500 }),
    licensesReply: new Response("giu", { status: 500 }),
  });
  assert.equal(await codeOf(activateLicense(input(), env)), "unavailable");
});

test("ritirato: il prodotto della chiave si controlla lo stesso (negozio o prodotto diversi = rifiutato)", async () => {
  install({
    catalogReply: catalogWithoutIt(),
    licensesReply: licenses([withdrawnEntry]),
    handlers: {
      activate: async (p) =>
        json({
          activated: true,
          error: null,
          license_key: licenseObject(),
          instance: { id: "inst-0001-aaaa", name: p.instance_name },
          meta: meta({ product_id: PRODUCT + 1 }),
        }),
    },
  });
  assert.equal(await codeOf(activateLicense(input(), env)), "wrongProduct");
});

// ---- le funzioni (HTTP) ----

const post = (handler, data, headers = { "Content-Type": "application/json" }, raw) =>
  handler({
    env,
    request: new Request("https://cuelith.test/api/license/x", {
      method: "POST",
      headers,
      body: raw ?? JSON.stringify(data),
    }),
  });

test("HTTP: risposte JSON senza cache, con i codici giusti, e mai la richiesta nei messaggi", async () => {
  const ok = await post(activate, input());
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("Cache-Control"), "no-store");
  const body = await ok.json();
  assert.equal(body.ok, true);
  assert.ok(await verifyLicense(body.token, notary.publicKey));

  assert.equal((await post(activate, input({ licenseKey: "x" }))).status, 400);
  assert.equal((await post(activate, input({ pluginId: "cuelith.songs" }))).status, 404);
  install({
    handlers: {
      activate: async () =>
        json(
          { activated: false, error: "This license key has reached the activation limit." },
          400,
        ),
    },
  });
  const limit = await post(activate, input());
  assert.equal(limit.status, 409);
  assert.deepEqual(await limit.json(), { error: "limit" });
  install({ handlers: { validate: async () => json({ valid: false, error: "x" }) } });
  const revoked = await post(refresh, renewInput());
  assert.equal(revoked.status, 403);
  assert.deepEqual(await revoked.json(), { error: "revoked" });
  install();
  assert.equal((await post(deactivate, renewInput())).status, 200);
});

test("HTTP: tipo, dimensione e forma del corpo; solo POST; errori inattesi senza dettagli e senza registrare", async () => {
  assert.equal((await post(activate, input(), { "Content-Type": "text/plain" })).status, 415);
  assert.equal(
    (await post(activate, undefined, { "Content-Type": "application/json" }, "x".repeat(5000)))
      .status,
    413,
  );
  assert.equal(
    (await post(activate, undefined, { "Content-Type": "application/json" }, "{rotto")).status,
    400,
  );
  assert.equal(activateAny({}).status, 405);

  const logged = [];
  const original = { log: console.log, error: console.error, warn: console.warn };
  console.log = console.error = console.warn = (...args) => logged.push(args);
  try {
    // Un errore che non e' del notaio: 500 senza dettagli (la richiesta contiene una chiave).
    globalThis.fetch = async () => {
      throw new TypeError(`rotto con ${KEY}`);
    };
    const failed = await post(activate, input());
    const text = await failed.text();
    assert.equal(failed.status, 503);
    assert.ok(!text.includes(KEY));
  } finally {
    Object.assign(console, original);
  }
  assert.deepEqual(logged, [], "il notaio non scrive nei registri");
});

// ---- chiave con scadenza propria (es. licenza di un anno) ----

test("il permesso non supera la scadenza della chiave presso il fornitore", async () => {
  const now = Date.UTC(2026, 9, 6, 10);
  const withExpiry = (expiresAt) => ({
    handlers: {
      activate: async (p) =>
        json({
          activated: true,
          license_key: licenseObject({ expires_at: expiresAt }),
          instance: { id: "inst-0001-aaaa", name: p.instance_name },
          meta: meta(),
        }),
    },
  });
  // Scade tra 20 giorni: il permesso vale 20 giorni, non 90, e il rinnovo non cade dopo.
  install(withExpiry(new Date(now + 20 * 86400_000).toISOString()));
  const soon = await verifyLicense(
    (await activateLicense(input(), env, fetch, now)).token,
    notary.publicKey,
    now,
  );
  assert.equal(soon.exp, now / 1000 + 20 * 86400);
  assert.equal(soon.renewAfter, soon.exp);
  // Scade tra 200 giorni: vale il tetto di sempre (90).
  install(withExpiry(new Date(now + 200 * 86400_000).toISOString()));
  const later = await verifyLicense(
    (await activateLicense(input(), env, fetch, now)).token,
    notary.publicKey,
    now,
  );
  assert.equal(later.exp, now / 1000 + 90 * 86400);
  assert.equal(later.renewAfter, now / 1000 + 30 * 86400);
  // Nessuna scadenza (licenza a vita): tetto di sempre. Il formato vero ha i microsecondi.
  install(withExpiry(null));
  assert.equal(
    (
      await verifyLicense(
        (await activateLicense(input(), env, fetch, now)).token,
        notary.publicKey,
        now,
      )
    ).exp,
    now / 1000 + 90 * 86400,
  );
  install(withExpiry("2027-10-05T12:32:50.000000Z"));
  assert.equal(
    (
      await verifyLicense(
        (await activateLicense(input(), env, fetch, now)).token,
        notary.publicKey,
        now,
      )
    ).exp,
    now / 1000 + 90 * 86400,
  );
});
