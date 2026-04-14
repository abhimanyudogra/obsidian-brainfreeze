import { Vault, TFile } from "obsidian";
import { BrainfreezeIndex, PageMeta } from "./search-index";
import { parseProvenanceDag } from "./provenance";

export interface LintIssue {
  severity: "error" | "warning";
  page: string;
  check: string;
  message: string;
}

/**
 * Structural lint — 10 checks, zero LLM cost, runs on every ingest.
 * Returns a list of issues sorted by severity.
 */
export async function runStructuralLint(
  vault: Vault,
  index: BrainfreezeIndex
): Promise<LintIssue[]> {
  const issues: LintIssue[] = [];
  const allPages = index.getAllPages();
  const allPaths = new Set(allPages.map((p) => p.path));

  for (const page of allPages) {
    const file = vault.getAbstractFileByPath(page.path);
    if (!file) continue;

    const content = await vault.cachedRead(file as TFile);

    // 1. Broken wikilinks
    const wikilinks = content.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g) ?? [];
    for (const link of wikilinks) {
      const target = link.match(/\[\[([^\]|]+)/)?.[1];
      if (!target) continue;
      const targetPath = target.includes("/")
        ? `${target}.md`
        : `${target}.md`;
      // Skip root-level special files
      if (["CLAUDE", "index", "log"].includes(target)) continue;
      if (
        !allPaths.has(targetPath) &&
        !allPaths.has(target) &&
        !vault.getAbstractFileByPath(targetPath) &&
        !vault.getAbstractFileByPath(target)
      ) {
        issues.push({
          severity: "warning",
          page: page.path,
          check: "broken-wikilink",
          message: `Link [[${target}]] points to a non-existent page`,
        });
      }
    }

    // 2. Missing provenance on numeric claims
    const hasNumbers = /\$[\d,]+|\d{2,}%|\d{4,}/.test(content);
    const hasTags = /\[\^[eia]\d+\]/.test(content);
    if (hasNumbers && !hasTags) {
      issues.push({
        severity: "warning",
        page: page.path,
        check: "missing-provenance",
        message: "Page contains numeric values but no provenance tags",
      });
    }

    // 3. Provenance count mismatch
    const definedE = new Set(
      (content.match(/^\[\^e(\d+)\]:/gm) ?? []).map((m) =>
        m.match(/\d+/)?.[0]
      )
    ).size;
    const definedI = new Set(
      (content.match(/^\[\^i(\d+)\]:/gm) ?? []).map((m) =>
        m.match(/\d+/)?.[0]
      )
    ).size;
    const definedA = new Set(
      (content.match(/^\[\^a(\d+)\]:/gm) ?? []).map((m) =>
        m.match(/\d+/)?.[0]
      )
    ).size;

    const prov = page.provenance;
    if (
      prov.extracted !== definedE ||
      prov.inferred !== definedI ||
      prov.ambiguous !== definedA
    ) {
      issues.push({
        severity: "error",
        page: page.path,
        check: "provenance-mismatch",
        message: `Frontmatter says (${prov.extracted}e/${prov.inferred}i/${prov.ambiguous}a) but body defines (${definedE}e/${definedI}i/${definedA}a)`,
      });
    }

    // 4. Empty required sections
    if (content.includes("_(no content yet)_")) {
      issues.push({
        severity: "warning",
        page: page.path,
        check: "empty-sections",
        message: "Page has unfilled template sections",
      });
    }

    // 5. Ambiguous without open questions
    if (prov.ambiguous > 0 && !/open questions/i.test(content)) {
      issues.push({
        severity: "error",
        page: page.path,
        check: "ambiguous-no-questions",
        message: `Has ${prov.ambiguous} ambiguous tags but no open-questions section`,
      });
    }

    // 6. Frontmatter validation
    if (!page.title) {
      issues.push({
        severity: "error",
        page: page.path,
        check: "missing-title",
        message: "Missing title in frontmatter",
      });
    }
    if (
      !["entity", "concept", "decision", "event", "strategy"].includes(
        page.category
      )
    ) {
      issues.push({
        severity: "error",
        page: page.path,
        check: "invalid-category",
        message: `Invalid category "${page.category}"`,
      });
    }

    // 7. Category-folder mismatch
    const folder = page.path.split("/")[0];
    const expectedFolder = page.category === "entity" ? "entities" : `${page.category}s`;
    if (folder !== expectedFolder && folder !== page.category) {
      issues.push({
        severity: "error",
        page: page.path,
        check: "category-folder-mismatch",
        message: `Category "${page.category}" but file is in "${folder}/"`,
      });
    }

    // 8. Active contradictions — both sides still active
    const contradicts = page.relations["contradicts"] ?? [];
    for (const target of contradicts) {
      const targetClean = target
        .replace(/\[\[|\]\]/g, "")
        .replace(/\|.*/, "");
      const targetMeta = index.getPage(`${targetClean}.md`) ?? index.getPage(targetClean);
      if (targetMeta && targetMeta.status === "active" && page.status === "active") {
        issues.push({
          severity: "warning",
          page: page.path,
          check: "active-contradiction",
          message: `Both this page and [[${targetClean}]] are active but marked as contradicting`,
        });
      }
    }

    // 9. Archived page cited as active dependency
    if (page.status === "active") {
      for (const dep of page.relations["depends-on"] ?? []) {
        const depClean = dep.replace(/\[\[|\]\]/g, "").replace(/\|.*/, "");
        const depMeta = index.getPage(`${depClean}.md`) ?? index.getPage(depClean);
        if (depMeta && depMeta.status === "archived") {
          issues.push({
            severity: "error",
            page: page.path,
            check: "depends-on-archived",
            message: `Active page depends on archived [[${depClean}]]`,
          });
        }
      }
    }

    // 11. Inference-chain depth
    const dag = parseProvenanceDag(content);
    if (dag.maxDepth > 3) {
      issues.push({
        severity: "error",
        page: page.path,
        check: "inference-depth",
        message: `Max inference chain depth ${dag.maxDepth} exceeds limit of 3 — ground a claim in [^e] or split the page`,
      });
    } else if (dag.maxDepth > 2) {
      issues.push({
        severity: "warning",
        page: page.path,
        check: "inference-depth",
        message: `Max inference chain depth ${dag.maxDepth} — synthesis is stacking, consider grounding in a new [^e]`,
      });
    }

    // 12. Orphan inferences
    if (dag.orphans > 0) {
      const badTags: string[] = [];
      for (const [id, tag] of dag.tags) {
        if (tag.type !== "i") continue;
        const d = dag.depths.get(id);
        if (d === undefined || d < 0) badTags.push(`[^${id}]`);
      }
      issues.push({
        severity: "error",
        page: page.path,
        check: "orphan-inference",
        message: `${dag.orphans} orphan [^i] tag${dag.orphans > 1 ? "s" : ""}: ${badTags.join(", ")} — missing 'inferred from [^...]' clause, unknown parents, or cyclic`,
      });
    }
  }

  // 10. Orphan pages (no backlinks and not in index)
  for (const page of allPages) {
    const backlinks = index.getBacklinks(page.path.replace(/\.md$/, ""));
    if (backlinks.length === 0) {
      issues.push({
        severity: "warning",
        page: page.path,
        check: "orphan-page",
        message: "No other page links to this one",
      });
    }
  }

  return issues.sort((a, b) => {
    const sev = { error: 0, warning: 1 };
    return sev[a.severity] - sev[b.severity];
  });
}
