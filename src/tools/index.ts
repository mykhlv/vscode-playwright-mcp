/**
 * Tool registry: exports all tool definitions with Zod schemas and handler dispatch.
 */

import { z } from 'zod';
import type { SessionManager } from '../session/session-manager.js';
import type { ToolResult } from '../types/tool-results.js';
import type {
  LaunchParams, CloseParams, ScreenshotParams,
  ClickParams, TypeParams, PressKeyParams,
  HoverParams, ScrollParams, DragParams,
  RunCommandParams, GetStateParams, GetHoverParams,
  EnsureFileParams, GifParams,
  EvaluateParams, WaitForParams, ConsoleParams,
} from '../types/tool-params.js';
import { handleLaunch, handleClose } from './launch.js';
import { handleScreenshot, handleSnapshot } from './vision.js';
import { handleType, handlePressKey } from './keyboard.js';
import { handleClick, handleHover, handleScroll, handleDrag } from './mouse.js';
import { handleRunCommand } from './command.js';
import { handleGetState, handleGetHover } from './state.js';
import { handleEnsureFile } from './file.js';
import { handleGif } from './gif.js';
import { handleEvaluate } from './evaluate.js';
import { handleWaitFor } from './wait-for.js';
import { handleConsole } from './console.js';
import type { GifRecorder } from '../session/gif-recorder.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  /** Watchdog timeout in ms. If the handler doesn't resolve within this time,
   * the call fails with TIMEOUT error and session transitions to UNRESPONSIVE. */
  timeoutMs: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (session: SessionManager, params: any) => Promise<ToolResult>;
}

/**
 * Create tool definitions with access to the shared GIF recorder.
 * The recorder is captured by closure in the vscode_gif handler.
 */
