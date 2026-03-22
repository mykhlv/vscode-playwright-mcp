# Changelog

## Unreleased

### Added
- `vscode_resize` tool: resize the VS Code viewport on the fly (min 200x200, max 3840x2160) for responsive layout testing
- `vscode_zoom` tool: capture a cropped screenshot of a specific region for closer inspection of small UI details, Monaco editor text, or status bar items
- `vscode_find_element` tool: search the accessibility tree by role and/or name with case-insensitive partial matching — returns matching elements with `[ref=eN]` for immediate use with `vscode_click` or `vscode_hover`
- **Ref-based interaction**: `vscode_snapshot` now returns `[ref=eN]` on interactive elements (buttons, tabs, tree items, etc.) — pass refs to `vscode_click(ref="e5")` or `vscode_hover(ref="e5")` for deterministic clicks without coordinate guessing
- `vscode_click` and `vscode_hover` accept `ref` parameter (from snapshot) as preferred alternative to x/y coordinates
- `vscode_snapshot` uses Playwright's AI snapshot mode internally, with fallback to legacy `ariaSnapshot()` when custom selector is specified
- `vscode_get_state` now scrapes peek widget (references/definitions), rename input box, and completion details panel — reduces need for screenshots
- Per-tool watchdog timeout — each tool has its own timeout; exceeding it transitions the session to UNRESPONSIVE state
- `vscode_evaluate` tool: run arbitrary JavaScript in the VS Code renderer process (DOM queries, VS Code API access)
- `vscode_wait_for` tool: wait for a CSS selector state, text appearance, or a simple delay before proceeding
- `vscode_console` tool: retrieve and filter console messages (log/warn/error/info) captured from the renderer process
- `vscode_ensure_file` tool: reliably open and activate a specific file by path with verification and retry (replaces error-prone Quick Open workflow)
- `vscode_get_state` now returns IntelliSense completions when the suggest widget is visible (label, kind, detail, selected state)
- `vscode_gif` tool: record VS Code actions as animated GIF with start/stop/save actions
- Auto-capture hook captures frames after each successful tool call while recording
- GifRecorder class with PNG-to-GIF encoding via gifenc, nearest-neighbor scaling (1280x720 → 640x360), frame limit protection
- Configurable viewport size (`width`/`height`) in `vscode_launch`
- `vscode_run_command` tool: execute VS Code commands via Command Palette automation (Meta+Shift+P → type → Enter)
- `vscode_get_state` tool: read editor state via DOM scraping (active file, cursor position, diagnostics, visible lines)
- `vscode_get_hover` tool: read hover tooltip content as text from `.monaco-hover-content` DOM elements
- `vscode_get_state` now scrapes the Problems panel (`.markers-panel`) for detailed diagnostics with severity, message, line, source, and code
- `vscode_click` and `vscode_hover` now accept `line` and `column` parameters for editor positioning without coordinate guessing
- `resolveEditorPosition()` helper converts editor line:column to pixel coordinates via DOM scraping
- MCP server with stdio transport and 10 core tools:
  `vscode_launch`, `vscode_close`, `vscode_screenshot`, `vscode_snapshot`,
  `vscode_click`, `vscode_type`, `vscode_press_key`, `vscode_hover`, `vscode_scroll`, `vscode_drag`
- Session manager with state machine (IDLE/LAUNCHING/READY/CLOSING/ERROR/CRASHED/UNRESPONSIVE)
- VS Code binary auto-detection on macOS and Linux
- Pre-launch settings injection to suppress Welcome tab and telemetry
- Isolated temp user-data-dir per session
- Process cleanup hooks (SIGINT, SIGTERM, exit)
- Structured JSON logging to stderr
- Input validation with LLM-actionable error messages
- Key combo normalization (Ctrl->Control, Cmd->Meta, etc.)
- Internal retry for transient CDP transport errors
- Key combo validation against known Playwright key names (rejects unrecognized keys, detects multiple non-modifier keys)
- Scroll amount validation (positive, max 100)
- E2E tests for full MCP protocol loop over stdio
- Integration and unit tests for all tools

### Changed
- Migrated tool registration from deprecated `server.tool()` to `server.registerTool()` API
- Replaced raw JSON Schema tool definitions with Zod schemas for type-safe parameter validation
- Added `zod` as a direct dependency (required by MCP SDK)
- Added ESLint with TypeScript and stylistic rules; removed all `any` usage
