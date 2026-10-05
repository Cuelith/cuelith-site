// Cloudflare Access (verifica del token dell'amministratore), Turnstile e le
// funzioni di crittografia condivise. Chiavi vere generate nella prova, rete finta.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { forgetAccessKeys, requireAdmin, verifyAccessJwt } from "../functions/_lib/access.js";
import {
  b64uDecode,
  b64uEncode,
  packageSignatureMessage,
  sameText,
  sha256Hex,
  signEd25519,
  verifyEd25519,
} from "../functions/_lib/crypto.js";
import { TURNSTILE_VERIFY, verifyTurnstile } from "../functions/_lib/turnstile.js";

const TEAM = "cuelith.cloudflareaccess.com";
const AUD = "aud-di-prova";
const enc = new TextEncoder();
const text = (value) => b64uEncode(enc.encode(JSON.stringify(value)));

const rsa = async () =>
  crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
const keyA = await rsa();
const keyB = await rsa();
const jwkOf = async (pair, kid) => ({
  ...(await crypto.subtle.exportKey("jwk", pair.publicKey)),
  kid,
  alg: "RS256",
  use: "sig",
});

async function token(pair, { kid = "k1", claims = {}, header = {} } = {}) {
  const h = text({ alg: "RS256", kid, typ: "JWT", ...header });
  const p = text({
    iss: `https://${TEAM}`,
    aud: [AUD],
    email: "fondatore@example.com",
    exp: Math.floor(Date.now() / 1000) + 600,
    ...claims,
  });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    enc.encode(`${h}.${p}`),
  );
  return `${h}.${p}.${b64uEncode(new Uint8Array(signature))}`;
}

let fetched = 0;
const certs = (keys) => async (url) => {
  fetched += 1;
  assert.equal(String(url), `https://${TEAM}/cdn-cgi/access/certs`);
  return Response.json({ keys });
};
beforeEach(() => {
  forgetAccessKeys();
  fetched = 0;
});

const verify = async (t, keys, extra = {}) =>
  verifyAccessJwt(t, { teamDomain: TEAM, aud: AUD, fetcher: certs(keys), ...extra });

test("Access: un token valido passa e porta l'email", async () => {
  const keys = [await jwkOf(keyA, "k1")];
  const claims = await verify(await token(keyA), keys);
  assert.equal(claims?.email, "fondatore@example.com");
});

test("Access: scaduto, emittente o audience diversi, firma di un'altra chiave, algoritmo strano", async () => {
  const keys = [await jwkOf(keyA, "k1")];
  const past = Math.floor(Date.now() / 1000) - 10;
  assert.equal(
    await verify(await token(keyA, { claims: { exp: past } }), keys),
    undefined,
    "scaduto",
  );
  assert.equal(
    await verify(
      await token(keyA, { claims: { iss: "https://altro.cloudflareaccess.com" } }),
      keys,
    ),
    undefined,
    "emittente",
  );
  assert.equal(
    await verify(await token(keyA, { claims: { aud: ["un-altra-app"] } }), keys),
    undefined,
    "audience",
  );
  // Firmato con una chiave che non e' quella del team (stessa "kid").
  assert.equal(await verify(await token(keyB), keys), undefined, "firma");
  for (const alg of ["none", "HS256"]) {
    assert.equal(await verify(await token(keyA, { header: { alg } }), keys), undefined, alg);
  }
  assert.equal(await verify("non.un.token.vero", keys), undefined);
  assert.equal(await verify("", keys), undefined);
  assert.equal(await verify(undefined, keys), undefined);
});

test("Access: una chiave nuova si trova rileggendo l'elenco, una sconosciuta no", async () => {
  const oldKeys = [await jwkOf(keyA, "k1")];
  await verify(await token(keyA), oldKeys);
  const rotated = [await jwkOf(keyA, "k1"), await jwkOf(keyB, "k2")];
  assert.ok(await verify(await token(keyB, { kid: "k2" }), rotated), "dopo la rotazione");
  assert.equal(await verify(await token(keyB, { kid: "sconosciuta" }), rotated), undefined);
});

