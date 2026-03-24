/**
 * Shared DOM scraping scripts for VS Code renderer.
 * Extracted to avoid duplicating selectors across tool handlers.
 */

/**
 * Read the active file name from VS Code's DOM.
 * Tries the active tab label first, falls back to window title.
 * Returns the JS expression as a string (for use with page.evaluate).
 */
export const GET_ACTIVE_FILE_SCRIPT = `(() => {
  const activeTab = document.querySelector('.tab.active .label-name');
  if (activeTab) return activeTab.textContent.trim();
  const titleEl = document.querySelector('.window-title');
  return titleEl ? titleEl.textContent.trim() : null;
})()`;
