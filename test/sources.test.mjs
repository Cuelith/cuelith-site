import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanNotes,
  parseLatest,
  parseReleases,
  PLATFORMS,
  publicModules,
  splitNotes,
  VERSION,
} from "../functions/_lib/sources.js";
import { versionList } from "../src/shared.js";
import { onRequestGet as download } from "../functions/download/[[path]].js";

test("la versione piu' recente si legge dal file del rilascio", () => {
  assert.equal(parseLatest("version: 0.1.0\nfiles:\n  - url: Cuelith-Setup-0.1.0.exe\n"), "0.1.0");
  assert.equal(parseLatest("version: '1.2.3-beta.1'\n"), "1.2.3-beta.1");
  assert.equal(parseLatest("version: ../../etc\n"), undefined);
  assert.equal(parseLatest("niente"), undefined);
});

test("i nomi dei file seguono la versione", () => {
  assert.equal(PLATFORMS.windows.file("0.1.0"), "Cuelith-Setup-0.1.0.exe");
  assert.equal(PLATFORMS.linux.file("0.1.0"), "Cuelith-0.1.0-x86_64.AppImage");
  assert.ok(VERSION.test("10.20.30"));
  assert.ok(!VERSION.test("1.0"));
  assert.ok(!VERSION.test("1.0.0/../x"));
});

test("le note di versione restano solo testo, elenchi e titoli", () => {
  const dirty =
    '<h2 class="x">Novità</h2><p onclick="x()">Testo <a href="https://github.com/a">con link</a> e <strong>grassetto</strong></p>' +
    '<script>alert(1)</script><img src="x"><ul><li>Uno</li></ul>';
  assert.equal(
    cleanNotes(dirty),
    "<h2>Novità</h2><p>Testo con link e <strong>grassetto</strong></p><ul><li>Uno</li></ul>",
  );
});

test("l'elenco delle versioni: numero, data, note; il resto (anche un tag senza release) si scarta", () => {
  const feed = `<feed>
<entry><id>x</id><updated>2026-10-01T22:15:49Z</updated>
<link rel="alternate" type="text/html" href="https://github.com/Cuelith/cuelith-core/releases/tag/v0.1.0"/>
<title>Cuelith 0.1.0</title><content type="html">&lt;p&gt;Prima &lt;a href=&quot;https://x&quot;&gt;versione&lt;/a&gt;&lt;/p&gt;</content></entry>
<entry><updated>2026-10-02T08:13:12Z</updated><link rel="alternate" type="text/html" href="https://github.com/Cuelith/cuelith-core/releases/tag/v0.0.9"/><title>v0.0.9</title><content type="html">&lt;p&gt;Solo un tag&lt;/p&gt;</content></entry>
<entry><updated>2026-09-01T00:00:00Z</updated><link href="https://github.com/Cuelith/cuelith-core/releases/tag/vNONVALIDA"/><content>x</content></entry>
</feed>`;
  assert.deepEqual(parseReleases(feed), [
    { version: "0.1.0", date: "2026-10-01T22:15:49Z", notes: { it: "<p>Prima versione</p>" } },
  ]);
});

test("le note in due lingue: una riga di separazione divide l'italiano dall'inglese", () => {
  assert.deepEqual(splitNotes('<p>Novità</p><hr><p>What is <a href="x">new</a></p>'), {
    it: "<p>Novità</p>",
    en: "<p>What is new</p>",
  });
  assert.deepEqual(splitNotes("<p>Solo italiano</p>"), { it: "<p>Solo italiano</p>" });
  assert.deepEqual(splitNotes("<p>Solo italiano</p><hr />"), { it: "<p>Solo italiano</p>" });
  // La pagina inglese mostra l'inglese; se manca, l'italiano.
  const strings = { latest: "", windows: "", linux: "", notes: "" };
  const release = (notes) => [{ version: "1.0.0", date: "2026-10-01T00:00:00Z", notes }];
  assert.ok(
    versionList(release({ it: "<p>ciao</p>", en: "<p>hello</p>" }), strings, "en-GB").includes(
      "hello",
    ),
  );
  assert.ok(versionList(release({ it: "<p>ciao</p>" }), strings, "en-GB").includes("ciao"));
  assert.ok(
    versionList(release({ it: "<p>ciao</p>", en: "<p>hello</p>" }), strings, "it-IT").includes(
      "ciao",
    ),
  );
});

test("dei plugin escono solo i dati da mostrare, mai gli indirizzi dei pacchetti", () => {
  const modules = publicModules({
    plugins: [
      {
        id: "cuelith.songs",
        name: "Canti",
        description: "Canti con sezioni.",
        family: "function",
        verified: true,
        repository: "https://github.com/Cuelith/plugin-songs",
        icon: "data:image/svg+xml;base64,AAAA",
        versions: [
          {
            version: "0.4.2",
            url: "https://github.com/x.cpkg",
            permissions: [],
            published: "2026-10-01T22:10:41Z",
          },
        ],
      },
    ],
  });
  assert.equal(modules.length, 1);
  assert.equal(modules[0].version, "0.4.2");
  assert.ok(!JSON.stringify(modules).includes("github"));
  assert.deepEqual(publicModules(undefined), []);
});

test("download: solo percorsi previsti, mai indirizzi costruiti con testo libero", async () => {
  const original = globalThis.fetch;
  const asked = [];
  globalThis.fetch = (url) => {
    asked.push(String(url));
    if (String(url).endsWith("latest.yml"))
      return Promise.resolve(new Response("version: 0.1.0\n"));
    return Promise.resolve(new Response("dati", { headers: { "Content-Length": "4" } }));
  };
  try {
    const get = (...path) => download({ params: { path } });
    const latest = await get("windows");
    assert.equal(latest.status, 200);
    assert.equal(
      latest.headers.get("Content-Disposition"),
      'attachment; filename="Cuelith-Setup-0.1.0.exe"',
    );
    assert.ok(asked.at(-1).endsWith("/releases/download/v0.1.0/Cuelith-Setup-0.1.0.exe"));
    assert.equal(await latest.text(), "dati");

    const old = await get("0.0.9", "linux");
    assert.equal(
      old.headers.get("Content-Disposition"),
      'attachment; filename="Cuelith-0.0.9-x86_64.AppImage"',
    );
    const source = await get("source");
    assert.equal(
      source.headers.get("Content-Disposition"),
      'attachment; filename="cuelith-source.zip"',
    );

    for (const bad of [
      ["mac"],
      ["..", "windows"],
      ["1.0", "windows"],
      ["0.1.0", "windows", "x"],
      [],
    ]) {
      assert.equal((await get(...bad)).status, 404, bad.join("/"));
    }
  } finally {
    globalThis.fetch = original;
  }
});
