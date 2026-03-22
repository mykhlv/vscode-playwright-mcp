/**
 * Return type interfaces for tool handlers.
 * Tools return these; the server layer converts them to MCP response format.
 */

export interface TextResult {
  type: 'text';
  text: string;
}

export interface ImageResult {
  type: 'image';
  data: string;       // base64-encoded image
  mimeType: 'image/jpeg' | 'image/png';
  metadata: string;   // Human-readable summary (dimensions, size, etc.)
}

export type ToolResult = TextResult | ImageResult;

/** Convenience builders */
export function textResult(text: string): ToolResult {
  return { type: 'text', text };
}

export function imageResult(data: Buffer, format: 'jpeg' | 'png', metadata: string): ToolResult {
  return {
    type: 'image',
    data: data.toString('base64'),
    mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
    metadata,
  };
}
