# vscode-playwright-mcp

Playwright for VS Code. An MCP server that gives LLMs full mouse, keyboard, and visual control over VS Code via Playwright's Electron API.

Just like [Playwright MCP](https://github.com/anthropics/playwright-mcp) lets AI control web browsers, `vscode-playwright-mcp` lets AI control VS Code — click UI elements, type code, run commands, take screenshots, read editor state, and record GIFs.

**Use cases:**
- E2E testing of VS Code extensions
- Automated VS Code workflows and tasks
- AI-driven code editing and refactoring
- Interactive demos and tutorials
- Testing themes, keybindings, and settings

## How It Works

A single Node.js process communicates over stdio using the MCP (Model Context Protocol) JSON-RPC transport. It launches VS Code as an Electron app via `playwright-core`, giving the connected LLM full control through 22 tools.

Each session runs in an isolated temp `--user-data-dir` with telemetry and the Welcome tab suppressed automatically.

## Requirements

- Node.js >= 22
- VS Code installed locally (the server auto-detects the binary on macOS and Linux)
- `playwright-core` (no browser downloads needed)

## Installation

```bash
npm install
npm run build
```

## Usage

Configure your MCP client to launch the server over stdio:

```json
{
  "mcpServers": {
    "vscode": {
      "command": "node",
      "args": ["dist/index.js"]
    }
  }
}
```

You can pass a custom VS Code binary path:

```bash
node dist/index.js --vscode-path /path/to/code
```

## Tools

### Lifecycle

| Tool | Description |
|------|-------------|
| `vscode_launch` | Launch a VS Code instance. Options: workspace folder, extensions to install, viewport size. |
| `vscode_close` | Gracefully close the running VS Code instance. |

### Vision

| Tool | Description |
|------|-------------|
| `vscode_screenshot` | Capture a full-window screenshot (JPEG or PNG). |
| `vscode_zoom` | Capture a cropped screenshot of a specific region for closer inspection. |
| `vscode_snapshot` | Get an accessibility tree snapshot with `[ref=eN]` annotations on interactive elements. |
| `vscode_find_element` | Search the accessibility tree by role and/or name. Returns matching elements with refs. |

### Mouse

| Tool | Description |
|------|-------------|
| `vscode_click` | Click at x/y coordinates, a `ref` from snapshot, or an editor `line`/`column`. |
| `vscode_hover` | Hover at x/y coordinates, a `ref`, or an editor `line`/`column`. |
| `vscode_scroll` | Scroll up or down by a given amount. |
| `vscode_drag` | Drag from one point to another. |

### Keyboard

| Tool | Description |
|------|-------------|
| `vscode_type` | Type text into the focused element. |
| `vscode_press_key` | Press a key combination (e.g., `Control+Shift+P`). |

### Commands and State

| Tool | Description |
|------|-------------|
| `vscode_run_command` | Execute a VS Code command via Command Palette automation. |
| `vscode_get_state` | Read editor state via DOM scraping: active file, cursor, diagnostics, completions, peek widget. |
| `vscode_get_hover` | Read hover tooltip content as text. |
| `vscode_ensure_file` | Open and activate a file by path with verification and retry. |

### Advanced

| Tool | Description |
|------|-------------|
| `vscode_evaluate` | Run arbitrary JavaScript in the VS Code renderer process. |
| `vscode_wait_for` | Wait for a CSS selector state, text appearance, or a simple delay. |
| `vscode_console` | Retrieve console messages (log/warn/error/info) from the renderer process. |
| `vscode_resize` | Resize the VS Code viewport on the fly (min 200x200, max 3840x2160). |
| `vscode_gif` | Record VS Code actions as an animated GIF. |

## Interaction Strategies

The LLM has two main ways to interact with VS Code:

1. **Keyboard-first (preferred for navigation):** `vscode_snapshot` shows roles, names, states, and keyboard shortcuts. The LLM reads the snapshot, identifies the target, and uses `vscode_press_key` or a `ref`-based click.

2. **Visual (required for editor content):** Monaco editor content is opaque to accessibility APIs. The LLM takes a `vscode_screenshot`, reads the image, and clicks at x/y coordinates or uses `line`/`column` parameters.

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

## How is this different from Playwright MCP?

[Playwright MCP](https://github.com/anthropics/playwright-mcp) controls **web browsers** (Chrome, Firefox, etc.). This project controls **VS Code** — a desktop Electron app with its own UI paradigm (editors, panels, command palette, extensions). The tools are purpose-built for VS Code interaction patterns.

## License

Private.
