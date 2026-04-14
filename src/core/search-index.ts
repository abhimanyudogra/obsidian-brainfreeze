import { TFile, Vault, parseYaml } from "obsidian";
import FlexSearch from "flexsearch";
import { parseProvenanceDag } from "./provenance";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FlexSearchIndex = any;

/**
 * Two-layer in-memory index for fast wiki queries.
 *
 * Layer 1: Structured frontmatter map — instant lookups by relations, tags, status, provenance.
 * Layer 2: FlexSearch full-text index — sub-5ms keyword search across all page bodies.
 *
 * Rebuilt from disk on vault load (~100ms for 500 pages). Updated incrementally on file changes.
 */
export interface PageMeta {
  path: string;
  title: string;
  category: string;
  status: string;
  tags: string[];
  relations: Record<string, string[]>;
  provenance: {
    extracted: number;
    inferred: number;
    ambiguous: number;
    /** Longest chain from any [^i] to an [^e]/[^a] leaf. Computed from body, not frontmatter. */
    maxDepth: number;
    /** Fraction of [^i] tags whose chain reaches a leaf. 1.0 when no [^i]. */
    rootedRatio: number;
    /** [^i] tags with no parent clause, missing parents, or cycles. */
    orphanInferences: number;
  };
  created: string;
  updated: string;
}

const WIKI_FOLDERS = new Set([
  "entities",
  "concepts",
  "decisions",
  "events",
  "strategy",
]);

export class BrainfreezeIndex {
  /** Path → parsed frontmatter metadata */
  private structured = new Map<string, PageMeta>();
  /** FlexSearch document index for body text */
  private fulltext: FlexSearchIndex = null;

  private vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  /** Full rebuild from disk. Call on plugin load and vault open. */
  async rebuild(): Promise<{ pageCount: number; timeMs: number }> {
    const start = Date.now();
    this.structured.clear();

    this.fulltext = new (FlexSearch as any).Document({
      document: {
        id: "id",
        index: ["title", "body"],
        store: ["title", "path"],
      },
      tokenize: "forward",
      resolution: 9,
    });

    const files = this.vault
      .getMarkdownFiles()
      .filter((f) => WIKI_FOLDERS.has(f.path.split("/")[0]));

    for (const file of files) {
      await this.indexFile(file);
    }

    return { pageCount: this.structured.size, timeMs: Date.now() - start };
  }

  /** Index or re-index a single file. Call on file create/modify. */
  async indexFile(file: TFile): Promise<void> {
    const content = await this.vault.cachedRead(file);
    const { frontmatter, body } = this.parseFrontmatter(content);

    if (!frontmatter) return;

    const fmProv = (frontmatter.provenance as Record<string, number> | undefined) ?? {
      extracted: 0,
      inferred: 0,
      ambiguous: 0,
    };
    const dag = parseProvenanceDag(body);

    const meta: PageMeta = {
      path: file.path,
      title: frontmatter.title ?? file.basename,
      category: frontmatter.category ?? "unknown",
      status: frontmatter.status ?? "active",
      tags: frontmatter.tags ?? [],
      relations: frontmatter.relations ?? {},
      provenance: {
        extracted: fmProv.extracted ?? 0,
        inferred: fmProv.inferred ?? 0,
        ambiguous: fmProv.ambiguous ?? 0,
        maxDepth: dag.maxDepth,
        rootedRatio: dag.rootedRatio,
        orphanInferences: dag.orphans,
      },
      created: frontmatter.created ?? "",
      updated: frontmatter.updated ?? "",
    };

    this.structured.set(file.path, meta);

    if (this.fulltext) {
      // Remove old entry if exists, then add
      try {
        this.fulltext.remove(file.path);
      } catch {
        /* first index */
      }
      this.fulltext.add({
        id: file.path,
        title: meta.title,
        body,
        path: file.path,
      });
    }
  }

  /** Remove a file from the index. Call on file delete. */
  removeFile(path: string): void {
    this.structured.delete(path);
    if (this.fulltext) {
      try {
        this.fulltext.remove(path);
      } catch {
        /* wasn't indexed */
      }
    }
  }

  // ── Structured queries ──────────────────────────────────────────

  getAllPages(): PageMeta[] {
    return Array.from(this.structured.values());
  }

  getPage(path: string): PageMeta | undefined {
    return this.structured.get(path);
  }

  findByCategory(category: string): PageMeta[] {
    return this.getAllPages().filter((p) => p.category === category);
  }

  findByStatus(status: string): PageMeta[] {
    return this.getAllPages().filter((p) => p.status === status);
  }

  findByTag(tag: string): PageMeta[] {
    return this.getAllPages().filter((p) => p.tags.includes(tag));
  }

  /** Find pages where `relationType` array contains `targetPath` */
  findByRelation(relationType: string, targetPath: string): PageMeta[] {
    return this.getAllPages().filter((p) => {
      const rels = p.relations[relationType];
      return rels && rels.some((r: string) => r.includes(targetPath));
    });
  }

  /** Find pages that contradict a given page */
  findContradictions(pagePath: string): PageMeta[] {
    return this.findByRelation("contradicts", pagePath);
  }

  /** Find all open decisions */
  findOpenDecisions(): PageMeta[] {
    return this.findByCategory("decision").filter(
      (p) => p.status === "active"
    );
  }

  /** Find pages with ambiguous provenance tags */
  findAmbiguous(): PageMeta[] {
    return this.getAllPages().filter((p) => p.provenance.ambiguous > 0);
  }

  /** Get backlinks — pages that reference `targetPath` in any relation */
  getBacklinks(targetPath: string): PageMeta[] {
    return this.getAllPages().filter((p) => {
      for (const rels of Object.values(p.relations)) {
        if (
          Array.isArray(rels) &&
          rels.some((r: string) => r.includes(targetPath))
        )
          return true;
      }
      return false;
    });
  }

  // ── Full-text search ────────────────────────────────────────────

  /** Search page titles and bodies. Returns paths ranked by relevance. */
  search(query: string, limit = 20): string[] {
    if (!this.fulltext || !query.trim()) return [];

    const results = this.fulltext.search(query, { limit, enrich: true });
    const paths = new Set<string>();

    for (const field of results) {
      for (const item of field.result) {
        const doc = typeof item === "object" ? item.doc : null;
        if (doc?.path) paths.add(doc.path);
        else if (typeof item === "string") paths.add(item);
      }
    }

    return Array.from(paths);
  }

  // ── Stats ───────────────────────────────────────────────────────

  get size(): number {
    return this.structured.size;
  }

  getStats(): Record<string, number> {
    const stats: Record<string, number> = { total: this.size };
    for (const p of this.structured.values()) {
      stats[p.category] = (stats[p.category] ?? 0) + 1;
    }
    return stats;
  }

  // ── Internal ────────────────────────────────────────────────────

  private parseFrontmatter(content: string): {
    frontmatter: Record<string, unknown> | null;
    body: string;
  } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { frontmatter: null, body: content };

    try {
      const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
      return { frontmatter, body: match[2] };
    } catch {
      return { frontmatter: null, body: content };
    }
  }
}
