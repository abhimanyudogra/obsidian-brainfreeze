import { Plugin, Notice, WorkspaceLeaf } from "obsidian";
import {
  BrainfreezeSettings,
  BrainfreezeSettingTab,
  DEFAULT_SETTINGS,
} from "./settings";
import { BrainfreezeIndex } from "./core/search-index";
import { ManifestManager } from "./core/manifest";
import { runStructuralLint, LintIssue } from "./core/lint";
import { AnthropicProvider } from "./llm/anthropic";
import { LLMProviderBase } from "./llm/provider";
import { IngestView, INGEST_VIEW_TYPE } from "./views/IngestView";
import { ReviewView, REVIEW_VIEW_TYPE } from "./views/ReviewView";

export default class BrainfreezePlugin extends Plugin {
  settings: BrainfreezeSettings = DEFAULT_SETTINGS;
  index: BrainfreezeIndex = null!;
  manifest: ManifestManager = null!;
  llm: LLMProviderBase = null!;

  async onload() {
    await this.loadSettings();

    // Initialize core systems
    this.index = new BrainfreezeIndex(this.app.vault);
    this.manifest = new ManifestManager(this.app.vault);
    await this.manifest.load();

    // Initialize LLM provider
    this.initLLMProvider();

    // Build search index
    const { pageCount, timeMs } = await this.index.rebuild();
    console.log(
      `Brainfreeze: indexed ${pageCount} pages in ${timeMs}ms`
    );

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

    // Open the ingest view on first load
    this.app.workspace.onLayoutReady(() => {
      this.activateView(INGEST_VIEW_TYPE, "left");
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
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!file) {
        new Notice(`File not found: ${path}`);
        continue;
      }
      const content = await this.app.vault.read(file as any);

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
      const response = await this.llm.chat(
        this.llm.buildSystemPrompt(schema, operation),
        [{ role: "user", content: "Begin ingest." }],
        { maxTokens: 16384 }
      );

      // Parse the response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        new Notice("LLM did not return valid JSON — check console");
        console.error("Brainfreeze ingest response:", response.content);
        return;
      }

      const result = JSON.parse(jsonMatch[0]);

      // Write drafts to .drafts/
      let draftCount = 0;
      for (const page of result.pages ?? []) {
        const draftPath = `.drafts/${page.path}`;
        const dir = draftPath.substring(0, draftPath.lastIndexOf("/"));

        // Ensure directory exists
        if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
          await this.app.vault.createFolder(dir);
        }

        const existing = this.app.vault.getAbstractFileByPath(draftPath);
        if (existing) {
          await this.app.vault.modify(existing as any, page.content);
        } else {
          await this.app.vault.create(draftPath, page.content);
        }
        draftCount++;
      }

      // Update manifest for ingested sources
      for (const source of newSources) {
        const producedPages = (result.pages ?? []).map(
          (p: { path: string }) => p.path
        );
        this.manifest.recordIngest(source.path, source.content, producedPages);
      }
      await this.manifest.save();

      // Show conversation to user
      new Notice(
        `Ingest complete: ${draftCount} drafts written. Open Review panel to approve.`
      );

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

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.initLLMProvider();
  }
}
