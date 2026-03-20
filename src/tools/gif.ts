/**
 * Tool handler for vscode_gif: start/stop/save GIF recording.
 */

import type { GifRecorder } from '../session/gif-recorder.js';
import type { GifParams } from '../types/tool-params.js';
import { type ToolResult, textResult } from '../types/tool-results.js';
import { ErrorCode, ToolError } from '../types/errors.js';

export async function handleGif(
  recorder: GifRecorder,
  params: GifParams,
): Promise<ToolResult> {
  switch (params.action) {
    case 'start': {
      recorder.startRecording();
      return textResult(
        'GIF recording started. Frames will be captured automatically after each tool call. ' +
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

      const result = await recorder.save(params.filename, params.delay, params.progress_bar);

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
