import { pluginPage } from "../_lib/plugin-page.js";

// /marketplace/<id>/: la scheda di un plugin (le altre pagine di /marketplace/ passano oltre).
export const onRequestGet = (context) => pluginPage(context, "it");
