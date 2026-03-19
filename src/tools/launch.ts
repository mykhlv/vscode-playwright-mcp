/**
 * Tool handlers: vscode_launch, vscode_close
 */

import type { SessionManager } from '../session/session-manager.js';
import type { LaunchParams, CloseParams } from '../types/tool-params.js';
import { type ToolResult, textResult } from '../types/tool-results.js';
import { validatePathExists } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

export async function handleLaunch(
  session: SessionManager,
  params: LaunchParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_launch', params });

  // Validate inputs before touching Playwright
  if (params.workspace) {
    validatePathExists(params.workspace, 'Workspace path');
  }

  if (params.extensions) {
    for (const ext of params.extensions) {
      validatePathExists(ext, 'Extension path');
      if (!ext.endsWith('.vsix')) {
        return textResult(`Error: Extension must be a .vsix file. Got: ${ext}. Only local .vsix files are supported for security.`);
      }
    }
  }

  await session.launch({
    executablePath: params.executable_path,
    workspace: params.workspace,
    extensions: params.extensions,
    settings: params.settings,
    args: params.args,
  });

  const parts = ['VS Code launched successfully (1280x720 viewport).'];
  if (params.workspace) {
    parts.push(`Workspace: ${params.workspace}`);
  }
  parts.push('Use vscode_screenshot to see the current state, or vscode_snapshot to explore UI elements via accessibility tree.');

  return textResult(parts.join(' '));
}

export async function handleClose(
  session: SessionManager,
  _params: CloseParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_close' });
  await session.close();
  return textResult('VS Code closed and temporary files cleaned up.');
}
