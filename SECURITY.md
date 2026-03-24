# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public issue
2. Use [GitHub's private vulnerability reporting](https://github.com/mykhlv/vscode-playwright-mcp/security/advisories/new) to submit the report
3. Include steps to reproduce if possible
4. Allow reasonable time for a fix before public disclosure

## Security Considerations

This MCP server launches a real VS Code (Electron) process and gives LLM clients full control over it, including:

- Mouse clicks and keyboard input
- File system access through VS Code
- Command execution via the Command Palette
- Screenshot capture of the VS Code window

### Recommendations

- **Run in isolated environments**: Use containers or VMs when running untrusted LLM-generated tool calls
- **Do not expose to the internet**: The stdio transport is designed for local MCP clients only
- **Review LLM actions**: Monitor tool calls in production workflows
- **Use a dedicated VS Code profile**: The server creates a temporary `--user-data-dir` per session, but the workspace files are real

### Built-in Protections

- **Blocked Electron flags**: Dangerous CLI arguments like `--disable-web-security`, `--no-sandbox`, and `--load-extension` are rejected at launch
- **Isolated sessions**: Each session uses a temporary user-data-dir, cleaned up on close
- **Process cleanup**: SIGINT/SIGTERM handlers and emergency cleanup prevent orphan VS Code processes
- **Input validation**: All tool parameters are validated with Zod schemas and LLM-actionable error messages
- **Timeout watchdog**: Per-tool timeouts prevent hung operations from blocking the server
