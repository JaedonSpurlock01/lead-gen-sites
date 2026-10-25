# lead-gen-sites

This repo holds all of the lead-gen sites, grouped by niche. Each site has its own domain and its own Cloudflare Worker. Every lead goes to Tracer.

- `niches/<niche>/sites/<site>/` holds one site's data: `site.json`, its pages, and its images.
- `niches/<niche>/` holds what a niche shares: its design, pages, copy, and AI prompts.
- `packages/` holds the shared code: the engine, UI parts, the lead handler, schemas, and the CLI.
- `config/` holds settings that apply to every site.

`CLAUDE.md` explains the rules for working in the repo.

## Niches

| Niche | Pages are written as |
| --- | --- |
| `asphalt-paving` | Markdown files in `content/services/` |
| `dumpster-rental` | YAML block pages in `content/pages/` and `content/services/` |
| `solar-installation` | YAML block pages in `content/pages/` and `content/services/` |

Each niche has its own look. Block pages are built from a fixed set of section types, such as prose, cards, steps and FAQ. They are listed in `packages/schema/src/blocks.ts`.

## Commands

A target is a site id, a niche id, `niche/site`, a comma-separated list, or `all`.

| Command | What it does |
| --- | --- |
| `pnpm new-site <niche> <id> --domain <apex>` | Creates a site from the niche's `_template` |
| `pnpm check [target]` | Checks data, content, images, domains and links |
| `pnpm build [target]` | Builds into `dist/<id>/` and skips sites that did not change |
| `pnpm verify-local [target]` | Runs the site under `wrangler dev` with a fake Tracer |
| `pnpm run deploy <target>` | Shows the deploy plan. Add `--apply` to deploy |
| `pnpm domains provision [target]` | Shows the Cloudflare setup plan. Add `--apply` to make the changes |
| `pnpm domains check [target]` | Checks the zone, certificate, Worker, home page and www redirect |
| `pnpm secrets rotate <NAME>` | Sets a Worker secret on every site (the backup plan). Add `--apply` |

Nothing writes to Cloudflare without `--apply`.

Always type `pnpm run deploy`. If you add a flag to plain `pnpm deploy`, pnpm runs its own built-in deploy command instead of ours.

