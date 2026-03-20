# Changelog

## Unreleased

### Added
- `vscode_ensure_file` tool: reliably open and activate a specific file by path with verification and retry (replaces error-prone Quick Open workflow)
- `vscode_get_state` now returns IntelliSense completions when the suggest widget is visible (label, kind, detail, selected state)
- `vscode_gif` tool: record VS Code actions as animated GIF with start/stop/save actions
- Auto-capture hook captures frames after each successful tool call while recording
- GifRecorder class with PNG-to-GIF encoding via gifenc, nearest-neighbor scaling (1280x720 → 640x360), frame limit protection
- `vscode_run_command` tool: execute VS Code commands via Command Palette automation (Meta+Shift+P → type → Enter)
- `vscode_get_state` tool: read editor state via DOM scraping (active file, cursor position, diagnostics, visible lines)
- `vscode_get_hover` tool: read hover tooltip content as text from `.monaco-hover-content` DOM elements
- `vscode_get_state` now scrapes the Problems panel (`.markers-panel`) for detailed diagnostics with severity, message, line, source, and code
- `vscode_click` and `vscode_hover` now accept `line` and `column` parameters for editor positioning without coordinate guessing
- `resolveEditorPosition()` helper converts editor line:column to pixel coordinates via DOM scraping
- Unit tests for DOM scraping script structure and selectors

### Changed
- Migrated tool registration from deprecated `server.tool()` to `server.registerTool()` API
- Replaced raw JSON Schema tool definitions with Zod schemas for type-safe parameter validation
- Added `zod` as a direct dependency (required by MCP SDK)

### Added
- MCP server with stdio transport and 7 core tools:
  `vscode_launch`, `vscode_close`, `vscode_screenshot`, `vscode_snapshot`,
  `vscode_click`, `vscode_type`, `vscode_press_key`
- Session manager with state machine (IDLE/LAUNCHING/READY/CLOSING/ERROR/CRASHED/UNRESPONSIVE)
- VS Code binary auto-detection on macOS and Linux
- Pre-launch settings injection to suppress Welcome tab and telemetry
- Isolated temp user-data-dir per session
- Process cleanup hooks (SIGINT, SIGTERM, exit)
- Structured JSON logging to stderr
- Input validation with LLM-actionable error messages
- Key combo normalization (Ctrl->Control, Cmd->Meta, etc.)
- Internal retry for transient CDP transport errors
- Unit tests for validation, key mapping, session state machine, config resolution
- Three remaining tools: `vscode_hover`, `vscode_scroll`, `vscode_drag`
- Key combo validation against known Playwright key names (rejects unrecognized keys, detects multiple non-modifier keys)
- Scroll amount validation (positive, max 100)
- Unit tests for key validation, scroll amount validation, `isKnownKey` helper
