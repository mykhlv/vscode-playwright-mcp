/**
 * VS Code binary auto-detection and Electron launch configuration.
 *
 * Detection order:
 * 1. Explicit executable_path parameter
 * 2. VSCODE_PLAYWRIGHT_VSCODE_PATH environment variable
 * 3. Platform-specific well-known paths
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { ErrorCode, ToolError } from '../types/errors.js';
import { DEFAULT_VIEWPORT } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

/** Well-known VS Code Electron binary paths per platform */
const WELL_KNOWN_PATHS: Record<string, string[]> = {
  darwin: [
    '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
    '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron',
    `${os.homedir()}/Applications/Visual Studio Code.app/Contents/MacOS/Electron`,
    `${os.homedir()}/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron`,
  ],
  linux: [
    '/usr/share/code/code',
    '/usr/bin/code',
    '/snap/code/current/usr/share/code/code',
    '/usr/share/code-insiders/code-insiders',
    '/usr/bin/code-insiders',
  ],
  win32: [
    `${process.env['LOCALAPPDATA'] ?? ''}\\Programs\\Microsoft VS Code\\Code.exe`,
    `${process.env['LOCALAPPDATA'] ?? ''}\\Programs\\Microsoft VS Code Insiders\\Code - Insiders.exe`,
  ],
};

/**
 * Resolve the VS Code Electron binary path.
 * Throws VSCODE_NOT_FOUND if no binary is found.
 */
export function resolveVSCodePath(explicitPath?: string): string {
  // 1. Explicit parameter
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      throw new ToolError(
        ErrorCode.VSCODE_NOT_FOUND,
        `Specified VS Code path does not exist: ${explicitPath}`,
      );
    }
    return explicitPath;
  }

  // 2. Environment variable
  const envPath = process.env['VSCODE_PLAYWRIGHT_VSCODE_PATH'];
  if (envPath) {
    if (!fs.existsSync(envPath)) {
      throw new ToolError(
        ErrorCode.VSCODE_NOT_FOUND,
        `VSCODE_PLAYWRIGHT_VSCODE_PATH points to non-existent path: ${envPath}`,
      );
    }
    return envPath;
  }

  // 3. Platform-specific detection
  const platform = process.platform;
  const candidates = WELL_KNOWN_PATHS[platform];
  if (!candidates) {
    throw new ToolError(
      ErrorCode.VSCODE_NOT_FOUND,
      `VS Code auto-detection is not supported on ${platform}. Provide executable_path or set VSCODE_PLAYWRIGHT_VSCODE_PATH.`,
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      logger.info('vscode_detected', { path: candidate });
      return candidate;
    }
  }

  throw new ToolError(
    ErrorCode.VSCODE_NOT_FOUND,
    `VS Code not found in well-known paths. Install VS Code or provide executable_path. Searched: ${candidates.join(', ')}`,
  );
}

/** Default settings injected before launch to suppress UI noise */
const BASE_SETTINGS: Record<string, unknown> = {
  'workbench.startupEditor': 'none',
  'workbench.tips.enabled': false,
  'workbench.colorTheme': 'Default Dark Modern',
  'update.mode': 'none',
  'extensions.autoUpdate': false,
  'telemetry.telemetryLevel': 'off',
  'window.restoreWindows': 'none',
  'workbench.enableExperiments': false,
  'extensions.ignoreRecommendations': true,
  'workbench.panel.defaultLocation': 'bottom',
  'chat.commandCenter.enabled': false,
  'github.copilot.chat.enabled': false,
};

/**
 * Write settings.json to the user-data-dir BEFORE launch.
 * Merges base settings with user overrides (user overrides win).
 */
export async function injectSettings(
  userDataDir: string,
  userSettings?: Record<string, unknown>,
): Promise<void> {
  const settingsDir = path.join(userDataDir, 'User');
  await fs.promises.mkdir(settingsDir, { recursive: true });

  const merged = { ...BASE_SETTINGS, ...userSettings };
  const settingsPath = path.join(settingsDir, 'settings.json');
  await fs.promises.writeFile(settingsPath, JSON.stringify(merged, null, 2));

  logger.debug('settings_injected', { path: settingsPath, keys: Object.keys(merged) });
}

export interface LaunchResult {
  app: ElectronApplication;
  window: Page;
  userDataDir: string;
  pid: number;
}

export interface LaunchConfig {
  executablePath?: string;
  workspace?: string;
  extensionDevelopmentPath?: string;
  extensions?: string[];
  settings?: Record<string, unknown>;
  args?: string[];
  viewport?: { width: number; height: number };
}

/**
 * Resolve the path to the compiled helper extension bundled in dist/.
 * Returns null if the extension files are not found (e.g. development without build).
 */
function resolveHelperExtensionPath(): string | null {
  const thisFile = fileURLToPath(import.meta.url);
  const distDir = path.dirname(thisFile);
  const helperDir = path.join(distDir, 'helper-extension');
  const manifest = path.join(helperDir, 'package.json');
  if (fs.existsSync(manifest)) return helperDir;
  return null;
}

/**
 * Copy the compiled helper extension into the session's extensions directory.
 * VS Code discovers it on startup via the standard extension loading mechanism.
 */
