import { build, emptyDir } from "https://deno.land/x/dnt@0.30.0/mod.ts";
import packageInfo from "./package.json" assert { type: "json" };

function currentPath(path: string): string {
  return new URL(path, import.meta.url).pathname;
}

await emptyDir(currentPath("./dist"));

//** NPM ES Module for Node.js and Browser */

await build({
  entryPoints: [currentPath("./mod.ts")],
  outDir: currentPath("./dist"),
  test: false,
  scriptModule: false,
  typeCheck: false,
  shims: {},
  package: {
    ...packageInfo,
    engines: {
      node: ">=14",
    },
    main: "./esm/mod.js",
    type: "module",
  },
  mappings: {
    "https://deno.land/x/lucid@0.10.2/mod.ts": {
      name: "lucid-cardano",
      version: ">=0.9.4 <=0.10.2",
      peerDependency: true,
    },
  },
});

Deno.copyFileSync(currentPath("../../LICENSE"), currentPath("dist/LICENSE"));
Deno.copyFileSync(currentPath("README.md"), currentPath("dist/README.md"));