export function createTools(recorder: GifRecorder): ToolDefinition[] {
  return [
    {
      name: 'vscode_launch',
      description:
        'Launch a new VS Code instance with an isolated environment. ' +
        'Creates a temporary user-data-dir for state isolation. ' +
        'Use extension_development_path to load an extension from source for testing. ' +
        'After launch, use vscode_screenshot to see the current state or vscode_snapshot to explore UI elements.',
      inputSchema: z.object({
        workspace: z.string().optional()
          .describe('Absolute path to a folder or .code-workspace file to open.'),
        extension_development_path: z.string().optional()
          .describe('Absolute path to an extension directory to load in development mode (--extensionDevelopmentPath). The extension is loaded from source without packaging as .vsix.'),
        extensions: z.array(z.string()).optional()
          .describe('Paths to .vsix files to pre-install before launch.'),
        settings: z.record(z.string(), z.unknown()).optional()
          .describe('VS Code settings overrides (merged with defaults that suppress Welcome tab and telemetry).'),
        executable_path: z.string().optional()
          .describe('Path to VS Code Electron binary. Auto-detected if omitted.'),
        args: z.array(z.string()).optional()
          .describe('Additional CLI arguments to pass to VS Code.'),
        viewport: z.object({
          width: z.number(),
          height: z.number(),
        }).optional()
          .describe('Viewport size in logical pixels. Default: { width: 1280, height: 720 }.'),
      }),
      timeoutMs: 35_000,
      handler: (session, params) => handleLaunch(session, params as LaunchParams),
    },
    {
      name: 'vscode_close',
      description: 'Close the running VS Code instance and clean up temporary files.',
      inputSchema: z.object({}),
      timeoutMs: 15_000,
      handler: (session, params) => handleClose(session, params as CloseParams),
    },
    {
      name: 'vscode_screenshot',
      description:
        'Capture a screenshot of the VS Code window as JPEG (default) or PNG. ' +
        'Use this to see editor content, visual state, and identify coordinates for vscode_click. ' +
        'Monaco editor content is only visible via screenshots, not via vscode_snapshot.',
      inputSchema: z.object({
        region: z.object({
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        }).optional()
          .describe('Optional crop region. Omit to capture the full window.'),
        format: z.enum(['jpeg', 'png']).optional()
          .describe('Image format. Default: jpeg.'),
        quality: z.number().optional()
          .describe('JPEG quality 1-100. Default: 75. Ignored for PNG.'),
      }),
      timeoutMs: 5_000,
      handler: (session, params) => handleScreenshot(session, params as ScreenshotParams),
    },
    {
      name: 'vscode_snapshot',
      description:
        'Get an accessibility tree snapshot of the VS Code UI. ' +
        'Returns YAML-like text with roles, names, states, and keyboard shortcuts. ' +
        'Interactive elements have [ref=eN] annotations — pass these refs to vscode_click or vscode_hover for deterministic clicks without coordinates. ' +
        'Refs expire when the UI changes or on the next vscode_snapshot call. ' +
        'Buttons include keyboard shortcuts like "Toggle Primary Side Bar (Cmd+B)" — use with vscode_press_key for navigation. ' +
        'NOTE: Monaco editor content appears as a single textbox — use vscode_screenshot to read code.',
      inputSchema: z.object({}),
      timeoutMs: 10_000,
      handler: (session) => handleSnapshot(session),
    },
    {
      name: 'vscode_click',
      description:
        'Click on a UI element or editor position. Three modes (pick one): ' +
        '1. ref — from vscode_snapshot [ref=eN], deterministic, preferred for buttons/tabs/tree items. ' +
        '2. line, column — for editor content (line must be visible in viewport). ' +
        '3. x, y — pixel coordinates from vscode_screenshot, fallback only. ' +
        'Supports left/right/middle click, double-click (click_count=2), and modifier keys.',
      inputSchema: z.object({
        ref: z.string().optional().describe('Element ref from vscode_snapshot [ref=eN]. Preferred — no coordinate guessing needed.'),
        x: z.number().optional().describe('X coordinate (logical pixels). Fallback when ref is not available.'),
        y: z.number().optional().describe('Y coordinate (logical pixels). Fallback when ref is not available.'),
        line: z.number().optional().describe('Editor line number (1-based). Must be visible in viewport.'),
        column: z.number().optional().describe('Editor column number (1-based). Used with line.'),
        button: z.enum(['left', 'right', 'middle']).optional()
          .describe('Mouse button. Default: left.'),
        click_count: z.number().optional()
          .describe('Number of clicks. Use 2 for double-click. Default: 1.'),
        modifiers: z.array(z.enum(['Control', 'Shift', 'Alt', 'Meta'])).optional()
          .describe('Modifier keys to hold during click.'),
      }),
      timeoutMs: 5_000,
      handler: (session, params) => handleClick(session, params as ClickParams),
    },
    {
      name: 'vscode_type',
      description:
        'Type text at the current cursor position. ' +
        'Make sure the target input is focused first (click on it, or use keyboard shortcuts to open Command Palette, Quick Open, etc.). ' +
        'NOTE: VS Code may not trigger IntelliSense for trigger characters (like $ or .) when text is typed as a batch. ' +
        'If you need completions to appear, type the trigger character separately with a small delay: vscode_type("$", delay: 50).',
      inputSchema: z.object({
        text: z.string().describe('Text to type.'),
        delay: z.number().optional()
          .describe('Delay between keystrokes in ms. Default: 0.'),
      }),
      timeoutMs: 5_000,
      handler: (session, params) => handleType(session, params as TypeParams),
    },
    {
      name: 'vscode_press_key',
      description:
        'Press a keyboard shortcut or key combination. ' +
        'Format: "Control+Shift+p", "Meta+b", "F2", "Escape", "Enter". ' +
        'Use Meta for Cmd on macOS. Common aliases: Ctrl=Control, Cmd=Meta, Esc=Escape. ' +
        'Note: some Meta+key combos (e.g. Meta+End) may be intercepted by Electron/macOS; ' +
        'use Meta+ArrowDown instead of Meta+End for go-to-end-of-file. ' +
        'Best workflow: use vscode_snapshot to discover shortcuts in button names, then press them directly.',
      inputSchema: z.object({
        key: z.string().describe('Key or key combination. Examples: "Control+Shift+p", "Meta+b", "F2", "Escape". Arrow keys are auto-normalized: Left→ArrowLeft, Up→ArrowUp, etc.'),
      }),
      timeoutMs: 5_000,
      handler: (session, params) => handlePressKey(session, params as PressKeyParams),
    },
    {
      name: 'vscode_hover',
      description:
        'Move the mouse to a UI element or editor position without clicking. ' +
        'Triggers hover effects: tooltips, documentation, error details, quick info popups. ' +
        'Three modes (pick one): ref (from vscode_snapshot), line+column (editor), x+y (pixel fallback). ' +
        'After hovering, use vscode_get_hover to read tooltip text, or vscode_screenshot to see it visually.',
      inputSchema: z.object({
        ref: z.string().optional().describe('Element ref from vscode_snapshot [ref=eN]. Preferred — no coordinate guessing needed.'),
        x: z.number().optional().describe('X coordinate (logical pixels). Fallback when ref is not available.'),
        y: z.number().optional().describe('Y coordinate (logical pixels). Fallback when ref is not available.'),
        line: z.number().optional().describe('Editor line number (1-based). Must be visible in viewport.'),
        column: z.number().optional().describe('Editor column number (1-based). Used with line.'),
      }),
      timeoutMs: 5_000,
      handler: (session, params) => handleHover(session, params as HoverParams),
    },
    {
      name: 'vscode_scroll',
      description:
        'Scroll at a specific position in the VS Code window. ' +
        'Position the mouse at (x, y) then scroll in the given direction. ' +
        'Works in any scrollable panel: editor, file explorer, terminal, output, etc. ' +
        'Amount is in scroll units (default: 3). Each unit is approximately 100 pixels.',
      inputSchema: z.object({
        x: z.number().describe('X coordinate to scroll at (logical pixels).'),
        y: z.number().describe('Y coordinate to scroll at (logical pixels).'),
        direction: z.enum(['up', 'down', 'left', 'right']).describe('Scroll direction.'),
        amount: z.number().optional()
          .describe('Scroll units (each ~100px). Default: 3. Max: 100.'),
      }),
      timeoutMs: 5_000,
      handler: (session, params) => handleScroll(session, params as ScrollParams),
    },
    {
      name: 'vscode_drag',
      description:
        'Drag from one position to another (mouse down, move, mouse up). ' +
        'Use for drag-and-drop operations: reordering tabs, moving files in explorer, resizing panels, selecting text regions. ' +
        'The drag is performed in 10 incremental steps for smooth movement.',
      inputSchema: z.object({
        start_x: z.number().describe('Start X coordinate (logical pixels).'),
        start_y: z.number().describe('Start Y coordinate (logical pixels).'),
        end_x: z.number().describe('End X coordinate (logical pixels).'),
        end_y: z.number().describe('End Y coordinate (logical pixels).'),
      }),
      timeoutMs: 5_000,
      handler: (session, params) => handleDrag(session, params as DragParams),
    },
    {
      name: 'vscode_run_command',
      description:
        'Execute a VS Code command via Command Palette automation (Meta+Shift+P → type → Enter). ' +
        'The command is typed into the Command Palette and the top match is executed. ' +
        'Use input for commands that open an input box (e.g., "Go to Line" needs a line number). ' +
        'Common commands: "File: Revert File" (undo all changes), "View: Toggle Problems" (open/close diagnostics panel), ' +
        '"Go to Line" (with input: line number), "editor.action.goToDefinition", "workbench.action.toggleSidebarVisibility", ' +
        '"Close Editor", "View: Toggle Terminal".',
      inputSchema: z.object({
        command: z.string()
          .describe('VS Code command ID or name, e.g. "editor.action.goToDefinition" or "Toggle Sidebar".'),
        input: z.string().optional()
          .describe(
            'Optional text typed into an input box AFTER the command is selected and executed. ' +
            'Works for commands that open an input box (e.g., "Go to Line" expects a line number, "Quick Open" expects a filename). ' +
            'Does NOT work for commands that accept programmatic arguments — this is keyboard input, not an API call.',
          ),
      }),
      timeoutMs: 10_000,
      handler: (session, params) => handleRunCommand(session, params as RunCommandParams),
    },
    {
      name: 'vscode_get_state',
      description:
        'Read current editor state via DOM scraping — no screenshot needed. ' +
        'Returns: active file name, cursor position, diagnostics, selection, visible lines, ' +
        'IntelliSense completions (when suggest widget is open), peek widget results (references/definitions), ' +
        'rename widget value, and completion details (type signature + docs). ' +
        'If the Problems panel is open, returns detailed diagnostics with severity, message, line, and source. ' +
        'Much faster and cheaper than a screenshot for getting editor metadata. ' +
        'Use vscode_screenshot when you need to see visual layout or precise code content.',
      inputSchema: z.object({
        diagnostics_file: z.string().optional()
          .describe('Filter diagnostics to only show entries matching this filename.'),
        diagnostics_severity: z.enum(['error', 'warning', 'info']).optional()
          .describe('Filter diagnostics by minimum severity: "error" shows only errors, "warning" shows errors and warnings, "info" shows all.'),
        visible_lines: z.union([z.literal('all'), z.literal('none'), z.number()]).optional()
          .describe('Control visible lines output: "all" returns all visible lines, "none" omits lines (pass the string none, not quoted), a number returns up to N lines. Default: 15.'),
        wait_for_diagnostics: z.boolean().optional()
          .describe('If true, poll until diagnostics appear (or timeout). Useful after opening a file when LSP needs time to index.'),
        timeout: z.number().optional()
          .describe('Max wait time in ms for wait_for_diagnostics. Default: 5000.'),
      }),
      timeoutMs: 15_000,
      handler: (session, params) => handleGetState(session, params as GetStateParams),
    },
    {
      name: 'vscode_get_hover',
      description:
        'Read the content of a visible hover tooltip as text. ' +
        'Must be called AFTER vscode_hover has triggered a tooltip at specific coordinates. ' +
        'Returns the hover text (type info, documentation, error details) without needing a screenshot. ' +
        'If no tooltip is visible, returns a message suggesting to use vscode_hover first.',
      inputSchema: z.object({}),
      timeoutMs: 5_000,
      handler: (session, params) => handleGetHover(session, params as GetHoverParams),
    },
    {
      name: 'vscode_ensure_file',
      description:
        'Open and activate a specific file in the editor by its path. ' +
        'More reliable than Quick Open via vscode_run_command — verifies the correct file became active and retries on mismatch. ' +
        'Use this instead of manually opening files to avoid "wrong active file" mistakes. ' +
        'The path should match a file in the open workspace (absolute or relative paths accepted).',
      inputSchema: z.object({
        path: z.string()
          .describe('File path to open. Can be absolute or workspace-relative. Example: "src/index.ts" or "/Users/me/project/src/index.ts".'),
      }),
      timeoutMs: 10_000,
      handler: (session, params) => handleEnsureFile(session, params as EnsureFileParams),
    },
    {
      name: 'vscode_gif',
      description:
        'Record VS Code actions as an animated GIF for documentation. ' +
        'Use action "start" to begin recording (frames captured automatically after each tool call). ' +
        'Use action "stop" to stop recording. ' +
        'Use action "save" with a filename to export the GIF.',
      inputSchema: z.object({
        action: z.enum(['start', 'stop', 'save']).describe('Recording action.'),
        filename: z.string().optional().describe('Output filename for "save" action. Absolute path or relative to workspace.'),
        delay: z.number().optional().describe('Frame delay in ms for "save" action. Overrides auto-calculated timing. Range: 100-2000ms.'),
        progress_bar: z.boolean().optional().describe('Show a thin progress bar at the bottom of the GIF. Default: false.'),
        capture_on: z.enum(['auto', 'manual']).optional().describe(
          'Frame capture mode for "start" action. ' +
          '"auto" (default): frames captured automatically after visual tool calls. ' +
          '"manual": frames captured only when vscode_screenshot is called, giving full control over which moments appear in the GIF.',
        ),
      }),
      timeoutMs: 5_000,
      handler: (_session, params) => handleGif(recorder, params as GifParams),
    },
    {
      name: 'vscode_evaluate',
      description:
        'Evaluate a JavaScript expression in the VS Code renderer process. ' +
        'Returns the result serialized as JSON. ' +
        'Use this for advanced DOM queries, reading VS Code internal state, or running arbitrary scripts. ' +
        'The expression runs in the Electron renderer context with full access to the DOM and VS Code APIs.',
      inputSchema: z.object({
        expression: z.string()
          .describe('JS expression to evaluate in the VS Code renderer process. Result returned as JSON.'),
        timeout: z.number().optional()
          .describe('Max execution time in ms. Default: 30000.'),
      }),
      timeoutMs: 35_000,
      handler: (session, params) => handleEvaluate(session, params as EvaluateParams),
    },
    {
      name: 'vscode_wait_for',
      description:
        'Wait for a condition before proceeding. ' +
        'Three modes: (1) CSS selector — wait for an element to reach a state (visible/hidden/attached/detached). ' +
        '(2) Text — wait for text to appear anywhere on the page. ' +
        '(3) Neither — simple delay. ' +
        'Cannot combine selector and text. Default timeout: 5000ms.',
      inputSchema: z.object({
        selector: z.string().optional()
          .describe('CSS selector to wait for.'),
        state: z.enum(['visible', 'hidden', 'attached', 'detached']).optional()
          .describe('Element state to wait for. Only valid with selector. Default: visible.'),
        timeout: z.number().optional()
          .describe('Max wait time in ms. Default: 5000.'),
        text: z.string().optional()
          .describe('Text content to wait for on the page. Cannot be combined with selector.'),
      }),
      timeoutMs: 10_000,
      handler: (session, params) => handleWaitFor(session, params as WaitForParams),
    },
    {
      name: 'vscode_console',
      description:
        'Retrieve console messages captured from the VS Code renderer process. ' +
        'Messages are collected continuously after launch. ' +
        'Filter by level (log/warn/error/info/all) and optionally clear the buffer after reading. ' +
        'Useful for debugging extension output, checking for errors, and verifying log messages.',
      inputSchema: z.object({
        clear: z.boolean().optional()
          .describe('If true, clear the message buffer after retrieving. Default: false.'),
        level: z.enum(['log', 'warn', 'error', 'info', 'all']).optional()
          .describe('Filter by message level. "warn" matches Playwright\'s "warning" type. Default: all.'),
        limit: z.number().optional()
          .describe('Max number of messages to return. Returns most recent. Default: all.'),
      }),
      timeoutMs: 5_000,
      handler: (session, params) => handleConsole(session, params as ConsoleParams),
    },
  ];
}
