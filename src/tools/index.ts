/**
 * Tool registry: exports all tool definitions with MCP schemas and handler dispatch.
 */

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

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (session: SessionManager, params: any) => Promise<ToolResult>;
}

export const tools: ToolDefinition[] = [
  {
    name: 'vscode_launch',
    description:
      'Launch a new VS Code instance with an isolated environment. ' +
      'Creates a temporary user-data-dir for state isolation. ' +
      'After launch, use vscode_screenshot to see the current state or vscode_snapshot to explore UI elements.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: {
          type: 'string',
          description: 'Absolute path to a folder or .code-workspace file to open.',
        },
        extensions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Paths to .vsix files to pre-install before launch.',
        },
        settings: {
          type: 'object',
          description: 'VS Code settings overrides (merged with defaults that suppress Welcome tab and telemetry).',
        },
        executable_path: {
          type: 'string',
          description: 'Path to VS Code Electron binary. Auto-detected if omitted.',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional CLI arguments to pass to VS Code.',
        },
      },
    },
    handler: (session, params) => handleLaunch(session, params as LaunchParams),
  },
  {
    name: 'vscode_close',
    description: 'Close the running VS Code instance and clean up temporary files.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: (session, params) => handleClose(session, params as CloseParams),
  },
  {
    name: 'vscode_screenshot',
    description:
      'Capture a screenshot of the VS Code window as JPEG (default) or PNG. ' +
      'Use this to see editor content, visual state, and identify coordinates for vscode_click. ' +
      'Monaco editor content is only visible via screenshots, not via vscode_snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        region: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
          required: ['x', 'y', 'width', 'height'],
          description: 'Optional crop region. Omit to capture the full window.',
        },
        format: {
          type: 'string',
          enum: ['jpeg', 'png'],
          description: 'Image format. Default: jpeg.',
        },
        quality: {
          type: 'number',
          description: 'JPEG quality 1-100. Default: 75. Ignored for PNG.',
        },
        scale: {
          type: 'number',
          description: 'Scale factor. 0.5 = half size. Default: 1.0.',
        },
      },
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
      type: 'object',
      properties: {
        max_depth: {
          type: 'number',
          description: 'Maximum tree depth. Default: 5. Higher = more detail but more tokens.',
        },
        selector: {
          type: 'string',
          description: 'CSS selector to scope the snapshot. Default: "body" (full window).',
        },
      },
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
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate (logical pixels).' },
        y: { type: 'number', description: 'Y coordinate (logical pixels).' },
        button: {
          type: 'string',
          enum: ['left', 'right', 'middle'],
          description: 'Mouse button. Default: left.',
        },
        click_count: {
          type: 'number',
          description: 'Number of clicks. Use 2 for double-click. Default: 1.',
        },
        modifiers: {
          type: 'array',
          items: { type: 'string', enum: ['Control', 'Shift', 'Alt', 'Meta'] },
          description: 'Modifier keys to hold during click.',
        },
      },
      required: ['x', 'y'],
    },
    handler: (session, params) => handleClick(session, params as ClickParams),
  },
  {
    name: 'vscode_type',
    description:
      'Type text at the current cursor position. ' +
      'Make sure the target input is focused first (click on it, or use keyboard shortcuts to open Command Palette, Quick Open, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to type.',
        },
        delay: {
          type: 'number',
          description: 'Delay between keystrokes in ms. Default: 0.',
        },
      },
      required: ['text'],
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
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Key or key combination. Examples: "Control+Shift+p", "Meta+b", "F2", "Escape".',
        },
      },
      required: ['key'],
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
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate (logical pixels).' },
        y: { type: 'number', description: 'Y coordinate (logical pixels).' },
      },
      required: ['x', 'y'],
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
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate to scroll at (logical pixels).' },
        y: { type: 'number', description: 'Y coordinate to scroll at (logical pixels).' },
        direction: {
          type: 'string',
          enum: ['up', 'down', 'left', 'right'],
          description: 'Scroll direction.',
        },
        amount: {
          type: 'number',
          description: 'Scroll units (each ~100px). Default: 3. Max: 100.',
        },
      },
      required: ['x', 'y', 'direction'],
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
      type: 'object',
      properties: {
        start_x: { type: 'number', description: 'Start X coordinate (logical pixels).' },
        start_y: { type: 'number', description: 'Start Y coordinate (logical pixels).' },
        end_x: { type: 'number', description: 'End X coordinate (logical pixels).' },
        end_y: { type: 'number', description: 'End Y coordinate (logical pixels).' },
      },
      required: ['start_x', 'start_y', 'end_x', 'end_y'],
    },
    handler: (session, params) => handleDrag(session, params as DragParams),
  },
];

/** Map of tool name -> definition for O(1) lookup */
export const toolMap = new Map(tools.map(t => [t.name, t]));
