/**
 * Diagnostic formatting utility for error tracebacks.
 *
 * In Python and Node.js tracebacks, the root exception type and description
 * are printed at the bottom of the traceback. Slicing the first 400 characters
 * truncates the message before the actual exception is reached.
 *
 * This utility returns the last `maxLines` lines (default 30) of the output,
 * ensuring the actual exception name, file location, and description are shown.
 */
export function formatErrorDiagnostic(errorText, maxLines = 30) {
  if (!errorText) return '';
  const str = typeof errorText === 'string' ? errorText : String(errorText);
  const lines = str.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length <= maxLines) return lines.join('\n');
  return lines.slice(-maxLines).join('\n');
}
