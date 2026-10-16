// Lets Node resolve "@internals/<path>" to a file in the skill, the same specifier the built page's import map
// and the dev server understand, so a figure anywhere on disk can import skill modules without fragile ../../.
// ("@internals/" is an internal name kept from before the skill was called Explainer.)
// Node 22.15+ has synchronous module.registerHooks; older Node (20.10+) gets the same resolver through
// module.register, which runs it on the loader thread.
import * as nodeModule from "node:module";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
let done = false;

export function installInternalsResolver() {
  if (done) return;
  done = true;
  if (typeof nodeModule.registerHooks === "function") {
    nodeModule.registerHooks({
      resolve(spec, ctx, next) {
        if (spec.startsWith("@internals/") && spec !== "@internals/figure") return { url: pathToFileURL(join(skillRoot, spec.slice(11))).href, shortCircuit: true };
        return next(spec, ctx);
      },
    });
  } else if (typeof nodeModule.register === "function") {
    const base = pathToFileURL(skillRoot).href.replace(/\/?$/, "/");
    const loader = `export async function resolve(spec, ctx, next) {
  if (spec.startsWith("@internals/") && spec !== "@internals/figure") return { url: new URL(spec.slice(11), ${JSON.stringify(base)}).href, shortCircuit: true };
  return next(spec, ctx);
}`;
    nodeModule.register("data:text/javascript," + encodeURIComponent(loader));
  }
}
installInternalsResolver();
