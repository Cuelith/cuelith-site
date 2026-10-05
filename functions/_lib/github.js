// Il registry dei plugin sta su GitHub (repo cuelith-registry): l'approvazione
// di una proposta apre una pull request con la voce del plugin. La CI del
// registry la controlla con lo schema vero e, se e' tutto verde, GitHub la
// unisce da solo ("auto-merge"): il fondatore non apre mai GitHub.
//
// Il token (GITHUB_TOKEN dell'ambiente) deve poter scrivere SOLO su quel repo
// (contenuti e pull request). In nessun commit, ramo o descrizione finiscono
// dati di chi propone (email comprese): il repo e' pubblico.

const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(step, status, detail = "") {
    super(`${step}: ${String(status)} ${detail}`.trim());
    this.step = step;
    this.status = status;
  }
}

function client({ token, repo, fetcher = fetch }) {
  const call = async (step, path, { method = "GET", body, graphql = false } = {}) => {
    const response = await fetcher(graphql ? `${API}/graphql` : `${API}/repos/${repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "cuelith-marketplace",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    let data;
    try {
      data = text === "" ? undefined : JSON.parse(text);
    } catch {
      data = undefined;
    }
    return { status: response.status, ok: response.ok, data, step };
  };
  return { call };
}

const toBase64 = (value) => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
};

/** Legge dal ramo principale la voce di un plugin gia' nel registry (undefined se non c'e'). */
export async function readRegistryEntry({ token, repo, id, base = "main", fetcher }) {
  const { call } = client({ token, repo, fetcher });
  const result = await call("read", `/contents/plugins/${encodeURIComponent(id)}.json?ref=${base}`);
  if (result.status === 404) return undefined;
  if (!result.ok || typeof result.data?.content !== "string") {
    throw new GitHubError("read", result.status);
  }
  try {
    return JSON.parse(atob(result.data.content.replace(/\n/g, "")));
  } catch {
    throw new GitHubError("read", "voce illeggibile");
  }
}

/**
 * Apre la pull request con i file dati ({ path, content }) su un ramo nuovo
 * `branch`. Restituisce { number, url, autoMerge } dove autoMerge dice se
 * l'unione automatica e' stata attivata (se no la pull request resta aperta
 * e va unita a mano). Se qualcosa va storto dopo aver creato il ramo, lancia
 * GitHubError e il ramo resta (il fondatore lo vede nel messaggio).
 */
export async function openRegistryPullRequest({
  token,
  repo,
  branch,
  base = "main",
  files,
  title,
  body,
  fetcher,
}) {
  const { call } = client({ token, repo, fetcher });
  const need = (result) => {
    if (!result.ok) throw new GitHubError(result.step, result.status, result.data?.message ?? "");
    return result.data;
  };

  const head = need(await call("base", `/git/ref/heads/${base}`));
  const baseSha = head?.object?.sha;
  if (typeof baseSha !== "string") throw new GitHubError("base", "senza sha");

  need(
    await call("branch", "/git/refs", {
      method: "POST",
      body: { ref: `refs/heads/${branch}`, sha: baseSha },
    }),
  );

  for (const file of files) {
    // Se il file c'e' gia' sul ramo principale serve la sua impronta per aggiornarlo.
    const known = await call("file", `/contents/${file.path}?ref=${base}`);
    const sha = known.ok && typeof known.data?.sha === "string" ? known.data.sha : undefined;
    if (!known.ok && known.status !== 404) throw new GitHubError("file", known.status);
    need(
      await call("commit", `/contents/${file.path}`, {
        method: "PUT",
        body: {
          message: file.message ?? `Aggiorna ${file.path}`,
          content: toBase64(file.content),
          branch,
          ...(sha === undefined ? {} : { sha }),
        },
      }),
    );
  }

  const pull = need(
    await call("pull", "/pulls", { method: "POST", body: { title, head: branch, base, body } }),
  );

  // Unione automatica a controlli verdi: serve che il repo la permetta; se no resta manuale.
  let autoMerge = false;
  if (typeof pull?.node_id === "string") {
    const merge = await call("automerge", "", {
      method: "POST",
      graphql: true,
      body: {
        query:
          "mutation($id: ID!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) { pullRequest { number } } }",
        variables: { id: pull.node_id },
      },
    });
    autoMerge =
      merge.ok &&
      merge.data?.errors === undefined &&
      merge.data?.data?.enablePullRequestAutoMerge != null;
  }
  return { number: pull.number, url: pull.html_url, autoMerge };
}
