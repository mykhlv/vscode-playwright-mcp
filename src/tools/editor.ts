/**
 * Tool handlers for VS Code API-backed editor operations.
 * Requires the helper extension to be running.
 */

import type { SessionManager } from '../session/session-manager.js';
import type { GetTextParams, EditorInsertParams, GetDiagnosticsParams } from '../types/tool-params.js';
import { type ToolResult, textResult } from '../types/tool-results.js';
import { ErrorCode, ToolError } from '../types/errors.js';
import { logger } from '../utils/logger.js';

function requireHelper(session: SessionManager) {
  const client = session.getHelperClient();
  if (!client) {
    throw new ToolError(
      ErrorCode.ACTION_FAILED,
      'Helper extension is not available. It may have failed to activate during launch. ' +
      'Try vscode_close and vscode_launch again.',
    );
  }
  return client;
}

export async function handleGetText(
  session: SessionManager,
  params: GetTextParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_get_text', uri: params.uri });

  const client = requireHelper(session);
  const result = await client.getText(params.uri);

  const lines = [
    `File: ${result.fileName}`,
    `Language: ${result.languageId}`,
    `Lines: ${result.lineCount}`,
    `URI: ${result.uri}`,
    '',
    result.text,
  ];

  return textResult(lines.join('\n'));
}

export async function handleEditorInsert(
  session: SessionManager,
  params: EditorInsertParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_editor_insert', textLength: params.text.length });

  const client = requireHelper(session);
  // Default character to 0 when line is provided without character
  const position = params.line !== undefined
    ? { line: params.line, character: params.character ?? 0 }
    : undefined;

  await client.editorInsert(params.text, position);

  const posDesc = position
    ? ` at line ${position.line}, character ${position.character}`
    : ' at cursor position';

  return textResult(
    `Inserted ${params.text.length} characters${posDesc}. ` +
    'Verify with vscode_get_text or vscode_screenshot.',
  );
}

export async function handleGetDiagnostics(
  session: SessionManager,
  params: GetDiagnosticsParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_get_diagnostics', uri: params.uri, severity: params.severity });

  const client = requireHelper(session);
  const items = await client.getDiagnostics(params.uri, params.severity);

  if (items.length === 0) {
    return textResult('No diagnostics found.');
  }

  const lines = [`Diagnostics (${items.length}):\n`];
  for (const d of items) {
    const loc = `${d.uri}:${d.range.start.line + 1}:${d.range.start.character + 1}`;
    const source = d.source ? ` [${d.source}]` : '';
    const code = d.code !== null ? ` (${d.code})` : '';
    lines.push(`  ${d.severity} ${loc}: ${d.message}${source}${code}`);
  }

  return textResult(lines.join('\n'));
}
