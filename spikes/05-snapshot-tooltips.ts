/**
 * Spike #5: Does ariaSnapshot() capture tooltip content on hover?
 *
 * Pass criteria:
 * - Hover over a symbol in the editor triggers a tooltip
 * - ariaSnapshot() captures the tooltip content in the a11y tree
 * - We can read type information, documentation from the tooltip
 *
 * This determines whether a11y-based interaction can read hover info
 * or if screenshots are the only way.
 */

import { _electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const VSCODE_PATH = '/Applications/Visual Studio Code.app/Contents/MacOS/Electron';
const OUTPUT_DIR = path.join(import.meta.dirname, 'output');
const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures');

async function saveScreenshot(window: any, name: string): Promise<void> {
  const screenshot = await window.screenshot({ type: 'jpeg', quality: 75 });
  const outputPath = path.join(OUTPUT_DIR, `spike-05-${name}.jpg`);
  await fs.promises.writeFile(outputPath, screenshot);
  console.log(`  [screenshot] ${name} (${(screenshot.length / 1024).toFixed(1)} KB)`);
}

async function saveSnapshot(window: any, name: string, maxDepth = 6): Promise<string> {
  const snapshot = await window.locator('body').ariaSnapshot({ maxDepth });
  const outputPath = path.join(OUTPUT_DIR, `spike-05-${name}.txt`);
  await fs.promises.writeFile(outputPath, snapshot);
  console.log(`  [snapshot] ${name} (${snapshot.split('\n').length} lines)`);
  return snapshot;
}

async function main() {
  console.log('Spike #5: ariaSnapshot() tooltip capture');
  console.log('=========================================\n');

  const userDataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-spike-'));
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

  // Inject settings
  const settingsDir = path.join(userDataDir, 'User');
  await fs.promises.mkdir(settingsDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(settingsDir, 'settings.json'),
    JSON.stringify({
      'workbench.startupEditor': 'none',
      'window.restoreWindows': 'none',
      'telemetry.telemetryLevel': 'off',
      'editor.hover.delay': 100,
      'editor.hover.enabled': true,
    })
  );

  let app;
  try {
    console.log('Launching VS Code with fixtures workspace...');
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
        FIXTURES_DIR,
      ],
    });

    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(3000);
    console.log('VS Code launched and loaded\n');

    // Set viewport to known size
    await window.setViewportSize({ width: 1280, height: 720 });
    await window.waitForTimeout(500);

    // Open sample.ts
    console.log('Opening sample.ts...');
    await window.keyboard.press('Meta+p');
    await window.waitForTimeout(500);
    await window.keyboard.type('sample.ts', { delay: 50 });
    await window.waitForTimeout(500);
    await window.keyboard.press('Enter');
    await window.waitForTimeout(2000);
    console.log('File opened\n');

    await saveScreenshot(window, '01-file-opened');

    // ================================================================
    // Step 1: Baseline snapshot — no tooltip
    // ================================================================
    console.log('--- Step 1: Baseline snapshot (no tooltip) ---');
    const baselineSnapshot = await saveSnapshot(window, '02-baseline');
    const baselineHasTooltip = baselineSnapshot.toLowerCase().includes('tooltip');
    console.log(`  Tooltip in baseline: ${baselineHasTooltip ? 'YES (unexpected)' : 'no (expected)'}\n`);

    // ================================================================
    // Step 2: Find a symbol to hover over
    // We need to locate a symbol in the editor. The editor is Monaco,
    // so we need to find coordinates of a specific token.
    // Strategy: Use screenshot + known file content to estimate position.
    // ================================================================
    console.log('--- Step 2: Hover over "greetUser" function call ---');

    // Navigate to line 25 where `greetUser(alice)` is called
    // Use Ctrl+G (Go to Line) — this doesn't leave dialogs open
    await window.keyboard.press('Meta+g');
    await window.waitForTimeout(500);
    await window.keyboard.type('25', { delay: 50 });
    await window.keyboard.press('Enter');
    await window.waitForTimeout(500);

    // Move cursor to start of "greetUser" — it's at col 16 on line 25
    // "const result = greetUser(alice);"
    await window.keyboard.press('Home');
    await window.waitForTimeout(200);
    for (let i = 0; i < 16; i++) {
      await window.keyboard.press('ArrowRight');
    }
    await window.waitForTimeout(300);

    await saveScreenshot(window, '03-cursor-positioned');

    // Now we need to trigger hover. The hover tooltip appears when the mouse
    // hovers over a symbol. We need to find where "greetUser" is rendered.
    // Let's try to get the cursor's screen position from the DOM.
    const cursorPosition = await window.evaluate(() => {
      const cursor = document.querySelector('.cursor');
      if (cursor) {
        const rect = cursor.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }
      // Fallback: try .cursor-layer
      const cursorLayer = document.querySelector('.cursors-layer .cursor');
      if (cursorLayer) {
        const rect = cursorLayer.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }
      return null;
    });

    console.log(`  Cursor position from DOM: ${JSON.stringify(cursorPosition)}`);

    if (cursorPosition && cursorPosition.x > 0) {
      // Hover slightly to the left of cursor (over "greetUser" text)
      const hoverX = cursorPosition.x - 30;
      const hoverY = cursorPosition.y + cursorPosition.height / 2;
      console.log(`  Hovering at (${hoverX}, ${hoverY})...`);

      await window.mouse.move(hoverX, hoverY);
      await window.waitForTimeout(2000); // Wait for hover tooltip to appear

      await saveScreenshot(window, '04-hover-tooltip');

      // ================================================================
      // Step 3: Snapshot WITH tooltip
      // ================================================================
      console.log('\n--- Step 3: Snapshot with tooltip visible ---');
      const hoverSnapshot = await saveSnapshot(window, '05-with-tooltip');

      // Check for tooltip-related content
      const tooltipKeywords = ['tooltip', 'hover', 'greetUser', 'function', 'User', 'string'];
      console.log('  Searching for tooltip indicators:');
      for (const keyword of tooltipKeywords) {
        const found = hoverSnapshot.toLowerCase().includes(keyword.toLowerCase());
        console.log(`    "${keyword}": ${found ? 'FOUND' : 'not found'}`);
      }

      // Look for tooltip DOM element
      const tooltipInfo = await window.evaluate(() => {
        const tooltipElements = document.querySelectorAll(
          '.monaco-hover, .hover-widget, [class*="tooltip"], [role="tooltip"], .hover-contents'
        );
        const results: Array<{ tag: string; class: string; text: string; visible: boolean }> = [];
        tooltipElements.forEach((el) => {
          const rect = (el as HTMLElement).getBoundingClientRect();
          results.push({
            tag: el.tagName,
            class: el.className.substring(0, 100),
            text: el.textContent?.substring(0, 200) || '',
            visible: rect.width > 0 && rect.height > 0,
          });
        });
        return results;
      });

      console.log(`\n  Tooltip DOM elements found: ${tooltipInfo.length}`);
      for (const tip of tooltipInfo) {
        console.log(`    <${tip.tag} class="${tip.class}">`);
        console.log(`      visible: ${tip.visible}`);
        console.log(`      text: "${tip.text}"`);
      }
    } else {
      console.log('  Could not determine cursor position, trying absolute coordinates...');

      // Fallback: hover over an approximate position in the editor
      // Editor typically starts around x=50 (after line numbers), line 23 would be ~y=400
      const fallbackX = 200;
      const fallbackY = 400;
      console.log(`  Hovering at fallback (${fallbackX}, ${fallbackY})...`);

      await window.mouse.move(fallbackX, fallbackY);
      await window.waitForTimeout(2000);

      await saveScreenshot(window, '04-hover-fallback');
      const fallbackSnapshot = await saveSnapshot(window, '05-with-tooltip-fallback');
      console.log(`  Snapshot has ${fallbackSnapshot.split('\n').length} lines`);
    }

    // ================================================================
    // Step 4: Try hover via keyboard (Ctrl+K Ctrl+I — Show Hover)
    // ================================================================
    console.log('\n--- Step 4: Trigger hover via keyboard shortcut ---');

    // Dismiss any open dialogs first
    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);
    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);

    // Position cursor on "greetUser" — go to line 25, col 16
    await window.keyboard.press('Meta+g');
    await window.waitForTimeout(500);
    await window.keyboard.type('25', { delay: 50 });
    await window.keyboard.press('Enter');
    await window.waitForTimeout(300);

    await window.keyboard.press('Home');
    await window.waitForTimeout(200);
    for (let i = 0; i < 16; i++) {
      await window.keyboard.press('ArrowRight');
    }
    await window.waitForTimeout(300);

    // Trigger hover via keyboard: Ctrl+K Ctrl+I
    await window.keyboard.press('Meta+k');
    await window.waitForTimeout(200);
    await window.keyboard.press('Meta+i');
    await window.waitForTimeout(2000);

    await saveScreenshot(window, '06-keyboard-hover');
    const keyboardHoverSnapshot = await saveSnapshot(window, '07-keyboard-hover');

    // Analyze the keyboard hover snapshot
    const tooltipKeywordsKb = ['tooltip', 'hover', 'greetUser', 'function', 'User', 'string', 'dialog'];
    console.log('  Searching for hover content in keyboard-triggered snapshot:');
    for (const keyword of tooltipKeywordsKb) {
      const found = keyboardHoverSnapshot.toLowerCase().includes(keyword.toLowerCase());
      console.log(`    "${keyword}": ${found ? 'FOUND' : 'not found'}`);
    }

    // Check DOM for hover widget after keyboard trigger
    const keyboardTooltipInfo = await window.evaluate(() => {
      const hoverWidgets = document.querySelectorAll(
        '.monaco-hover, .hover-widget, [class*="tooltip"], [role="tooltip"], .hover-contents, .monaco-hover-content'
      );
      const results: Array<{ class: string; text: string; visible: boolean; rect: any }> = [];
      hoverWidgets.forEach((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        results.push({
          class: el.className.substring(0, 100),
          text: el.textContent?.substring(0, 300) || '',
          visible: rect.width > 0 && rect.height > 0,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        });
      });
      return results;
    });

    console.log(`\n  Hover DOM elements after keyboard trigger: ${keyboardTooltipInfo.length}`);
    for (const tip of keyboardTooltipInfo) {
      console.log(`    class="${tip.class}"`);
      console.log(`      visible: ${tip.visible}, rect: ${JSON.stringify(tip.rect)}`);
      console.log(`      text: "${tip.text}"`);
    }

    // ================================================================
    // Step 5: Test autocomplete/suggest widget visibility
    // ================================================================
    console.log('\n--- Step 5: Trigger autocomplete and check a11y ---');

    // Dismiss any hover/dialog first
    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);
    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);

    // Go to end of file and start typing to trigger autocomplete
    await window.keyboard.press('Meta+End');
    await window.waitForTimeout(500);
    await window.keyboard.press('Enter');
    await window.keyboard.type('alice.', { delay: 100 });
    await window.waitForTimeout(2000); // Wait for IntelliSense

    await saveScreenshot(window, '08-autocomplete');
    const autocompleteSnapshot = await saveSnapshot(window, '09-autocomplete');

    const suggestKeywords = ['listbox', 'option', 'name', 'age', 'email', 'suggest', 'completion'];
    console.log('  Searching for autocomplete content in snapshot:');
    for (const keyword of suggestKeywords) {
      const found = autocompleteSnapshot.toLowerCase().includes(keyword.toLowerCase());
      console.log(`    "${keyword}": ${found ? 'FOUND' : 'not found'}`);
    }

    // ================================================================
    // SUMMARY
    // ================================================================
    console.log('\n=========================================');
    console.log('SPIKE #5: SUMMARY');
    console.log('=========================================');
    console.log('  Check screenshots and snapshots in spikes/output/spike-05-*');
    console.log('  Key questions answered:');
    console.log('    1. Does ariaSnapshot() see hover tooltips?');
    console.log('    2. Does ariaSnapshot() see autocomplete suggestions?');
    console.log('    3. Can we get tooltip content from the DOM via evaluate()?');
    console.log('    4. Does keyboard-triggered hover (Ctrl+K Ctrl+I) differ from mouse hover?');
  } catch (err) {
    console.error('\n=========================================');
    console.error('SPIKE #5: FAIL');
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (app) {
      console.log('\nClosing VS Code...');
      await app.close();
      console.log('VS Code closed');
    }
    await fs.promises.rm(userDataDir, { recursive: true, force: true });
    console.log('Temp dir cleaned up');
  }
}

main();
