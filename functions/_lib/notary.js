import { b64uDecode, b64uEncode, sha256Hex, signEd25519, verifyEd25519 } from "./crypto.js";
import { MODULES_INDEX_V2 } from "./sources.js";

// Il Notaio (decisione 0013): verifica una chiave di licenza presso il
// fornitore (API pubblica di Lemon Squeezy, che custodisce chiavi e posti) e
// restituisce un PERMESSO firmato con la chiave del progetto, legato alla chiave
// pubblica del computer. Non memorizza nulla: ne' chiavi, ne' computer, ne' log.
// Il permesso si verifica sul computer anche senza internet; si rinnova in
// silenzio. Il limite e' di 3 computer per chiave e lo fa rispettare il
// fornitore: il notaio rifiuta le chiavi con un limite diverso.

export const MAX_DEVICES = 3;
const DAY = 24 * 60 * 60;
/** Dopo quanto il programma prova a rinnovare, e fino a quando il permesso resta valido senza rinnovo. */
export const RENEW_AFTER_DAYS = 30;
export const EXPIRES_DAYS = 90;
const TOKEN_DOMAIN = "cuelith-license-v1";

export class NotaryError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const PLUGIN_ID = /^[a-z0-9]+(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const LICENSE_KEY = /^[A-Za-z0-9-]{8,80}$/;
const DEVICE_KEY = /^[A-Za-z0-9_-]{43}$/;
const INSTANCE_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Controlla i campi attesi di una richiesta: restituisce solo quelli, ripuliti. */
export function parseLicenseInput(input, fields) {
  const raw = input !== null && typeof input === "object" ? input : {};
  const patterns = {
    licenseKey: LICENSE_KEY,
    pluginId: PLUGIN_ID,
    devicePublicKey: DEVICE_KEY,
    instanceId: INSTANCE_ID,
  };
  const value = {};
  for (const field of fields) {
    const text = typeof raw[field] === "string" ? raw[field].trim() : "";
    if (!patterns[field].test(text)) throw new NotaryError("invalidInput", 400);
    value[field] = text;
  }
  return value;
}

/** Il plugin deve essere nel catalogo come "a pagamento" con licenza verificabile. */
async function paidPlugin(pluginId, fetcher) {
  let index;
  try {
    const response = await fetcher(MODULES_INDEX_V2, { cf: { cacheTtl: 300 } });
    if (!response.ok) throw new Error("catalogo");
    index = await response.json();
  } catch {
    throw new NotaryError("unavailable", 503);
  }
  const plugin = (index.plugins ?? []).find((p) => p?.id === pluginId);
  if (plugin?.access !== "paid" || plugin.licensing?.provider !== "lemonsqueezy") {
    throw new NotaryError("notPaid", 404);
  }
  return plugin.licensing;
}

/** Chiamata all'API pubblica delle licenze del fornitore. */
async function lemon(env, fetcher, action, params) {
  const base = env.LS_API_BASE || "https://api.lemonsqueezy.com";
  let response;
  try {
    response = await fetcher(`${base}/v1/licenses/${action}`, {
      method: "POST",
      headers: { Accept: "application/json", "User-Agent": "cuelith-notary" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new NotaryError("unavailable", 503);
  }
  // Un guasto o troppe richieste: non e' colpa della chiave.
  if (response.status >= 500 || response.status === 429) throw new NotaryError("unavailable", 503);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new NotaryError("unavailable", 503);
  }
  return data ?? {};
}

/** Nome anonimo del computer presso il fornitore: derivato dalla sua chiave pubblica. */
const instanceName = async (devicePublicKey) =>
  `cuelith-${(await sha256Hex(new TextEncoder().encode(devicePublicKey))).slice(0, 12)}`;

/**
 * Controlla che la licenza sia di questo plugin e abbia le regole giuste.
 * `statuses`: stati ammessi della chiave.
 */
function checkLicense(data, licensing, env, statuses) {
  const meta = data.meta ?? {};
  if (
    Number(meta.store_id) !== licensing.storeId ||
    Number(meta.product_id) !== licensing.productId
  ) {
    throw new NotaryError("wrongProduct", 403);
  }
  const key = data.license_key ?? {};
  if (key.test_mode === true && env.ALLOW_TEST_MODE !== "1") throw new NotaryError("testMode", 403);
  if (!statuses.includes(key.status)) throw new NotaryError("revoked", 403);
  const limit = key.activation_limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DEVICES) {
    throw new NotaryError("badLimit", 409);
  }
}

/** Permesso firmato: chi, per quale plugin, per quale computer, quando rinnovare e quando scade. */
export async function signLicense(
  { pluginId, devicePublicKey, instanceId, test },
  env,
  now = Date.now(),
) {
  if (!env.NOTARY_PRIVATE_KEY) throw new NotaryError("unavailable", 503);
  const iat = Math.floor(now / 1000);
  const payload = {
    v: 1,
    kid: env.NOTARY_KEY_ID || "n1",
    plugin: pluginId,
    device: devicePublicKey,
    instance: instanceId,
    iat,
    renewAfter: iat + RENEW_AFTER_DAYS * DAY,
    exp: iat + EXPIRES_DAYS * DAY,
    ...(test ? { test: true } : {}),
  };
  const body = b64uEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signEd25519(env.NOTARY_PRIVATE_KEY, `${TOKEN_DOMAIN}\n${body}`);
  return { token: `${body}.${signature}`, payload };
}

/**
 * Verifica un permesso con la chiave pubblica del notaio (base64url). Lo usa
 * anche il programma; qui serve alle prove. Restituisce il contenuto o undefined.
 */
export async function verifyLicense(token, publicKey, now = Date.now()) {
  const [body, signature, extra] = String(token).split(".");
  if (body === undefined || signature === undefined || extra !== undefined) return undefined;
  if (!(await verifyEd25519(publicKey, `${TOKEN_DOMAIN}\n${body}`, signature))) return undefined;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64uDecode(body)));
    return payload.exp * 1000 > now ? payload : undefined;
  } catch {
    return undefined;
  }
}

