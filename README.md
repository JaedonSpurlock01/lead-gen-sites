# lead-gen-sites

All of the lead-gen sites live in this repo, grouped by niche. Each site has its own domain and its own Cloudflare Worker. Leads from every site go to Tracer.

- `niches/<niche>/sites/<site>/` holds one site's data: `site.json`, Markdown pages, and images.
- `niches/<niche>/` holds what a niche shares: pages, sections, copy, and AI prompts.
- `packages/` holds the shared code: the engine, UI parts, the lead handler, schemas, and the CLI.
- `config/` holds settings that apply to every site.

`CLAUDE.md` explains the rules for working in the repo.

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

Nothing writes to Cloudflare without `--apply`. Always type `pnpm run deploy`. With a flag, plain `pnpm deploy` runs pnpm's own built-in deploy command instead of ours. The `domains` commands need `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your shell.

## Add a site

1. **Buy the domain** in Cloudflare Registrar. Do this by hand. **Turn on auto-renew.** It is off by default, and renewals cannot be managed through the API yet.
2. **Create the site.** Ask Claude Code to build it. The `new-site` skill runs every step below and opens a pull request. To do it by hand, run:
   ```
   pnpm new-site asphalt-paving twin-falls --domain twinfallsasphaltpaving.com --city "Twin Falls"
   ```
3. **Write the content.** Fill in `site.json`. Use the niche's `prompts/` to research the city and write each page in `content/services/`. Add photos to `assets/`. Run `pnpm check twin-falls` until it passes.
4. **Set up Cloudflare.** Run `pnpm domains provision twin-falls`, read the plan, then run it again with `--apply`. Set the nameservers it prints at the registrar.
5. **Deploy.** Merge the pull request and CI deploys the site. You can also run `pnpm run deploy twin-falls --apply`.
6. **Check it.** Run `pnpm domains check twin-falls`. A new zone can take a while to go active, so re-run until it passes. Then send one test lead from the contact form.

## Add a niche

1. Copy the template: `cp -R niches/_template niches/roofing`.
2. In `niche.json`, set the `id`, `name`, `schemaOrgType`, services, image slots, market fields and theme colors. Rename the package in `package.json` to `@niche/roofing`.
3. Replace every `TEMPLATE` line in `copy/shared.yaml`. Rewrite the files in `prompts/` for this trade.
4. Change the pages and sections in `pages/` and `components/` as needed. Code that only this niche uses stays in the niche. For a niche whose pages are mostly copy, use block pages like `dumpster-rental` and `solar-installation`: set `pages`, `serviceContent: "blocks"` and `blocks` in `niche.json`, and write each page as YAML.
5. Set the lead form in `niche.json` under `form`: each field's name, the label Tracer receives, and its rules.
6. Update `sites/_template/` so new sites start with the right services and images.
7. Run `pnpm install`, then add the first site with `pnpm new-site roofing <id> --domain <apex>`.

## Rotate the Tracer key

Every site reads `TRACER_FORM_KEY` from one secret in the Cloudflare Secrets Store. You change it in one place.

Tracer keeps only one key. Making a new one turns the old one off right away. Forms fail between those two moments, so keep the gap short:

1. Pick a quiet time.
2. Find the secret id and have the update command ready:
   ```
   pnpm wrangler secrets-store secret list <STORE_ID> --remote
   pnpm wrangler secrets-store secret update <STORE_ID> --secret-id <ID> --remote
   ```
   Wrangler asks for the value. Do not use `--value`.
3. Generate the new key, then paste it into the waiting command right away.
4. Send a test lead from one site and confirm it arrives.

A visitor who submits during the gap sees "We could not send that request. Try again in a few minutes or call us."

**Backup plan.** If the Secrets Store cannot be used, set the key as a normal secret on every Worker:

```
pbpaste | pnpm secrets rotate TRACER_FORM_KEY --apply
```

It reads the key from stdin only and never prints it. It works in batches and waits when Cloudflare rate-limits it. Run it again with `--retry-failed` to redo only the sites that failed. The lead handler accepts either form of the key, so you can switch between the two plans.

## First deploy of the three live sites

The sites keep their Worker names, so a deploy replaces each live Worker in place. That is the same as starting fresh, without any downtime for the apex.

