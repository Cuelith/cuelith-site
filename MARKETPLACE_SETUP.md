# Marketplace: cosa configurare (Cloudflare e GitHub)

Per chi: il fondatore, che esegue ogni passo. Il codice è già scritto e provato (decisione 0013, fase 3); qui si collega all'infrastruttura. Tempo: circa 45 minuti. Regola: **nessun segreto in chat**. Le chiavi segrete si incollano solo nei campi di Cloudflare indicati qui; la chiave _pubblica_ del Notaio e le chiavi _pubbliche_ di Turnstile si possono dire.

> Il sito con le pagine del marketplace **non va pubblicato** finché non è pronta anche la parte del programma (fase 4): vedi «Quando pubblicare» in fondo. Puoi comunque configurare tutto adesso e provare con l'anteprima (`dev`).

## Mappa

| #   | Cosa                               | Dove                         | Perché                                                             |
| --- | ---------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| 1   | Archivio KV `cuelith-submissions`  | Cloudflare                   | Tiene le proposte in attesa (si cancellano da sole dopo 60 giorni) |
| 2   | Turnstile                          | Cloudflare                   | Distingue una persona da un programma sul modulo di proposta       |
| 3   | Access sul pannello                | Cloudflare Zero Trust        | Solo tu entri nel pannello (codice via email)                      |
| 4   | Impostazioni del repo del registry | GitHub                       | Unione automatica delle pull request a controlli verdi             |
| 5   | Token GitHub                       | GitHub                       | Permette al sito di aprire la pull request dopo il tuo «Approva»   |
| 6   | Chiavi del Notaio                  | il tuo computer → Cloudflare | Firma dei permessi di licenza                                      |
| 7   | Variabili d'ambiente               | Cloudflare Pages             | Collega tutto                                                      |
| 8   | Prove                              | —                            | Verifica passo per passo                                           |

---

## 1. KV: l'archivio delle proposte

1. Cloudflare → **Storage & Databases** → **KV** → **Create a namespace**.
2. Nome: `cuelith-submissions`. Crea.
3. Poi collegalo al sito: **Workers & Pages** → progetto **cuelith** → **Settings** → **Bindings** (o «Functions» → «KV namespace bindings») → **Add** → **KV namespace**.
   - Variable name: **`SUBMISSIONS`** (esatto, maiuscolo).
   - KV namespace: `cuelith-submissions`.
   - Aggiungilo sia in **Production** sia in **Preview** (la scheda in alto).

Piano gratuito: 1.000 scritture al giorno, 100.000 letture. Ogni proposta ne usa 2-3: nessun problema.

## 2. Turnstile

1. Cloudflare → **Turnstile** → **Add widget**.
2. Nome: `Cuelith proposte`. Hostname: `cuelith.lzrhive.it` (aggiungi anche `localhost` se vuoi provarlo in locale). Widget mode: **Managed**.
3. Ti dà due chiavi:
   - **Site Key** (pubblica): serve alla costruzione del sito → passo 7, comando di pubblicazione.
   - **Secret Key** (segreta): va nelle variabili d'ambiente del progetto, nome `TURNSTILE_SECRET` → passo 7. **Non scriverla in chat.**
4. Per le prove locali ci sono le chiavi finte di Cloudflare già nel file `.dev.vars.example`.

> **Da verificare:** il piè di pagina dice «Questo sito non usa cookie e non traccia i visitatori». Turnstile può salvare qualcosa nel browser di chi apre la pagina di proposta. Guarda nella documentazione di Cloudflare/nel browser (Strumenti sviluppatore → Applicazione) e, se salva dati, aggiungi una riga nell'informativa della pagina di proposta prima di pubblicare.

## 3. Cloudflare Access sul pannello

Lo stesso meccanismo che già protegge la console dell'hub (codice via email).

1. Cloudflare → **Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**.
2. Nome: `Cuelith pannello proposte`. Durata sessione: 24 ore.
3. **Destinazioni** (devono essere due, entrambe sul dominio `cuelith.lzrhive.it`):
   - percorso `marketplace/dashboard-admin` (la pagina);
   - percorso `api/marketplace/admin` (le funzioni che la pagina chiama).