async function installHelperExtension(extensionsDir: string): Promise<boolean> {
  const helperSrc = resolveHelperExtensionPath();
  if (!helperSrc) {
    logger.warn('helper_extension_not_found', { expected: 'dist/helper-extension/' });
    return false;
  }

  const dest = path.join(extensionsDir, 'vscode-mcp-helper');
  await fs.promises.cp(helperSrc, dest, { recursive: true });
  logger.debug('helper_extension_installed', { dest });
  return true;
}

/**
 * Launch a VS Code Electron instance with full isolation.
 * Creates a temp user-data-dir, injects settings, and launches via Playwright.
 */
export async function launchVSCode(config: LaunchConfig): Promise<LaunchResult> {
  const vscodePath = resolveVSCodePath(config.executablePath);
  const userDataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-mcp-'));

  logger.info('launch_start', { vscodePath, userDataDir, workspace: config.workspace });

  // Inject settings BEFORE launch
  await injectSettings(userDataDir, config.settings);

  // Install helper extension into the isolated extensions directory
  const extensionsDir = path.join(userDataDir, 'extensions');
  await fs.promises.mkdir(extensionsDir, { recursive: true });
  const helperInstalled = await installHelperExtension(extensionsDir);
  if (helperInstalled) {
    logger.debug('helper_extension_ready_for_activation');
  }

  // Build CLI args
  const launchArgs = [
    // Required: playwright@1.59+ removed --remote-debugging-port=0 from Electron defaults,
    // but it's still needed for CDP communication with the VS Code process.
    '--remote-debugging-port=0',
    '--disable-gpu',
    '--disable-workspace-trust',
    '--skip-release-notes',
    '--disable-telemetry',
    '--new-window',
    `--user-data-dir=${userDataDir}`,
    `--extensions-dir=${path.join(userDataDir, 'extensions')}`,
  ];

  // CI-specific flags
  if (process.env['CI']) {
    launchArgs.push('--no-sandbox', '--disable-dev-shm-usage');
  }

  // Extension under development (loads from source, no .vsix needed)
  if (config.extensionDevelopmentPath) {
    launchArgs.push(`--extensionDevelopmentPath=${config.extensionDevelopmentPath}`);
  }

  // Extension installation (.vsix files)
  if (config.extensions) {
    for (const ext of config.extensions) {
      launchArgs.push(`--install-extension=${ext}`);
    }
  }

  // User-provided additional args (with blocklist for dangerous flags)
  if (config.args) {
    const BLOCKED_ARGS = [
      '--remote-debugging-port', '--inspect', '--inspect-brk', '--inspect-port', '--js-flags',
      '--disable-web-security', '--allow-running-insecure-content', '--no-sandbox',
      '--load-extension', '--disable-features',
    ];
    for (const arg of config.args) {
      if (BLOCKED_ARGS.some((blocked) => arg.startsWith(blocked))) {
        throw new ToolError(
          ErrorCode.INVALID_INPUT,
          `Blocked dangerous launch argument: "${arg}". Flags like --inspect and --remote-debugging-port are not allowed.`,
        );
      }
    }
    launchArgs.push(...config.args);
  }

  // Workspace path goes last (positional arg)
  if (config.workspace) {
    launchArgs.push(config.workspace);
  }

  const app = await _electron.launch({
    executablePath: vscodePath,
    args: launchArgs,
    env: { ...process.env, VSCODE_MCP_USER_DATA_DIR: userDataDir },
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Resize the Electron BrowserWindow content area, wait for the renderer to
  // process the new size, then sync Playwright's viewport.  Without this the
  // window starts at Electron's default size and setViewportSize alone leaves
  // black bars where the content doesn't fill the frame.
  const viewport = config.viewport ?? DEFAULT_VIEWPORT;
  const DIMENSION_TOLERANCE = 2;
  const LAYOUT_SETTLE_TIMEOUT_MS = 2_000;

  await app.evaluate(
    ({ BrowserWindow }, { width, height }) => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (win) win.setContentSize(width, height);
    },
    viewport,
  );

  try {
    // Use `globalThis` instead of `window` inside the callback — tsup renames
    // the outer `window` variable (Playwright Page), which shadows the browser
    // global inside the serialised function body.
    await window.waitForFunction(
      ({ w, h, tol }) =>
        Math.abs(globalThis.innerWidth - w) <= tol && Math.abs(globalThis.innerHeight - h) <= tol,
      { w: viewport.width, h: viewport.height, tol: DIMENSION_TOLERANCE },
      { timeout: LAYOUT_SETTLE_TIMEOUT_MS },
    );
  } catch {
    // Timeout is not fatal — proceed with viewport sync anyway.
    logger.debug('launch_viewport_wait_timeout', viewport);
  }

  await window.setViewportSize(viewport);

  // Get PID for cleanup tracking
  const pid = getPid(app);

  logger.info('launch_complete', { pid, userDataDir });

  return { app, window, userDataDir, pid };
}

function getPid(app: ElectronApplication): number {
  try {
    // ElectronApplication.process() returns the spawned child process
    const proc = app.process();
    return proc.pid ?? 0;
  } catch {
    return 0;
  }
}
