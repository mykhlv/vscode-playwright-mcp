/**
 * Entry point: parse CLI args, create MCP server, connect stdio transport.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { setLogLevel, logger } from './utils/logger.js';

function parseArgs(): { verbose: boolean; vscodePath?: string } {
  const args = process.argv.slice(2);
  let verbose = false;
  let vscodePath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--vscode-path' && i + 1 < args.length) {
      vscodePath = args[++i];
    } else if (arg?.startsWith('--vscode-path=')) {
      vscodePath = arg.split('=').slice(1).join('=');
    }
  }

  return { verbose, vscodePath };
}

async function main(): Promise<void> {
  const { verbose, vscodePath } = parseArgs();

  if (verbose) {
    setLogLevel('debug');
  }

  // Set default VS Code path from CLI if provided
  if (vscodePath) {
    process.env['VSCODE_PLAYWRIGHT_VSCODE_PATH'] = vscodePath;
  }

  logger.info('starting', { verbose, vscodePath });

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('server_connected', { transport: 'stdio' });
}

main().catch((error) => {
  logger.error('fatal', { error: String(error) });
  process.exit(1);
});
