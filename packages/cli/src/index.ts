export const COMMANDS = ["new-site", "check", "build", "deploy", "domains", "secrets"] as const;
export type Command = (typeof COMMANDS)[number];

export { runBatched, type BatchOptions, type BatchResult, type TaskOutcome } from "./batch";
export { runBuild, resolveTracerFormsUrl, type BuildOptions, type BuildResult } from "./build";
export { runCheck, type CheckIssue, type CheckReport } from "./check";
export { runDeploy, type DeployOptions, type DeployResult } from "./deploy";
export { httpChecks, type DomainCheckResult } from "./domains/http-checks";
export { loadFailures, saveFailures } from "./failures";
export { siteInputHash, hashInputs } from "./hash";
export { CliError, consoleLogger, memoryLogger, type Logger } from "./log";
export { runNewSite, displayPhone, type NewSiteOptions } from "./new-site";
export { looksRateLimited, spawnRunner, type Runner, type RunResult } from "./runner";
export { runSecretsRotate, type RotateOptions, type RotateResult } from "./secrets";
export { listAllSites, resolveTargets, refKey, type SiteRef } from "./targets";
export { wranglerConfig, writeWranglerConfig, wranglerConfigPath } from "./wrangler-config";
