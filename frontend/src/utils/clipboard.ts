/*
 * Copy text to the clipboard with a legacy-textarea fallback for non-secure contexts, where
 * navigator.clipboard is absent (a dev server reached over plain http from a network host).
 */

// Copies text to the clipboard, returning whether the copy succeeded so the caller can confirm or warn.
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission or focus denied the async path, so fall through to the legacy textarea copy.
    }
  }
  return legacyCopy(text);
}

// Selects the text inside an off-screen textarea and copies it with the legacy execCommand.
function legacyCopy(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    // Keep it out of view and out of the layout flow while it stays focusable and selectable.
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}
