#!/usr/bin/env bun
/**
 * Lightweight repository-local lint checks that do not depend on external registries.
 */

import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".cjs", ".mjs"]);
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build"]);

function listFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      listFiles(full, acc);
      continue;
    }
    if ([...SOURCE_EXTENSIONS].some((ext) => full.endsWith(ext))) {
      acc.push(full);
    }
  }
  return acc;
}

function changedFiles(): string[] | null {
  try {
    const output = execSync("git diff --name-only HEAD", {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!output) {
      return [];
    }
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => join(ROOT, line));
  } catch {
    return null;
  }
}

function stripShebang(content: string): string {
  return content.startsWith("#!") ? content.slice(content.indexOf("\n") + 1) : content;
}

function hasTopLevelDocstring(content: string): boolean {
  return stripShebang(content).trimStart().startsWith("/**");
}

const problems: string[] = [];
const candidateFiles = changedFiles() ?? listFiles(ROOT);

for (const file of candidateFiles) {
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
    continue;
  }
  const rel = file.slice(ROOT.length + 1);
  const content = readFileSync(file, "utf-8");
  if (content.includes("\t")) {
    problems.push(`${rel}: contains tab characters`);
  }
  if (/[^\S\r\n]+$/m.test(content)) {
    problems.push(`${rel}: contains trailing whitespace`);
  }
  if ((file.endsWith(".ts") || file.endsWith(".tsx")) && !hasTopLevelDocstring(content)) {
    problems.push(`${rel}: missing top-level docstring`);
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

console.log("lint passed");
