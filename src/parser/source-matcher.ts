// Matches an ALObject's ReferenceSourceFileName against the raw .al entry names
// stored inside a package's ZIP, handling the src/ prefix and double-URL-encoding
// mismatch between the two.

export interface SourceZipEntry {
  raw: string;  // exact entry name as stored in the zip (may be over-encoded)
  norm: string; // decoded-and-lowercased path, used for matching only
}

/**
 * Repeat decodeURIComponent until stable or it throws. Handles the %2520 vs %20 mismatch
 * caused by AL packaging tools double-encoding folder names with spaces.
 */
export function decodeStable(value: string): string {
  let current = value;

  for (let i = 0; i < 5; i++) {
    let next: string;

    try {
      next = decodeURIComponent(current);
    } catch {
      break;
    }

    if (next === current) {
      break;
    }

    current = next;
  }

  return current;
}

export function normalizePath(entryPath: string): string {
  const withForwardSlashes = entryPath.replace(/\\/g, '/');
  const decoded = decodeStable(withForwardSlashes);

  return decoded.replace(/^\.\//, '').toLowerCase();
}

export function buildSourceZipEntries(rawEntryNames: string[]): SourceZipEntry[] {
  return rawEntryNames.map(raw => ({ raw, norm: normalizePath(raw) }));
}

/**
 * Match an object's ReferenceSourceFileName against the package's known .al entries.
 * Returns the RAW (stored, possibly over-encoded) entry name, or null if no match.
 */
export function matchSourceEntry(entries: SourceZipEntry[], referenceSourceFileName: string): string | null {
  const normalizedRef = normalizePath(referenceSourceFileName);

  // Tier 1: exact match
  const exactMatch = entries.find(e => e.norm === normalizedRef);
  if (exactMatch) {
    return exactMatch.raw;
  }

  // Tier 2: suffix match (handles the missing src/ prefix) - this is the tier that fires in practice
  const suffixMatch = entries.find(e => e.norm.endsWith('/' + normalizedRef));
  if (suffixMatch) {
    return suffixMatch.raw;
  }

  // Tier 3: basename fallback, disambiguated by longest matching trailing path segments
  const refBaseName = normalizedRef.split('/').pop()!;
  const candidates = entries.filter(e => e.norm.split('/').pop() === refBaseName);

  if (candidates.length === 1) {
    return candidates[0].raw;
  }

  if (candidates.length > 1) {
    const refSegments = normalizedRef.split('/').reverse();
    let best = candidates[0];
    let bestScore = -1;

    for (const candidate of candidates) {
      const candidateSegments = candidate.norm.split('/').reverse();
      let score = 0;

      while (score < refSegments.length && score < candidateSegments.length && refSegments[score] === candidateSegments[score]) {
        score++;
      }

      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best.raw;
  }

  return null;
}
