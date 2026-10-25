# Niche template

Copy this folder to start a niche. The root README's "Adding a niche" section has the full steps; in short:

1. `cp -R niches/_template niches/<niche-id>` and set `id`, `name`, `schemaOrgType`, `services`, `imageSlots`, `marketFields` and `theme` in `niche.json`. Rename the package in `package.json` to `@niche/<niche-id>`.
2. Replace every `TEMPLATE` line in `copy/shared.yaml` and adapt each file in `prompts/` to the trade.
3. Replace the placeholder images in `assets/` and adjust `sites/_template/` (site.json service options, one content file per service).
4. Add niche-only sections under `components/` and order them through `layout.sections`.
5. `pnpm install`, then `pnpm new-site <niche-id> <site-id> --domain <apex>` for the first site.

Folders starting with `_` are never built or deployed.
