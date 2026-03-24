# Changelog

## Unreleased

### Changed
- **`vscode_resize` is now a native Electron resize**: Resizes the actual `BrowserWindow` (via `getFocusedWindow()` with fallback) instead of only the Playwright viewport. Includes input validation (200-7680 x 200-4320), error handling, and proper propagation when no window is found. `browser_resize` remains filtered out.
- **GIF quality improvements**: 960x540 output resolution, bilinear scaling, Floyd-Steinberg dithering, and global palette for consistent colors across frames.
- **Security hardening**: Expanded blocked Electron CLI args, pre-launch guard for native tools, SIGINT/SIGTERM handlers with correct exit codes (130/143).
- **Tool descriptions fixed**: `browser_*` references replaced with `vscode_*` in aliased tool descriptions.
- **`@playwright/mcp` pinned to exact version** to guard against breaking changes in private API usage.
- Various code quality improvements: `ToolError.cause` for error chaining, logger safety, viewport validation.

### Changed (BREAKING)
- **Built on top of `@playwright/mcp`**: Generic tools (click, type, screenshot, snapshot, hover, drag, resize, evaluate, wait_for, console) are now delegated to `@playwright/mcp` upstream. All tools keep their `vscode_*` names via aliasing — no breaking change for LLM consumers.
- Replaced `playwright-core` dependency with `@playwright/mcp` (which brings `playwright` transitively)
- `createServer()` is now async (returns `Promise<Server>`)

### Added
- **Lazy tool discovery**: Before `vscode_launch`, only 1 tool is visible. After launch, `tools/list_changed` notification reveals all ~26 tools. Saves ~10k context tokens for clients that support it.
- `ContextBridge` class: deferred-promise bridge between our launch/close lifecycle and upstream's contextGetter
- New aliased tools from upstream: `vscode_click_xy`, `vscode_hover_xy`, `vscode_drag_xy`, `vscode_select_option`, `vscode_fill_form`
- SDK compatibility guard: clear error message if `@playwright/mcp` internals change
- Upstream "Target closed" errors mapped to actionable LLM hint

### Removed
- Deleted ~1500 lines of tool handlers delegated to upstream: `keyboard.ts`, `evaluate.ts`, `wait-for.ts`, `console.ts`, `key-mapping.ts`
- Removed `spikes/` directory (Phase 0 validation scripts)

## 0.1.0 — Initial Implementation

### Added
- MCP server with stdio transport
- 10 native VS Code tools: `vscode_launch`, `vscode_close`, `vscode_run_command`, `vscode_get_state`, `vscode_get_hover`, `vscode_ensure_file`, `vscode_scroll`, `vscode_zoom`, `vscode_find_element`, `vscode_gif`
- Ref-based interaction: `vscode_snapshot` returns `[ref=eN]` on interactive elements
- Editor state scraping: cursor, diagnostics, completions, peek widget, rename input, Problems panel
- `vscode_run_command`: Command Palette automation (Meta+Shift+P → type → Enter)
- `vscode_ensure_file`: reliable file open with verification and retry
- `vscode_zoom`: cropped screenshot for Monaco text inspection
- `vscode_find_element`: a11y tree search by role/name
- `vscode_gif`: animated GIF recording with auto-capture hook
- Configurable viewport size in `vscode_launch`
- Session manager with state machine (IDLE/LAUNCHING/READY/CLOSING/ERROR/CRASHED/UNRESPONSIVE)
- VS Code binary auto-detection on macOS and Linux
- Pre-launch settings injection (suppress Welcome tab and telemetry)
- Isolated temp user-data-dir per session
- Process cleanup hooks (SIGINT, SIGTERM, exit)
- Per-tool watchdog timeouts
- Structured JSON logging to stderr
- Input validation with LLM-actionable error messages
- E2E, integration, and unit tests
