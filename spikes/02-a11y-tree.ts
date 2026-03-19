/**
 * Spike #2: Can we read the accessibility tree from VS Code?
 *
 * Pass criteria:
 * - ariaSnapshot() or accessibility.snapshot() returns structured data
 * - Tree contains recognizable VS Code elements (menu, sidebar, editor)
 * - Nodes have roles, names, and ideally bounding boxes
 *
 * Tests both the modern ariaSnapshot() API and the legacy accessibility.snapshot()
 */

import { _electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const VSCODE_PATH = '/Applications/Visual Studio Code.app/Contents/MacOS/Electron';
const OUTPUT_DIR = path.join(import.meta.dirname, 'output');

async function main() {
  console.log('Spike #2: Accessibility Tree');
  console.log('======================================\n');

  const userDataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-spike-'));
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

  let app;
  try {
    console.log('Launching VS Code...');
    app = await _electron.launch({
      executablePath: VSCODE_PATH,
      args: [
        '--disable-gpu',
        '--disable-workspace-trust',
        '--skip-release-notes',
        '--disable-telemetry',
        '--new-window',
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${path.join(userDataDir, 'extensions')}`,
      ],
    });

    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(3000);
    console.log('✓ VS Code launched and loaded\n');

    // === Method 1: Modern ariaSnapshot() ===
    console.log('--- Method 1: locator.ariaSnapshot() ---');
    try {
      const startTime = Date.now();
      const ariaSnapshot = await window.locator('body').ariaSnapshot({ maxDepth: 5 });
      const elapsed = Date.now() - startTime;

      const outputPath = path.join(OUTPUT_DIR, 'spike-02-aria-snapshot.txt');
      await fs.promises.writeFile(outputPath, ariaSnapshot);

      const lines = ariaSnapshot.split('\n');
      console.log(`✓ ariaSnapshot() returned ${lines.length} lines in ${elapsed}ms`);
      console.log(`  Saved to: ${outputPath}`);
      console.log(`  First 30 lines:`);
      console.log(lines.slice(0, 30).map(l => `    ${l}`).join('\n'));
      console.log('    ...');
    } catch (err) {
      console.error(`✗ ariaSnapshot() failed: ${err}`);
    }

    // === Method 2: Legacy accessibility.snapshot() ===
    console.log('\n--- Method 2: accessibility.snapshot() ---');
    try {
      const startTime = Date.now();
      // @ts-expect-error — deprecated API, testing if it still works
      const a11ySnapshot = await window.accessibility.snapshot();
      const elapsed = Date.now() - startTime;

      const snapshotStr = JSON.stringify(a11ySnapshot, null, 2);
      const outputPath = path.join(OUTPUT_DIR, 'spike-02-a11y-snapshot.json');
      await fs.promises.writeFile(outputPath, snapshotStr);

      console.log(`✓ accessibility.snapshot() returned in ${elapsed}ms`);
      console.log(`  Saved to: ${outputPath}`);
      console.log(`  Root role: ${a11ySnapshot?.role}`);
      console.log(`  Root name: "${a11ySnapshot?.name}"`);
      console.log(`  Children count: ${a11ySnapshot?.children?.length ?? 0}`);

      // Count total nodes
      function countNodes(node: any): number {
        let count = 1;
        if (node.children) {
          for (const child of node.children) {
            count += countNodes(child);
          }
        }
        return count;
      }
      console.log(`  Total nodes: ${countNodes(a11ySnapshot)}`);

      // Show first few interesting nodes
      function printTree(node: any, depth: number = 0, maxDepth: number = 3): void {
        if (depth > maxDepth) return;
        const indent = '    ' + '  '.repeat(depth);
        const name = node.name ? ` "${node.name}"` : '';
        const extra = [];
        if (node.focused) extra.push('focused');
        if (node.expanded !== undefined) extra.push(node.expanded ? 'expanded' : 'collapsed');
        const suffix = extra.length ? ` [${extra.join(', ')}]` : '';
        console.log(`${indent}[${node.role}]${name}${suffix}`);
        if (node.children) {
          for (const child of node.children) {
            printTree(child, depth + 1, maxDepth);
          }
        }
      }
      console.log(`\n  Tree (depth=3):`);
      printTree(a11ySnapshot);
    } catch (err) {
      console.error(`✗ accessibility.snapshot() failed: ${err}`);
    }

    console.log('\n======================================');
    console.log('SPIKE #2: See output above for assessment');
  } catch (err) {
    console.error('\n======================================');
    console.error('SPIKE #2: FAIL');
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close();
      console.log('✓ VS Code closed');
    }
    await fs.promises.rm(userDataDir, { recursive: true, force: true });
    console.log('✓ Temp dir cleaned up');
  }
}

main();
