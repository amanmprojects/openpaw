import { parse, resolve, sep } from "node:path";
import { isSandboxRestricted } from "./turn-context";

/**
 * Workspace root used for sandboxed file paths (`FILE_EDITOR_ROOT` overrides `workspaceRoot`).
 */
export function workspaceSandboxBase(workspaceRoot: string): string {
  return resolve(process.env.FILE_EDITOR_ROOT ?? workspaceRoot);
}

/**
 * When the sandbox is off, tools use the OS filesystem root (same as previous `allowedBaseFor` behavior).
 */
export function filesystemSandboxBase(): string {
  return parse(process.cwd()).root;
}

/**
 * Resolves `userPath` for file_editor and list_dir: when the sandbox is on, the result must lie
 * under the workspace sandbox base or under one of the absolute `skillRoots`; when off, under
 * the filesystem root only.
 */
export function resolveScopePath(
  workspaceRoot: string,
  skillRoots: readonly string[],
  userPath: string,
): string {
  if (!isSandboxRestricted()) {
    return resolveUnderRoot(filesystemSandboxBase(), userPath);
  }

  const ws = workspaceSandboxBase(workspaceRoot);
  const roots = [ws, ...skillRoots.map((r) => resolve(r))];
  for (const base of roots) {
    const full = resolve(base, userPath);
    const prefix = base.endsWith(sep) ? base : `${base}${sep}`;
    if (full === base || full.startsWith(prefix)) {
      return full;
    }
  }
  throw new Error(`Path outside sandbox: "${userPath}"`);
}

function resolveUnderRoot(root: string, userPath: string): string {
  const r = resolve(root);
  const full = resolve(r, userPath);
  const prefix = r.endsWith(sep) ? r : `${r}${sep}`;
  if (full !== r && !full.startsWith(prefix)) {
    throw new Error(`Path traversal blocked: "${userPath}"`);
  }
  return full;
}
