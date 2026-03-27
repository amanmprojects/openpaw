import { homedir } from "node:os";
import { join } from "node:path";
import { discoverSkillDirectories, type SkillMetadata } from "./skills/discover";

/**
 * Mutable list of discovered skills for the agent runtime; rescan the filesystem to pick up installs.
 */
export type OpenPawSkillCatalog = {
  workspacePath: string;
  skills: SkillMetadata[];
};

/**
 * Directories scanned for `SKILL.md` under immediate subfolders (OpenPaw workspace + optional user dir).
 */
export function skillScanDirsForWorkspace(workspacePath: string): string[] {
  return [join(workspacePath, ".agents/skills"), join(homedir(), ".config/agent/skills")];
}

/**
 * Re-reads skill metadata from disk into {@link OpenPawSkillCatalog.skills}.
 */
export async function refreshSkillCatalog(catalog: OpenPawSkillCatalog): Promise<void> {
  catalog.skills = await discoverSkillDirectories(skillScanDirsForWorkspace(catalog.workspacePath));
}
