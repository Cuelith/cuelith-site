import { buildEntry } from "./entry.js";
import { openRegistryPullRequest, readRegistryEntry } from "./github.js";
import { analyzePackage, PackageError } from "./package.js";

// La revisione di una proposta: analisi del pacchetto, voce del registry e,
// all'approvazione, la pull request. Ogni funzione rifa' tutto dai dati
// conservati: nulla di cio' che arriva dal pannello viene preso per buono
// (tranne l'indirizzo di acquisto che sceglie il fondatore, ricontrollato).

export const registryRepo = (env) => env.GITHUB_REPO || "Cuelith/cuelith-registry";

/**
 * Analizza una proposta conservata. Restituisce { report, built } dove `report`
 * e' quanto mostra il pannello (senza i file) e `built` serve all'approvazione
 * (undefined se il pacchetto non si e' potuto analizzare).
 */
export async function reviewSubmission(record, env, { fetcher = fetch, checkoutUrl, now } = {}) {
  const { submission } = record;
  const failed = (key, detail) => ({
    report: { ok: false, checks: [{ key, ok: false, detail }], warnings: [] },
    built: undefined,
  });

  let analysis;
  try {
    analysis = await analyzePackage(submission.packageUrl, { fetcher });
  } catch (error) {
    if (error instanceof PackageError) return failed(`package:${error.code}`, error.detail);
    throw error;
  }

  if (!env.GITHUB_TOKEN) return failed("github", "GITHUB_TOKEN non configurato");
  let existing;
  try {
    existing = await readRegistryEntry({
      token: env.GITHUB_TOKEN,
      repo: registryRepo(env),
      id: submission.id,
      fetcher,
    });
  } catch (error) {
    return failed("github", String(error.message ?? error));
  }

  const built = await buildEntry({ submission, analysis, existing, checkoutUrl, now });
  const version = built.entry.versions[0];
  return {
    report: {
      ok: built.ok,
      checks: built.checks,
      warnings: built.warnings,
      summary: {
        id: submission.id,
        version: version.version,
        kind: submission.kind,
        isUpdate: existing !== undefined,
        size: version.size,
        sha256: version.sha256,
        family: built.entry.family,
        engines: version.engines,
        permissions: version.permissions,
        price: submission.price ?? null,
        checkoutUrl: built.entry.checkoutUrl ?? null,
        hasImage: built.image !== undefined,
        hasGuide: built.entry.guide !== undefined,
      },
    },
    built,
  };
}

const slug = (text) => String(text).replace(/[^A-Za-z0-9._-]/g, "-");

/**
 * Approva: rifa' l'analisi e, se tutto torna, apre la pull request nel
 * registry. Lancia un Error con `code` ("notOk") se l'analisi non passa.
 */
export async function approveSubmission(record, env, { fetcher = fetch, checkoutUrl, now } = {}) {
  const { report, built } = await reviewSubmission(record, env, { fetcher, checkoutUrl, now });
  if (built === undefined || !report.ok) {
    const error = new Error("notOk");
    error.code = "notOk";
    error.report = report;
    throw error;
  }
  const { entry } = built;
  const version = entry.versions[0];
  const id = entry.id;
  const permissions = version.permissions.length === 0 ? "nessuno" : version.permissions.join(", ");
  const pull = await openRegistryPullRequest({
    token: env.GITHUB_TOKEN,
    repo: registryRepo(env),
    branch: `submission/${slug(id)}-${slug(version.version)}`,
    fetcher,
    files: [
      {
        path: `plugins/${id}.json`,
        content: `${JSON.stringify(entry, null, 2)}\n`,
        message: `${entry.name} ${version.version}: voce nel registry`,
      },
      {
        path: `plugins/${id}.svg`,
        content: built.icon,
        message: `${entry.name}: icona`,
      },
      // Immagine di copertina del pacchetto, se ne ha una (protocollo 1.19).
      ...(built.image === undefined
        ? []
        : [
            {
              path: `plugins/${id}.${built.image.ext}`,
              bytes: built.image.bytes,
              message: `${entry.name}: immagine di copertina`,
            },
          ]),
    ],
    title: `${entry.name} ${version.version} (proposta approvata)`,
    body: [
      `Plugin **${entry.name}** (\`${id}\`) versione ${version.version}, ${
        entry.access === "paid" ? "a pagamento" : "gratuito"
      }.`,
      "",
      `- Dimensione: ${String(version.size)} byte`,
      `- Impronta SHA-256: \`${version.sha256}\``,
      `- Permessi: ${permissions}`,
      "",
      "Aperta dal pannello di approvazione. La CI controlla pacchetto, permessi, icona e firma; con i controlli verdi la pull request si unisce da sola e l'indice si pubblica.",
    ].join("\n"),
  });
  return { ...pull, id, name: entry.name, version: version.version };
}