The `domains` commands need `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your shell.

## Add a site

1. **Buy the domain** in Cloudflare Registrar. Do this by hand. **Turn on auto-renew.** It is off by default, and renewals cannot be managed through the API yet.
2. **Create the site.** Ask Claude Code to build it. The `new-site` skill runs every step below and opens a pull request. To do it by hand, run:
   ```
   pnpm new-site asphalt-paving twin-falls --domain twinfallsasphaltpaving.com --city "Twin Falls"
   ```
3. **Write the content.** Fill in `site.json`. Use the niche's `prompts/` to research the city, then rewrite every page in `content/`. Add photos to `assets/`. Run `pnpm check twin-falls` until it passes. It fails while any template text is left.
4. **Set up Cloudflare.** Run `pnpm domains provision twin-falls` and read the plan. Then run it again with `--apply`, and set the nameservers it prints at the registrar.
5. **Deploy.** Merge the pull request, and CI deploys the site. You can also run `pnpm run deploy twin-falls --apply`.
6. **Check it.** Run `pnpm domains check twin-falls`. A new zone can take a while to go active, so re-run it until it passes. Then send one test lead from the contact form.

## Add a niche

1. Copy the template: `cp -R niches/_template niches/roofing`.
2. In `niche.json`, set the `id`, `name`, `schemaOrgType`, services, image slots, market fields and theme colors. Rename the package in `package.json` to `@niche/roofing`.
3. Set the lead form in `niche.json` under `form`. Give each field its name, the label Tracer receives, and its rules.
4. Replace every `TEMPLATE` line in `copy/shared.yaml`. Rewrite the files in `prompts/` for this trade.
5. Change `pages/` and `components/` to give the niche its own design. Code that only this niche uses stays in the niche. If the pages are mostly copy, use block pages like `dumpster-rental` does: set `pages`, `serviceContent: "blocks"` and `blocks` in `niche.json`.
6. Update `sites/_template/` so new sites start with the right services and images.
7. Run `pnpm install`. Then add the first site with `pnpm new-site roofing <id> --domain <apex>`.

## Rotate the Tracer key

Every site reads `TRACER_FORM_KEY` from one secret in the Cloudflare Secrets Store, so you change it in one place.

Tracer keeps only one key. Making a new one turns the old one off right away, so forms fail until the new key is in place. Keep that gap short:

1. Pick a quiet time.
2. Find the secret id, and get the update command ready:
   ```
   pnpm wrangler secrets-store secret list <STORE_ID> --remote
   pnpm wrangler secrets-store secret update <STORE_ID> --secret-id <ID> --remote
   ```
   Wrangler asks for the value. Do not use `--value`.
3. Generate the new key, and paste it into the waiting command right away.
4. Send a test lead from one site, and confirm it arrives. If it fails, run `pnpm run deploy all --apply` once. The docs do not say whether running Workers pick up a new value without a redeploy. A redeploy is always safe.

A visitor who submits during the gap sees a message asking them to try again or call.

**Backup plan.** If the Secrets Store cannot be used, set the key as a normal secret on every Worker:

```
pbpaste | pnpm secrets rotate TRACER_FORM_KEY --apply
```

It reads the key from stdin only and never prints it. It works in batches, and it waits when Cloudflare rate-limits it. Run it again with `--retry-failed` to redo only the sites that failed. The lead handler accepts either kind of key, so you can switch between the two plans.

To undo a bad deploy, run `pnpm wrangler rollback --name <worker>`.

## CI setup

Add these GitHub repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_READ_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Create a GitHub environment named `production`. Add a required reviewer to it if you want to approve each deploy.

| Workflow | When it runs | What it does |
| --- | --- | --- |
| CI | Pull requests | Check, typecheck, tests, and a build of the sites the PR changes |
| Deploy | Pushes to `main`, or by hand | `pnpm run deploy <changed sites> --apply` |
| Nightly | Every day | `pnpm domains check all`, which is read-only |

What a change deploys:
- A change in `packages/` or `config/` deploys every site.
- A change in a niche outside `sites/` deploys that niche.
- A change in a site's folder deploys that site.

These rules live in `packages/cli/src/affected.ts`.

### Token permissions

**Deploy and provision token** (`CLOUDFLARE_API_TOKEN`):

| Scope | Permission | Why |
| --- | --- | --- |
| Account | Workers Scripts: Edit | Deploy Workers and set Worker secrets |
| Account | Account Secrets Store: Edit | Deploy a Worker that uses the Secrets Store |
| Zone (all zones) | Workers Routes: Edit | Attach each site's domain when deploying |
| Zone (all zones) | Zone: Edit | Create zones |
| Zone (all zones) | Zone Settings: Edit | SSL mode, Always Use HTTPS, TLS versions |
| Zone (all zones) | DNS: Edit | The `www` record |
| Zone (all zones) | Single Redirect: Edit | The www-to-apex redirect |
| Zone (all zones) | SSL and Certificates: Read | Certificate checks |

Creating a new Worker needs Workers access for the whole account, not one Worker. Grant the zone permissions for **all zones**, so new domains work without editing the token.

**Read-only token** (`CLOUDFLARE_READ_API_TOKEN`, for the nightly check): Zone: Read, SSL and Certificates: Read, and Workers Scripts: Read.

## Tracer

The sites need only two things from Tracer: the forms URL in `config/environments.json`, and the Forms key in the Secrets Store. Each lead is one POST. If Tracer answers with an error, the visitor sees the send error. Everything else happens in Tracer.

To get mail sent to `info@` yourself, use Email Routing and forward every site to **one** inbox. An account can have at most 200 verified destination addresses.

## Good to know

- **One domain, one Worker.** A domain can be attached to only one Worker. To move a domain to a new Worker, remove it from the old one first, then deploy right away.
- **Domain buying stays manual.** The Registrar API is in beta, supports only some top-level domains, and turns auto-renew off by default.
- **Scale.** The Workers Paid plan allows 500 Workers per account, and Tracer counts toward that limit. `pnpm check` warns at 400. Past that, the next step is Workers for Platforms.