test("Access: se le chiavi del team non si leggono, non si entra", async () => {
  const failing = async () => new Response("no", { status: 500 });
  assert.equal(
    await verifyAccessJwt(await token(keyA), { teamDomain: TEAM, aud: AUD, fetcher: failing }),
    undefined,
  );
});

const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ADMIN_EMAIL: "Fondatore@Example.com" };
const asAdmin = async (init = {}, method = "GET") => {
  const keys = [await jwkOf(keyA, "k1")];
  const request = new Request("https://cuelith.test/api/marketplace/admin/pending", {
    method,
    ...init,
    headers: { "Cf-Access-Jwt-Assertion": await token(keyA), ...init.headers },
  });
  return requireAdmin(request, env, certs(keys));
};

test("amministratore: l'email deve essere quella indicata (maiuscole a parte)", async () => {
  assert.equal((await asAdmin()).email, "fondatore@example.com");
  const other = await token(keyA, { claims: { email: "altro@example.com" } });
  const keys = [await jwkOf(keyA, "k1")];
  const response = await requireAdmin(
    new Request("https://cuelith.test/x", { headers: { "Cf-Access-Jwt-Assertion": other } }),
    env,
    certs(keys),
  );
  assert.equal(response.status, 403);
});

test("amministratore: senza token 401, senza configurazione 503, e nel cookie lo stesso token vale", async () => {
  const none = await requireAdmin(new Request("https://cuelith.test/x"), env, certs([]));
  assert.equal(none.status, 401);
  for (const missing of ["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "ADMIN_EMAIL"]) {
    const partial = { ...env, [missing]: "" };
    const response = await requireAdmin(new Request("https://cuelith.test/x"), partial, certs([]));
    assert.equal(response.status, 503, missing);
  }
  const keys = [await jwkOf(keyA, "k1")];
  const viaCookie = await requireAdmin(
    new Request("https://cuelith.test/x", {
      headers: { Cookie: `a=b; CF_Authorization=${await token(keyA)}` },
    }),
    env,
    certs(keys),
  );
  assert.equal(viaCookie.email, "fondatore@example.com");
});

test("amministratore: una modifica (POST) chiede anche l'intestazione propria e l'origine del sito", async () => {
  const good = { "X-Cuelith-Admin": "1", Origin: "https://cuelith.test" };
  assert.equal((await asAdmin({ headers: good }, "POST")).email, "fondatore@example.com");
  for (const headers of [
    {},
    { "X-Cuelith-Admin": "1" },
    { Origin: "https://cuelith.test" },
    { "X-Cuelith-Admin": "1", Origin: "https://evil.example" },
  ]) {
    assert.equal((await asAdmin({ headers }, "POST")).status, 403, JSON.stringify(headers));
  }
});

// ---- Turnstile ----

const turnstile = (reply) => async (url, init) => {
  assert.equal(String(url), TURNSTILE_VERIFY);
  assert.equal(init.body.get("secret"), "segreto");
  return typeof reply === "function" ? reply(init) : reply;
};

test("Turnstile: conferma solo se Cloudflare dice di si, con la chiave segreta e l'indirizzo", async () => {
  const ok = turnstile((init) => {
    assert.equal(init.body.get("response"), "prova");
    // L'indirizzo di chi invia si passa solo se c'è.
    if (init.body.has("remoteip")) assert.equal(init.body.get("remoteip"), "1.2.3.4");
    return Response.json({ success: true, hostname: "cuelith.lzrhive.it" });
  });
  assert.equal(
    await verifyTurnstile("prova", { secret: "segreto", ip: "1.2.3.4", fetcher: ok }),
    true,
  );
  assert.equal(
    await verifyTurnstile("prova", {
      secret: "segreto",
      hostname: "cuelith.lzrhive.it",
      fetcher: ok,
    }),
    true,
  );
  assert.equal(
    await verifyTurnstile("prova", { secret: "segreto", hostname: "altro.example", fetcher: ok }),
    false,
    "nato su un altro sito",
  );
  const no = turnstile(
    Response.json({ success: false, "error-codes": ["invalid-input-response"] }),
  );
  assert.equal(await verifyTurnstile("prova", { secret: "segreto", fetcher: no }), false);
});

test("Turnstile: nel dubbio non si accetta", async () => {
  const down = turnstile(new Response("x", { status: 500 }));
  const broken = turnstile(new Response("non json"));
  const throws = async () => {
    throw new Error("rete");
  };
  for (const fetcher of [down, broken, throws]) {
    assert.equal(await verifyTurnstile("prova", { secret: "segreto", fetcher }), false);
  }
  for (const response of ["", undefined, null, 5, "x".repeat(3000)]) {
    assert.equal(await verifyTurnstile(response, { secret: "segreto", fetcher: down }), false);
  }
  assert.equal(await verifyTurnstile("prova", { secret: "", fetcher: down }), false);
});

// ---- crittografia condivisa ----

test("base64url: andata e ritorno su byte qualsiasi", () => {
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
  const text = b64uEncode(bytes);
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(b64uDecode(text), bytes);
  assert.equal(b64uEncode(new Uint8Array()), "");
});

test("SHA-256 e confronto in tempo costante", async () => {
  assert.equal(
    await sha256Hex(enc.encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(sameText("abc", "abc"), true);
  assert.equal(sameText("abc", "abd"), false);
  assert.equal(sameText("abc", "abcd"), false);
  assert.equal(sameText("abc", undefined), false);
});

test("Ed25519: firma e verifica, e la firma non vale per altro", async () => {
  const pair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const publicKey = b64uEncode(
    new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)),
  );
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString(
    "base64",
  );
  const message = packageSignatureMessage("acme.pro", "1.0.0", "a".repeat(64));
  const signature = await signEd25519(pkcs8, message);
  assert.equal(signature.length, 86);
  assert.equal(await verifyEd25519(publicKey, message, signature), true);
  assert.equal(
    await verifyEd25519(
      publicKey,
      packageSignatureMessage("acme.pro", "1.0.1", "a".repeat(64)),
      signature,
    ),
    false,
  );
  assert.equal(await verifyEd25519(publicKey, message, signature.slice(0, -2) + "AA"), false);
  const other = b64uEncode(
    new Uint8Array(
      await crypto.subtle.exportKey(
        "raw",
        (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])).publicKey,
      ),
    ),
  );
  assert.equal(await verifyEd25519(other, message, signature), false);
  // Chiavi o firme malformate non fanno cadere nulla: sono semplicemente false.
  assert.equal(await verifyEd25519("corta", message, signature), false);
  assert.equal(await verifyEd25519(publicKey, message, "###"), false);
});

test("amministratore: chi è riconosciuto ma non è l'amministratore vede con quale indirizzo è entrato", async () => {
  const keys = [await jwkOf(keyA, "k1")];
  const other = await token(keyA, { claims: { email: "altro@example.com" } });
  const response = await requireAdmin(
    new Request("https://cuelith.test/x", { headers: { "Cf-Access-Jwt-Assertion": other } }),
    { ...env, ADMIN_EMAIL: "  Fondatore@Example.com " },
    certs(keys),
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden", email: "altro@example.com" });
  // Con spazi attorno nella variabile, l'indirizzo giusto passa comunque.
  const good = await requireAdmin(
    new Request("https://cuelith.test/x", {
      headers: { "Cf-Access-Jwt-Assertion": await token(keyA) },
    }),
    { ...env, ADMIN_EMAIL: "  Fondatore@Example.com " },
    certs(keys),
  );
  assert.equal(good.email, "fondatore@example.com");
});
