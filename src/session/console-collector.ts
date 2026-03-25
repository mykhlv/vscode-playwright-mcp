/**
 * Manages console message listener lifecycle for the VS Code renderer process.
 * Attach to a Playwright Page to suppress noisy console output from polluting logs.
 */

import type { Page, ConsoleMessage } from 'playwright';

export class ConsoleCollector {
  private listener: ((msg: ConsoleMessage) => void) | null = null;
  private attachedPage: Page | null = null;

  attach(page: Page): void {
    this.detach();
    this.attachedPage = page;
    // Listener is intentionally a no-op — it exists to capture console events
    // so they don't propagate as unhandled. The upstream @playwright/mcp
    // vscode_console tool provides console access when needed.
    this.listener = () => {};
    page.on('console', this.listener);
  }

  detach(): void {
    if (this.listener && this.attachedPage) {
      this.attachedPage.removeListener('console', this.listener);
      this.listener = null;
    }
    this.attachedPage = null;
  }
}
