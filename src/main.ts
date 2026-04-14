import { Plugin, Notice, WorkspaceLeaf } from "obsidian";
import {
  BrainfreezeSettings,
  BrainfreezeSettingTab,
  DEFAULT_SETTINGS,
} from "./settings";
import { BrainfreezeIndex } from "./core/search-index";
import { ManifestManager } from "./core/manifest";
import { runStructuralLint, LintIssue } from "./core/lint";
import { initVault, isVaultInitialized } from "./core/init";
import { AnthropicProvider } from "./llm/anthropic";
import { LLMProviderBase } from "./llm/provider";
import { IngestView, INGEST_VIEW_TYPE } from "./views/IngestView";
import { ReviewView, REVIEW_VIEW_TYPE } from "./views/ReviewView";

export default class BrainfreezePlugin extends Plugin {
  settings: BrainfreezeSettings = DEFAULT_SETTINGS;
  index: BrainfreezeIndex = null!;
  manifest: ManifestManager = null!;
  llm: LLMProviderBase = null!;
  initialized = false;

  async onload() {
    await this.loadSettings();

    // Initialize core systems
    this.index = new BrainfreezeIndex(this.app.vault);
    this.manifest = new ManifestManager(this.app.vault);
    await this.manifest.load();

    // Initialize LLM provider
    this.initLLMProvider();

    // Check if vault is initialized
    this.initialized = await isVaultInitialized(this.app.vault);

    // Build search index
    const { pageCount, timeMs } = await this.index.rebuild();
    console.log(`Brainfreeze: indexed ${pageCount} pages in ${timeMs}ms`);

    // Register views
    this.registerView(
      INGEST_VIEW_TYPE,
      (leaf) => new IngestView(leaf, this)
    );
    this.registerView(
      REVIEW_VIEW_TYPE,
      (leaf) => new ReviewView(leaf, this)
    );

    // Register commands
    this.addCommand({
      id: "open-ingest-view",
      name: "Open ingest panel",
      callback: () => this.activateView(INGEST_VIEW_TYPE, "left"),
    });

    this.addCommand({
      id: "open-review-view",
      name: "Open review panel",
      callback: () => this.activateView(REVIEW_VIEW_TYPE, "right"),
    });

    this.addCommand({
      id: "run-lint",
      name: "Run structural lint",
      callback: () => this.runLint(),
    });

    this.addCommand({
      id: "rebuild-index",
      name: "Rebuild search index",
      callback: async () => {
        const r = await this.index.rebuild();
        new Notice(`Index rebuilt: ${r.pageCount} pages in ${r.timeMs}ms`);
      },
    });

    // Ribbon icon
    this.addRibbonIcon("brain", "Brainfreeze", () => {
      this.activateView(INGEST_VIEW_TYPE, "left");
    });

    // Settings tab
    this.addSettingTab(new BrainfreezeSettingTab(this.app, this));

    // Watch for file changes to update index incrementally
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (file.path.endsWith(".md") && !file.path.startsWith(".")) {
          await this.index.indexFile(file as any);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("create", async (file) => {
        if (file.path.endsWith(".md") && !file.path.startsWith(".")) {
          await this.index.indexFile(file as any);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.index.removeFile(file.path);
      })
    );

    // Open the ingest view on first load, then refresh stats after index catches up
    this.app.workspace.onLayoutReady(async () => {
      await this.activateView(INGEST_VIEW_TYPE, "left");
      // Re-index after vault cache is ready (initial rebuild may have found 0 pages)
      const result = await this.index.rebuild();
      if (result.pageCount > 0) {
        console.log(`Brainfreeze: re-indexed ${result.pageCount} pages in ${result.timeMs}ms (post-layout)`);
        this.refreshViews();
      }
    });
  }

  onunload() {
    // Views are automatically cleaned up by Obsidian
  }

  // ── LLM Provider ─────────────────────────────────────────────

  private initLLMProvider() {
    // Currently only Anthropic is implemented; others are TODO
    switch (this.settings.llmProvider) {
      case "anthropic":
        this.llm = new AnthropicProvider(
          this.settings.anthropicApiKey,
          this.settings.anthropicModel
        );
        break;
      default:
        // Fallback to Anthropic
        this.llm = new AnthropicProvider(
          this.settings.anthropicApiKey,
          this.settings.anthropicModel
        );
    }
  }

  // ── Public API (called by views) ──────────────────────────────

  /** Start an ingest pipeline for the given source file paths */
  async startIngest(sourcePaths: string[]): Promise<void> {
    if (!this.llm.isConfigured()) {
      new Notice("Please configure your API key in Brainfreeze settings");
      return;
    }

    new Notice(`Starting ingest of ${sourcePaths.length} file(s)...`);

    // Read vault schema (CLAUDE.md)
    const schemaFile = this.app.vault.getAbstractFileByPath("CLAUDE.md");
    const schema = schemaFile
      ? await this.app.vault.read(schemaFile as any)
      : "No CLAUDE.md found — using default brainfreeze schema.";

    // Read source files and check manifest for changes
    const newSources: { path: string; content: string }[] = [];
    const skipped: string[] = [];

    for (const path of sourcePaths) {
      let content: string;
      try {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file) {
          content = await this.app.vault.read(file as any);
        } else {
          // Fallback: read directly from disk (file index may not have caught up)
          content = await this.app.vault.adapter.read(path);
        }
      } catch (err) {
        new Notice(`Cannot read ${path}: ${err}`);
        continue;
      }

      if (this.manifest.hasChanged(path, content)) {
        newSources.push({ path, content });
      } else {
        skipped.push(path);
      }
    }

    if (skipped.length > 0) {
      new Notice(
        `Skipped ${skipped.length} unchanged file(s) (manifest match)`
      );
    }

    if (newSources.length === 0) {
      new Notice("No new or changed files to ingest");
      return;
    }

    // Read index for context
    const indexFile = this.app.vault.getAbstractFileByPath("index.md");
    const indexContent = indexFile
      ? await this.app.vault.read(indexFile as any)
      : "";

    // Build the ingest prompt
    const sourceList = newSources
      .map((s) => `### ${s.path}\n\`\`\`\n${s.content}\n\`\`\``)
      .join("\n\n");

    const operation = `INGEST OPERATION

You are ingesting ${newSources.length} source file(s) into a brainfreeze wiki vault.

Current wiki index:
${indexContent}

Source files to ingest:
${sourceList}

Follow the ingest procedure from CLAUDE.md exactly:
1. Identify key facts, surprises, open questions.
2. Propose which pages to create or update (the "change preview").
3. For each page, write the FULL markdown content following the vault's templates.

Respond in this JSON format:
{
  "conversation": "Your pre-ingest conversation text — key facts, surprises, questions",
  "pages": [
    {
      "path": "concepts/example.md",
      "action": "create",
      "content": "---\\ntitle: ...\\n---\\n\\n# ..."
    }
  ]
}`;

    try {
      console.log("Brainfreeze: calling LLM...");
      const response = await this.llm.chat(
        this.llm.buildSystemPrompt(schema, operation),
        [{ role: "user", content: "Begin ingest." }],
        { maxTokens: 16384 }
      );
      console.log(`Brainfreeze: LLM responded (${response.inputTokens} in, ${response.outputTokens} out)`);

      // Parse the response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        new Notice("LLM did not return valid JSON — check console");
        console.error("Brainfreeze: raw LLM response:", response.content);
        return;
      }

      const result = JSON.parse(jsonMatch[0]);
      const pages = result.pages ?? [];
      console.log(`Brainfreeze: parsed ${pages.length} pages from LLM response`);

      if (result.conversation) {
        console.log("Brainfreeze: pre-ingest conversation:", result.conversation);
      }

      // Write drafts to .drafts/
      let draftCount = 0;
      for (const page of pages) {
        const draftPath = `.drafts/${page.path}`;
        console.log(`Brainfreeze: writing draft ${draftPath}...`);

        // Ensure all parent directories exist
        const parts = draftPath.split("/");
        parts.pop(); // remove filename
        let current = "";
        for (const part of parts) {
          current = current ? `${current}/${part}` : part;
          const exists = await this.app.vault.adapter.exists(current);
          if (!exists) {
            console.log(`Brainfreeze: creating folder ${current}`);
            try {
              await this.app.vault.adapter.mkdir(current);
            } catch (e) {
              console.log(`Brainfreeze: mkdir ${current} failed (probably exists): ${e}`);
            }
          }
        }

        // Write draft file via adapter (overwrites if exists)
        try {
          await this.app.vault.adapter.write(draftPath, page.content);
          draftCount++;
          console.log(`Brainfreeze: wrote ${draftPath} OK`);
        } catch (e) {
          console.error(`Brainfreeze: failed to write ${draftPath}:`, e);
        }
      }

      // Update manifest for ingested sources
      console.log(`Brainfreeze: updating manifest...`);
      for (const source of newSources) {
        const producedPages = pages.map((p: { path: string }) => p.path);
        this.manifest.recordIngest(source.path, source.content, producedPages);
      }
      try {
        await this.manifest.save();
        console.log("Brainfreeze: manifest saved");
      } catch (e) {
        console.error("Brainfreeze: manifest save failed:", e);
      }

      // Show conversation to user
      new Notice(
        `Ingest complete: ${draftCount} drafts written. Click Review to approve.`
      );
      console.log(`Brainfreeze: ingest complete — ${draftCount} drafts`);

      // Open the review panel with the new drafts
      await this.activateView(REVIEW_VIEW_TYPE, "right");
      const reviewLeaf = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)[0];
      if (reviewLeaf) {
        (reviewLeaf.view as ReviewView).loadDrafts();
      }
    } catch (err) {
      new Notice(`Ingest failed: ${err}`);
      console.error("Brainfreeze ingest error:", err);
    }
  }

  /** Run structural lint and display results */
  async runLint(): Promise<void> {
    const issues = await runStructuralLint(this.app.vault, this.index);

    if (issues.length === 0) {
      new Notice("Structural lint: CLEAN (0 issues)");
      return;
    }

    const errors = issues.filter((i) => i.severity === "error").length;
    const warnings = issues.filter((i) => i.severity === "warning").length;
    new Notice(`Lint: ${errors} errors, ${warnings} warnings`);

    // Log details to console
    console.group("Brainfreeze Structural Lint");
    for (const issue of issues) {
      const icon = issue.severity === "error" ? "X" : "!";
      console.log(`[${icon}] ${issue.page} — ${issue.check}: ${issue.message}`);
    }
    console.groupEnd();
  }

  /** Initialize vault with brainfreeze scaffold */
  async initializeVault(): Promise<void> {
    await initVault(this.app.vault);
    this.initialized = true;
    await this.index.rebuild();
    new Notice("Vault initialized — ready to ingest");
    this.refreshViews();
  }

  /** Reconstruct: archive all pages, re-ingest all sources from manifest */
  async reconstruct(): Promise<void> {
    if (!this.llm.isConfigured()) {
      new Notice("Configure your API key first");
      return;
    }

    const sources = this.manifest.getSources();
    const sourcePaths = Object.keys(sources);
    if (sourcePaths.length === 0) {
      new Notice("No sources in manifest — nothing to reconstruct from");
      return;
    }

    new Notice(`Reconstructing from ${sourcePaths.length} sources...`);

    // Clear existing drafts
    const adapter = this.app.vault.adapter;
    if (await adapter.exists(".drafts")) {
      const listing = await adapter.list(".drafts");
      for (const f of listing.files) {
        try { await adapter.remove(f); } catch { /* ok */ }
      }
    }

    // Force re-ingest all sources (bypass manifest hash check)
    // Read all source contents
    const allContents: { path: string; content: string }[] = [];
    for (const path of sourcePaths) {
      try {
        const content = await adapter.read(path);
        allContents.push({ path, content });
      } catch {
        console.log(`Brainfreeze reconstruct: can't read ${path}, skipping`);
      }
    }

    if (allContents.length === 0) {
      new Notice("No readable sources found");
      return;
    }

    // Read schema
    const schemaFile = this.app.vault.getAbstractFileByPath("CLAUDE.md");
    const schema = schemaFile
      ? await this.app.vault.read(schemaFile as any)
      : "Use the brainfreeze wiki schema with five categories: entities, concepts, decisions, events, strategy.";

    const indexFile = this.app.vault.getAbstractFileByPath("index.md");
    const indexContent = indexFile ? await this.app.vault.read(indexFile as any) : "";

    const sourceList = allContents
      .map((s) => `### ${s.path}\n\`\`\`\n${s.content.substring(0, 5000)}\n\`\`\``)
      .join("\n\n");

    const operation = `FULL RECONSTRUCTION

Rebuild the entire wiki from scratch using ALL ${allContents.length} source files below.
Create a comprehensive set of wiki pages that cross-reference each other.
This is a fresh reconstruction — ignore any existing pages.

Current index (for reference only):
${indexContent}

ALL source files:
${sourceList}

Respond as JSON with "conversation" and "pages" array.`;

    try {
      console.log("Brainfreeze: calling LLM for reconstruction...");
      const response = await this.llm.chat(
        this.llm.buildSystemPrompt(schema, operation),
        [{ role: "user", content: "Begin full reconstruction." }],
        { maxTokens: 32768 }
      );

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        new Notice("LLM did not return valid JSON");
        console.error("Brainfreeze reconstruct response:", response.content);
        return;
      }

      const result = JSON.parse(jsonMatch[0]);
      const pages = result.pages ?? [];
      let count = 0;

      for (const page of pages) {
        const draftPath = `.drafts/${page.path}`;
        const parts = draftPath.split("/"); parts.pop();
        let current = "";
        for (const part of parts) {
          current = current ? `${current}/${part}` : part;
          if (!(await adapter.exists(current))) {
            try { await adapter.mkdir(current); } catch { /* ok */ }
          }
        }
        await adapter.write(draftPath, page.content);
        count++;
      }

      new Notice(`Reconstruction: ${count} drafts. Click Review to approve.`);
      await this.openReviewPanel();
    } catch (err) {
      new Notice(`Reconstruction failed: ${err}`);
      console.error("Brainfreeze reconstruct error:", err);
    }
  }

  /** Compute vault health score (0-100) based on structural issues */
  async getHealthScore(): Promise<{ score: number; issues: LintIssue[]; breakdown: string[] }> {
    const issues = await runStructuralLint(this.app.vault, this.index);
    const pageCount = this.index.size;

    if (pageCount === 0) {
      return { score: 100, issues: [], breakdown: ["No pages yet — vault is clean"] };
    }

    const breakdown: string[] = [];
    const errors = issues.filter(i => i.severity === "error").length;
    const warnings = issues.filter(i => i.severity === "warning").length;

    // Score: start at 100, deduct per issue
    let score = 100;
    score -= errors * 8;     // errors are serious
    score -= warnings * 3;   // warnings are minor

    // Check freshness — pages not updated in >90 days
    const now = Date.now();
    let stale = 0;
    for (const page of this.index.getAllPages()) {
      if (page.updated) {
        const updated = new Date(page.updated).getTime();
        const daysOld = (now - updated) / (1000 * 60 * 60 * 24);
        if (daysOld > 90) stale++;
      }
    }
    if (stale > 0) {
      score -= stale * 2;
      breakdown.push(`${stale} stale page${stale > 1 ? "s" : ""} (>90 days)`);
    }

    // Check ambiguous tags
    const ambiguousPages = this.index.findAmbiguous();
    if (ambiguousPages.length > 0) {
      breakdown.push(`${ambiguousPages.length} page${ambiguousPages.length > 1 ? "s" : ""} with unresolved ambiguities`);
    }

    if (errors > 0) breakdown.push(`${errors} error${errors > 1 ? "s" : ""}`);
    if (warnings > 0) breakdown.push(`${warnings} warning${warnings > 1 ? "s" : ""}`);
    if (breakdown.length === 0) breakdown.push("All checks passed");

    score = Math.max(0, Math.min(100, score));
    return { score, issues, breakdown };
  }

  /** Open the review panel and load drafts */
  async openReviewPanel(): Promise<void> {
    await this.activateView(REVIEW_VIEW_TYPE, "right");
    const leaf = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)[0];
    if (leaf) {
      (leaf.view as ReviewView).loadDrafts();
    }
  }

  /** Refresh all brainfreeze views (call after ingest/promote) */
  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(INGEST_VIEW_TYPE)) {
      (leaf.view as IngestView).refresh();
    }
  }

  // ── View management ───────────────────────────────────────────

  private async activateView(
    viewType: string,
    side: "left" | "right"
  ): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(viewType);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf =
      side === "left"
        ? this.app.workspace.getLeftLeaf(false)
        : this.app.workspace.getRightLeaf(false);

    if (leaf) {
      await leaf.setViewState({ type: viewType, active: true });
    }
  }

  // ── Settings ──────────────────────────────────────────────────

  private get settingsPath(): string {
    return `${this.manifest.dir}/data.json`;
  }

  async loadSettings() {
    try {
      // Try Obsidian's built-in first
      const saved = await this.loadData();
      if (saved) {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
        return;
      }
    } catch { /* fall through */ }

    // Fallback: read directly from disk
    try {
      const path = `.obsidian/plugins/brainfreeze/data.json`;
      if (await this.app.vault.adapter.exists(path)) {
        const raw = await this.app.vault.adapter.read(path);
        this.settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
        return;
      }
    } catch { /* fall through */ }

    this.settings = { ...DEFAULT_SETTINGS };
  }

  async saveSettings() {
    // Try Obsidian's built-in
    try {
      await this.saveData(this.settings);
    } catch { /* fall through */ }

    // Also write directly to disk as backup
    try {
      const path = `.obsidian/plugins/brainfreeze/data.json`;
      await this.app.vault.adapter.write(path, JSON.stringify(this.settings, null, 2));
    } catch (err) {
      console.error("Brainfreeze: failed to save settings:", err);
    }

    this.initLLMProvider();
  }
}
