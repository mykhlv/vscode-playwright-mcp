/**
 * Spike #1: Can Playwright launch VS Code and take a screenshot?
 *
 * Pass criteria:
 * - VS Code launches via _electron.launch()
 * - page.screenshot() returns a valid JPEG buffer
 * - Screenshot saved to spikes/output/spike-01.jpg
 */

import { _electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const VSCODE_PATH = '/Applications/Visual Studio Code.app/Contents/MacOS/Electron';
const OUTPUT_DIR = path.join(import.meta.dirname, 'output');

async function main() {
  console.log('Spike #1: Launch VS Code + Screenshot');
  console.log('======================================\n');

  // Create isolated user-data-dir
  const userDataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-spike-'));
  console.log(`User data dir: ${userDataDir}`);

  // Create output dir
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

  let app;
  try {
    console.log('Launching VS Code...');
    const startTime = Date.now();

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

    const launchTime = Date.now() - startTime;
    console.log(`✓ VS Code launched in ${launchTime}ms`);

    // Get the first window
    const window = await app.firstWindow();
    console.log(`✓ Got first window`);

    // Wait for VS Code to settle
    await window.waitForLoadState('domcontentloaded');
    // Extra settle time for VS Code UI to fully render
    await window.waitForTimeout(3000);
    console.log(`✓ Window loaded`);

    // Get window info
    const viewportSize = window.viewportSize();
    console.log(`  Viewport: ${viewportSize?.width}x${viewportSize?.height}`);

    const title = await window.title();
    console.log(`  Title: "${title}"`);

    // Take screenshot
    const screenshotStart = Date.now();
    const screenshot = await window.screenshot({ type: 'jpeg', quality: 75 });
    const screenshotTime = Date.now() - screenshotStart;

    const outputPath = path.join(OUTPUT_DIR, 'spike-01.jpg');
    await fs.promises.writeFile(outputPath, screenshot);

    console.log(`\n✓ Screenshot captured in ${screenshotTime}ms`);
    console.log(`  Size: ${screenshot.length} bytes (${(screenshot.length / 1024).toFixed(1)} KB)`);
    console.log(`  Saved to: ${outputPath}`);

    // Report
    console.log('\n======================================');
    console.log('SPIKE #1: PASS');
    console.log(`  Launch time: ${launchTime}ms`);
    console.log(`  Screenshot time: ${screenshotTime}ms`);
    console.log(`  Screenshot size: ${(screenshot.length / 1024).toFixed(1)} KB`);
    console.log(`  Viewport: ${viewportSize?.width}x${viewportSize?.height}`);
  } catch (err) {
    console.error('\n======================================');
    console.error('SPIKE #1: FAIL');
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (app) {
      console.log('\nClosing VS Code...');
      await app.close();
      console.log('✓ VS Code closed');
    }
    // Cleanup temp dir
    await fs.promises.rm(userDataDir, { recursive: true, force: true });
    console.log('✓ Temp dir cleaned up');
  }
}

main();
