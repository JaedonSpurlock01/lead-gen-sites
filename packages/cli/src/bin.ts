import { COMMANDS, type Command } from "./index";

const [command, ...rest] = process.argv.slice(2);

function usage(): never {
  console.error(`Usage: pnpm <command> [target] [flags]\n\nCommands: ${COMMANDS.join(", ")}\nTargets: a site id, a niche id, or "all".`);
  process.exit(1);
}

if (!command || !COMMANDS.includes(command as Command)) usage();

// Phase 3 wires each command up. Until then every command reports that it is not implemented.
console.error(`${command} is not implemented yet (args: ${rest.join(" ") || "none"}).`);
process.exit(2);