const answer = (payload, token, instanceId) => ({
  ok: true,
  token,
  instanceId,
  renewAfter: payload.renewAfter,
  expires: payload.exp,
});

/** Attiva un posto per questo computer e restituisce il permesso. */
export async function activateLicense(input, env, fetcher = fetch, now = Date.now()) {
  const { licenseKey, pluginId, devicePublicKey } = parseLicenseInput(input, [
    "licenseKey",
    "pluginId",
    "devicePublicKey",
  ]);
  const licensing = await paidPlugin(pluginId, fetcher);
  const data = await lemon(env, fetcher, "activate", {
    license_key: licenseKey,
    instance_name: await instanceName(devicePublicKey),
  });
  if (data.activated !== true) {
    const text = String(data.error ?? "").toLowerCase();
    throw new NotaryError(
      text.includes("limit") ? "limit" : "invalidKey",
      text.includes("limit") ? 409 : 403,
    );
  }
  const instanceId = data.instance?.id;
  try {
    if (typeof instanceId !== "string" || !INSTANCE_ID.test(instanceId)) {
      throw new NotaryError("unavailable", 503);
    }
    checkLicense(data, licensing, env, ["active", "inactive"]);
  } catch (error) {
    // Il posto e' stato preso ma la chiave non va bene per questo plugin: si libera subito.
    if (typeof instanceId === "string") {
      await lemon(env, fetcher, "deactivate", {
        license_key: licenseKey,
        instance_id: instanceId,
      }).catch(() => undefined);
    }
    throw error;
  }
  const { token, payload } = await signLicense(
    { pluginId, devicePublicKey, instanceId, test: data.license_key?.test_mode === true },
    env,
    now,
  );
  return answer(payload, token, instanceId);
}

/** Rinnova il permesso, se la chiave e' ancora valida (non rimborsata, non scaduta). */
export async function refreshLicense(input, env, fetcher = fetch, now = Date.now()) {
  const { licenseKey, pluginId, devicePublicKey, instanceId } = parseLicenseInput(input, [
    "licenseKey",
    "pluginId",
    "devicePublicKey",
    "instanceId",
  ]);
  const licensing = await paidPlugin(pluginId, fetcher);
  const data = await lemon(env, fetcher, "validate", {
    license_key: licenseKey,
    instance_id: instanceId,
  });
  if (data.valid !== true) throw new NotaryError("revoked", 403);
  // Il posto deve essere di questo computer: il nome lo lega alla sua chiave.
  if (
    data.instance?.id !== instanceId ||
    data.instance?.name !== (await instanceName(devicePublicKey))
  ) {
    throw new NotaryError("revoked", 403);
  }
  checkLicense(data, licensing, env, ["active"]);
  const { token, payload } = await signLicense(
    { pluginId, devicePublicKey, instanceId, test: data.license_key?.test_mode === true },
    env,
    now,
  );
  return answer(payload, token, instanceId);
}

/** Libera un posto (cambio di computer). */
export async function deactivateLicense(input, env, fetcher = fetch) {
  const { licenseKey, pluginId, instanceId } = parseLicenseInput(input, [
    "licenseKey",
    "pluginId",
    "instanceId",
  ]);
  await paidPlugin(pluginId, fetcher);
  const data = await lemon(env, fetcher, "deactivate", {
    license_key: licenseKey,
    instance_id: instanceId,
  });
  if (data.deactivated !== true) throw new NotaryError("invalidKey", 403);
  return { ok: true };
}
