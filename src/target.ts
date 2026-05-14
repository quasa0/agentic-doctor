import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { TargetSnapshot } from "./types.js";

const ignoredDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".expo",
  "ios/Pods"
]);

export function resolveTargetPath(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return path.join(homedir(), input.slice(2));
  return path.resolve(input);
}

export async function snapshotTarget(targetPath: string, limit = 200): Promise<TargetSnapshot> {
  const root = resolveTargetPath(targetPath);
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) {
    throw new Error(`Target path is not a directory: ${root}`);
  }

  const files: string[] = [];
  await walk(root, root, files, limit);
  return { path: root, files };
}

async function walk(root: string, dir: string, files: string[], limit: number): Promise<void> {
  if (files.length >= limit) return;
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (files.length >= limit) return;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(root, fullPath);

    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name) || ignoredDirs.has(relPath)) continue;
      await walk(root, fullPath, files, limit);
      continue;
    }

    if (entry.isFile()) {
      files.push(relPath);
    }
  }
}
