/**
 * Input parameter interfaces for all tools.
 * These map 1:1 to the JSON schemas registered with the MCP server.
 */

export interface LaunchParams {
  workspace?: string;
  extension_development_path?: string;
  extensions?: string[];
  settings?: Record<string, unknown>;
  executable_path?: string;
  args?: string[];
  viewport?: { width: number; height: number };
}

export type CloseParams = Record<string, never>;

export interface ScreenshotParams {
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  format?: 'jpeg' | 'png';
  quality?: number;
}

export interface SnapshotParams {
  max_depth?: number;
  selector?: string;
}

export interface ClickParams {
  x?: number;
  y?: number;
  line?: number;
  column?: number;
  button?: 'left' | 'right' | 'middle';
  click_count?: number;
  modifiers?: ('Control' | 'Shift' | 'Alt' | 'Meta')[];
}

export interface TypeParams {
  text: string;
  delay?: number;
}

export interface PressKeyParams {
  key: string;
}

export interface HoverParams {
  x?: number;
  y?: number;
  line?: number;
  column?: number;
}

export interface ScrollParams {
  x: number;
  y: number;
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number;
}

export interface DragParams {
  start_x: number;
  start_y: number;
  end_x: number;
  end_y: number;
}

export interface RunCommandParams {
  command: string;
  input?: string;
}

export interface GetStateParams {
  diagnostics_file?: string;
  diagnostics_severity?: 'error' | 'warning' | 'info';
  visible_lines?: 'all' | 'none' | number;
  wait_for_diagnostics?: boolean;
  timeout?: number;
}

export type GetHoverParams = Record<string, never>;

export interface EnsureFileParams {
  path: string;
}

export interface GifParams {
  action: 'start' | 'stop' | 'save';
  filename?: string;
  delay?: number;
  progress_bar?: boolean;
  capture_on?: 'auto' | 'manual';
}
