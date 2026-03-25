/**
 * HTTP client for the helper extension running inside VS Code.
 * Communicates over localhost with a nonce auth token for security.
 */

import * as http from 'node:http';
import { ErrorCode, ToolError } from './types/errors.js';

const REQUEST_TIMEOUT_MS = 5_000;

/** Maximum response body size (5 MB). Responses exceeding this are rejected. */
const MAX_RESPONSE_BYTES = 5_242_880;

export interface GetTextResponse {
  text: string;
  uri: string;
  fileName: string;
  languageId: string;
  lineCount: number;
}

export interface DiagnosticItem {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  severity: string;
  source: string | null;
  code: string | number | null;
}

export class HelperClient {
  constructor(
    private readonly port: number,
    private readonly authToken: string,
  ) {}

  async healthCheck(): Promise<void> {
    await this.request('GET', '/health');
  }

  async executeCommand(command: string, args?: unknown[]): Promise<unknown> {
    try {
      const res = await this.request('POST', '/execute-command', { command, args });
      return res['result'];
    } catch (err) {
      // VS Code's executeCommand throws "command 'xyz' not found" — map to COMMAND_NOT_FOUND
      if (err instanceof ToolError && err.code === ErrorCode.ACTION_FAILED
          && /command .+ not found/i.test(err.actionable)) {
        throw new ToolError(ErrorCode.COMMAND_NOT_FOUND, err.actionable);
      }
      throw err;
    }
  }

  async getText(uri?: string): Promise<GetTextResponse> {
    const res = await this.request('POST', '/get-text', uri ? { uri } : {});
    return {
      text: String(res['text'] ?? ''),
      uri: String(res['uri'] ?? ''),
      fileName: String(res['fileName'] ?? ''),
      languageId: String(res['languageId'] ?? ''),
      lineCount: Number(res['lineCount'] ?? 0),
    };
  }

  async editorInsert(text: string, position?: { line: number; character: number }): Promise<void> {
    const body: Record<string, unknown> = { text };
    if (position) {
      body['line'] = position.line;
      body['character'] = position.character;
    }
    await this.request('POST', '/editor-insert', body);
  }

  async getDiagnostics(uri?: string, severity?: string): Promise<DiagnosticItem[]> {
    const body: Record<string, unknown> = {};
    if (uri) body['uri'] = uri;
    if (severity) body['severity'] = severity;
    const res = await this.request('POST', '/get-diagnostics', body);
    return res['diagnostics'] as DiagnosticItem[];
  }

  private request(
    method: string,
    urlPath: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const jsonBody = body ? JSON.stringify(body) : undefined;

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.authToken}`,
      };
      if (jsonBody) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = String(Buffer.byteLength(jsonBody));
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: this.port,
          path: urlPath,
          method,
          headers,
          timeout: REQUEST_TIMEOUT_MS,
        },
        (res) => {
          let data = '';
          let dataBytes = 0;
          res.on('data', (chunk: Buffer) => {
            dataBytes += chunk.length;
            if (dataBytes > MAX_RESPONSE_BYTES) {
              req.destroy();
              reject(new ToolError(
                ErrorCode.ACTION_FAILED,
                'Helper extension response too large (max 5 MB).',
              ));
              return;
            }
            data += chunk.toString();
          });
          res.on('end', () => {
            if (dataBytes > MAX_RESPONSE_BYTES) return; // Already rejected
            try {
              const parsed = JSON.parse(data) as Record<string, unknown>;
              if (parsed['ok'] === false) {
                reject(new ToolError(
                  ErrorCode.ACTION_FAILED,
                  String(parsed['error'] ?? 'Helper extension returned an error.'),
                ));
              } else {
                resolve(parsed);
              }
            } catch {
              reject(new ToolError(
                ErrorCode.ACTION_FAILED,
                `Helper extension returned invalid JSON: ${data.slice(0, 200)}`,
              ));
            }
          });
        },
      );

      req.on('error', (err) => {
        if ('code' in err && err.code === 'ECONNREFUSED') {
          reject(new ToolError(
            ErrorCode.NO_SESSION,
            'Helper extension is not running. The extension may have crashed or failed to activate.',
          ));
        } else {
          reject(new ToolError(
            ErrorCode.ACTION_FAILED,
            `Helper extension request failed: ${err.message}`,
          ));
        }
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new ToolError(
          ErrorCode.TIMEOUT,
          'Helper extension request timed out.',
        ));
      });

      if (jsonBody) req.write(jsonBody);
      req.end();
    });
  }
}
