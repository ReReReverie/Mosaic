import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Path Sanitizer
// Prevents path traversal by validating that a resolved path stays within root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitize a file path relative to a root directory.
 * Returns the resolved absolute path if it is within root, or null if it escapes.
 *
 * @param input   The user-supplied relative path (may contain ".." segments)
 * @param root    The declared safe root directory (absolute path)
 */
export function sanitizePath(input: string, root: string): string | null {
  if (!input || !root) return null;

  // Normalize to remove ".." segments and resolve to an absolute path
  const resolved = path.resolve(root, input);
  const normalizedRoot = path.resolve(root);

  // Ensure the resolved path starts with the root (plus separator)
  // This prevents "/safe" matching "/safe-extra" via prefix check
  const rootWithSep = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : normalizedRoot + path.sep;

  if (
    resolved === normalizedRoot ||
    resolved.startsWith(rootWithSep)
  ) {
    return resolved;
  }

  return null;
}

/**
 * Check whether a path is safe without resolving it to a full absolute path.
 * Useful for validating paths before passing them to sanitizePath.
 */
export function isSafePath(input: string): boolean {
  const normalized = path.normalize(input);
  // Reject paths that start with ".." or contain null bytes
  return (
    !normalized.startsWith("..") &&
    !normalized.includes("\0") &&
    !path.isAbsolute(input)
  );
}
