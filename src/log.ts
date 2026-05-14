import { RoleName } from "./types.js";

const roleLabels: Record<RoleName | "system", string> = {
  advisor: "ADVISOR",
  executor: "EXECUTOR",
  system: "SYSTEM"
};

const ansi = {
  reset: "\x1b[0m",
  purple: "\x1b[38;5;141m"
};

export function logLine(role: RoleName | "system", message: string): void {
  const stamp = new Date().toISOString();
  writePrefixed(role, `[${stamp}] [${roleLabels[role]}] ${message}`);
}

export function logBlock(role: RoleName | "system", title: string, body: string): void {
  logLine(role, title);
  writePrefixed(role, body.trim());
  process.stdout.write("\n");
}

function writePrefixed(role: RoleName | "system", text: string): void {
  const prefix = role === "system" ? `${ansi.purple}> ${ansi.reset}` : "";
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    process.stdout.write(`${prefix}${line}\n`);
  }
}
