/**
 * Collects console messages from the VS Code renderer process.
 * Attach to a Playwright Page to capture console.log/warn/error/info output.
 */

import type { Page, ConsoleMessage } from 'playwright';
import { logger } from '../utils/logger.js';

export const MAX_MESSAGES = 10_000;
export const TRIM_AMOUNT = 1_000;

interface CollectedMessage {
  level: string;
  text: string;
  timestamp: number;
}

export class ConsoleCollector {
  private messages: CollectedMessage[] = [];
  private listener: ((msg: ConsoleMessage) => void) | null = null;
  private attachedPage: Page | null = null;

  attach(page: Page): void {
    this.detach();
    this.messages = [];
    this.attachedPage = page;
    this.listener = (msg: ConsoleMessage) => {
      this.messages.push({
        level: msg.type(),  // 'log', 'warning', 'error', 'info', etc.
        text: msg.text(),
        timestamp: Date.now(),
      });
      if (this.messages.length > MAX_MESSAGES) {
        logger.warn('console_buffer_trimmed', {
          dropped: TRIM_AMOUNT,
          remaining: this.messages.length - TRIM_AMOUNT,
        });
        this.messages = this.messages.slice(TRIM_AMOUNT);
      }
    };
    page.on('console', this.listener);
  }

  /** Number of messages currently buffered. */
  get messageCount(): number {
    return this.messages.length;
  }

  detach(): void {
    if (this.listener && this.attachedPage) {
      this.attachedPage.removeListener('console', this.listener);
      this.listener = null;
    }
    this.attachedPage = null;
  }
}
