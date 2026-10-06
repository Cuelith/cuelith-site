import { pluginPage } from "../../_lib/plugin-page.js";

// /en/marketplace/<id>/: la scheda di un plugin, in inglese.
export const onRequestGet = (context) => pluginPage(context, "en");
