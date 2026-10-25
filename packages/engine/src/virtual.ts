import type { Plugin } from "vite";
import type { LoadedSite } from "./load";

const modules = {
  "virtual:site": "\0virtual:site",
  "virtual:niche": "\0virtual:niche",
  "virtual:content": "\0virtual:content",
  "virtual:copy": "\0virtual:copy",
  "virtual:site-assets": "\0virtual:site-assets",
} as const;

/** Exposes the loaded site, niche, content, copy and image imports to pages and components. */
export function virtualModulesPlugin(loaded: LoadedSite): Plugin {
  return {
    name: "lead-gen:virtual",
    resolveId(source) {
      return source in modules ? modules[source as keyof typeof modules] : undefined;
    },
    load(id) {
      switch (id) {
        case modules["virtual:site"]:
          return `export default ${JSON.stringify(loaded.site)};`;
        case modules["virtual:niche"]:
          return `export default ${JSON.stringify(loaded.niche)};`;
        case modules["virtual:content"]:
          return [
            `export const services = ${JSON.stringify(loaded.services)};`,
            "export function getService(slug) { return services.find((service) => service.slug === slug); }",
          ].join("\n");
        case modules["virtual:copy"]:
          return `export default ${JSON.stringify(loaded.copy)};`;
        case modules["virtual:site-assets"]: {
          const entries = Object.entries(loaded.assetPaths);
          return [
            ...entries.map(([slot, path], index) => `import asset${index} from ${JSON.stringify(path)};`),
            `export default { ${entries.map(([slot], index) => `${JSON.stringify(slot)}: asset${index}`).join(", ")} };`,
          ].join("\n");
        }
        default:
          return undefined;
      }
    },
  };
}
