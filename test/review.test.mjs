// Analisi del pacchetto, voce del registry e pull request (decisione 0013).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { packageSignatureMessage, sha256Hex } from "../functions/_lib/crypto.js";
import { buildEntry, compareSemver } from "../functions/_lib/entry.js";
import {
  GitHubError,
  openRegistryPullRequest,
  readRegistryEntry,
} from "../functions/_lib/github.js";
import { analyzePackage, checkPackageUrl, PackageError } from "../functions/_lib/package.js";
import { parseSubmission } from "../src/submission.js";
import { ed25519Pair, fakeNetwork, makeZip, manifestOf, SVG, signPackage } from "./helpers.mjs";

const URL_OK = "https://downloads.acme.example/lyrics-pro-1.2.0.cpkg";
const serve = (bytes, init = {}) =>
  fakeNetwork([[URL_OK, new Response(bytes, { status: 200, ...init })]]).fetcher;
const codeOf = async (promise) => {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof PackageError, String(error));
    return error.code;
  }
  return "nessun errore";
};

// ---- pacchetto ----

test("pacchetto: impronta, dimensione, manifest e icona di un pacchetto vero", async () => {
  const zip = makeZip();
  const result = await analyzePackage(URL_OK, { fetcher: serve(zip) });
  assert.equal(result.sha256, await sha256Hex(zip));
  assert.equal(result.size, zip.byteLength);
  assert.equal(result.manifest.id, "acme.lyrics-pro");
  assert.equal(result.icon, SVG);
});

test("pacchetto: indirizzi ammessi solo https con nome di sito vero", () => {
  assert.equal(checkPackageUrl(URL_OK).hostname, "downloads.acme.example");
  for (const bad of [
    "http://a.example/x.cpkg",
    "https://user:pw@a.example/x",
    "https://127.0.0.1/x",
    "https://10.0.0.5/x",
    "https://[::1]/x",
    "https://localhost/x",
    "https://nas.local/x",
    "https://db.internal/x",
    "https://singolo/x",
    "ftp://a.example/x",
    "non un indirizzo",
  ]) {
    assert.throws(() => checkPackageUrl(bad), PackageError, bad);
  }
});

test("pacchetto: troppo grande (anche senza dichiarare la dimensione), non scaricabile, non uno zip", async () => {
  const limits = { maxPackage: 1000, maxManifest: 256 * 1024, maxIcon: 40 * 1024, timeoutMs: 5000 };
  const big = new Uint8Array(5000);
  assert.equal(
    await codeOf(
      analyzePackage(URL_OK, {
        fetcher: serve(big, { headers: { "Content-Length": "5000" } }),
        limits,
      }),
    ),
    "tooLarge",
  );
  // Senza Content-Length (o con uno falso) ci si ferma comunque al limite.
  const stream = new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < 10; i += 1) controller.enqueue(new Uint8Array(500));
        controller.close();
      },
    }),
  );
  assert.equal(
    await codeOf(
      analyzePackage(URL_OK, { fetcher: fakeNetwork([[URL_OK, stream]]).fetcher, limits }),
    ),
    "tooLarge",
  );
  assert.equal(
    await codeOf(
      analyzePackage(URL_OK, {
        fetcher: fakeNetwork([[URL_OK, new Response("x", { status: 404 })]]).fetcher,
      }),
    ),
    "download",
  );
  const broken = async () => {
    throw new Error("rete");
  };
  assert.equal(await codeOf(analyzePackage(URL_OK, { fetcher: broken })), "download");
  assert.equal(
    await codeOf(analyzePackage(URL_OK, { fetcher: serve(new Uint8Array(0)) })),
    "notZip",
  );
  assert.equal(
    await codeOf(
      analyzePackage(URL_OK, { fetcher: serve(new TextEncoder().encode("non uno zip ma testo")) }),
    ),
    "notZip",
  );
  assert.equal(
    await codeOf(analyzePackage("http://a.example/x", { fetcher: serve(makeZip()) })),
    "badUrl",
  );
});

