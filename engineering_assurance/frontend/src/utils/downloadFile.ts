/**
 * downloadFile — Reliable cross-origin file download
 *
 * Strategy: Programmatic invisible anchor with target="_blank" prevents
 * page navigation. The backend sets Content-Disposition: attachment, so
 * the browser saves the file rather than rendering it.
 * 
 * We do NOT use fetch+blob: the backend CORS headers may not include
 * expose-headers for binary responses, causing silent failures.
 */
export function downloadFile(
  url: string,
  filename: string,
  _onError?: (msg: string) => void
): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';            // open in new tab — does NOT kill current page
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Clean up after a short delay
  setTimeout(() => {
    if (document.body.contains(a)) document.body.removeChild(a);
  }, 300);
}

/** Extracts a filename from a URL path, with a fallback */
export function filenameFromUrl(url: string, fallback = 'download.docx'): string {
  if (!url) return fallback;
  const parts = url.split('/');
  return decodeURIComponent(parts[parts.length - 1] || fallback);
}
