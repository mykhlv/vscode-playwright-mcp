/**
 * Tool handler for vscode_gif: start/stop/save GIF recording.
 */

import { resolve, isAbsolute, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { GifRecorder } from '../session/gif-recorder.js';
import type { GifParams } from '../types/tool-params.js';
import { type ToolResult, textResult } from '../types/tool-results.js';
import { ErrorCode, ToolError } from '../types/errors.js';
import { logger } from '../utils/logger.js';

export async function handleGif(
  recorder: GifRecorder,
  params: GifParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_gif', action: params.action });
  switch (params.action) {
    case 'start': {
      const captureMode = params.capture_on ?? 'auto';
      recorder.startRecording(captureMode);

      const modeDescription = captureMode === 'manual'
        ? 'Frames will be captured only when you call vscode_screenshot.'
        : 'Frames will be captured automatically after each visual tool call.';

      return textResult(
        `GIF recording started (capture_on: ${captureMode}). ${modeDescription} ` +
        'Use vscode_gif with action "stop" to stop recording, then "save" with a filename to export.',
      );
    }

    case 'stop': {
      recorder.stopRecording();
      return textResult(
        `GIF recording stopped. ${recorder.frameCount} frames captured. ` +
        'Use vscode_gif with action "save" and a filename to export the GIF.',
      );
    }

    case 'save': {
      if (!params.filename) {
        throw new ToolError(
          ErrorCode.INVALID_INPUT,
          'The "save" action requires a "filename" parameter. Provide an absolute path or relative filename like "demo.gif".',
        );
      }

      if (!params.filename.endsWith('.gif')) {
        throw new ToolError(
          ErrorCode.INVALID_INPUT,
          'GIF filename must end with ".gif".',
        );
      }

      // Resolve path: absolute paths used as-is, relative paths resolved from cwd
      const resolved = isAbsolute(params.filename) ? params.filename : resolve(process.cwd(), params.filename);

      // Validate the parent directory exists so we get a clear error instead of ENOENT
      const parentDir = dirname(resolved);
      if (!existsSync(parentDir)) {
        throw new ToolError(
          ErrorCode.INVALID_INPUT,
          `Parent directory does not exist: ${parentDir}. Create it first or use a different path.`,
        );
      }

      const result = await recorder.save(resolved, params.delay, params.progress_bar);

      return textResult(
        `GIF saved: ${result.path}\n` +
        `Frames: ${result.frameCount}, Size: ${formatBytes(result.size)}`,
      );
    }

    default: {
      const _exhaustive: never = params.action;
      throw new ToolError(
        ErrorCode.INVALID_INPUT,
        `Unknown GIF action: "${_exhaustive}". Use "start", "stop", or "save".`,
      );
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
