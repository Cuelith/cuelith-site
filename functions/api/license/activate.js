import { activateLicense } from "../../_lib/notary.js";
import { licenseHandler } from "../../_lib/license-handler.js";

export const { onRequestPost, onRequest } = licenseHandler((input, env) =>
  activateLicense(input, env),
);
