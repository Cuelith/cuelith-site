// La struttura del sito: home breve e cinque pagine (funzioni, plugin, download,
// domande, contatti), con lo stesso menu, lo stesso piede e i vecchi collegamenti
// (/#download, /#funzioni...) che portano alla pagina giusta.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import {
  document,
  PAGE_PATHS,
  renderContact,
  renderDownload,
  renderFaq,
  renderFeatures,
  renderHome,
  renderPlugins,
} from "../src/page.mjs";

const json = (file) => JSON.parse(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"));
const snapshot = json("data/snapshot.json");
const catalog = json("data/plugins.json");
const image = {
  width: 1600,
  height: 900,
  files: [{ src: "/assets/shots/x-900.webp", width: 900 }],
};
const shots = Object.fromEntries(
  ["regia", "uscita-sala", "uscita-palco", "band", "telecomando", "risorse"].map((name) => [
    name,
    image,
  ]),
);
const assets = {
  logo: "/logo.png",
  icon: "/icon.svg",
  social: "/social.jpg",
  styles: "",
  script: "",
};
const CONTACT = "contatto@example.org";

const RENDER = {
  features: renderFeatures,
  plugins: renderPlugins,
  download: renderDownload,
  faq: renderFaq,
  contact: renderContact,
};
const input = (lang, extra = {}) => ({
  content: json(`content/${lang}.json`),
  ...snapshot,
  catalog,
  shots,
  assets,
  contact: CONTACT,
  ...extra,
});
const page = (key, lang, extra) =>
  document(key === "home" ? renderHome(input(lang, extra)) : RENDER[key](input(lang, extra)), lang);
const KEYS = ["home", ...Object.keys(PAGE_PATHS)];

for (const lang of ["it", "en"]) {
  test(`${lang}: ogni pagina ha un solo h1, i suoi indirizzi nelle due lingue e il menu`, () => {
    for (const key of KEYS) {
      const html = page(key, lang);
      assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, `${key}: un solo h1`);
      assert.match(html, new RegExp(`<html lang="${lang}">`));
      const self = key === "home" ? (lang === "it" ? "/" : "/en/") : PAGE_PATHS[key][lang];
      const alt = key === "home" ? { it: "/", en: "/en/" } : PAGE_PATHS[key];
      assert.ok(
        html.includes(`<link rel="canonical" href="https://cuelith.lzrhive.it${self}">`),
        `${key}: canonico`,
      );
      assert.ok(
        html.includes(`hreflang="it" href="https://cuelith.lzrhive.it${alt.it}"`),
        `${key}: it`,
      );
      assert.ok(
        html.includes(`hreflang="en" href="https://cuelith.lzrhive.it${alt.en}"`),
        `${key}: en`,
      );
      // Menu in linea e menu a pulsante (telefono): stesse voci, Download e Contatti nel secondo.
      for (const to of [PAGE_PATHS.features, PAGE_PATHS.plugins, PAGE_PATHS.faq].map(
        (p) => p[lang],
      )) {
        assert.ok(
          (html.match(new RegExp(`href="${to}"`, "g")) ?? []).length >= 2,
          `${key}: ${to} nel menu`,
        );
      }
      assert.ok(html.includes('<details class="menu">'), `${key}: menu a pulsante`);
      assert.ok(html.includes(`href="${PAGE_PATHS.contact[lang]}"`), `${key}: contatti`);
      assert.ok(html.includes(`href="${PAGE_PATHS.download[lang]}"`), `${key}: download`);
      // La voce della pagina in lettura e' segnata (la home non ne ha).
      const marked = [...html.matchAll(/href="([^"]+)" aria-current="page"/g)].map((m) => m[1]);
      if (key === "home") assert.deepEqual(marked, []);
      else
        assert.ok(
          marked.includes(PAGE_PATHS[key][lang]) || key === "contact",
          `${key}: voce attiva`,
        );
    }
  });

  test(`${lang}: la home e' breve e porta alle altre pagine`, () => {
    const html = page("home", lang);
    // Niente piu' versioni, domande o elenco dei plugin tutti nella stessa pagina.
    assert.doesNotMatch(html, /id="versioni"|data-versions|data-plugins|<details data-reveal/);
    assert.doesNotMatch(html, /id="funzioni"|id="domande"|id="download"/);
    const doors = [...html.matchAll(/<a class="door" href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(
      doors,
      ["features", "plugins", "download", "faq"].map((k) => PAGE_PATHS[k][lang]),
    );
    // Il pulsante di download della home resta (il sistema di chi guarda lo sceglie lo script).
    assert.ok(html.includes('href="/download/windows" data-download'));
    assert.ok(html.length < 40000, `home ${String(html.length)} byte`);
  });

  test(`${lang}: download, plugin, funzioni e domande hanno i loro contenuti`, () => {
    const download = page("download", lang);
    for (const href of ["/download/windows", "/download/linux", "/download/source"]) {
      assert.ok(download.includes(`href="${href}"`), href);
    }
    assert.ok(download.includes(`/download/${snapshot.releases[0].version}/windows`));
    assert.match(download, /id="versioni"/);
    assert.match(download, /data-versions/);

    const plugins = page("plugins", lang);
    assert.ok(plugins.includes('class="roadmap__group" data-group="audio"'));
    assert.ok(plugins.includes('<li class="plugin" data-group='));
    assert.ok(plugins.includes(`href="${lang === "it" ? "/marketplace/" : "/en/marketplace/"}"`));

    const features = page("features", lang);
    const content = json(`content/${lang}.json`);
    for (const row of content.features.rows)
      assert.ok(
        features.includes(row.title.replace(/'/g, "&#39;")) || features.includes(row.title),
        row.title,
      );
    assert.equal(
      (features.match(/<article class="feature/g) ?? []).length,
      content.features.rows.length,
    );
    assert.equal(
      (features.match(/class="badge badge--/g) ?? []).length,
      content.audience.items.length,
    );
  });

  test(`${lang}: le domande stanno a gruppi, ognuna una sola volta`, () => {
    const content = json(`content/${lang}.json`);
    const all = content.faq.groups.flatMap((g) => g.items).sort((a, b) => a - b);
    assert.deepEqual(
      all,
      content.faq.items.map((_, i) => i),
      "ogni domanda in un gruppo, una volta",
    );
    const html = page("faq", lang);
    assert.equal((html.match(/<details data-reveal/g) ?? []).length, content.faq.items.length);
    assert.equal((html.match(/class="faq-group__title"/g) ?? []).length, content.faq.groups.length);
    // Le risposte non promettono piu' una commissione ne' parlano di plugin a pagamento come "futuro".
    assert.doesNotMatch(
      html,
      /commission(e|s) (del|of) 10|programma affiliati|affiliate programme/i,
    );
  });

  test(`${lang}: contatti: indirizzo in chiaro, cliccabile, fuori dall'offuscamento di Cloudflare`, () => {
    const html = page("contact", lang);
    assert.ok(
      html.includes(
        `<!--email_off--><a class="link" href="mailto:${CONTACT}">${CONTACT}</a><!--/email_off-->`,
      ),
    );
    assert.equal(
      (html.match(new RegExp(`mailto:${CONTACT}`, "g")) ?? []).length,
      1 +
        json(`content/${lang}.json`).contact.items.filter((i) => i.text.includes("{contact}"))
          .length,
    );
    assert.doesNotMatch(html, /\{contact\}/);
    // Senza indirizzo la pagina lo dice (non mostra un buco).
    const empty = page("contact", lang, { contact: "" });
    assert.ok(empty.includes(json(`content/${lang}.json`).footer.noContact));
    assert.doesNotMatch(empty, /mailto:/);
    // La pagina non nomina da dove arrivano i file.
    assert.doesNotMatch(html, /github/i);
  });
}

test("ogni pagina ha titolo e descrizione nelle due lingue, e il menu ha i suoi testi", () => {
  for (const lang of ["it", "en"]) {
    const content = json(`content/${lang}.json`);
    for (const key of Object.keys(PAGE_PATHS)) {
      const meta = content.pages[key]?.meta;
      assert.ok(meta?.title?.length > 5 && meta?.description?.length > 20, `${lang} ${key}`);
    }
    for (const key of [
      "features",
      "plugins",
      "marketplace",
      "faq",
      "download",
      "contact",
      "menu",
      "skip",
    ]) {
      assert.ok(content.nav[key]?.length > 0, `${lang} nav.${key}`);
    }
    assert.ok(content.footer.contact.length > 0 && content.cta.more.length > 0);
    assert.equal(content.doors.items.length, 4);
    assert.ok(content.doors.items.every((d) => d.key in PAGE_PATHS));
  }
});

test("i vecchi collegamenti (/#download, /#funzioni...) portano alla pagina che ora ha quella parte", () => {
  const source = readFileSync(new URL("../src/motion-flag.js", import.meta.url), "utf8");
  const run = (pathname, hash) => {
    const calls = [];
    const sandbox = {
      location: { pathname, hash, replace: (to) => calls.push(to) },
      document: { documentElement: { classList: { add() {}, remove() {} } } },
      window: { matchMedia: () => ({ matches: true }) },
      setTimeout() {},
    };
    sandbox.window.location = sandbox.location;
    vm.runInNewContext(source, sandbox);
    return calls;
  };
  const expected = {
    download: "download",
    versioni: "download",
    funzioni: "features",
    plugin: "plugins",
    domande: "faq",
  };
  for (const [hash, key] of Object.entries(expected)) {
    for (const [lang, pathname] of [
      ["it", "/"],
      ["en", "/en/"],
    ]) {
      const [target] = run(pathname, `#${hash}`);
      assert.ok(target?.startsWith(PAGE_PATHS[key][lang]), `${lang} #${hash} -> ${String(target)}`);
    }
  }
  // Una pagina che non e' la home, o un'ancora sconosciuta, non si sposta.
  assert.deepEqual(run("/scarica/", "#download"), []);
  assert.deepEqual(run("/", "#boh"), []);
  assert.deepEqual(run("/", ""), []);
});

test("il sito non ha due pagine allo stesso indirizzo, ne' in conflitto con le funzioni /download/*", () => {
  const all = Object.values(PAGE_PATHS).flatMap((p) => [p.it, p.en]);
  assert.equal(new Set(all).size, all.length);
  for (const path of all) {
    assert.ok(path.startsWith("/") && path.endsWith("/"), path);
    assert.ok(!path.startsWith("/download/"), `${path} e' sotto /download/, che e' una funzione`);
    assert.ok(!path.startsWith("/api/") && !path.startsWith("/marketplace/"), path);
  }
});
