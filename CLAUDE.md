# cuelith-site

Il sito di Cuelith (`cuelith.lzrhive.it`). Fonte di verità del progetto: `cuelith-docs`
(documento e decisioni). Leggi il `README.md` per comandi e struttura.

## Regole

- **Licenza**: il programma è GPL 3.0 (piè di pagina, dati strutturati, domande frequenti); questo repo del sito resta Apache 2.0. Non scrivere «Apache» nei testi sul programma.
- **Mai nominare altri programmi** del settore, né dire a cosa Cuelith si ispira. Formati aperti
  (OpenLyrics, ChordPro) e protocolli (NDI, ASIO, Dante, MIDI, OSC, DMX…) si possono nominare.
- **Non descrivere l'architettura** né le tecnologie usate: la pagina parla di cosa fa il
  programma per chi lo usa.
- **Il visitatore non vede da dove arrivano i file.** Download, versioni e plugin passano dalle
  funzioni del sito. Nessun collegamento esterno nella pagina: `test/site.test.mjs` lo verifica.
- **Niente funzioni finte.** Ciò che non esiste ancora sta solo in «In arrivo», senza date.
  I numeri in evidenza devono essere misure scritte in `cuelith-docs`.
- **Contenuti dimostrativi neutri.** Cuelith è un software generale: nelle schermate niente testi
  religiosi o legati a un solo tipo di pubblico (lo show d'esempio è una serata con canzoni
  originali). Chiese e comunità sono uno dei pubblici, non l'unico né il primo.
- **Marketplace** (decisione 0013): `/marketplace/` (schede dei plugin dal registry) e `/marketplace/submit/` (proposta di un plugin), in due lingue. Ciò che riguarda i plugin **a pagamento** (introduzione, filtri, spiegazione dell'acquisto) resta nascosto finché nel registry non ce n'è uno: niente funzioni finte. L'indirizzo del negozio **non sta mai nell'HTML né in `/api/modules`**: «Acquista» è `/marketplace/buy/<id>`, funzione che legge il catalogo e reindirizza solo a negozi ammessi. Sul modulo di proposta e sul 10% (`AFFILIATE_PERCENT` in `src/market.mjs`) vedi sotto. Gli unici collegamenti esterni delle pagine del marketplace, oltre a Ko-fi e hub, sono guida e modello per chi sviluppa (`DEV_LINKS` in `src/market.mjs`, solo nella pagina di proposta).
- **Non pubblicare il sito con le pagine del marketplace prima delle fasi 3-4 della 0013**: il modulo risponde «servizio non disponibile» finché non c'è dove conservare le proposte, e i testi sull'acquisto, sulle licenze su 3 computer e sul rimborso descrivono funzioni del programma che si costruiscono nella fase 4. Il **10%** chiesto agli autori e l'avviso sull'affiliazione vanno confermati con il commercialista prima di andare online.
- **Backend del marketplace** (decisione 0013, fase 3): sono Pages Functions di questo repo. `api/marketplace/submit.js` (Turnstile + limite per indirizzo + KV), `api/marketplace/admin/[action].js` (pannello: elenco, analisi, approvazione, rifiuto; ogni richiesta verifica il token di **Cloudflare Access** in `_lib/access.js` e che l'email sia `ADMIN_EMAIL`), `api/license/*` (Notaio: attiva, rinnova, disattiva; `_lib/notary.js`). L'approvazione apre una **pull request** nel registry (`_lib/github.js`): la CI `validate` è il cancello, mai un commit diretto su `main`. Istruzioni per il fondatore, variabili d'ambiente e prove: `MARKETPLACE_SETUP.md`. Il pannello (`src/admin.mjs`, `src/admin-client.js`) è **solo in italiano** (strumento interno), non indicizzato, e scrive ogni dato di terzi con `textContent`, mai come HTML.
- **Mai segreti nel repo né nei log**: `.dev.vars` è ignorato da Git; il Notaio non scrive nei registri (le richieste contengono chiavi di licenza); nessun dato di chi propone (email) finisce in GitHub, che è pubblico. Dopo ogni modifica a `functions/` o `src/submission.js`: `pnpm test` (tutti i file in `test/`) e `pnpm exec prettier --check .`.
- **Il controllo di una proposta sta in `src/submission.js`** ed è lo stesso per la pagina e per la funzione `api/marketplace/submit` (che non si fida mai della pagina). Il campo `company` è una trappola per i programmi: resta vuoto per le persone.
- **Prezzi**: il programma e ciò che è essenziale restano gratuiti; in futuro alcuni plugin
  avanzati potrebbero avere un prezzo contenuto. Non promettere altro.
- **Animazioni**: ogni sezione ha un suo ingresso (`data-reveal`, gruppi `data-stagger`) e alcune
  parti seguono lo scorrimento (`data-scene`, `data-parallax`, linea sotto la barra). Tutto è
  spento con le animazioni ridotte e senza script la pagina è completa (`src/motion-flag.js`).
  Su schermi stretti nessun ingresso laterale.
- **Due lingue**, italiano e inglese, con le stesse voci. I termini inglesi comuni (download,
  plugin, streaming, live, open source, background…) restano in inglese anche in italiano.
- **L'inglese è tutto in inglese**: schermate comprese. Le serie sono due
  (`src/assets/shots/` e `src/assets/shots/en/`), fatte dal programma nelle due lingue con uno
  show nella stessa lingua. Le note di versione arrivano già nelle due lingue: nel testo pubblicato
  una riga `---` divide l'italiano (prima) dall'inglese.
- **Tono**: sicuro ma mai arrogante; niente confronti, niente superlativi.
- **Telefono in verticale**: ogni modifica va guardata anche a 400 px di larghezza.
- Il sito dice «plugin»; il programma dice «moduli». Le note di versione arrivano dal
  programma così come sono.
- `main` solo versioni con tag; il lavoro su `dev`. Prima di salvare: `pnpm test` e
  `pnpm exec prettier --check .`.
