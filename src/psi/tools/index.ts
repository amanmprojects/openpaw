import { createListDirTool } from './list-dir.js';
import { createFileEditorTool } from './file-editor.js';
import { createBashTool } from './bash.js';
import { createWebSearchTool } from './web-search.js';
import { createMemorySaveTool } from './memory-save.js';

export function getTools(workspacePath: string) {
  return {
    list_dir: createListDirTool(workspacePath),
    file_editor: createFileEditorTool(workspacePath),
    bash: createBashTool(workspacePath),
    web_search: createWebSearchTool(),
    memory_save: createMemorySaveTool(workspacePath),
  };
}
