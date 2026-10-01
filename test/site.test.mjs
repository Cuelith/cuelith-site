// La pagina, costruita con l'ultima copia dei dati: completa nelle due lingue,
// senza nominare da dove arrivano i file e senza collegamenti verso l'esterno.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { document, renderPage } from "../src/page.mjs";
import { pluginList } from "../src/shared.js";

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

const page = (lang) => {
  const content = json(`content/${lang}.json`);
  return document(renderPage({ content, ...snapshot, catalog, shots, assets }), lang);
};

for (const lang of ["it", "en"]) {
  test(`la pagina ${lang} non mostra da dove arrivano i file`, () => {
    const html = page(lang);
    assert.doesNotMatch(html, /github/i);
    // Gli unici indirizzi completi sono quelli del sito stesso.
    const external = [...html.matchAll(/https?:\/\/[^"'\s<)]+/g)]
      .map((match) => match[0])
      .filter((url) => !url.startsWith("https://cuelith.lzrhive.it"));
    assert.deepEqual(external, []);
  });

  test(`la pagina ${lang} ha download, versioni e plugin`, () => {
    const html = page(lang);
    for (const href of ["/download/windows", "/download/linux", "/download/source"]) {
      assert.ok(html.includes(`href="${href}"`), href);
    }
    const latest = snapshot.releases[0].version;
    assert.ok(html.includes(`/download/${latest}/windows`));
    assert.ok(html.includes('class="roadmap__group" data-group="audio"'));
    assert.ok(html.includes('<li class="plugin" data-group='));
  });
}

test("le due lingue hanno le stesse voci", () => {
  // Note e domande possono essere di piu' in una lingua (l'inglese avvisa che
  // l'interfaccia e' ancora in italiano): li' conta solo che la voce esista.
  const free = new Set([".download.notes", ".faq.items"]);
  const keys = (value, prefix = "") =>
    value !== null && typeof value === "object" && !free.has(prefix)
      ? Object.entries(value).flatMap(([key, inner]) => keys(inner, `${prefix}.${key}`))
      : [prefix];
  assert.deepEqual(keys(json("content/en.json")), keys(json("content/it.json")));
});

test("ogni plugin del catalogo ha nome e testo nelle due lingue e un gruppo noto", () => {
  const groups = Object.keys(json("content/it.json").plugins.filters);
  for (const lang of ["it", "en"]) {
    for (const plugin of pluginList(snapshot.modules, catalog, lang)) {
      assert.ok(plugin.name.length > 0 && plugin.text.length > 0, plugin.id);
      assert.ok(groups.includes(plugin.group), `${plugin.id}: ${plugin.group}`);
    }
  }
  for (const item of catalog.items) {
    assert.ok(item.name.en && item.name.it && item.text.en && item.text.it, item.id);
  }
});
