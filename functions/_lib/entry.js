import { packageSignatureMessage, verifyEd25519 } from "./crypto.js";

// Dalla proposta approvata e dall'analisi del pacchetto alla voce del
// registry (plugins/<id>.json). Qui si decide cosa va scritto e si segnalano i
// problemi al fondatore; la CI del registry rifa' poi tutti i controlli con lo
// schema vero prima di pubblicare, ed e' lei il cancello finale.

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Confronto tra versioni: positivo se a e' piu' recente di b (una prerelease vale meno della versione piena). */
export function compareSemver(a, b) {
  const x = SEMVER.exec(a);
  const y = SEMVER.exec(b);
  if (x === null || y === null) return 0;
  for (let i = 1; i <= 3; i += 1) {
    const diff = Number(x[i]) - Number(y[i]);
    if (diff !== 0) return diff;
  }
  if (x[4] === undefined && y[4] === undefined) return 0;
  if (x[4] === undefined) return 1;
  if (y[4] === undefined) return -1;
  return x[4] < y[4] ? -1 : x[4] > y[4] ? 1 : 0;
}

const isText = (value) => typeof value === "string" && value.length > 0;
const isHttps = (value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Costruisce la voce del registry per la versione proposta.
 *
 * - `submission`: la proposta (gia' controllata da parseSubmission).
 * - `analysis`: { sha256, size, manifest, icon } da analyzePackage.
 * - `existing`: la voce gia' nel registry per lo stesso id, se c'e'.
 * - `checkoutUrl`: l'indirizzo di acquisto da pubblicare (quello con il link
 *   di affiliazione del progetto, scelto dal fondatore); se manca, quello
 *   dell'autore.
 *
 * Restituisce { checks, ok, entry, icon, warnings }: `checks` e' l'elenco dei
 * controlli ({ key, ok, detail }), `ok` e' vero solo se tutti passano.
 */
export async function buildEntry({
  submission,
  analysis,
  existing,
  checkoutUrl,
  now = new Date(),
}) {
  const { manifest, sha256, size } = analysis;
  const checks = [];
  const warnings = [];
  const check = (key, ok, detail = "") => {
    checks.push({ key, ok, detail });
    return ok;
  };

  check("id", manifest.id === submission.id, `manifesto: ${String(manifest.id)}`);
  const version = String(manifest.version ?? "");
  check("version", SEMVER.test(version), version);
  check(
    "engines",
    manifest.engines !== null &&
      typeof manifest.engines === "object" &&
      isText(manifest.engines.cuelith) &&
      isText(manifest.engines.protocol),
  );
  check("permissions", Array.isArray(manifest.permissions) && manifest.permissions.every(isText));
  check("family", isText(manifest.family), String(manifest.family ?? ""));
  check("manifestInfo", [manifest.name, manifest.publisher, manifest.license].every(isText));
  const repository = isHttps(manifest.repository) ? manifest.repository : submission.repositoryUrl;
  check("repository", isHttps(repository), repository ?? "");

  // Cose che il fondatore deve sapere, senza bloccare.
  if (manifest.name !== submission.name)
    warnings.push(`nome: modulo «${submission.name}», manifesto «${String(manifest.name)}»`);
  if (manifest.publisher !== submission.publisher) {
    warnings.push(
      `autore: modulo «${submission.publisher}», manifesto «${String(manifest.publisher)}»`,
    );
  }
  if (manifest.license !== submission.license) {
    warnings.push(
      `licenza: modulo «${submission.license}», manifesto «${String(manifest.license)}»`,
    );
  }

  // Firma dell'autore sul pacchetto (id, versione, impronta).
  if (submission.authorKey !== "") {
    const signed = await verifyEd25519(
      submission.authorKey,
      packageSignatureMessage(submission.id, version, sha256),
      submission.signature,
    );
    check("signature", signed, signed ? "" : "la firma non corrisponde alla chiave dell'autore");
  }

  // Chi possiede gia' il plugin: stessa chiave d'autore, stesso tipo, versione nuova.
  if (existing !== undefined) {
    check(
      "ownership",
      (existing.authorKey ?? "") === submission.authorKey,
      "la chiave d'autore e' diversa da quella gia' registrata",
    );
    check(
      "sameKind",
      (existing.access ?? "free") === submission.kind,
      `nel registry: ${existing.access ?? "free"}`,
    );
    check(
      "versionNew",
      !(existing.versions ?? []).some((v) => v.version === version),
      `la versione ${version} e' gia' nel registry`,
    );
  }

  let shop;
  if (submission.kind === "paid") {
    shop = checkoutUrl ?? submission.checkoutUrl;
    check(
      "checkoutUrl",
      /^https:\/\/(?:[a-z0-9-]+\.)*lemonsqueezy\.com(?:[/?#]|$)/.test(shop ?? ""),
      shop ?? "",
    );
  }

  const base =
    existing ??
    Object.fromEntries(
      Object.entries({
        id: submission.id,
        name: manifest.name,
        description: isText(manifest.description) ? manifest.description : submission.description,
        publisher: manifest.publisher,
        license: manifest.license,
        repository,
        family: manifest.family,
        // Un plugin di terzi non e' mai "del progetto": lo decide solo il fondatore, a mano.
        verified: false,
        access: submission.kind,
        ...(submission.kind === "paid"
          ? {
              price: submission.price,
              checkoutUrl: shop,
              licensing: {
                provider: "lemonsqueezy",
                storeId: submission.storeId,
                productId: submission.productId,
              },
            }
          : {}),
        ...(submission.authorKey === "" ? {} : { authorKey: submission.authorKey }),
      }).filter(([, value]) => value !== undefined),
    );

  const newVersion = {
    version,
    engines: manifest.engines,
    url: submission.packageUrl,
    sha256,
    size,
    permissions: manifest.permissions,
    published: now.toISOString(),
    ...(submission.authorKey === "" ? {} : { signature: submission.signature }),
  };
  // Dalla piu' recente alla piu' vecchia.
  const versions = [newVersion, ...(existing?.versions ?? [])].sort((a, b) =>
    compareSemver(b.version, a.version),
  );
  // Per un plugin gia' nel registry cambia solo l'elenco delle versioni (e, se il fondatore
  // lo sceglie, l'indirizzo di acquisto aggiornato).
  const entry = {
    ...base,
    ...(existing !== undefined && submission.kind === "paid" && shop !== undefined
      ? { checkoutUrl: shop }
      : {}),
    versions,
  };

  return { checks, ok: checks.every((c) => c.ok), entry, icon: analysis.icon, warnings };
}
