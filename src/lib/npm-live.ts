// Live dependency verification against the public npm registry.
// Zero-budget by design: the browser talks directly to registry.npmjs.org
// (CORS-enabled). There is no operator proxy, no API key, no database.
// Only the package names being checked are requested — no other tool input
// leaves the device. All functions are total: network failures resolve to
// null, they never throw.

export interface NpmLiveInfo {
  /** Latest version according to the registry dist-tag. */
  version: string;
  /** ISO timestamp of the latest release, when the packument exposes it. */
  publishedAt: string | null;
}

const cache = new Map<string, Promise<NpmLiveInfo | null>>();

/** Registry document URL for a package (scoped names are %2F-encoded). */
export function npmRegistryUrl(name: string): string {
  return `https://registry.npmjs.org/${encodeURIComponent(name.trim())}`;
}

/** True for syntactically valid npm package names (incl. @scope/name). */
export function isNpmPackageName(name: string): boolean {
  return /^(@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/i.test(name.trim());
}

/**
 * Fetch the latest published version of an npm package, browser-direct.
 * Uses the abbreviated packument (dist-tags + time, no readmes/tarballs).
 * Results are cached in memory for the session; failures resolve to null.
 */
export function fetchLatestNpm(name: string, timeoutMs = 8000): Promise<NpmLiveInfo | null> {
  const key = name.trim();
  if (!isNpmPackageName(key)) return Promise.resolve(null);
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async (): Promise<NpmLiveInfo | null> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(npmRegistryUrl(key), {
        headers: { accept: 'application/vnd.npm.install-v1+json' },
        signal: ctrl.signal,
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const doc = (await res.json()) as {
        'dist-tags'?: { latest?: unknown };
        time?: Record<string, unknown>;
      };
      const latest = doc['dist-tags']?.latest;
      if (typeof latest !== 'string' || !latest) return null;
      const t = doc.time?.[latest];
      return { version: latest, publishedAt: typeof t === 'string' ? t : null };
    } catch {
      return null; // offline, blocked, timeout — the caller renders "unreachable"
    } finally {
      clearTimeout(timer);
    }
  })();
  cache.set(key, p);
  return p;
}

/** Drop the in-memory cache (e.g. for an explicit re-verification). */
export function clearNpmLiveCache(): void {
  cache.clear();
}