1. **Create the secret** with your Forms key. Wrangler asks for the value:
   ```
   pnpm wrangler secrets-store store list --remote
   pnpm wrangler secrets-store secret create <STORE_ID> --name TRACER_FORM_KEY --scopes workers --remote
   ```
2. **Add the GitHub secrets** listed under [CI setup](#ci-setup).
3. **Set the store id.** Put it in `config/cloudflare.json` as `secretsStore.storeId`, then commit and push. CI deploys every site.
4. **Set up the zones.** From your machine, run:
   ```
   pnpm domains provision all --apply
   ```
   This turns on HTTPS-only, sets TLS and SSL, and makes `www` redirect to the apex.
5. **Check.** Run `pnpm domains check all`, then submit one contact form by hand.

Today, `www` is attached to each Worker. The deploy in step 3 removes it, so `www` is down until step 4 runs. Run step 4 right after CI finishes. Forms switch to the new key and URL in a single step, so they never break.

To undo a bad deploy, run `pnpm wrangler rollback --name <worker>`.

## CI setup

Add these as GitHub repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_READ_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Create a GitHub environment named `production`. Add a required reviewer to it if you want to approve each deploy.

| Workflow | When it runs | What it does |
| --- | --- | --- |
| CI | Pull requests | Check, typecheck, tests, and a build of the sites the PR changes |
| Deploy | Pushes to `main`, or by hand | `pnpm run deploy <changed sites> --apply` |
| Nightly | Every day | `pnpm domains check all`. It is read-only |

The deploy rules are:
- A change in `packages/` or `config/` deploys every site.
- A change in a niche outside `sites/` deploys that niche.
- A change in a site's folder deploys that site.

The rules live in `packages/cli/src/affected.ts`.

### Token permissions

**Deploy and provision token** (`CLOUDFLARE_API_TOKEN`):

| Scope | Permission | Why |
| --- | --- | --- |
| Account | Workers Scripts: Edit | Deploy Workers and set Worker secrets |
| Account | Account Secrets Store: Edit | Required to deploy a Worker that has a Secrets Store binding |
| Zone (all zones) | Workers Routes: Edit | Attach custom domains when deploying |
| Zone (all zones) | Zone: Edit | Create zones |
| Zone (all zones) | Zone Settings: Edit | SSL mode, Always Use HTTPS, TLS versions |
| Zone (all zones) | DNS: Edit | The `www` record and the email records |
| Zone (all zones) | Single Redirect: Edit | The www-to-apex redirect rule |
| Zone (all zones) | SSL and Certificates: Read | Certificate checks |

Creating a brand-new Worker needs Workers access at the account level, not for one Worker only. Grant the permissions for **all zones** in the account so new domains work without editing the token.

**Read-only token** (`CLOUDFLARE_READ_API_TOKEN`, for the nightly check): Zone: Read, SSL and Certificates: Read, and Workers Scripts: Read.

## Tracer

The sites only need two things from Tracer: the forms URL in `config/environments.json` and the Forms key in the Secrets Store. Each lead is one POST. Any non-2xx answer shows the visitor the send error. Everything else happens in Tracer.

To get mail sent to `info@` yourself, use Email Routing and forward every site to **one** inbox. An account can have at most 200 verified destination addresses.

## Not yet verified

These were not tested against the real Cloudflare account. Check each one during the first cutover.

- **Key gap length.** It depends on how fast a new Secrets Store value reaches the Workers. See the next item.

- **Secret updates.** Docs do not say whether a new Secrets Store value reaches running Workers without a redeploy. After rotating, send a test lead. If the old key is still used, run `pnpm run deploy all --apply`. A redeploy is safe.
- **How www is attached.** I could not see this without a token. Provision reports it.
- **Redirect order.** Redirect Rules run first among Cloudflare's rule types. The docs do not say whether they also run before a Worker on a custom-domain hostname. Step 4 of the cutover checks this.
- **Wrangler in CI.** Wrangler now shows differences between your config and the dashboard before deploying. I did not confirm that CI deploys go through without a prompt. Watch the first CI deploy.
- **Live zone settings.** The current settings of the three zones are unknown. The provision plan will show them.
- **Domain buying.** It stays manual. The Registrar API is in beta, supports only some top-level domains, and turns auto-renew off by default.
- **Scale.** The Workers Paid plan allows 500 Workers per account, and Tracer counts toward that limit. `pnpm check` warns at 400. The next step after that is Workers for Platforms.
