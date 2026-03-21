/**
 * Tool handler: vscode_console
 *
 * Retrieves collected console messages from the VS Code renderer process.
 * Messages are captured continuously after launch via ConsoleCollector.
 */

import type { SessionManager } from '../session/session-manager.js';
import type { ConsoleParams } from '../types/tool-params.js';
import { type ToolResult, textResult } from '../types/tool-results.js';
import { logger } from '../utils/logger.js';

/** Format a timestamp as HH:MM:SS.mmm in UTC */
function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  const ms = String(d.getUTCMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export async function handleConsole(
  session: SessionManager,
  params: ConsoleParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_console', params });

  // Verify session is active
  session.getPage();

  let messages = session.consoleCollector.getMessages(params.level);

  // Apply limit — take the most recent N messages
  if (params.limit !== undefined && params.limit > 0 && messages.length > params.limit) {
    messages = messages.slice(-params.limit);
  }

  if (params.clear) {
    // When a level filter is set, only clear messages of that level
    if (params.level && params.level !== 'all') {
      session.consoleCollector.clearLevel(params.level);
    } else {
      session.consoleCollector.clear();
    }
  }

  if (messages.length === 0) {
    const levelNote = params.level && params.level !== 'all' ? ` (level: ${params.level})` : '';
    return textResult(`No console messages${levelNote}.`);
  }

  const lines = messages.map(
    (m) => `[${formatTimestamp(m.timestamp)}] [${m.level}] ${m.text}`,
  );

  const clearNote = params.clear ? ' (buffer cleared)' : '';
  return textResult(`Console messages (${messages.length})${clearNote}:\n${lines.join('\n')}`);
}
