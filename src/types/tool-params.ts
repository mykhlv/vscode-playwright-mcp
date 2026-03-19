/**
 * Input parameter interfaces for all Phase 1 tools.
 * These map 1:1 to the JSON schemas registered with the MCP server.
 */

export interface LaunchParams {
  workspace?: string;
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
  scale?: number;
}

export interface SnapshotParams {
  max_depth?: number;
  selector?: string;
}

export interface ClickParams {
  x: number;
  y: number;
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
