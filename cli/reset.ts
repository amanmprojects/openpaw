import { resetWorkspaceToOnboardingDefaults } from "../agent/workspace-bootstrap";
import { getWorkspaceRoot } from "../config/paths";

/**
 * CLI handler: delete `~/.openpaw/workspace` and recreate the same layout and
 * default markdown files as onboarding (`AGENTS.md`, `SOUL.md`, `USER.md`, empty `sessions/`).
 */
export function handleReset(): void {
  const root = getWorkspaceRoot();
  resetWorkspaceToOnboardingDefaults();
  console.log(`Reset workspace: removed and recreated ${root} with onboarding defaults.`);
}
