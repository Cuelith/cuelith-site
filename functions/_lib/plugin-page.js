import catalog from "../../src/data/plugins.json" with { type: "json" };
import en from "../../src/content/en.json" with { type: "json" };
import it from "../../src/content/it.json" with { type: "json" };
import { renderPluginDetail, renderPluginNotFound } from "../../src/market.mjs";
import { document } from "../../src/page.mjs";
import { pluginList } from "../../src/shared.js";
import { loadModules, loadSupport } from "./sources.js";

// La scheda di un plugin del marketplace (/marketplace/<id>/ e /en/marketplace/<id>/):
// si disegna al momento con i dati del catalogo, cosi' un plugin appena pubblicato ha
// la sua pagina senza ricostruire il sito. Stile e collegamenti si leggono dal file
// assets/manifest.json che scrive la costruzione (i nomi degli stili cambiano a ogni versione).

/** Identificatore di un plugin (come nel protocollo): le pagine fisse (submit, condizioni...) non lo sono. */
export const PLUGIN_ID = /^[a-z0-9]+(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;

const html = (body, status, cache) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
    },
  });

async function readAssets(context, lang) {
  try {
    const response = await context.env.ASSETS.fetch(
      new URL("/assets/manifest.json", context.request.url),
    );
    if (!response.ok) return undefined;
    const manifest = await response.json();
    return {
      logo: manifest.logo,
      icon: manifest.icon,
      social: manifest.social[lang],
      styles: manifest.styles,
      script: manifest.script ?? "",
    };
  } catch {
    return undefined;
  }
}

export async function pluginPage(context, lang) {
  const raw = context.params.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  // Qualsiasi altra pagina sotto /marketplace/ (proposta, condizioni, acquisto) resta com'e'.
  if (typeof id !== "string" || !PLUGIN_ID.test(id)) return context.next();

  const content = lang === "en" ? en : it;
  const assets = await readAssets(context, lang);
  if (assets === undefined) return html("Not available", 503, "no-store");

  const modules = await loadModules();
  if (modules === undefined) {
    // Il catalogo non risponde: meglio dirlo che far credere che il plugin non esista.
    return html("Marketplace unavailable", 503, "no-store");
  }
  const found = pluginList(modules, catalog, lang).find(
    (p) => p.id === id && p.status === "available",
  );
  const plugin = found === undefined ? undefined : { ...found, support: (await loadSupport())[id] };
  if (plugin === undefined) {
    return html(document(renderPluginNotFound({ content, id, assets }), lang), 404, "no-store");
  }
  return html(
    document(renderPluginDetail({ content, plugin, assets }), lang),
    200,
    "public, max-age=300",
  );
}
