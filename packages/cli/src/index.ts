export const COMMANDS = ["new-site", "check", "build", "deploy", "domains", "secrets"] as const;
export type Command = (typeof COMMANDS)[number];
