# vscode-playwright-mcp

A VS Code-aware layer on top of [@playwright/mcp](https://github.com/microsoft/playwright-mcp). Gives LLMs full control over VS Code — click UI elements, type code, run commands, take screenshots, read editor state, and record GIFs.

**Use cases:**
- E2E testing of VS Code extensions
- Automated VS Code workflows and tasks
- AI-driven code editing and refactoring
- Interactive demos and tutorials
- Testing themes, keybindings, and settings

## How It Works

Built on top of `@playwright/mcp`, which provides generic Electron automation (click, type, screenshot, etc.). We add a VS Code-specific layer: isolated launch with temp user-data-dir, command palette automation, editor state scraping, and Monaco-aware tools.

Generic tools from `@playwright/mcp` are aliased to `vscode_*` names for a unified LLM experience. Before `vscode_launch`, only 1 tool is visible (lazy discovery saves ~10k context tokens). After launch, all 26 tools appear.

## Requirements

- Node.js >= 22
- VS Code installed locally (auto-detected on macOS and Linux)

## Quick Start

```json
{
  "mcpServers": {
    "vscode": {
      "command": "npx",
      "args": ["-y", "vscode-playwright-mcp"]
    }
  }
}
```

Custom VS Code binary:

```json
{
  "mcpServers": {
    "vscode": {
      "command": "npx",
      "args": ["-y", "vscode-playwright-mcp", "--vscode-path", "/path/to/code"]
    }
  }
}
```

## Tools

### Lifecycle

| Tool | Description |
|------|-------------|
| `vscode_launch` | Launch an isolated VS Code instance. Options: workspace, extensions, viewport size, settings. |
| `vscode_close` | Close VS Code and clean up temp files/processes. |

### Vision (aliased from @playwright/mcp)

| Tool | Description |
|------|-------------|
| `vscode_screenshot` | Full-window screenshot. |
| `vscode_snapshot` | Accessibility tree with `[ref=eN]` annotations on interactive elements. |
| `vscode_zoom` | Cropped screenshot of a specific region (native — Monaco-aware). |
| `vscode_find_element` | Search a11y tree by role/name, returns refs (native). |

### Mouse & Keyboard (aliased from @playwright/mcp)

| Tool | Description |
|------|-------------|
| `vscode_click` | Click by ref, element description, or coordinates. |
| `vscode_type` | Type text into focused element. |
| `vscode_press_key` | Press key combinations (e.g., `Control+Shift+P`). |
| `vscode_hover` | Hover to reveal tooltips. |
| `vscode_drag` | Drag from one point to another. |
| `vscode_click_xy` | Click at exact pixel coordinates. |
| `vscode_hover_xy` | Hover at exact pixel coordinates. |
| `vscode_drag_xy` | Drag between exact pixel coordinates. |
| `vscode_select_option` | Select from dropdown/combobox. |
| `vscode_fill_form` | Fill form inputs. |

### VS Code Commands (native)

| Tool | Description |
|------|-------------|
| `vscode_run_command` | Execute a VS Code command via Command Palette automation. |
| `vscode_ensure_file` | Open and activate a file by path with verification. |

### State (native)

| Tool | Description |
|------|-------------|
| `vscode_get_state` | Read editor state: active file, cursor, diagnostics, completions, peek widget. |
| `vscode_get_hover` | Read hover tooltip content as text. |

### Advanced (mixed)

| Tool | Description |
|------|-------------|
| `vscode_evaluate` | Run JavaScript in the VS Code renderer process (aliased). |
| `vscode_wait_for` | Wait for selector state, text, or delay (aliased). |
| `vscode_console` | Retrieve console messages from renderer (aliased). |
| `vscode_resize` | Resize the VS Code window and viewport (native). |
| `vscode_scroll` | Scroll up/down by amount (native). |
| `vscode_gif` | Record actions as animated GIF (native). |

## Interaction Strategies

1. **Ref-based (preferred for UI):** `vscode_snapshot` → see `[ref=eN]` annotations → `vscode_click(ref="e5")`. Deterministic, no coordinate guessing.

2. **Keyboard-first (preferred for navigation):** `vscode_snapshot` → see shortcuts → `vscode_press_key`. Fastest for commands.

3. **Visual (required for editor content):** Monaco editor is opaque to accessibility APIs. `vscode_screenshot` or `vscode_zoom` → read the image → `vscode_click_xy(x, y)`.

## How is this different from Playwright MCP?

This project is **built on top of** [@playwright/mcp](https://github.com/microsoft/playwright-mcp), not a replacement. Playwright MCP provides generic Electron automation. We add:

- **Isolated VS Code launch** with temp user-data-dir, suppressed Welcome tab, settings injection
- **Command palette automation** (`vscode_run_command`) — execute commands by name
- **Editor state scraping** (`vscode_get_state`) — cursor, diagnostics, completions, peek widget
- **Monaco-aware tools** (`vscode_zoom`, `vscode_find_element`) — the editor is invisible to generic a11y tools
- **Lazy tool discovery** — 1 tool visible before launch, all ~26 after (saves context tokens)
- **GIF recording** of VS Code sessions

## Development

```bash
npm run build          # Build with tsup
npm run dev            # Build in watch mode
npm test               # Run unit tests (vitest)
npm run test:integration  # Run integration tests (requires VS Code)
npm run test:e2e       # Run E2E tests (full MCP protocol loop)
npm run typecheck      # Type-check with tsc
npm run lint           # Lint with ESLint
```

## License

[MIT](LICENSE)
