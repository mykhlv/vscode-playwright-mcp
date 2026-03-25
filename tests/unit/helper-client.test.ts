/**
 * Unit tests for HelperClient — HTTP client for the helper extension.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'node:http';
import { HelperClient } from '../../src/helper-client.js';
import { ToolError } from '../../src/types/errors.js';

const TEST_TOKEN = 'test-auth-token-1234';

/** Create a mock HTTP server that responds with the given handler. */
function createMockServer(
  handler: (req: http.IncomingMessage, body: string) => { status: number; data: Record<string, unknown> },
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        const { status, data } = handler(req, body);
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        resolve({ server, port: addr.port });
      }
    });
  });
}

describe('HelperClient', () => {
  const servers: http.Server[] = [];

  afterEach(() => {
    for (const s of servers) {
      s.close();
    }
    servers.length = 0;
  });

  it('healthCheck succeeds on 200 with ok:true', async () => {
    const { server, port } = await createMockServer(() => ({
      status: 200,
      data: { ok: true, pid: 12345 },
    }));
    servers.push(server);

    const client = new HelperClient(port, TEST_TOKEN);
    await expect(client.healthCheck()).resolves.toBeUndefined();
  });

  it('sends Authorization header with auth token', async () => {
    let receivedAuth = '';
    const { server, port } = await createMockServer((req) => {
      receivedAuth = req.headers['authorization'] ?? '';
      return { status: 200, data: { ok: true, pid: 1 } };
    });
    servers.push(server);

    const client = new HelperClient(port, TEST_TOKEN);
    await client.healthCheck();
    expect(receivedAuth).toBe(`Bearer ${TEST_TOKEN}`);
  });

  it('executeCommand returns result from extension', async () => {
    const { server, port } = await createMockServer((_req, body) => {
      const parsed = JSON.parse(body);
      return {
        status: 200,
        data: { ok: true, result: `executed:${parsed.command}` },
      };
    });
    servers.push(server);

    const client = new HelperClient(port, TEST_TOKEN);
    const result = await client.executeCommand('workbench.action.closeAllEditors');
    expect(result).toBe('executed:workbench.action.closeAllEditors');
  });

  it('executeCommand throws COMMAND_NOT_FOUND for command not found errors', async () => {
    const { server, port } = await createMockServer(() => ({
      status: 500,
      data: { ok: false, error: 'command \'bogus.command\' not found' },
    }));
    servers.push(server);

    const client = new HelperClient(port, TEST_TOKEN);
    try {
      await client.executeCommand('bogus.command');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      expect((err as ToolError).code).toBe('COMMAND_NOT_FOUND');
    }
  });

  it('getText returns document info', async () => {
    const { server, port } = await createMockServer(() => ({
      status: 200,
      data: {
        ok: true,
        text: 'hello world',
        uri: 'file:///test.ts',
        fileName: '/test.ts',
        languageId: 'typescript',
        lineCount: 1,
      },
    }));
    servers.push(server);

    const client = new HelperClient(port, TEST_TOKEN);
    const result = await client.getText();
    expect(result.text).toBe('hello world');
    expect(result.languageId).toBe('typescript');
    expect(result.lineCount).toBe(1);
  });

  it('editorInsert succeeds on ok:true', async () => {
    const { server, port } = await createMockServer(() => ({
      status: 200,
      data: { ok: true, success: true },
    }));
    servers.push(server);

    const client = new HelperClient(port, TEST_TOKEN);
    await expect(client.editorInsert('new text', { line: 0, character: 0 })).resolves.toBeUndefined();
  });

  it('getDiagnostics returns diagnostic items', async () => {
    const { server, port } = await createMockServer(() => ({
      status: 200,
      data: {
        ok: true,
        diagnostics: [
          {
            uri: 'file:///test.ts',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            message: 'Cannot find name',
            severity: 'Error',
            source: 'ts',
            code: 2304,
          },
        ],
      },
    }));
    servers.push(server);

    const client = new HelperClient(port, TEST_TOKEN);
    const items = await client.getDiagnostics();
    expect(items).toHaveLength(1);
    expect(items[0]!.message).toBe('Cannot find name');
    expect(items[0]!.severity).toBe('Error');
  });

  it('throws ToolError on ok:false response', async () => {
    const { server, port } = await createMockServer(() => ({
      status: 500,
      data: { ok: false, error: 'No active text editor.' },
    }));
    servers.push(server);

    const client = new HelperClient(port, TEST_TOKEN);
    await expect(client.getText()).rejects.toThrow(ToolError);
    try {
      await client.getText();
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      expect((err as ToolError).actionable).toBe('No active text editor.');
    }
  });

  it('throws ToolError with NO_SESSION on ECONNREFUSED', async () => {
    const client = new HelperClient(19999, TEST_TOKEN); // No server on this port
    try {
      await client.healthCheck();
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      expect((err as ToolError).code).toBe('NO_SESSION');
    }
  });
});
