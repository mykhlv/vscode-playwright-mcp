/**
 * Tool registry: exports all tool definitions with Zod schemas and handler dispatch.
 */

import { z } from 'zod';
import type { SessionManager } from '../session/session-manager.js';
import type { ToolResult } from '../types/tool-results.js';
import type {
  LaunchParams, CloseParams, ScreenshotParams, SnapshotParams,
  ClickParams, TypeParams, PressKeyParams,
  HoverParams, ScrollParams, DragParams,
  RunCommandParams, GetStateParams, GetHoverParams,
  GifParams,
} from '../types/tool-params.js';
import { handleLaunch, handleClose } from './launch.js';
import { handleScreenshot, handleSnapshot } from './vision.js';
import { handleType, handlePressKey } from './keyboard.js';
import { handleClick, handleHover, handleScroll, handleDrag } from './mouse.js';
import { handleRunCommand } from './command.js';
import { handleGetState, handleGetHover } from './state.js';
import { handleGif } from './gif.js';
import type { GifRecorder } from '../session/gif-recorder.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
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
      handler: (session, params) => handleLaunch(session, params as LaunchParams),
    },
    {
      name: 'vscode_close',
      description: 'Close the running VS Code instance and clean up temporary files.',
      inputSchema: z.object({}),
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
      handler: (session, params) => handleScreenshot(session, params as ScreenshotParams),
    },
    {
      name: 'vscode_snapshot',
      description:
        'Get an accessibility tree snapshot of the VS Code UI. ' +
        'Returns YAML-like text with roles, names, states, and keyboard shortcuts — but NO coordinates. ' +
        'Buttons include keyboard shortcuts like "Toggle Primary Side Bar (Cmd+B)" — use these with vscode_press_key for reliable navigation. ' +
        'Preferred workflow: vscode_snapshot -> find keyboard shortcut -> vscode_press_key. ' +
        'NOTE: Monaco editor content appears as a single textbox — use vscode_screenshot to read code.',
      inputSchema: z.object({
        max_depth: z.number().optional()
          .describe('Maximum tree depth. Default: 5. Higher = more detail but more tokens.'),
        selector: z.string().optional()
          .describe('CSS selector to scope the snapshot. Default: "body" (full window).'),
      }),
      handler: (session, params) => handleSnapshot(session, params as SnapshotParams),
    },
    {
      name: 'vscode_click',
      description:
        'Click at pixel coordinates OR editor line:column in the VS Code window. ' +
        'Provide either (x, y) for pixel coordinates or (line, column) for editor positions. ' +
        'Use vscode_screenshot first to identify the target coordinates visually. ' +
        'For editor content, line:column avoids coordinate guessing — the line must be visible in the viewport. ' +
        'Supports left/right/middle click, double-click (click_count=2), and modifier keys.',
      inputSchema: z.object({
        x: z.number().optional().describe('X coordinate (logical pixels). Required if line/column not provided.'),
        y: z.number().optional().describe('Y coordinate (logical pixels). Required if line/column not provided.'),
        line: z.number().optional().describe('Editor line number (1-based). Must be visible in viewport. Use instead of x/y for editor content.'),
        column: z.number().optional().describe('Editor column number (1-based). Used with line parameter.'),
        button: z.enum(['left', 'right', 'middle']).optional()
          .describe('Mouse button. Default: left.'),
        click_count: z.number().optional()
          .describe('Number of clicks. Use 2 for double-click. Default: 1.'),
        modifiers: z.array(z.enum(['Control', 'Shift', 'Alt', 'Meta'])).optional()
          .describe('Modifier keys to hold during click.'),
      }),
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
      handler: (session, params) => handleType(session, params as TypeParams),
    },
    {
      name: 'vscode_press_key',
      description:
        'Press a keyboard shortcut or key combination. ' +
        'Format: "Control+Shift+p", "Meta+b", "F2", "Escape", "Enter". ' +
        'Use Meta for Cmd on macOS. Common aliases: Ctrl=Control, Cmd=Meta, Esc=Escape. ' +
        'Best workflow: use vscode_snapshot to discover shortcuts in button names, then press them directly.',
      inputSchema: z.object({
        key: z.string().describe('Key or key combination. Examples: "Control+Shift+p", "Meta+b", "F2", "Escape".'),
      }),
      handler: (session, params) => handlePressKey(session, params as PressKeyParams),
    },
    {
      name: 'vscode_hover',
      description:
        'Move the mouse to pixel coordinates OR editor line:column without clicking. ' +
        'Use this to trigger hover effects like tooltips, hover documentation, error details, and quick info popups. ' +
        'Provide either (x, y) for pixel coordinates or (line, column) for editor positions. ' +
        'For editor content, line:column avoids coordinate guessing — the line must be visible in the viewport. ' +
        'Take a screenshot after hovering to see the tooltip content.',
      inputSchema: z.object({
        x: z.number().optional().describe('X coordinate (logical pixels). Required if line/column not provided.'),
        y: z.number().optional().describe('Y coordinate (logical pixels). Required if line/column not provided.'),
        line: z.number().optional().describe('Editor line number (1-based). Must be visible in viewport. Use instead of x/y for editor content.'),
        column: z.number().optional().describe('Editor column number (1-based). Used with line parameter.'),
      }),
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
      handler: (session, params) => handleDrag(session, params as DragParams),
    },
    {
      name: 'vscode_run_command',
      description:
        'Execute a VS Code command via Command Palette automation (Meta+Shift+P → type → Enter). ' +
        'Use this for any VS Code command: "editor.action.goToDefinition", "workbench.action.toggleSidebarVisibility", etc. ' +
        'The command is typed into the Command Palette and the top match is executed. ' +
        'Use input for commands that require additional text typed into an input box (e.g., "Go to Line" needs a line number).',
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
      handler: (session, params) => handleRunCommand(session, params as RunCommandParams),
    },
    {
      name: 'vscode_get_state',
      description:
        'Read current editor state via DOM scraping — no screenshot needed. ' +
        'Returns: active file name, cursor position (line/column), diagnostics count (errors/warnings), ' +
        'selection info, and visible editor lines with line numbers. ' +
        'If the Problems panel is open (use vscode_run_command with "workbench.actions.view.problems" to open it), ' +
        'also returns detailed diagnostics with severity, message, line number, and source. ' +
        'Much faster and cheaper than a screenshot for getting editor metadata. ' +
        'Use vscode_screenshot when you need to see visual layout or precise code content.',
      inputSchema: z.object({
        diagnostics_file: z.string().optional()
          .describe('Filter diagnostics to only show entries matching this filename.'),
        diagnostics_severity: z.enum(['error', 'warning', 'info']).optional()
          .describe('Filter diagnostics by minimum severity: "error" shows only errors, "warning" shows errors and warnings, "info" shows all.'),
        visible_lines: z.union([z.literal('all'), z.literal('none'), z.number()]).optional()
          .describe('Control visible lines output: "all" returns all visible lines, "none" omits lines, a number returns up to N lines. Default: 15.'),
        wait_for_diagnostics: z.boolean().optional()
          .describe('If true, poll until diagnostics appear (or timeout). Useful after opening a file when LSP needs time to index.'),
        timeout: z.number().optional()
          .describe('Max wait time in ms for wait_for_diagnostics. Default: 5000.'),
      }),
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
      handler: (session, params) => handleGetHover(session, params as GetHoverParams),
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
      handler: (_session, params) => handleGif(recorder, params as GifParams),
    },
  ];
}
