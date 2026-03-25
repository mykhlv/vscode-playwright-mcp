/**
 * HTTP route handlers — each maps to a specific VS Code API call.
 * No generic eval — narrow, typed surface area for safety.
 */

import * as vscode from 'vscode';

export type RouteHandler = (body: Record<string, unknown>) => Promise<Record<string, unknown>>;

export function createRouter(): Map<string, RouteHandler> {
  const routes = new Map<string, RouteHandler>();
  routes.set('/execute-command', handleExecuteCommand);
  routes.set('/get-text', handleGetText);
  routes.set('/editor-insert', handleEditorInsert);
  routes.set('/get-diagnostics', handleGetDiagnostics);
  return routes;
}

async function handleExecuteCommand(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const command = body['command'];
  if (typeof command !== 'string' || command.length === 0) {
    throw new Error('Missing required field "command" (string).');
  }

  const args = Array.isArray(body['args']) ? body['args'] as unknown[] : [];
  const result = await vscode.commands.executeCommand(command, ...args);
  return { result: serializeResult(result) };
}

async function handleGetText(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const uri = body['uri'];
  let doc: vscode.TextDocument;

  if (typeof uri === 'string' && uri.length > 0) {
    doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
  } else {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error('No active text editor. Open a file first, then retry.');
    }
    doc = editor.document;
  }

  return {
    text: doc.getText(),
    uri: doc.uri.toString(),
    fileName: doc.fileName,
    languageId: doc.languageId,
    lineCount: doc.lineCount,
  };
}

async function handleEditorInsert(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const text = body['text'];
  if (typeof text !== 'string') {
    throw new Error('Missing required field "text" (string).');
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error('No active text editor. Open a file first, then retry.');
  }

  let position: vscode.Position;
  const line = body['line'];
  const character = body['character'];

  if (typeof line === 'number') {
    // Default character to 0 when line is provided without character
    const char = typeof character === 'number' ? character : 0;
    position = new vscode.Position(line, char);
  } else {
    position = editor.selection.active;
  }

  const success = await editor.edit((builder) => {
    builder.insert(position, text);
  });

  if (!success) {
    throw new Error('Editor insert failed. The document may be read-only.');
  }

  return { success: true };
}

async function handleGetDiagnostics(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const uriFilter = body['uri'];
  const severityFilter = body['severity'];

  let entries: [vscode.Uri, vscode.Diagnostic[]][];

  if (typeof uriFilter === 'string' && uriFilter.length > 0) {
    const uri = vscode.Uri.parse(uriFilter);
    const diagnostics = vscode.languages.getDiagnostics(uri);
    entries = [[uri, diagnostics]];
  } else {
    entries = vscode.languages.getDiagnostics() as [vscode.Uri, vscode.Diagnostic[]][];
  }

  const severityNames = ['Error', 'Warning', 'Information', 'Hint'] as const;
  const minSeverity = parseSeverityFilter(severityFilter);

  const items: Record<string, unknown>[] = [];
  for (const [uri, diagnostics] of entries) {
    for (const d of diagnostics) {
      if (minSeverity !== undefined && d.severity > minSeverity) continue;
      items.push({
        uri: uri.toString(),
        range: {
          start: { line: d.range.start.line, character: d.range.start.character },
          end: { line: d.range.end.line, character: d.range.end.character },
        },
        message: d.message,
        severity: severityNames[d.severity] ?? 'Unknown',
        source: d.source ?? null,
        code: typeof d.code === 'object' ? d.code?.value : d.code ?? null,
      });
    }
  }

  return { diagnostics: items };
}

function parseSeverityFilter(value: unknown): vscode.DiagnosticSeverity | undefined {
  if (typeof value !== 'string') return undefined;
  switch (value.toLowerCase()) {
    case 'error': return vscode.DiagnosticSeverity.Error;
    case 'warning': return vscode.DiagnosticSeverity.Warning;
    case 'information': return vscode.DiagnosticSeverity.Information;
    case 'hint': return vscode.DiagnosticSeverity.Hint;
    default: return undefined;
  }
}

function serializeResult(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(serializeResult);
  if (typeof value === 'object') {
    try {
      JSON.stringify(value);
      return value;
    } catch {
      return String(value);
    }
  }
  return String(value);
}
