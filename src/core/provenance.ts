/**
 * Provenance DAG parser for brainfreeze pages.
 *
 * Every [^i]<n>]: inferred from [^X1], [^X2] — rationale
 * definition contributes an edge (tag -> parents). Walking the DAG gives us:
 *   - maxDepth: longest chain from any inferred claim to an [^e] or [^a] leaf
 *   - rootedRatio: fraction of [^i] tags that reach a leaf (vs. orphan chains)
 *   - orphans: [^i] tags with no parent clause, missing parents, or cycles
 *
 * Both search-index.ts (rollup into PageMeta) and lint.ts (emit issues) consume this.
 */

export type ProvenanceTagType = "e" | "i" | "a";

export interface ProvenanceTag {
  /** Full tag id, e.g. "i3" */
  id: string;
  type: ProvenanceTagType;
  /** Parent tag ids, only populated for [^i]. */
  parents: string[];
  /** True for [^i] lines that had no "inferred from [^...]" clause at all. */
  hasExplicitParents: boolean;
}

export interface ProvenanceDag {
  tags: Map<string, ProvenanceTag>;
  /** Longest depth from any [^i] to a leaf ([^e] or [^a]). 0 if no [^i]. */
  maxDepth: number;
  /** Fraction of [^i] tags whose chain reaches a leaf. 1.0 if no [^i]. */
  rootedRatio: number;
  /** Count of [^i] tags that are orphans (no parents, missing parents, or in a cycle). */
  orphans: number;
  /** Per-tag depth result (-1 means orphan/unreachable). */
  depths: Map<string, number>;
}

/**
 * Parse all [^e|i|a]<n>]: ... definition lines from page body. Definitions may
 * span multiple lines (continuation via leading whitespace). Returns the DAG
 * with precomputed depth metrics.
 */
export function parseProvenanceDag(body: string): ProvenanceDag {
  const tags = new Map<string, ProvenanceTag>();
  const defLines = collectDefinitions(body);

  for (const [id, rest] of defLines) {
    const type = id[0] as ProvenanceTagType;
    let parents: string[] = [];
    let hasExplicitParents = false;

    if (type === "i") {
      const fromMatch = rest.match(/^inferred\s+from\s+([^—\-\n]+)/i);
      if (fromMatch) {
        hasExplicitParents = true;
        const parentMatches = fromMatch[1].match(/\[\^([eia]\d+)\]/g) ?? [];
        parents = parentMatches.map((m) => m.slice(2, -1));
      }
    }

    tags.set(id, { id, type, parents, hasExplicitParents });
  }

  const depths = new Map<string, number>();
  const computeDepth = (id: string, visiting: Set<string>): number => {
    if (depths.has(id)) return depths.get(id)!;
    if (visiting.has(id)) return -1;

    const tag = tags.get(id);
    if (!tag) return -1;
    if (tag.type === "e" || tag.type === "a") {
      depths.set(id, 0);
      return 0;
    }
    if (!tag.hasExplicitParents || tag.parents.length === 0) {
      depths.set(id, -1);
      return -1;
    }

    visiting.add(id);
    let max = -1;
    for (const parentId of tag.parents) {
      const pd = computeDepth(parentId, visiting);
      if (pd >= 0) max = Math.max(max, pd + 1);
    }
    visiting.delete(id);

    depths.set(id, max);
    return max;
  };

  let maxDepth = 0;
  let rooted = 0;
  let orphans = 0;
  let totalInferred = 0;

  for (const tag of tags.values()) {
    if (tag.type !== "i") continue;
    totalInferred++;
    const d = computeDepth(tag.id, new Set());
    if (d < 0) orphans++;
    else {
      rooted++;
      if (d > maxDepth) maxDepth = d;
    }
  }

  const rootedRatio = totalInferred === 0 ? 1.0 : rooted / totalInferred;
  return { tags, maxDepth, rootedRatio, orphans, depths };
}

/**
 * Extract definition lines from a body, handling multi-line continuations.
 * Returns [tagId, restOfDefinition] pairs.
 */
function collectDefinitions(body: string): Array<[string, string]> {
  const defs: Array<[string, string]> = [];
  const lines = body.split("\n");

  let currentId: string | null = null;
  let currentRest = "";

  const flush = () => {
    if (currentId) defs.push([currentId, currentRest.trim()]);
    currentId = null;
    currentRest = "";
  };

  for (const line of lines) {
    const header = line.match(/^\[\^([eia]\d+)\]:\s*(.*)$/);
    if (header) {
      flush();
      currentId = header[1];
      currentRest = header[2];
      continue;
    }
    if (currentId && /^\s+\S/.test(line)) {
      currentRest += " " + line.trim();
      continue;
    }
    if (currentId && line.trim() === "") {
      continue;
    }
    if (currentId) flush();
  }
  flush();

  return defs;
}
