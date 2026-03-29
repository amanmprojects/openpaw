import { refreshSkillCatalog, skillScanDirsForWorkspace, type OpenPawSkillCatalog } from "../agent";
import { getWorkspaceRoot } from "../config";

/**
 * Lists installed skills and their source directories.
 */
export async function handleSkillsList(): Promise<void> {
  const workspacePath = getWorkspaceRoot();
  const catalog: OpenPawSkillCatalog = { workspacePath, skills: [] };
  await refreshSkillCatalog(catalog);
  if (catalog.skills.length === 0) {
    console.log("No skills discovered.");
    return;
  }
  for (const skill of catalog.skills) {
    console.log(`${skill.name} — ${skill.description}`);
    console.log(`  ${skill.path}`);
  }
}

/**
 * Refreshes skill discovery and prints the scanned roots.
 */
export async function handleSkillsRefresh(): Promise<void> {
  const workspacePath = getWorkspaceRoot();
  const catalog: OpenPawSkillCatalog = { workspacePath, skills: [] };
  await refreshSkillCatalog(catalog);
  console.log(`Refreshed ${catalog.skills.length} skill(s).`);
  console.log(skillScanDirsForWorkspace(workspacePath).join("\n"));
}
