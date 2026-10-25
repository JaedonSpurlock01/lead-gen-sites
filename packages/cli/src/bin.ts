import { parseArgs } from "node:util";
import { findRepoRoot } from "@lead-gen/engine/load";
import { COMMANDS, type Command } from "./index";
import { runBuild } from "./build";
import { runCheck } from "./check";
import { runDeploy } from "./deploy";
import { CliError, consoleLogger } from "./log";
import { runNewSite } from "./new-site";
import { runSecretsRotate } from "./secrets";

const usage = `Usage:
  pnpm new-site <niche> <id> --domain <apex> [--name ..] [--city ..] [--region ID --region-name Idaho] [--phone +1...] [--canary]
  pnpm check [target]
  pnpm build [target] [--force] [--concurrency N] [--env NAME]
  pnpm deploy <target> [--apply] [--concurrency N] [--retry-failed] [--skip-build] [--env NAME]
  pnpm secrets rotate <NAME> [--apply] [--target T] [--concurrency N] [--retry-failed]   (value on stdin)
  pnpm domains provision|check [target] [--apply] [--with-lead]

Targets: a site id, a niche id, niche/site, or "all". Commands that write to Cloudflare are dry-run without --apply.`;

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || !COMMANDS.includes(command as Command)) {
    console.error(usage);
    return 1;
  }
  const root = findRepoRoot(process.cwd());
  const logger = consoleLogger;

  switch (command as Command) {
    case "new-site": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          domain: { type: "string" },
          name: { type: "string" },
          city: { type: "string" },
          region: { type: "string" },
          "region-name": { type: "string" },
          phone: { type: "string" },
          canary: { type: "boolean" },
        },
      });
      const [niche, id] = positionals;
      if (!niche || !id || !values.domain) throw new CliError(usage);
      runNewSite(root, niche, id, {
        domain: values.domain,
        name: values.name,
        city: values.city,
        region: values.region,
        regionName: values["region-name"],
        phone: values.phone,
        canary: values.canary,
        logger,
      });
      return 0;
    }
    case "check": {
      const { positionals } = parseArgs({ args: rest, allowPositionals: true, options: {} });
      return runCheck(root, positionals[0], logger).ok ? 0 : 1;
    }
    case "build": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { force: { type: "boolean" }, concurrency: { type: "string" }, env: { type: "string" } },
      });
      const results = await runBuild(root, positionals[0], {
        force: values.force,
        concurrency: values.concurrency ? Number(values.concurrency) : undefined,
        env: values.env,
        logger,
      });
      return results.some((result) => result.status === "failed") ? 1 : 0;
    }
    case "deploy": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          apply: { type: "boolean" },
          concurrency: { type: "string" },
          "retry-failed": { type: "boolean" },
          "skip-build": { type: "boolean" },
          env: { type: "string" },
        },
      });
      if (!positionals[0] && !values["retry-failed"]) throw new CliError(`deploy needs a target (a site, a niche, or all)\n\n${usage}`);
      const result = await runDeploy(root, positionals[0], {
        apply: values.apply,
        concurrency: values.concurrency ? Number(values.concurrency) : undefined,
        retryFailed: values["retry-failed"],
        skipBuild: values["skip-build"],
        env: values.env,
        logger,
      });
      return result.ok ? 0 : 1;
    }
    case "secrets": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          apply: { type: "boolean" },
          target: { type: "string" },
          concurrency: { type: "string" },
          "retry-failed": { type: "boolean" },
        },
      });
      const [sub, name] = positionals;
      if (sub !== "rotate" || !name) throw new CliError(`secrets supports: rotate <NAME>\n\n${usage}`);
      const result = await runSecretsRotate(root, name, {
        value: await readStdin(),
        apply: values.apply,
        target: values.target,
        concurrency: values.concurrency ? Number(values.concurrency) : undefined,
        retryFailed: values["retry-failed"],
        logger,
      });
      return result.ok ? 0 : 1;
    }
    case "domains": {
      // Phase 5 wires provision and check up.
      throw new CliError("domains is not implemented yet (phase 5)", 2);
    }
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    if (error instanceof CliError) {
      console.error(`error: ${error.message}`);
      process.exit(error.exitCode);
    }
    console.error(error);
    process.exit(1);
  });
