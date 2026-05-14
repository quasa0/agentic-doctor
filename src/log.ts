import { RoleName } from "./types.js";

const roleLabels: Record<RoleName | "system", string> = {
  advisor: "ADVISOR",
  executor: "EXECUTOR",
  system: "SYSTEM"
};

export function logLine(role: RoleName | "system", message: string): void {
  const stamp = new Date().toISOString();
  process.stdout.write(`[${stamp}] [${roleLabels[role]}] ${message}\n`);
}

export function logBlock(role: RoleName | "system", title: string, body: string): void {
  logLine(role, title);
  process.stdout.write(`${body.trim()}\n\n`);
}