test("pacchetto: manifest e icona devono esserci ed essere sicuri", async () => {
  const bad = async (options) =>
    codeOf(analyzePackage(URL_OK, { fetcher: serve(makeZip(options)) }));
  assert.equal(await bad({ manifest: { ...manifestOf(), icon: undefined } }), "noIcon");
  assert.equal(await bad({ manifest: manifestOf({ icon: "../fuori.svg" }) }), "noIcon");
  assert.equal(await bad({ manifest: manifestOf({ icon: "/assoluto.svg" }) }), "noIcon");
  assert.equal(await bad({ manifest: manifestOf({ icon: "icon.png" }) }), "noIcon");
  assert.equal(await bad({ manifest: manifestOf({ icon: "non-nel-pacchetto.svg" }) }), "noIcon");
  assert.equal(
    await bad({ icon: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' }),
    "badIcon",
  );
  assert.equal(
    await bad({ icon: '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"></svg>' }),
    "badIcon",
  );
  assert.equal(
    await bad({
      icon: '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/a.png"/></svg>',
    }),
    "badIcon",
  );
  assert.equal(await bad({ icon: "non un svg" }), "badIcon");
  // Un manifest che non e' JSON, o che non e' un oggetto.
  const { strToU8, zipSync } = await import("fflate");
  const zipWith = (manifest) =>
    zipSync({ "cuelith-plugin.json": strToU8(manifest), "icon.svg": strToU8(SVG) });
  assert.equal(
    await codeOf(analyzePackage(URL_OK, { fetcher: serve(zipWith("{non json")) })),
    "badManifest",
  );
  assert.equal(
    await codeOf(analyzePackage(URL_OK, { fetcher: serve(zipWith("[1,2]")) })),
    "badManifest",
  );
  const noManifest = zipSync({ "icon.svg": strToU8(SVG) });
  assert.equal(await codeOf(analyzePackage(URL_OK, { fetcher: serve(noManifest) })), "noManifest");
});

test("pacchetto: un manifest enorme non si decomprime (limite sulla dimensione originale)", async () => {
  const huge = makeZip({ manifest: manifestOf({ description: "x".repeat(400 * 1024) }) });
  assert.equal(await codeOf(analyzePackage(URL_OK, { fetcher: serve(huge) })), "noManifest");
});

// ---- voce del registry ----

const submissionOf = (extra = {}) => {
  const result = parseSubmission({
    kind: "free",
    name: "Lyrics Pro",
    id: "acme.lyrics-pro",
    description: "Testi avanzati con piu' stili.",
    publisher: "Acme Studio",
    license: "Proprietaria (EULA)",
    packageUrl: URL_OK,
    contact: "dev@acme.example",
    confirm: { noMalware: true, permissions: true, licence: true, name: true },
    ...extra,
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  return result.value;
};
const analysisOf = async (options) => analyzePackage(URL_OK, { fetcher: serve(makeZip(options)) });
const NOW = new Date("2026-10-06T10:00:00.000Z");
const failing = (built) => built.checks.filter((c) => !c.ok).map((c) => c.key);

test("voce nuova gratuita: dati del manifest, mai 'verified', versione con impronta", async () => {
  const analysis = await analysisOf();
  const built = await buildEntry({ submission: submissionOf(), analysis, now: NOW });
  assert.equal(built.ok, true, JSON.stringify(failing(built)));
  const { entry } = built;
  assert.equal(entry.verified, false);
  assert.equal(entry.access, "free");
  assert.equal(entry.repository, "https://github.com/acme/lyrics-pro");
  assert.equal(entry.versions.length, 1);
  assert.deepEqual(entry.versions[0], {
    version: "1.2.0",
    engines: { cuelith: ">=0.2.0 <1.0.0", protocol: "^1.14.0" },
    url: URL_OK,
    sha256: analysis.sha256,
    size: analysis.size,
    permissions: ["storage"],
    published: "2026-10-06T10:00:00.000Z",
  });
  assert.equal(built.icon, SVG);
  assert.equal("price" in entry && "checkoutUrl" in entry && "licensing" in entry, false);
});

test("voce a pagamento: prezzo, negozio scelto dal fondatore, licenza e chiave d'autore con firma", async () => {
  const pair = await ed25519Pair();
  const analysis = await analysisOf();
  const signature = await signPackage(
    pair,
    packageSignatureMessage("acme.lyrics-pro", "1.2.0", analysis.sha256),
  );
  const submission = submissionOf({
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
  });
  const affiliate = "https://acme.lemonsqueezy.com/checkout/buy/abc?aff=cuelith";
  const built = await buildEntry({ submission, analysis, checkoutUrl: affiliate, now: NOW });
  assert.equal(built.ok, true, JSON.stringify(failing(built)));
  assert.equal(built.entry.access, "paid");
  assert.equal(built.entry.price, "9 €");
  assert.equal(built.entry.checkoutUrl, affiliate);
  assert.deepEqual(built.entry.licensing, {
    provider: "lemonsqueezy",
    storeId: 12345,
    productId: 67890,
  });
  assert.equal(built.entry.authorKey, pair.publicKey);
  assert.equal(built.entry.versions[0].signature, signature);

  // L'indirizzo di acquisto deve restare di un negozio ammesso, anche se lo sceglie il fondatore.
  const wrong = await buildEntry({
    submission,
    analysis,
    checkoutUrl: "https://evil.example/buy",
    now: NOW,
  });
  assert.deepEqual(failing(wrong), ["checkoutUrl"]);
});

test("firma dell'autore: sbagliata, di un'altra versione o di un altro pacchetto = non passa", async () => {
  const pair = await ed25519Pair();
  const other = await ed25519Pair();
  const analysis = await analysisOf();
  const message = (v, sha) => packageSignatureMessage("acme.lyrics-pro", v, sha);
  const cases = {
    "firma di un'altra chiave": await signPackage(other, message("1.2.0", analysis.sha256)),
    "altra versione": await signPackage(pair, message("1.2.1", analysis.sha256)),
    "altro pacchetto": await signPackage(pair, message("1.2.0", "b".repeat(64))),
  };
  for (const [name, signature] of Object.entries(cases)) {
    const submission = submissionOf({ authorKey: pair.publicKey, signature });
    const built = await buildEntry({ submission, analysis, now: NOW });
    assert.deepEqual(failing(built), ["signature"], name);
  }
});

test("manifest incoerente con la proposta: id diverso, versione non valida, repository mancante", async () => {
  const submission = submissionOf();
  const run = async (manifest) =>
    buildEntry({ submission, analysis: await analysisOf({ manifest }), now: NOW });
  assert.ok(failing(await run(manifestOf({ id: "altro.plugin" }))).includes("id"));
  assert.ok(failing(await run(manifestOf({ version: "uno" }))).includes("version"));
  assert.ok(failing(await run(manifestOf({ repository: undefined }))).includes("repository"));
  assert.ok(failing(await run(manifestOf({ permissions: "tutti" }))).includes("permissions"));
  assert.ok(failing(await run(manifestOf({ engines: { cuelith: "^0.2.0" } }))).includes("engines"));
  // Differenze di nome/autore/licenza non bloccano: si segnalano.
  const different = await run(manifestOf({ name: "Altro nome", publisher: "Altri" }));
  assert.equal(different.ok, true);
  assert.equal(different.warnings.length, 2);
});

test("aggiornamento di un plugin gia' nel registry: stessa chiave, versione nuova, ordine delle versioni", async () => {
  const pair = await ed25519Pair();
  const sign = async (analysis, v) =>
    signPackage(pair, packageSignatureMessage("acme.lyrics-pro", v, analysis.sha256));
  const first = await analysisOf({ manifest: manifestOf({ version: "1.9.0" }) });
  const second = await analysisOf({ manifest: manifestOf({ version: "1.10.0" }) });
  const initial = await buildEntry({
    submission: submissionOf({ authorKey: pair.publicKey, signature: await sign(first, "1.9.0") }),
    analysis: first,
    now: NOW,
  });
  assert.equal(initial.ok, true, JSON.stringify(failing(initial)));

  const update = await buildEntry({
    submission: submissionOf({
      authorKey: pair.publicKey,
      signature: await sign(second, "1.10.0"),
    }),
    analysis: second,
    existing: initial.entry,
    now: NOW,
  });
  assert.equal(update.ok, true, JSON.stringify(failing(update)));
  // 1.10.0 viene prima di 1.9.0 (confronto di versioni, non di testo).
  assert.deepEqual(
    update.entry.versions.map((v) => v.version),
    ["1.10.0", "1.9.0"],
  );
  assert.equal(
    update.entry.name,
    initial.entry.name,
    "i dati del plugin restano quelli gia' approvati",
  );

  // Stessa versione: no. Chiave diversa: no. Tipo diverso: no.
  const again = await buildEntry({
    submission: submissionOf({ authorKey: pair.publicKey, signature: await sign(first, "1.9.0") }),
    analysis: first,
    existing: initial.entry,
    now: NOW,
  });
  assert.deepEqual(failing(again), ["versionNew"]);
  const thief = await ed25519Pair();
  const stolen = await buildEntry({
    submission: submissionOf({
      authorKey: thief.publicKey,
      signature: await signPackage(
        thief,
        packageSignatureMessage("acme.lyrics-pro", "1.10.0", second.sha256),
      ),
    }),
    analysis: second,
    existing: initial.entry,
    now: NOW,
  });
  assert.deepEqual(failing(stolen), ["ownership"]);
  const noKey = await buildEntry({
    submission: submissionOf(),
    analysis: second,
    existing: initial.entry,
    now: NOW,
  });
  assert.deepEqual(failing(noKey), ["ownership"]);
});

test("confronto tra versioni", () => {
  assert.ok(compareSemver("1.10.0", "1.9.0") > 0);
  assert.ok(compareSemver("2.0.0", "10.0.0") < 0);
  assert.ok(compareSemver("1.0.0", "1.0.0-beta.1") > 0);
  assert.equal(compareSemver("1.0.0", "1.0.0"), 0);
  assert.equal(compareSemver("x", "1.0.0"), 0);
});

// Se il repo dell'SDK e' affiancato (come in locale), la voce prodotta deve passare lo schema vero.
const SDK = new URL("../../cuelith-sdk/packages/protocol/dist/index.js", import.meta.url);
test(
  "la voce prodotta e il testo della firma coincidono con lo schema e le funzioni dell'SDK",
  { skip: !existsSync(SDK) },
  async () => {
    const sdk = await import(SDK.href);
    const pair = await ed25519Pair();
    const analysis = await analysisOf();
    const signature = await signPackage(
      pair,
      packageSignatureMessage("acme.lyrics-pro", "1.2.0", analysis.sha256),
    );
    const submission = submissionOf({
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
    });
    const paid = await buildEntry({ submission, analysis, now: NOW });
    assert.equal(
      sdk.RegistryPluginSchema.safeParse(paid.entry).success,
      true,
      JSON.stringify(sdk.RegistryPluginSchema.safeParse(paid.entry).error?.issues),
    );
    const free = await buildEntry({ submission: submissionOf(), analysis, now: NOW });
    assert.equal(sdk.RegistryPluginSchema.safeParse(free.entry).success, true);
    assert.equal(
      packageSignatureMessage("a.b", "1.0.0", "c".repeat(64)),
      sdk.packageSignatureMessage("a.b", "1.0.0", "c".repeat(64)),
    );
  },
);

// ---- GitHub ----

const REPO = "Cuelith/cuelith-registry";
const API = `https://api.github.com/repos/${REPO}`;
const json = (value, status = 200) => Response.json(value, { status });
const b64 = (text) => Buffer.from(text).toString("base64");

function githubRoutes({ existing = {}, autoMerge = true, branchStatus = 201 } = {}) {
  return [
    [
      (u, i) => u === `${API}/git/ref/heads/main` && (i.method ?? "GET") === "GET",
      json({ object: { sha: "abc123" } }),
    ],
    [
      (u, i) => u === `${API}/git/refs` && i.method === "POST",
      () => json({ message: "Reference already exists" }, branchStatus),
    ],
    [
      (u, i) => u.startsWith(`${API}/contents/`) && (i.method ?? "GET") === "GET",
      (u) => {
        const path = decodeURIComponent(u.slice(`${API}/contents/`.length).split("?")[0]);
        return path in existing
          ? json({ sha: `sha-${path}`, content: b64(existing[path]) })
          : json({ message: "Not Found" }, 404);
      },
    ],
    [(u, i) => u.startsWith(`${API}/contents/`) && i.method === "PUT", json({ content: {} }, 201)],
    [
      (u, i) => u === `${API}/pulls` && i.method === "POST",
      json(
        {
          number: 7,
          html_url: "https://github.com/Cuelith/cuelith-registry/pull/7",
          node_id: "PR_node",
        },
        201,
      ),
    ],
    [
      (u) => u === "https://api.github.com/graphql",
      autoMerge
        ? json({ data: { enablePullRequestAutoMerge: { pullRequest: { number: 7 } } } })
        : json({ errors: [{ message: "Auto merge is not allowed" }] }),
    ],
  ];
}
const open = (fetcher, extra = {}) =>
  openRegistryPullRequest({
    token: "ghp_segreto",
    repo: REPO,
    branch: "submission/acme.lyrics-pro-1.2.0",
    fetcher,
    files: [
      {
        path: "plugins/acme.lyrics-pro.json",
        content: '{"id":"acme.lyrics-pro"}\n',
        message: "voce",
      },
      { path: "plugins/acme.lyrics-pro.svg", content: SVG, message: "icona" },
    ],
    title: "Lyrics Pro 1.2.0",
    body: "corpo",
    ...extra,
  });

test("pull request: ramo, file, apertura e unione automatica, con il token e senza dati di chi propone", async () => {
  const { fetcher, calls } = fakeNetwork(githubRoutes());
  const pr = await open(fetcher);
  assert.deepEqual(pr, {
    number: 7,
    url: "https://github.com/Cuelith/cuelith-registry/pull/7",
    autoMerge: true,
  });
  const steps = calls.map(
    (c) =>
      `${c.init.method ?? "GET"} ${c.url.replace(API, "").replace("https://api.github.com", "")}`,
  );
  assert.deepEqual(steps, [
    "GET /git/ref/heads/main",
    "POST /git/refs",
    "GET /contents/plugins/acme.lyrics-pro.json?ref=main",
    "PUT /contents/plugins/acme.lyrics-pro.json",
    "GET /contents/plugins/acme.lyrics-pro.svg?ref=main",
    "PUT /contents/plugins/acme.lyrics-pro.svg",
    "POST /pulls",
    "POST /graphql",
  ]);
  assert.ok(calls.every((c) => c.init.headers.Authorization === "Bearer ghp_segreto"));
  const put = calls.find((c) => c.init.method === "PUT");
  const body = JSON.parse(put.init.body);
  assert.equal(body.branch, "submission/acme.lyrics-pro-1.2.0");
  assert.equal(Buffer.from(body.content, "base64").toString(), '{"id":"acme.lyrics-pro"}\n');
  assert.equal(body.sha, undefined, "file nuovo: nessuna impronta");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    ref: "refs/heads/submission/acme.lyrics-pro-1.2.0",
    sha: "abc123",
  });
});

test("pull request: un file gia' nel registry si aggiorna con la sua impronta", async () => {
  const { fetcher, calls } = fakeNetwork(
    githubRoutes({ existing: { "plugins/acme.lyrics-pro.json": "{}" } }),
  );
  await open(fetcher);
  const put = calls.find((c) => c.init.method === "PUT" && c.url.endsWith(".json"));
  assert.equal(JSON.parse(put.init.body).sha, "sha-plugins/acme.lyrics-pro.json");
});

test("pull request: se l'unione automatica non e' permessa la pull request resta aperta e lo dice", async () => {
  const { fetcher } = fakeNetwork(githubRoutes({ autoMerge: false }));
  const pr = await open(fetcher);
  assert.equal(pr.autoMerge, false);
  assert.equal(pr.number, 7);
});

test("pull request: ramo gia' esistente o token senza permessi = errore chiaro, nessun file scritto", async () => {
  const exists = fakeNetwork(githubRoutes({ branchStatus: 422 }));
  await assert.rejects(
    open(exists.fetcher),
    (error) => error instanceof GitHubError && error.step === "branch" && error.status === 422,
  );
  assert.ok(!exists.calls.some((c) => c.init.method === "PUT"));
  const denied = fakeNetwork([[() => true, json({ message: "Bad credentials" }, 401)]]);
  await assert.rejects(
    open(denied.fetcher),
    (error) => error instanceof GitHubError && error.step === "base" && error.status === 401,
  );
});

test("lettura di una voce del registry: assente, presente, illeggibile", async () => {
  const entry = { id: "acme.x", versions: [] };
  const ok = fakeNetwork(
    githubRoutes({ existing: { "plugins/acme.x.json": JSON.stringify(entry) } }),
  );
  assert.deepEqual(
    await readRegistryEntry({ token: "t", repo: REPO, id: "acme.x", fetcher: ok.fetcher }),
    entry,
  );
  assert.equal(
    await readRegistryEntry({ token: "t", repo: REPO, id: "acme.y", fetcher: ok.fetcher }),
    undefined,
  );
  const bad = fakeNetwork(githubRoutes({ existing: { "plugins/acme.z.json": "non json" } }));
  await assert.rejects(
    readRegistryEntry({ token: "t", repo: REPO, id: "acme.z", fetcher: bad.fetcher }),
    GitHubError,
  );
});
