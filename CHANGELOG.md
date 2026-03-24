# Changelog

## 0.1.0 — 2026-03-25

### Added
- MCP server with stdio transport, built on top of `@playwright/mcp`
- 10 native VS Code tools: `vscode_launch`, `vscode_close`, `vscode_run_command`, `vscode_get_state`, `vscode_get_hover`, `vscode_ensure_file`, `vscode_scroll`, `vscode_zoom`, `vscode_find_element`, `vscode_gif`
- 16 aliased tools from `@playwright/mcp`: `vscode_screenshot`, `vscode_snapshot`, `vscode_click`, `vscode_type`, `vscode_press_key`, `vscode_hover`, `vscode_drag`, `vscode_evaluate`, `vscode_wait_for`, `vscode_console`, `vscode_click_xy`, `vscode_hover_xy`, `vscode_drag_xy`, `vscode_select_option`, `vscode_fill_form`, `vscode_resize`
- `vscode_resize` is a native Electron tool — resizes the actual `BrowserWindow`, not just the Playwright viewport
- Lazy tool discovery: before `vscode_launch`, only 1 tool is visible. After launch, `tools/list_changed` reveals all 26 tools (saves ~10k context tokens)
- `ContextBridge` class: deferred-promise bridge between launch/close lifecycle and upstream's `contextGetter()`
- Ref-based interaction: `vscode_snapshot` returns `[ref=eN]` annotations on interactive elements
- Editor state scraping: cursor position, diagnostics, completions, peek widget, rename input, Problems panel
- `vscode_run_command`: Command Palette automation (Meta+Shift+P → type → Enter)
- `vscode_ensure_file`: reliable file open with verification and retry
- `vscode_zoom`: cropped screenshot for Monaco text inspection
- `vscode_find_element`: accessibility tree search by role/name
- `vscode_gif`: animated GIF recording with auto-capture, bilinear scaling, Floyd-Steinberg dithering, global palette
- Configurable viewport size in `vscode_launch`
- Session manager with state machine (IDLE/LAUNCHING/READY/CLOSING/ERROR/CRASHED/UNRESPONSIVE)
- VS Code binary auto-detection on macOS and Linux
- Pre-launch settings injection (suppress Welcome tab and telemetry)
- Isolated temp user-data-dir per session
- Process cleanup hooks (SIGINT, SIGTERM, exit) with correct Unix exit codes
- Per-tool watchdog timeouts with UNRESPONSIVE state transition
- Structured JSON logging to stderr
- Input validation with Zod schemas and LLM-actionable error messages
- Security: blocked dangerous Electron flags, pre-launch guard for native tools
- SDK compatibility guard: clear error if `@playwright/mcp` internals change
- Upstream "Target closed" errors mapped to actionable LLM hints
- MIT license, SECURITY.md, GitHub Actions CI/CD
- E2E, integration, and unit tests (142 unit, 18 integration)