4. **Policy**: Action **Allow**; regola **Emails** = il tuo indirizzo (lo stesso che userai in `ADMIN_EMAIL`). Metodo di accesso: **One-time PIN**.
5. Salva. Ti servono due valori per il passo 7:
   - **Team domain**: Zero Trust → **Settings** → **Custom Pages**/**General**: è del tipo `NOME.cloudflareaccess.com` (senza `https://`) → `ACCESS_TEAM_DOMAIN`.
   - **Application Audience (AUD) Tag**: apri l'applicazione appena creata → **Overview**: stringa lunga → `ACCESS_AUD`.

Le funzioni controllano **da sole** il token di Access (firma, scadenza, emittente, AUD) e che l'email sia `ADMIN_EMAIL`: se Access non fosse attivo sul percorso, il pannello risponde «non autenticato», non si apre a nessuno.

## 4. GitHub: impostazioni del repo `cuelith-registry`

Repo → **Settings** → **General** → **Pull Requests**:

- ☑ **Allow auto-merge** (oggi è **spento**).
- ☑ **Allow squash merging** (già attivo).
- ☑ **Automatically delete head branches** (pulisce i rami `submission/…` dopo l'unione).

**Una scelta da confermare.** La protezione di `main` oggi chiede **1 approvazione** e la **revisione del proprietario del codice**, oltre al controllo `validate`. Con queste regole una pull request aperta dal sito resterebbe ferma ad aspettare un'approvazione: l'unione automatica non scatta. Il tuo «Approva» nel pannello _è_ l'approvazione umana; il controllo `validate` è il cancello automatico. Quindi propongo, **solo per il repo del registry**:

Repo → **Settings** → **Branches** → regola su `main` → **Edit**:

- **Required approving reviews: 0** (togli la spunta «Require approvals» e «Require review from Code Owners»);
- lascia **Require status checks to pass: `validate`** e **Require a pull request before merging**.

Chi non ha accesso in scrittura al repo non può unire nulla comunque. Se preferisci tenere l'approvazione, resta valido: la pull request si apre ugualmente, e la unisci tu a mano da GitHub dopo i controlli (il pannello te lo dice: «unione automatica non attiva»).

## 5. Il token GitHub (PAT)

Serve per aprire la pull request. Deve poter toccare **solo** quel repo.

1. GitHub → il tuo profilo → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. **Resource owner**: l'organizzazione **Cuelith**. (Se non compare: nell'organizzazione → Settings → **Personal access tokens** → consenti i token fine-grained, e approva la richiesta tu stesso.)
3. **Repository access**: **Only select repositories** → `cuelith-registry`.
4. **Permissions** → Repository permissions:
   - **Contents**: Read and write;
   - **Pull requests**: Read and write;
   - **Metadata**: Read (si mette da solo).
5. Scadenza: 90 giorni. **Metti un promemoria** nel calendario: dopo la scadenza le approvazioni falliscono con «GitHub non ha accettato (codice 401)»; si rigenera e si sostituisce al passo 7.
6. Copia il token (compare una volta sola) e incollalo **solo** nella variabile `GITHUB_TOKEN` del passo 7.

## 6. Le chiavi del Notaio (già generate)

> **Aggiornamento del 2026-10-06.** Le chiavi sono già state create, con `node scripts/notary-keys.mjs --out <file>`: la **pubblica** (`5lToPBMM2bePCMUbSl8NGl0wrXKS8OnxpSuj5gESaN8`) è già nel programma, la **privata** è nel file `C:\Users\MattiaLazzari\cuelith-notary-chiave-privata.txt`. Apri il file, copia la riga e incollala nel segreto `NOTARY_PRIVATE_KEY` di Cloudflare (passo 7); poi **cancella il file** (o spostalo in un posto sicuro). Il resto di questo paragrafo vale se devi rigenerare le chiavi.

Sul tuo computer, nella cartella `cuelith-site`:

```
node scripts/notary-keys.mjs
```

Stampa due righe e non scrive nulla su disco:

- **Chiave PRIVATA**: va in `NOTARY_PRIVATE_KEY` (passo 7), **solo lì**.
- **Chiave PUBBLICA** (43 caratteri): non è segreta. Mandamela: la incorporo nel programma (fase 4) per verificare i permessi.

Se perdi la privata, ne generi un'altra, la cambi qui e dai a `NOTARY_KEY_ID` un nuovo nome (`n2`): i permessi vecchi scadono da soli entro 90 giorni.

## 7. Le variabili d'ambiente

Cloudflare → **Workers & Pages** → progetto **cuelith** → **Settings** → **Variables and Secrets** → **Add**. Per i segreti scegli tipo **Secret** (cifrato). Aggiungi in **Production** (e, per provare, anche in **Preview**).

| Nome                 | Tipo                | Valore                                   | A cosa serve                                                                         |
| -------------------- | ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `TURNSTILE_SECRET`   | Secret              | Secret Key del passo 2                   | Verifica che chi invia sia una persona                                               |
| `ACCESS_TEAM_DOMAIN` | Testo               | `NOME.cloudflareaccess.com`              | Dove sono le chiavi per verificare il token di Access                                |
| `ACCESS_AUD`         | Testo               | AUD Tag del passo 3                      | A quale applicazione deve appartenere il token                                       |
| `ADMIN_EMAIL`        | Testo               | la tua email                             | L'unico indirizzo ammesso nel pannello                                               |
| `GITHUB_TOKEN`       | Secret              | il token del passo 5                     | Apre la pull request                                                                 |
| `NOTARY_PRIVATE_KEY` | Secret              | chiave privata del passo 6               | Firma i permessi di licenza                                                          |
| `NOTARY_KEY_ID`      | Testo               | `n1`                                     | Nome della chiave del Notaio                                                         |
| `GITHUB_REPO`        | Testo (facoltativo) | `Cuelith/cuelith-registry`               | Solo se il repo cambia: è il valore predefinito                                      |
| `TURNSTILE_HOSTNAME` | Testo (facoltativo) | `cuelith.lzrhive.it`                     | Accetta solo prove nate su questo sito                                               |
| `LS_API_BASE`        | Testo (facoltativo) | —                                        | Non serve: l'API di Lemon Squeezy è `https://api.lemonsqueezy.com`                   |
| `ALLOW_TEST_MODE`    | Testo               | `1` **solo in Preview** durante le prove | Fa accettare le chiavi di prova di Lemon Squeezy. **In Production non va mai messa** |

Il binding `SUBMISSIONS` (passo 1) non è una variabile: è già collegato.

La **Site Key** di Turnstile non va nelle variabili: serve quando si costruisce il sito. In PowerShell:

```
$env:TURNSTILE_SITE_KEY = "LA-SITE-KEY"
pnpm deploy:dev      # anteprima (ramo dev)
```

(`pnpm deploy` per il sito vero, solo quando è il momento.) Senza la Site Key la pagina di proposta non mostra il controllo e le proposte non si accettano.

Dopo aver cambiato variabili serve una **nuova pubblicazione** perché valgano.

## 8. Le prove, in ordine

Fai la prova sull'anteprima (`pnpm deploy:dev`), non sul sito vero.

1. **Il modulo.** Apri `/marketplace/submit/` dell'anteprima: deve comparire il controllo Turnstile. Invia una proposta di un plugin di prova (id tipo `prova.ciao`, costruito dal modello di plugin e con il pacchetto a un indirizzo https). Messaggio atteso: «Proposta ricevuta».
2. **Il pannello.** Apri `/marketplace/dashboard-admin/`: Access ti chiede il codice via email; poi vedi la proposta. **Analizza**: tutti i controlli verdi.
3. **L'approvazione.** **Approva** → compare «pull request #N». Su GitHub, nel repo del registry: la CI `validate` parte; a controlli verdi la pull request si unisce da sola (se hai fatto il passo 4) e dopo qualche minuto `index-2.json` contiene il plugin.
4. **Pulizia.** Il plugin di prova va tolto dal registry: elimina `plugins/prova.ciao.json` e `.svg` con una pull request normale.
5. **Il Notaio** (dopo che il fondatore ha un prodotto di prova in Lemon Squeezy, **test mode**, con chiavi di licenza e limite di 3 attivazioni): vedi sotto.

### Prova del Notaio

Serve un plugin a pagamento _già nel registry_ (`index-2.json`) con `licensing` uguale allo Store ID e al Product ID **veri** del tuo negozio in test mode (non i numeri 12345/67890, che sono segnaposto e usano solo i test automatici). Poi, con una chiave generata da un ordine di prova:

```
curl -s -H "Content-Type: application/json" -d '{"licenseKey":"LA-CHIAVE","pluginId":"ID-DEL-PLUGIN","devicePublicKey":"43-CARATTERI"}' https://ANTEPRIMA/api/license/activate
```

(`devicePublicKey`: qualunque stringa di 43 caratteri base64url, per la prova; il programma userà la sua vera, fase 4.) Risposte: `{"ok":true,"token":…}` se va; altrimenti `{"error":"…"}`:

| Errore               | Significa                                                                |
| -------------------- | ------------------------------------------------------------------------ |
| `invalidInput` (400) | un campo ha la forma sbagliata                                           |
| `notPaid` (404)      | il plugin non è nel catalogo come a pagamento                            |
| `invalidKey` (403)   | la chiave non esiste                                                     |
| `limit` (409)        | la chiave ha già usato tutti i posti                                     |
| `wrongProduct` (403) | la chiave è di un altro negozio o prodotto                               |
| `badLimit` (409)     | il prodotto non ha un limite da 1 a 3 attivazioni                        |
| `testMode` (403)     | chiave di prova e `ALLOW_TEST_MODE` non attivo                           |
| `revoked` (403)      | rimborsata, scaduta o posto di un altro computer                         |
| `unavailable` (503)  | Lemon Squeezy o il catalogo non rispondono, o manca la chiave del Notaio |

## Quando pubblicare

Non pubblicare il sito con il marketplace (`pnpm deploy`) finché:

- non c'è la **fase 4** (acquisto, licenza e rinnovo nel programma): i testi della pagina li descrivono;
- non hai parlato con il **commercialista** per il 10% di affiliazione (`AFFILIATE_PERCENT` in `src/market.mjs`);
- l'**informativa** copre Turnstile e l'email di chi propone (si conserva fino alla decisione, poi si cancella).

## Cosa viene conservato e dove

| Dato                                                                       | Dove                                                                          | Per quanto                                               |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| Proposta (compresa l'email di chi propone)                                 | KV                                                                            | fino all'approvazione o al rifiuto, e comunque 60 giorni |
| Esito (nome, versione, link alla pull request, **senza email**)            | KV                                                                            | 14 giorni                                                |
| Impronta (non l'indirizzo) di chi ha inviato, per il limite di 5 al giorno | KV                                                                            | un giorno                                                |
| Voce del plugin (nome, descrizione, autore, prezzo, chiavi pubbliche)      | registry su GitHub (pubblico)                                                 | per sempre                                               |
| Chiavi di licenza e chiavi dei computer                                    | **da nessuna parte**: il Notaio le legge, le gira al fornitore e le dimentica | —                                                        |

## Limiti dei piani gratuiti da tenere d'occhio

Pages Functions: 100.000 richieste al giorno; KV: 1.000 scritture e 1.000 cancellazioni al giorno. Se il Notaio fosse preso di mira, in Cloudflare → **Security** → **WAF** → **Rate limiting rules** si può aggiungere una regola (una è gratis) su `/api/license/*`, per esempio 30 richieste al minuto per indirizzo.

## Dove sta il codice

`functions/api/marketplace/submit.js` (invio), `functions/api/marketplace/admin/[action].js` (pannello), `functions/api/license/*.js` (Notaio), `functions/_lib/` (verifica di Access, Turnstile, KV, pacchetto, voce del registry, GitHub, Notaio), `src/admin.mjs` e `src/admin-client.js` (pannello). Prove: `pnpm test` (94). Documentazione di progetto: `cuelith-docs/decisioni/0013-marketplace-a-pagamento-senza-account.md`.
