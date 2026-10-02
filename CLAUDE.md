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
- **Contenuti dimostrativi neutri.** Cuelith è un software generale: nelle schermate niente testi
  religiosi o legati a un solo tipo di pubblico (lo show d'esempio è una serata con canzoni
  originali). Chiese e comunità sono uno dei pubblici, non l'unico né il primo.
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
