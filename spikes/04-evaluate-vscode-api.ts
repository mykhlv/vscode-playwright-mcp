/**
 * Spike #4: Can we access VS Code internal APIs via page.evaluate()?
 *
 * Pass criteria:
 * - page.evaluate() can execute JS in VS Code's renderer process
 * - We can discover how to reach vscode.commands, editor state, diagnostics
 * - We document what works and what doesn't for each approach
 *
 * This spike determines whether we can offer a direct "execute command" tool
 * instead of forcing users through coordinate-based GUI automation.
 */

import { _electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const VSCODE_PATH = '/Applications/Visual Studio Code.app/Contents/MacOS/Electron';
const OUTPUT_DIR = path.join(import.meta.dirname, 'output');
const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures');

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'PARTIAL';
  detail: string;
  error?: string;
}

const results: TestResult[] = [];

function logResult(result: TestResult): void {
  const icon = result.status === 'PASS' ? '✓' : result.status === 'PARTIAL' ? '~' : '✗';
  console.log(`  ${icon} [${result.status}] ${result.name}`);
  console.log(`    ${result.detail}`);
  if (result.error) {
    console.log(`    Error: ${result.error}`);
  }
  results.push(result);
}

async function main() {
  console.log('Spike #4: page.evaluate() access to VS Code APIs');
  console.log('=================================================\n');

  const userDataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-spike-'));
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

  // Inject settings to suppress Welcome tab and enable known state
  const settingsDir = path.join(userDataDir, 'User');
  await fs.promises.mkdir(settingsDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(settingsDir, 'settings.json'),
    JSON.stringify({
      'workbench.startupEditor': 'none',
      'window.restoreWindows': 'none',
      'telemetry.telemetryLevel': 'off',
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

    // Open sample.ts via Quick Open
    console.log('Opening sample.ts...');
    await window.keyboard.press('Meta+p');
    await window.waitForTimeout(500);
    await window.keyboard.type('sample.ts', { delay: 50 });
    await window.waitForTimeout(500);
    await window.keyboard.press('Enter');
    await window.waitForTimeout(2000);
    console.log('File opened\n');

    // ================================================================
    // TEST 1: Basic page.evaluate() — does it work at all?
    // ================================================================
    console.log('--- Test 1: Basic page.evaluate() ---');
    try {
      const basicResult = await window.evaluate(() => {
        return {
          hasWindow: typeof window !== 'undefined',
          hasDocument: typeof document !== 'undefined',
          title: document.title,
          userAgent: navigator.userAgent,
          electronVersion: (globalThis as any).process?.versions?.electron,
          nodeVersion: (globalThis as any).process?.versions?.node,
        };
      });
      logResult({
        name: 'Basic evaluate()',
        status: 'PASS',
        detail: `title="${basicResult.title}", electron=${basicResult.electronVersion}, node=${basicResult.nodeVersion}`,
      });
    } catch (err: any) {
      logResult({ name: 'Basic evaluate()', status: 'FAIL', detail: 'Cannot run evaluate()', error: err.message });
    }

    // ================================================================
    // TEST 2: Explore globalThis / window for VS Code APIs
    // ================================================================
    console.log('\n--- Test 2: Explore globalThis for VS Code APIs ---');
    try {
      const globals = await window.evaluate(() => {
        const interesting: string[] = [];
        for (const key of Object.keys(globalThis)) {
          const lower = key.toLowerCase();
          if (
            lower.includes('vscode') ||
            lower.includes('monaco') ||
            lower.includes('require') ||
            lower.includes('module') ||
            lower.includes('electron') ||
            lower.includes('workbench')
          ) {
            interesting.push(key);
          }
        }
        // Also check common AMD loader patterns
        const hasRequire = typeof (globalThis as any).require === 'function';
        const hasDefine = typeof (globalThis as any).define === 'function';
        const hasMonacoEnv = typeof (globalThis as any).MonacoEnvironment !== 'undefined';
        const hasVscode = typeof (globalThis as any).vscode !== 'undefined';

        return { interesting, hasRequire, hasDefine, hasMonacoEnv, hasVscode };
      });
      logResult({
        name: 'globalThis exploration',
        status: globals.interesting.length > 0 ? 'PASS' : 'PARTIAL',
        detail: `Found keys: [${globals.interesting.join(', ')}], require=${globals.hasRequire}, define=${globals.hasDefine}, MonacoEnvironment=${globals.hasMonacoEnv}, vscode=${globals.hasVscode}`,
      });
    } catch (err: any) {
      logResult({ name: 'globalThis exploration', status: 'FAIL', detail: 'Cannot explore globals', error: err.message });
    }

    // ================================================================
    // TEST 2b: Deep-dive into globalThis.vscode
    // ================================================================
    console.log('\n--- Test 2b: Deep-dive into globalThis.vscode ---');
    try {
      const vscodeObj = await window.evaluate(`
        (() => {
          const vs = globalThis.vscode;
          if (!vs) return { exists: false };

          const topKeys = Object.keys(vs);
          const typeOfEach = {};
          for (const key of topKeys) {
            typeOfEach[key] = typeof vs[key];
          }

          // Iterative drill into nested objects
          const deepKeys = {};
          const stack = topKeys.map(k => ({ obj: vs[k], prefix: 'vscode.' + k, depth: 0 }));
          while (stack.length > 0) {
            const { obj, prefix, depth } = stack.pop();
            if (depth > 2 || !obj || typeof obj !== 'object') continue;
            const keys = Object.keys(obj).slice(0, 15);
            for (const key of keys) {
              const fullKey = prefix + '.' + key;
              const val = obj[key];
              deepKeys[fullKey] = typeof val === 'function' ? 'function' : typeof val;
              if (typeof val === 'object' && val !== null && depth < 2) {
                stack.push({ obj: val, prefix: fullKey, depth: depth + 1 });
              }
            }
          }

          const hasCommands = typeof vs.commands !== 'undefined';
          const hasCommandsExecute = typeof (vs.commands && vs.commands.executeCommand) === 'function';
          const hasWindow = typeof vs.window !== 'undefined';
          const hasWorkspace = typeof vs.workspace !== 'undefined';

          // Also check prototype chain
          const protoKeys = [];
          let proto = Object.getPrototypeOf(vs);
          while (proto && proto !== Object.prototype) {
            protoKeys.push(...Object.getOwnPropertyNames(proto));
            proto = Object.getPrototypeOf(proto);
          }

          return {
            exists: true,
            topKeys,
            typeOfEach,
            deepKeys,
            hasCommands,
            hasCommandsExecute,
            hasWindow,
            hasWorkspace,
            protoKeys: protoKeys.slice(0, 20),
            constructor: vs.constructor ? vs.constructor.name : 'none',
          };
        })()
      `);

      if ((vscodeObj as any).exists) {
        const obj = vscodeObj as any;
        console.log(`  Top-level keys: [${obj.topKeys.join(', ')}]`);
        console.log(`  Types: ${JSON.stringify(obj.typeOfEach, null, 4)}`);
        console.log(`  commands API: ${obj.hasCommands}, executeCommand: ${obj.hasCommandsExecute}`);
        console.log(`  window API: ${obj.hasWindow}`);
        console.log(`  workspace API: ${obj.hasWorkspace}`);
        console.log(`  constructor: ${obj.constructor}`);
        console.log(`  proto keys: [${(obj.protoKeys || []).join(', ')}]`);
        console.log('  Deep keys (first 40):');
        const entries = Object.entries(obj.deepKeys).slice(0, 40);
        for (const [k, v] of entries) {
          console.log(`    ${k}: ${v}`);
        }
        logResult({
          name: 'globalThis.vscode deep-dive',
          status: obj.hasCommandsExecute ? 'PASS' : 'PARTIAL',
          detail: `keys=[${obj.topKeys.join(',')}], commands.executeCommand=${obj.hasCommandsExecute}`,
        });
      } else {
        logResult({ name: 'globalThis.vscode deep-dive', status: 'FAIL', detail: 'vscode object not found' });
      }
    } catch (err: any) {
      logResult({ name: 'globalThis.vscode deep-dive', status: 'FAIL', detail: '', error: err.message });
    }

    // ================================================================
    // TEST 2c: Try vscode.commands.executeCommand if available
    // ================================================================
    console.log('\n--- Test 2c: Execute command via globalThis.vscode ---');
    try {
      const cmdResult = await window.evaluate(async () => {
        const vs = (globalThis as any).vscode;
        if (!vs?.commands?.executeCommand) {
          return { available: false, reason: 'executeCommand not found on globalThis.vscode' };
        }

        try {
          // Try toggling sidebar
          await vs.commands.executeCommand('workbench.action.toggleSidebarVisibility');
          return { available: true, executed: true, command: 'workbench.action.toggleSidebarVisibility' };
        } catch (e: any) {
          return { available: true, executed: false, error: e.message };
        }
      });
      logResult({
        name: 'Execute command via vscode.commands',
        status: (cmdResult as any).executed ? 'PASS' : 'FAIL',
        detail: JSON.stringify(cmdResult),
      });
    } catch (err: any) {
      logResult({ name: 'Execute command via vscode.commands', status: 'FAIL', detail: '', error: err.message });
    }

    // ================================================================
    // TEST 3: AMD loader — require/define for VS Code modules
    // ================================================================
    console.log('\n--- Test 3: AMD loader for VS Code modules ---');
    try {
      const amdResult = await window.evaluate(`
        new Promise((resolve) => {
          const req = globalThis.require;
          const def = globalThis.define;

          const loaderInfo = {
            hasRequire: typeof req === 'function',
            hasDefine: typeof def === 'function',
            requireType: typeof req,
            defineType: typeof def,
          };

          // Explore define — it may have amd property or stored modules
          if (def) {
            loaderInfo.defineAmd = typeof def.amd !== 'undefined';
            loaderInfo.defineKeys = Object.keys(def).slice(0, 10);
          }

          // If require is not a function, try to find it on globalThis.AMDLoader
          // or similar VS Code loader mechanisms
          const amdLoader = globalThis.AMDLoader || globalThis._amdLoaderGlobal;
          if (amdLoader) {
            loaderInfo.amdLoaderKeys = Object.keys(amdLoader).slice(0, 10);
          }

          // Check for globalThis.MonacoEnvironment or similar loaders
          if (globalThis.MonacoEnvironment) {
            loaderInfo.monacoEnvKeys = Object.keys(globalThis.MonacoEnvironment);
          }

          // If require exists as a function, try loading modules
          if (typeof req === 'function') {
            const modulesToTry = [
              'vs/platform/commands/common/commands',
              'vs/editor/editor.api',
              'vscode',
            ];
            const moduleResults = {};
            let pending = modulesToTry.length;

            for (const mod of modulesToTry) {
              try {
                req([mod], (m) => {
                  moduleResults[mod] = m ? 'loaded: ' + Object.keys(m).slice(0, 5).join(', ') : 'null';
                  if (--pending === 0) resolve({ ...loaderInfo, modules: moduleResults });
                }, (err) => {
                  moduleResults[mod] = 'error: ' + (err?.message || String(err)).substring(0, 100);
                  if (--pending === 0) resolve({ ...loaderInfo, modules: moduleResults });
                });
              } catch (e) {
                moduleResults[mod] = 'threw: ' + e.message;
                if (--pending === 0) resolve({ ...loaderInfo, modules: moduleResults });
              }
            }
            setTimeout(() => resolve({ ...loaderInfo, modules: moduleResults, timedOut: true }), 5000);
          } else {
            resolve(loaderInfo);
          }
        })
      `);
      logResult({
        name: 'AMD loader',
        status: 'PARTIAL',
        detail: JSON.stringify(amdResult, null, 2),
      });
    } catch (err: any) {
      logResult({ name: 'AMD loader', status: 'FAIL', detail: 'Cannot use AMD loader', error: err.message });
    }

    // ================================================================
    // TEST 4: Try to find the command service via DOM or global references
    // ================================================================
    console.log('\n--- Test 4: Command execution via various approaches ---');

    // 4a: Try acquireVsCodeApi pattern (used in webviews)
    try {
      const webviewApi = await window.evaluate(() => {
        const fn = (globalThis as any).acquireVsCodeApi;
        if (fn) {
          const api = fn();
          return { available: true, keys: Object.keys(api) };
        }
        return { available: false };
      });
      logResult({
        name: 'acquireVsCodeApi()',
        status: (webviewApi as any).available ? 'PASS' : 'FAIL',
        detail: (webviewApi as any).available
          ? `Keys: ${(webviewApi as any).keys.join(', ')}`
          : 'Not available (expected — this is for webview contexts only)',
      });
    } catch (err: any) {
      logResult({ name: 'acquireVsCodeApi()', status: 'FAIL', detail: 'Not available', error: err.message });
    }

    // 4b: Try to execute command via DOM command dispatching
    try {
      const commandResult = await window.evaluate(() => {
        // VS Code workbench stores service references. Try to find them.
        // The workbench uses a service locator pattern.

        // Approach: Try to trigger a command via the keyboard simulation DOM API
        // This won't work for arbitrary commands but tests the evaluate pipeline
        const activeElement = document.activeElement;
        return {
          activeElementTag: activeElement?.tagName,
          activeElementClass: activeElement?.className?.substring(0, 100),
          activeElementRole: activeElement?.getAttribute('role'),
        };
      });
      logResult({
        name: 'DOM active element info',
        status: 'PASS',
        detail: JSON.stringify(commandResult),
      });
    } catch (err: any) {
      logResult({ name: 'DOM active element info', status: 'FAIL', detail: '', error: err.message });
    }

    // ================================================================
    // TEST 5: Execute command via keyboard shortcut simulation
    // (baseline — we know this works from spike #3)
    // ================================================================
    console.log('\n--- Test 5: Toggle sidebar via keyboard (baseline) ---');
    try {
      const before = await window.screenshot({ type: 'jpeg', quality: 75 });
      await window.keyboard.press('Meta+b');
      await window.waitForTimeout(500);
      const after = await window.screenshot({ type: 'jpeg', quality: 75 });

      // Compare sizes — toggling sidebar changes the screenshot significantly
      const sizeDiff = Math.abs(before.length - after.length);
      const changed = sizeDiff > 1000; // Threshold for meaningful change

      await fs.promises.writeFile(path.join(OUTPUT_DIR, 'spike-04-sidebar-before.jpg'), before);
      await fs.promises.writeFile(path.join(OUTPUT_DIR, 'spike-04-sidebar-after.jpg'), after);

      // Toggle back
      await window.keyboard.press('Meta+b');
      await window.waitForTimeout(500);

      logResult({
        name: 'Keyboard command execution (baseline)',
        status: changed ? 'PASS' : 'PARTIAL',
        detail: `Screenshot size diff: ${sizeDiff} bytes (${changed ? 'sidebar toggled' : 'no visible change'})`,
      });
    } catch (err: any) {
      logResult({ name: 'Keyboard command execution', status: 'FAIL', detail: '', error: err.message });
    }

    // ================================================================
    // TEST 6: ElectronApplication.evaluate() — main process access
    // ================================================================
    console.log('\n--- Test 6: app.evaluate() — main process ---');
    try {
      const mainResult = await app.evaluate(async ({ app: electronApp }) => {
        return {
          name: electronApp.getName(),
          version: electronApp.getVersion(),
          locale: electronApp.getLocale(),
          paths: {
            userData: electronApp.getPath('userData'),
            exe: electronApp.getPath('exe'),
          },
        };
      });
      logResult({
        name: 'Main process evaluate()',
        status: 'PASS',
        detail: `name=${mainResult.name}, version=${mainResult.version}, locale=${mainResult.locale}`,
      });
    } catch (err: any) {
      logResult({ name: 'Main process evaluate()', status: 'FAIL', detail: '', error: err.message });
    }

    // ================================================================
    // TEST 7: Try to get editor state from the DOM
    // ================================================================
    console.log('\n--- Test 7: Editor state from DOM ---');
    try {
      const editorState = await window.evaluate(() => {
        // Monaco editor puts content in .view-lines
        const viewLines = document.querySelector('.view-lines');
        const lines: string[] = [];
        if (viewLines) {
          viewLines.querySelectorAll('.view-line').forEach((line) => {
            lines.push(line.textContent || '');
          });
        }

        // Active tab info
        const activeTab = document.querySelector('.tab.active');
        const activeTabName = activeTab?.querySelector('.label-name')?.textContent
          || activeTab?.textContent?.trim();

        // Cursor position from the cursor element or status bar
        const statusItems = document.querySelectorAll('.statusbar-item');
        const statusTexts: string[] = [];
        statusItems.forEach((item) => {
          const text = item.textContent?.trim();
          if (text) statusTexts.push(text);
        });

        // Try to find line/col indicator
        const cursorInfo = Array.from(statusItems)
          .map((el) => el.textContent?.trim() || '')
          .find((text) => /Ln \d+/.test(text) || /Line \d+/.test(text));

        return {
          visibleLines: lines.slice(0, 10),
          lineCount: lines.length,
          activeTabName,
          cursorInfo,
          statusBarItems: statusTexts.slice(0, 10),
        };
      });
      logResult({
        name: 'Editor state from DOM',
        status: editorState.visibleLines.length > 0 ? 'PASS' : 'PARTIAL',
        detail: `Lines: ${editorState.lineCount}, tab: "${editorState.activeTabName}", cursor: "${editorState.cursorInfo}"`,
      });
      if (editorState.visibleLines.length > 0) {
        console.log('    Visible lines:');
        editorState.visibleLines.forEach((line, i) => console.log(`      ${i + 1}: ${line}`));
      }
      console.log(`    Status bar: [${editorState.statusBarItems.join(' | ')}]`);
    } catch (err: any) {
      logResult({ name: 'Editor state from DOM', status: 'FAIL', detail: '', error: err.message });
    }

    // ================================================================
    // TEST 8: Try to access services via internal VS Code bootstrapping
    // ================================================================
    console.log('\n--- Test 8: VS Code internal service discovery ---');
    try {
      const serviceDiscovery = await window.evaluate(() => {
        const results: Record<string, string> = {};

        // Check for the workbench service accessor
        // VS Code stores services on specific DOM elements or globals
        const workbenchEl = document.getElementById('workbench.main.container')
          || document.querySelector('.monaco-workbench');
        results['workbench-element'] = workbenchEl ? 'found' : 'not found';

        // Check for __VSCODE_WORKBENCH_SERVICES or similar
        for (const key of Object.getOwnPropertyNames(window)) {
          if (key.startsWith('__') && key.toLowerCase().includes('vscode')) {
            results[key] = typeof (window as any)[key];
          }
        }

        // Check for StandaloneServices (Monaco editor API)
        try {
          const req = (globalThis as any).require;
          if (req) {
            // Synchronous require attempt
            results['require-type'] = typeof req;
            // Check if it's the AMD require with toUrl
            results['require-toUrl'] = typeof req.toUrl;
            results['require-config'] = typeof req.getConfig === 'function' ? 'available' : 'not found';
          }
        } catch (e: any) {
          results['require-error'] = e.message;
        }

        return results;
      });
      logResult({
        name: 'Internal service discovery',
        status: Object.keys(serviceDiscovery).length > 1 ? 'PARTIAL' : 'FAIL',
        detail: JSON.stringify(serviceDiscovery, null, 2),
      });
    } catch (err: any) {
      logResult({ name: 'Internal service discovery', status: 'FAIL', detail: '', error: err.message });
    }

    // ================================================================
    // TEST 9: Try to execute a command by dispatching to VS Code's IPC
    // ================================================================
    console.log('\n--- Test 9: Electron IPC command execution ---');
    try {
      const ipcResult = await app.evaluate(async ({ app: electronApp }) => {
        // In the main process, we can try to send IPC messages to the renderer
        const windows = electronApp.windows?.() ?? [];
        return {
          windowCount: windows.length,
          // We can't easily call VS Code commands from main process
          // but we can confirm IPC channel access
          note: 'Main process has no direct access to VS Code command service',
        };
      });
      logResult({
        name: 'Electron IPC exploration',
        status: 'PARTIAL',
        detail: JSON.stringify(ipcResult),
      });
    } catch (err: any) {
      logResult({ name: 'Electron IPC exploration', status: 'FAIL', detail: '', error: err.message });
    }

    // ================================================================
    // TEST 10: Try dynamic import / ESM module access
    // ================================================================
    console.log('\n--- Test 10: ESM dynamic import ---');
    try {
      const esmResult = await window.evaluate(async () => {
        try {
          // VS Code's renderer may or may not support dynamic import
          // @ts-expect-error — experimental
          const mod = await import('vs/workbench/services/commands/common/commandService');
          return { available: true, keys: Object.keys(mod) };
        } catch (e: any) {
          return { available: false, error: e.message };
        }
      });
      logResult({
        name: 'ESM dynamic import',
        status: (esmResult as any).available ? 'PASS' : 'FAIL',
        detail: JSON.stringify(esmResult),
      });
    } catch (err: any) {
      logResult({ name: 'ESM dynamic import', status: 'FAIL', detail: '', error: err.message });
    }

    // ================================================================
    // SUMMARY
    // ================================================================
    console.log('\n=================================================');
    console.log('SPIKE #4: SUMMARY');
    console.log('=================================================');
    const passed = results.filter((r) => r.status === 'PASS').length;
    const partial = results.filter((r) => r.status === 'PARTIAL').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;
    console.log(`  PASS: ${passed}, PARTIAL: ${partial}, FAIL: ${failed}`);
    console.log('');
    console.log('  Key findings:');
    for (const r of results) {
      console.log(`    [${r.status}] ${r.name}`);
    }

    // Save full results
    const reportPath = path.join(OUTPUT_DIR, 'spike-04-results.json');
    await fs.promises.writeFile(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n  Full results saved to: ${reportPath}`);
  } catch (err) {
    console.error('\n=================================================');
    console.error('SPIKE #4: FAIL');
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
