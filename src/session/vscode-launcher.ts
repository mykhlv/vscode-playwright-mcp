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
import { _electron } from 'playwright-core';
import type { ElectronApplication, Page } from 'playwright-core';
import { ErrorCode, ToolError } from '../types/errors.js';
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
  extensions?: string[];
  settings?: Record<string, unknown>;
  args?: string[];
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

  // Build CLI args
  const launchArgs = [
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

  // Extension installation
  if (config.extensions) {
    for (const ext of config.extensions) {
      launchArgs.push(`--install-extension=${ext}`);
    }
  }

  // User-provided additional args
  if (config.args) {
    launchArgs.push(...config.args);
  }

  // Workspace path goes last (positional arg)
  if (config.workspace) {
    launchArgs.push(config.workspace);
  }

  const app = await _electron.launch({
    executablePath: vscodePath,
    args: launchArgs,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Set explicit viewport — viewportSize() returns undefined for Electron without this
  await window.setViewportSize({ width: 1280, height: 720 });

  // Get PID for cleanup tracking
  const pid = await getPid(app);

  logger.info('launch_complete', { pid, userDataDir });

  return { app, window, userDataDir, pid };
}

async function getPid(app: ElectronApplication): Promise<number> {
  try {
    // ElectronApplication.process() returns the spawned child process
    const proc = app.process();
    return proc.pid ?? 0;
  } catch {
    return 0;
  }
}
