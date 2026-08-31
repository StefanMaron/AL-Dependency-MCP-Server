// Locates a procedure/trigger member's body within an AL object's source, using a
// text-scan heuristic (no AST). This is intentionally a best-effort heuristic,
// not a full AL parser.

export interface MemberRange {
  start: number; // 0-based line index, inclusive (includes leading attribute lines)
  end: number;   // 0-based line index, inclusive
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find the declaration + body of a procedure/trigger named `memberName` inside `lines`.
 * Returns null if no matching declaration is found.
 */
export function findMemberRange(lines: string[], memberName: string): MemberRange | null {
  const nameEscaped = escapeRegExp(memberName);
  const declarationRegex = new RegExp(
    `^\\s*(?:local\\s+|internal\\s+|protected\\s+)?(?:procedure|trigger)\\s+"?${nameEscaped}"?\\s*\\(`,
    'i'
  );
  const anyMemberDeclarationRegex = /^\s*(?:local\s+|internal\s+|protected\s+)?(?:procedure|trigger)\s+/i;

  let declarationIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (declarationRegex.test(lines[i])) {
      declarationIndex = i;
      break;
    }
  }

  if (declarationIndex === -1) {
    return null;
  }

  // Include contiguous attribute lines (e.g. [Test], [EventSubscriber(...)]) directly above
  let start = declarationIndex;
  while (start > 0 && /^\s*\[.*\]\s*$/.test(lines[start - 1])) {
    start--;
  }

  let depth = 0;
  let sawBlockStart = false;
  let end = declarationIndex;

  for (let i = declarationIndex; i < lines.length; i++) {
    const line = lines[i];

    // Stop at the next top-level member declaration if this one never opened a body
    // (e.g. an interface/abstract procedure signature terminated by ';')
    if (i > declarationIndex && !sawBlockStart && anyMemberDeclarationRegex.test(line)) {
      end = i - 1;
      break;
    }

    const blockStarts = (line.match(/\bbegin\b/gi) || []).length + (line.match(/\bcase\b/gi) || []).length;
    const blockEnds = (line.match(/\bend\b/gi) || []).length;

    if (blockStarts > 0) {
      sawBlockStart = true;
    }

    depth += blockStarts - blockEnds;
    end = i;

    if (sawBlockStart && depth <= 0) {
      break;
    }
  }

  return { start, end };
}
