# Changelog

## Unreleased

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
