function configuredOrigins(): string[] {
  const raw = (import.meta as any).env?.VITE_EMPCLOUD_RETURN_ORIGINS as string | undefined;
  if (!raw) return [];

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .flatMap((value) => {
      try {
        const url = new URL(value);
        const isOriginOnly =
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          url.pathname === "/" &&
          !url.search &&
          !url.hash;
        return isOriginOnly ? [url.origin] : [];
      } catch {
        return [];
      }
    });
}

/**
 * Prevent an SSO query string or poisoned localStorage value from becoming an
 * open redirect. Relative application paths are safe; absolute destinations
 * must use HTTPS and match an explicitly configured EMP Cloud origin.
 */
export function sanitizeEmpCloudReturnUrl(
  value: string | null | undefined,
  allowedOrigins = configuredOrigins(),
): string {
  const fallback = allowedOrigins[0] ? `${allowedOrigins[0]}/dashboard` : "/dashboard";
  if (!value) return fallback;

  if (value.startsWith("/") && !value.startsWith("//")) {
    try {
      const base = "https://relative-return.invalid";
      const url = new URL(value, base);
      if (url.origin === base) return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return fallback;
    }
  }

  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      allowedOrigins.includes(url.origin)
    ) {
      return url.toString();
    }
  } catch {
    // Fall through to the closed, same-origin fallback.
  }

  return fallback;
}
