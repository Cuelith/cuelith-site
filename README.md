# cuelith-site

Il sito di Cuelith: presentazione, download, versioni e plugin, in italiano e in inglese.

Pagine statiche costruite da `build.mjs`, più poche funzioni che passano al visitatore i file
e i dati pubblicati altrove, senza mostrarne l'origine:

- `/download/windows`, `/download/linux` — l'installatore più recente
- `/download/<versione>/<sistema>` — una versione precisa
- `/download/source` — il codice sorgente (zip)
- `/api/releases`, `/api/modules` — versioni e plugin del momento, per aggiornare la pagina

## Lavorare

```
pnpm install
pnpm dev            # costruisce e serve in locale, funzioni comprese (porta 8788)
pnpm test           # prove delle funzioni e della pagina
pnpm build:preview  # in più, un'anteprima in un file solo (dist-single/)
pnpm shots          # copia le schermate fatte dal programma vero (vedi sotto)
```

Per guardare la pagina a ogni larghezza, con `pnpm dev` acceso:
`node scripts/foto.mjs http://127.0.0.1:8788/ <cartella> 400 800 telefono 0.6` (usa il browser di
prova del repo affiancato `cuelith-core`; l'ultimo numero è il passo tra una foto e l'altra).

Le schermate vengono dal programma in esecuzione, mai ritoccate: nel repo affiancato
`cuelith-core`, `pnpm build` e poi `pnpm -C e2e run site:shots`; qui `pnpm shots`.

## Dove sta cosa

- `src/content/it.json`, `src/content/en.json` — tutti i testi della pagina
- `src/data/plugins.json` — i plugin presentati oltre a quelli del marketplace (inclusi e in arrivo)
- `src/page.mjs`, `src/shared.js`, `src/styles.css`, `src/app.js` — la pagina
- `functions/` — download e dati

## Pubblicare

`pnpm deploy:dev` per l'anteprima, `pnpm deploy` per il sito. Come negli altri repo di Cuelith,
`main` riceve solo versioni con tag; il lavoro va su `dev`.

Licenza Apache 2.0 per il codice di questo sito. Il programma Cuelith è GPL 3.0 o successiva (vedi `cuelith-core` e la decisione 0012 in `cuelith-docs`): il piè di pagina e i dati strutturati del sito dicono GPL 3.0.
