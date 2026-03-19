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
} from '../types/tool-params.js';
import { handleLaunch, handleClose } from './launch.js';
import { handleScreenshot, handleSnapshot } from './vision.js';
import { handleType, handlePressKey } from './keyboard.js';
import { handleClick, handleHover, handleScroll, handleDrag } from './mouse.js';

/**
 * Zod shape type: a plain object of Zod schemas (one per parameter).
 * Passed directly to server.registerTool({ inputSchema }).
 */
type ZodShape = Record<string, z.ZodType>;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodShape;
  // Params are validated by Zod before reaching the handler, so the cast is safe
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (session: SessionManager, params: any) => Promise<ToolResult>;
}

export const tools: ToolDefinition[] = [
  {
    name: 'vscode_launch',
    description:
      'Launch a new VS Code instance with an isolated environment. ' +
      'Creates a temporary user-data-dir for state isolation. ' +
      'Use extension_development_path to load an extension from source for testing. ' +
      'After launch, use vscode_screenshot to see the current state or vscode_snapshot to explore UI elements.',
    inputSchema: {
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
    },
    handler: (session, params) => handleLaunch(session, params as LaunchParams),
  },
  {
    name: 'vscode_close',
    description: 'Close the running VS Code instance and clean up temporary files.',
    inputSchema: {},
    handler: (session, params) => handleClose(session, params as CloseParams),
  },
  {
    name: 'vscode_screenshot',
    description:
      'Capture a screenshot of the VS Code window as JPEG (default) or PNG. ' +
      'Use this to see editor content, visual state, and identify coordinates for vscode_click. ' +
      'Monaco editor content is only visible via screenshots, not via vscode_snapshot.',
    inputSchema: {
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
      scale: z.number().optional()
        .describe('Scale factor. 0.5 = half size. Default: 1.0.'),
    },
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
    inputSchema: {
      max_depth: z.number().optional()
        .describe('Maximum tree depth. Default: 5. Higher = more detail but more tokens.'),
      selector: z.string().optional()
        .describe('CSS selector to scope the snapshot. Default: "body" (full window).'),
    },
    handler: (session, params) => handleSnapshot(session, params as SnapshotParams),
  },
  {
    name: 'vscode_click',
    description:
      'Click at pixel coordinates in the VS Code window. ' +
      'Use vscode_screenshot first to identify the target coordinates visually. ' +
      'Supports left/right/middle click, double-click (click_count=2), and modifier keys.',
    inputSchema: {
      x: z.number().describe('X coordinate (logical pixels).'),
      y: z.number().describe('Y coordinate (logical pixels).'),
      button: z.enum(['left', 'right', 'middle']).optional()
        .describe('Mouse button. Default: left.'),
      click_count: z.number().optional()
        .describe('Number of clicks. Use 2 for double-click. Default: 1.'),
      modifiers: z.array(z.enum(['Control', 'Shift', 'Alt', 'Meta'])).optional()
        .describe('Modifier keys to hold during click.'),
    },
    handler: (session, params) => handleClick(session, params as ClickParams),
  },
  {
    name: 'vscode_type',
    description:
      'Type text at the current cursor position. ' +
      'Make sure the target input is focused first (click on it, or use keyboard shortcuts to open Command Palette, Quick Open, etc.).',
    inputSchema: {
      text: z.string().describe('Text to type.'),
      delay: z.number().optional()
        .describe('Delay between keystrokes in ms. Default: 0.'),
    },
    handler: (session, params) => handleType(session, params as TypeParams),
  },
  {
    name: 'vscode_press_key',
    description:
      'Press a keyboard shortcut or key combination. ' +
      'Format: "Control+Shift+p", "Meta+b", "F2", "Escape", "Enter". ' +
      'Use Meta for Cmd on macOS. Common aliases: Ctrl=Control, Cmd=Meta, Esc=Escape. ' +
      'Best workflow: use vscode_snapshot to discover shortcuts in button names, then press them directly.',
    inputSchema: {
      key: z.string().describe('Key or key combination. Examples: "Control+Shift+p", "Meta+b", "F2", "Escape".'),
    },
    handler: (session, params) => handlePressKey(session, params as PressKeyParams),
  },
  {
    name: 'vscode_hover',
    description:
      'Move the mouse to pixel coordinates without clicking. ' +
      'Use this to trigger hover effects like tooltips, hover documentation, error details, and quick info popups. ' +
      'Take a screenshot after hovering to see the tooltip content.',
    inputSchema: {
      x: z.number().describe('X coordinate (logical pixels).'),
      y: z.number().describe('Y coordinate (logical pixels).'),
    },
    handler: (session, params) => handleHover(session, params as HoverParams),
  },
  {
    name: 'vscode_scroll',
    description:
      'Scroll at a specific position in the VS Code window. ' +
      'Position the mouse at (x, y) then scroll in the given direction. ' +
      'Works in any scrollable panel: editor, file explorer, terminal, output, etc. ' +
      'Amount is in scroll units (default: 3). Each unit is approximately 100 pixels.',
    inputSchema: {
      x: z.number().describe('X coordinate to scroll at (logical pixels).'),
      y: z.number().describe('Y coordinate to scroll at (logical pixels).'),
      direction: z.enum(['up', 'down', 'left', 'right']).describe('Scroll direction.'),
      amount: z.number().optional()
        .describe('Scroll units (each ~100px). Default: 3. Max: 100.'),
    },
    handler: (session, params) => handleScroll(session, params as ScrollParams),
  },
  {
    name: 'vscode_drag',
    description:
      'Drag from one position to another (mouse down, move, mouse up). ' +
      'Use for drag-and-drop operations: reordering tabs, moving files in explorer, resizing panels, selecting text regions. ' +
      'The drag is performed in 10 incremental steps for smooth movement.',
    inputSchema: {
      start_x: z.number().describe('Start X coordinate (logical pixels).'),
      start_y: z.number().describe('Start Y coordinate (logical pixels).'),
      end_x: z.number().describe('End X coordinate (logical pixels).'),
      end_y: z.number().describe('End Y coordinate (logical pixels).'),
    },
    handler: (session, params) => handleDrag(session, params as DragParams),
  },
];

/** Map of tool name -> definition for O(1) lookup */
export const toolMap = new Map(tools.map(t => [t.name, t]));
