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
| `pnpm deploy <target>` | Shows the deploy plan. Add `--apply` to deploy |
| `pnpm domains provision [target]` | Shows the Cloudflare setup plan. Add `--apply` to make the changes |
| `pnpm domains check [target]` | Checks the zone, certificate, Worker, home page and www redirect |
| `pnpm secrets rotate <NAME>` | Sets a Worker secret on every site (the backup plan). Add `--apply` |

Nothing writes to Cloudflare without `--apply`. The `domains` commands need `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your shell.

## Add a site

1. **Buy the domain** in Cloudflare Registrar. Do this by hand. **Turn on auto-renew.** It is off by default, and renewals cannot be managed through the API yet.
2. **Create the site.** Ask Claude Code to build it. The `new-site` skill runs every step below and opens a pull request. To do it by hand, run:
   ```
   pnpm new-site asphalt-paving twin-falls --domain twinfallsasphaltpaving.com --city "Twin Falls"
   ```
3. **Write the content.** Fill in `site.json`. Use the niche's `prompts/` to research the city and write each page in `content/services/`. Add photos to `assets/`. Run `pnpm check twin-falls` until it passes.
4. **Set up Cloudflare.** Run `pnpm domains provision twin-falls`, read the plan, then run it again with `--apply`. Set the nameservers it prints at the registrar. Add the site in Tracer.
5. **Deploy.** Merge the pull request and CI deploys the site. You can also run `pnpm deploy twin-falls --apply`.
6. **Check it.** Run `pnpm domains check twin-falls`. A new zone can take a while to go active, so re-run until it passes.

## Add a niche

1. Copy the template: `cp -R niches/_template niches/roofing`.
2. In `niche.json`, set the `id`, `name`, `schemaOrgType`, services, image slots, market fields and theme colors. Rename the package in `package.json` to `@niche/roofing`.
3. Replace every `TEMPLATE` line in `copy/shared.yaml`. Rewrite the files in `prompts/` for this trade.
4. Change the pages and sections in `pages/` and `components/` as needed. Code that only this niche uses stays in the niche.
5. Update `sites/_template/` so new sites start with the right services and images.
6. Run `pnpm install`, then add the first site with `pnpm new-site roofing <id> --domain <apex>`.

## Rotate the Tracer key

Every site reads `TRACER_FORM_KEY` from one secret in the Cloudflare Secrets Store. You change it in one place.

Follow these steps so forms never break:

1. Make a new key in Tracer, and have Tracer accept **both** the old key and the new key.
2. Update the secret:
   ```
   pnpm wrangler secrets-store secret list <STORE_ID> --remote
   pnpm wrangler secrets-store secret update <STORE_ID> --secret-id <ID> --remote
   ```
   Wrangler asks for the value. Do not use `--value`.
3. Send a test lead from one site. Confirm in Tracer that it arrived with the new key.
4. Remove the old key in Tracer.

**Backup plan.** If the Secrets Store cannot be used, set the key as a normal secret on every Worker:

```
pbpaste | pnpm secrets rotate TRACER_FORM_KEY --apply
```

It reads the key from stdin only and never prints it. It works in batches and waits when Cloudflare rate-limits it. Run it again with `--retry-failed` to redo only the sites that failed. The lead handler accepts either form of the key, so you can switch between the two plans.

## Switch the three live sites over

The live sites keep their Worker names, so deploys replace the current Workers in place. Two things change at runtime:

- The key moves from a plain variable to the Secrets Store binding.
- `www` stops showing the site and redirects to the apex instead.

Today, `www` on all three sites serves the same pages as the apex. It is probably attached to each Worker as a second custom domain. The first deploy will remove it, because Wrangler makes a Worker's domains match its config. The order below covers that.

Run these steps from your machine, not from CI. If the repo is already on GitHub, disable the Deploy workflow until step 8. Steps 1 and 2 change files that would otherwise start a deploy.

1. **Create the token and secret.** Make the deploy token below. Create the secret with the **current** key, so nothing changes yet:
   ```
   pnpm wrangler secrets-store secret create <STORE_ID> --name TRACER_FORM_KEY --scopes workers --remote
   ```
   Put the store id in `config/cloudflare.json` as `secretsStore.storeId`.
2. **Pick a canary.** Set `"canary": true` in one site's `site.json`, for example Pocatello. Commit the change.
3. **Plan.** Run `pnpm domains provision all` and read the plan. It lists the settings it will change and the redirect rule it will add. It also reports how `www` is attached today.
4. **Apply the zone changes.** Run `pnpm domains provision all --apply`. Then run `curl -I https://www.<domain>/` on each site. It should return `301` to the apex. If it still returns `200`, stop. The redirect rule does not override a `www` custom domain, so detach `www` from each Worker in the dashboard, then re-run provision with `--apply`.
5. **Deploy the canary.** Run `pnpm deploy pocatello --apply`. In the new version the key comes from the binding and the old variable is gone. Both changes land in one step, so there is no gap.
6. **Test the canary form.** Run `pnpm domains check pocatello --with-lead`. This sends one real test lead, so check that it shows up in Tracer. Also submit the contact form once by hand.
7. **Re-run provision.** Run `pnpm domains provision pocatello --apply`. If the deploy removed the `www` custom domain, this adds the `www` DNS record the redirect needs.
8. **Deploy the rest.** Run `pnpm deploy all --apply`, then `pnpm domains provision all --apply`, then `pnpm domains check all`.

