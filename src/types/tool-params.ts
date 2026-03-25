/**
 * Input parameter interfaces for VS Code-specific tools.
 * Generic browser tools (click, type, screenshot, etc.) are handled by @playwright/mcp.
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

export interface RunCommandParams {
  command: string;
  input?: string;
  args?: unknown[];
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

export interface ScrollParams {
  x: number;
  y: number;
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number;
}

export interface ZoomParams {
  x: number;
  y: number;
  width: number;
  height: number;
  format?: 'jpeg' | 'png';
  quality?: number;
}

export interface FindElementParams {
  role?: string;
  name?: string;
  max_results?: number;
}

export interface ResizeParams {
  width: number;
  height: number;
}

export interface GetTextParams {
  uri?: string;
}

export interface EditorInsertParams {
  text: string;
  line?: number;
  character?: number;
}

export interface GetDiagnosticsParams {
  uri?: string;
  severity?: 'error' | 'warning' | 'information' | 'hint';
}
