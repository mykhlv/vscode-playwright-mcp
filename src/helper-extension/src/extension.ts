/**
 * MCP Helper Extension — provides VS Code API access over HTTP.
 *
 * Activated on startup (`*`), starts an HTTP server on 127.0.0.1:0,
 * writes the assigned port and auth token to {userDataDir}/mcp-helper-port
 * so the MCP server can connect.
 */

import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import { type RouteHandler, createRouter } from './routes';

/** Maximum request body size (1 MB). Requests exceeding this are rejected with 413. */
const MAX_BODY_BYTES = 1_048_576;

export function activate(context: vscode.ExtensionContext): void {
  const userDataDir = process.env['VSCODE_MCP_USER_DATA_DIR'];
  if (!userDataDir) {
    // Not launched by vscode-playwright-mcp — do nothing
    return;
  }

  // Random nonce token — written to the port file, required on every request.
  // Prevents other local processes from sending commands to this VS Code instance.
  const authToken = crypto.randomBytes(16).toString('hex');

  const router = createRouter();
  const server = http.createServer((req, res) => {
    // Verify auth token on every request
    if (req.headers['authorization'] !== `Bearer ${authToken}`) {
      respond(res, 401, { ok: false, error: 'Unauthorized.' });
      return;
    }

    let body = '';
    let bodyBytes = 0;
    req.on('data', (chunk: Buffer) => {
      bodyBytes += chunk.length;
      if (bodyBytes > MAX_BODY_BYTES) {
        respond(res, 413, { ok: false, error: 'Request body too large (max 1 MB).' });
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
    req.on('end', () => {
      if (bodyBytes > MAX_BODY_BYTES) return; // Already responded with 413
      handleRequest(router, req, res, body);
    });
  });

  server.listen(0, '127.0.0.1', () => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      // eslint-disable-next-line no-console -- extension host has no logger, stderr is the only option
      console.error('[MCP Helper] Failed to get server address after listen');
      return;
    }

    const port = addr.port;
    const portFile = path.join(userDataDir, 'mcp-helper-port');
    // Write "port:token" so the MCP server gets both in one read
    fs.writeFileSync(portFile, `${port}:${authToken}`, 'utf-8');
  });

  context.subscriptions.push({
    dispose: () => {
      server.close();
    },
  });
}

export function deactivate(): void {
  // Cleanup handled by disposable in context.subscriptions
}

type Router = Map<string, RouteHandler>;

async function handleRequest(
  router: Router,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  rawBody: string,
): Promise<void> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  // Health check
  if (url === '/health' && method === 'GET') {
    respond(res, 200, { ok: true, pid: process.pid });
    return;
  }

  // All API routes are POST
  if (method !== 'POST') {
    respond(res, 405, { ok: false, error: 'Method not allowed. Use POST.' });
    return;
  }

  const handler = router.get(url);
  if (!handler) {
    respond(res, 404, { ok: false, error: `Unknown endpoint: ${url}` });
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : {};
  } catch {
    respond(res, 400, { ok: false, error: 'Invalid JSON body.' });
    return;
  }

  try {
    const result = await handler(parsed);
    respond(res, 200, { ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    respond(res, 500, { ok: false, error: message });
  }
}

function respond(res: http.ServerResponse, status: number, data: Record<string, unknown>): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
