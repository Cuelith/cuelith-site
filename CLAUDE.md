# cuelith-site

Il sito di Cuelith (`cuelith.lzrhive.it`). Fonte di verità del progetto: `cuelith-docs`
(documento e decisioni). Leggi il `README.md` per comandi e struttura.

## Regole

- **Mai nominare altri programmi** del settore, né dire a cosa Cuelith si ispira. Formati aperti
  (OpenLyrics, ChordPro) e protocolli (NDI, ASIO, Dante, MIDI, OSC, DMX…) si possono nominare.
- **Non descrivere l'architettura** né le tecnologie usate: la pagina parla di cosa fa il
  programma per chi lo usa.
- **Il visitatore non vede da dove arrivano i file.** Download, versioni e plugin passano dalle
  funzioni del sito. Nessun collegamento esterno nella pagina: `test/site.test.mjs` lo verifica.
- **Niente funzioni finte.** Ciò che non esiste ancora sta solo in «In arrivo», senza date.
  I numeri in evidenza devono essere misure scritte in `cuelith-docs`.
- **Due lingue**, italiano e inglese, con le stesse voci. I termini inglesi comuni (download,
  plugin, streaming, live, open source, background…) restano in inglese anche in italiano.
- **Tono**: sicuro ma mai arrogante; niente confronti, niente superlativi.
- **Telefono in verticale**: ogni modifica va guardata anche a 400 px di larghezza.
- Il sito dice «plugin»; il programma dice «moduli». Le note di versione arrivano dal
  programma così come sono.
- `main` solo versioni con tag; il lavoro su `dev`. Prima di salvare: `pnpm test` e
  `pnpm exec prettier --check .`.