To undo a bad deploy, run `pnpm wrangler rollback --name <worker>`. The old version still has the old key variable.

## CI setup

Add these as GitHub repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_READ_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Create a GitHub environment named `production`. Add a required reviewer to it if you want to approve each deploy.

| Workflow | When it runs | What it does |
| --- | --- | --- |
| CI | Pull requests | Check, typecheck, tests, and a build of the sites the PR changes |
| Deploy | Pushes to `main`, or by hand | `pnpm deploy <changed sites> --apply` |
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

## Email

Tracer sends each lead from the site's `info@<domain>` address. The SPF, DKIM and DMARC records go in `config/email-dns.json`, which is empty until Tracer's mail provider is known. Provision shows this as a TODO.

To receive mail at `info@`, use Email Routing and forward every site to **one** inbox. An account can have at most 200 verified destination addresses, so one address per site will not scale.

## Questions for Tracer

1. Which provider sends the `info@` emails? We need its SPF, DKIM and DMARC records for `config/email-dns.json`.
2. Is there an API to register a new site (hostname and sender address)? If so, `domains provision` can do that step.
3. Can Tracer accept two form keys at once? Key rotation needs this to avoid downtime.
4. What is the production Tracer URL? All three sites post to the staging URL today. It is set once in `config/environments.json`.
5. Does Tracer drop duplicate `submissionId` values? If so, retries are safe.
6. What does Tracer return for a hostname it does not know? It should not be a 2xx.
7. Can a test lead be marked so it does not count? `domains check --with-lead` sends one per site.

## Not yet verified

These were not tested against the real Cloudflare account. Check each one during the first cutover.

- **Secret updates.** Docs do not say whether a new Secrets Store value reaches running Workers without a redeploy. After rotating, send a test lead. If the old key is still used, run `pnpm deploy all --apply`. A redeploy is safe.
- **How www is attached.** I could not see this without a token. Provision reports it.
- **Redirect order.** Redirect Rules run first among Cloudflare's rule types. The docs do not say whether they also run before a Worker on a custom-domain hostname. Step 4 of the cutover checks this.
- **Wrangler in CI.** Wrangler now shows differences between your config and the dashboard before deploying. I did not confirm that CI deploys go through without a prompt. Watch the first CI deploy.
- **Live zone settings.** The current settings of the three zones are unknown. The provision plan will show them.
- **Domain buying.** It stays manual. The Registrar API is in beta, supports only some top-level domains, and turns auto-renew off by default.
- **Scale.** The Workers Paid plan allows 500 Workers per account, and Tracer counts toward that limit. `pnpm check` warns at 400. The next step after that is Workers for Platforms.
