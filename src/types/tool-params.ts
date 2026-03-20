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
}

export interface CloseParams {
  // No parameters
}

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
  args?: string;
}

export interface GetStateParams {
  // No parameters
}

export interface GetHoverParams {
  // No parameters
}
