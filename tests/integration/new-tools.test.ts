/**
 * Integration tests: vscode_resize, vscode_zoom, vscode_find_element.
 *
 * Launches a single VS Code instance and tests the three new tools
 * against the live window.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { SessionManager } from '../../src/session/session-manager.js';
import {
  handleScreenshot, handleSnapshot, handleResize, handleZoom, handleFindElement,
} from '../../src/tools/vision.js';
import { handleClick } from '../../src/tools/mouse.js';
import { ToolError } from '../../src/types/errors.js';
import {
  isVSCodeAvailable,
  createSession,
  launchTestVSCode,
  assertText,
  assertImage,
  TEST_TIMEOUT,
  LAUNCH_TIMEOUT,
} from './setup.js';

const canRun = isVSCodeAvailable();

describe.skipIf(!canRun)('new-tools', { timeout: 120_000 }, () => {
  let session: SessionManager;

  beforeAll(async () => {
    session = createSession();
    await launchTestVSCode(session);
    // Let VS Code fully render before testing
    const page = session.getPage();
    await page.waitForTimeout(2000);
  }, LAUNCH_TIMEOUT);

  afterAll(async () => {
    await session.close();
  }, LAUNCH_TIMEOUT);

  // --- vscode_resize ---

  describe('vscode_resize', () => {
    afterEach(async () => {
      // Always restore viewport to default so subsequent tests are not affected
      try { await handleResize(session, { width: 1280, height: 720 }); } catch { /* ignore */ }
    });

    it('resizes viewport and reports new dimensions', { timeout: TEST_TIMEOUT }, async () => {
      const text = assertText(await handleResize(session, { width: 800, height: 600 }));
      expect(text).toContain('800x600');

      // Verify screenshot reflects new size
      const img = assertImage(await handleScreenshot(session, {}));
      expect(img.metadata).toContain('800x600');
    });

    it('restores to original viewport', { timeout: TEST_TIMEOUT }, async () => {
      // First resize away from default to verify restore works
      await handleResize(session, { width: 800, height: 600 });
      const text = assertText(await handleResize(session, { width: 1280, height: 720 }));
      expect(text).toContain('1280x720');
    });

    it('snapshot reflects resized layout', { timeout: TEST_TIMEOUT }, async () => {
      // Resize to narrow width
      await handleResize(session, { width: 400, height: 720 });
      const page = session.getPage();
      await page.waitForTimeout(500);

      // Snapshot should still work at narrow width
      const text = assertText(await handleSnapshot(session, {}));
      expect(text).toContain('Accessibility snapshot');
      expect(text.length).toBeGreaterThan(20);
      // afterEach restores viewport
    });

    it('rejects dimensions below minimum', { timeout: TEST_TIMEOUT }, async () => {
      await expect(
        handleResize(session, { width: 100, height: 100 }),
      ).rejects.toThrow(ToolError);
    });

    it('rejects dimensions above maximum', { timeout: TEST_TIMEOUT }, async () => {
      await expect(
        handleResize(session, { width: 5000, height: 3000 }),
      ).rejects.toThrow(ToolError);
    });
  });

  // --- vscode_zoom ---

  describe('vscode_zoom', () => {
    it('captures cropped region with offset metadata', { timeout: TEST_TIMEOUT }, async () => {
      const img = assertImage(await handleZoom(session, {
        x: 0, y: 0, width: 300, height: 200,
      }));

      expect(img.data.length).toBeGreaterThan(100);
      expect(img.metadata).toContain('300x200');
      expect(img.metadata).toContain('add (0, 0)');
    });

    it('crop is smaller than full screenshot', { timeout: TEST_TIMEOUT }, async () => {
      const full = assertImage(await handleScreenshot(session, {}));
      const cropped = assertImage(await handleZoom(session, {
        x: 100, y: 100, width: 200, height: 200,
      }));

      expect(cropped.data.length).toBeLessThan(full.data.length);
      expect(cropped.metadata).toContain('add (100, 100)');
    });

    it('crop at viewport edge succeeds', { timeout: TEST_TIMEOUT }, async () => {
      // Crop the bottom-right corner (right up to the viewport boundary)
      const img = assertImage(await handleZoom(session, {
        x: 1080, y: 520, width: 200, height: 200,
      }));

      expect(img.data.length).toBeGreaterThan(100);
    });

    it('crop exceeding viewport boundary throws', { timeout: TEST_TIMEOUT }, async () => {
      await expect(
        handleZoom(session, { x: 1200, y: 600, width: 200, height: 200 }),
      ).rejects.toThrow(ToolError);
    });

    it('supports PNG format', { timeout: TEST_TIMEOUT }, async () => {
      const img = assertImage(await handleZoom(session, {
        x: 0, y: 0, width: 200, height: 200, format: 'png',
      }));

      expect(img.mimeType).toBe('image/png');
    });
  });

  // --- vscode_find_element ---

  describe('vscode_find_element', () => {
    it('finds buttons in VS Code UI', { timeout: TEST_TIMEOUT }, async () => {
      const text = assertText(await handleFindElement(session, { role: 'button' }));
      expect(text).toContain('Found');
      expect(text).toContain('element(s)');
      expect(text).toContain('[ref=');
    });

    it('finds tabs by role', { timeout: TEST_TIMEOUT }, async () => {
      // VS Code may or may not have tabs depending on state,
      // but 'tab' should not match 'tablist' or 'tabpanel'
      const text = assertText(await handleFindElement(session, { role: 'tab' }));
      // Result is either "Found N" or "No elements found" — both are valid
      expect(text).toMatch(/Found \d+ element|No elements found/);
    });

    it('finds elements by name', { timeout: TEST_TIMEOUT }, async () => {
      // VS Code always has something with "Explorer" or "Search" in the UI
      const text = assertText(await handleFindElement(session, { name: 'Explorer' }));
      // May or may not find it depending on sidebar state
      expect(text).toMatch(/Found \d+ element|No elements found/);
    });

    it('combined role+name filter narrows results', { timeout: TEST_TIMEOUT }, async () => {
      const allButtons = assertText(await handleFindElement(session, { role: 'button' }));
      const filtered = assertText(await handleFindElement(session, {
        role: 'button', name: 'Toggle',
      }));

      // If both find results, filtered should have fewer or equal matches
      const allCount = allButtons.match(/Found (\d+)/)?.[1];
      const filteredCount = filtered.match(/Found (\d+)/)?.[1];
      if (allCount && filteredCount) {
        expect(Number(filteredCount)).toBeLessThanOrEqual(Number(allCount));
      }
    });

    it('max_results limits output', { timeout: TEST_TIMEOUT }, async () => {
      const text = assertText(await handleFindElement(session, {
        role: 'button', max_results: 2,
      }));

      if (text.includes('Found')) {
        const count = Number(text.match(/Found (\d+)/)?.[1] ?? 0);
        expect(count).toBeLessThanOrEqual(2);
      }
    });

    it('returns no-match message for non-existent role', { timeout: TEST_TIMEOUT }, async () => {
      const text = assertText(await handleFindElement(session, {
        role: 'nonexistentrole',
      }));
      expect(text).toContain('No elements found');
    });

    it('requires at least one filter', { timeout: TEST_TIMEOUT }, async () => {
      await expect(
        handleFindElement(session, {}),
      ).rejects.toThrow(ToolError);
    });

    it('refs from find_element work with vscode_click', { timeout: TEST_TIMEOUT }, async () => {
      // Dismiss any popups and let UI settle before taking snapshot
      const page = session.getPage();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      const text = assertText(await handleFindElement(session, { role: 'button' }));
      // Extract all refs and try clicking the first one that succeeds
      const refs = [...text.matchAll(/\[ref=(e\d+)\]/g)].map((m) => m[1]);
      if (refs.length === 0) return;

      let clicked = false;
      for (const ref of refs) {
        try {
          const clickResult = assertText(await handleClick(session, { ref }));
          expect(clickResult).toContain('Clicked');
          clicked = true;
          break;
        } catch {
          // Ref may have become stale due to UI animation — try next
          continue;
        }
      }
      expect(clicked).toBe(true);
    });

    it('result mentions refs are refreshed', { timeout: TEST_TIMEOUT }, async () => {
      const text = assertText(await handleFindElement(session, { role: 'button' }));
      if (text.includes('Found')) {
        expect(text).toContain('refs refreshed');
      }
    });
  });

  // --- Cross-tool integration ---

  describe('cross-tool flows', () => {
    it('resize → find_element → click ref', { timeout: TEST_TIMEOUT }, async () => {
      // Resize to a smaller viewport
      await handleResize(session, { width: 800, height: 600 });
      const page = session.getPage();
      await page.waitForTimeout(500);

      try {
        // Find a button
        const text = assertText(await handleFindElement(session, { role: 'button' }));
        const refMatch = text.match(/\[ref=(e\d+)\]/);

        if (refMatch) {
          // Click it — should work at the new viewport size
          const clickResult = assertText(await handleClick(session, { ref: refMatch[1] }));
          expect(clickResult).toContain('Clicked');
        }
      } finally {
        // Restore viewport even if assertions fail
        await handleResize(session, { width: 1280, height: 720 });
      }
    });

    it('zoom captures actual UI content (non-empty image)', { timeout: TEST_TIMEOUT }, async () => {
      // Take a zoom of the top-left area (usually has sidebar/activity bar)
      const img = assertImage(await handleZoom(session, {
        x: 0, y: 0, width: 50, height: 400,
      }));

      // Should be a non-trivial image (not empty/blank)
      expect(img.data.length).toBeGreaterThan(200);
    });

    it('find_element → find_element refreshes refs', { timeout: TEST_TIMEOUT }, async () => {
      // First search
      const first = assertText(await handleFindElement(session, { role: 'button' }));
      const firstRef = first.match(/\[ref=(e\d+)\]/)?.[1];

      // Second search
      const second = assertText(await handleFindElement(session, { role: 'button' }));
      const secondRef = second.match(/\[ref=(e\d+)\]/)?.[1];

      // Both should have found buttons (VS Code always has buttons)
      if (firstRef && secondRef) {
        // Refs may or may not be the same IDs, but the second set should be usable
        const clickResult = assertText(await handleClick(session, { ref: secondRef }));
        expect(clickResult).toContain('Clicked');
      }
    });
  });
});
