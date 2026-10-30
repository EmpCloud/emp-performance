const DEFAULT_LIMIT = 500;

/**
 * Keep operational diagnostics useful without exposing destinations or common
 * credential formats in admin APIs, attempt history, or structured alerts.
 */
export function sanitizeOperationalError(
  value: unknown,
  maxLength = DEFAULT_LIMIT,
): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  return value
    .replace(/https?:\/\/[^\s)]+/gi, "[redacted-url]")
    .replace(
      /["']?\bauthorization["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|(?:bearer|basic)\s+[^\s,;}]+|[^\s,;}]+)/gi,
      "authorization=[redacted]",
    )
    .replace(
      /["']?\b(api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|secret[-_ ]?access[-_ ]?key|token|secret|password)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      "$1=[redacted]",
    )
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, Math.max(1, maxLength));
}
