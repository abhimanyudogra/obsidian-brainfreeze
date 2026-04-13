import { ItemView, WorkspaceLeaf, Notice, TFile, setIcon } from "obsidian";
import type BrainfreezePlugin from "../main";

export const INGEST_VIEW_TYPE = "brainfreeze-ingest";

/**
 * Left sidebar view — the primary interaction surface.
 * File drop zone + ingest controls + vault stats.
 */
export class IngestView extends ItemView {
  private plugin: BrainfreezePlugin;
  private dropZone: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: BrainfreezePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return INGEST_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Brainfreeze";
  }

  getIcon(): string {
    return "brain";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("brainfreeze-ingest-view");

    // ── Header ──────────────────────────────────────────────────
    const header = container.createDiv("brainfreeze-header");
    header.createEl("h4", { text: "Brainfreeze" });

    // ── Vault stats ─────────────────────────────────────────────
    const statsEl = container.createDiv("brainfreeze-stats");
    this.renderStats(statsEl);

    // ── Drop zone ───────────────────────────────────────────────
    this.dropZone = container.createDiv("brainfreeze-dropzone");
    this.dropZone.createEl("p", { text: "Drop files here to ingest" });
    this.dropZone.createEl("p", {
      text: "or select from vault",
      cls: "brainfreeze-dropzone-sub",
    });

    this.dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.dropZone?.addClass("brainfreeze-dropzone-active");
    });

    this.dropZone.addEventListener("dragleave", () => {
      this.dropZone?.removeClass("brainfreeze-dropzone-active");
    });

    this.dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      this.dropZone?.removeClass("brainfreeze-dropzone-active");

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      // Copy dropped files into sources/ folder
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const buffer = await file.arrayBuffer();
        const destPath = `sources/${file.name}`;
        try {
          await this.plugin.app.vault.createBinary(destPath, buffer);
          new Notice(`Copied ${file.name} to sources/`);
        } catch {
          new Notice(`${file.name} already exists in sources/`);
        }
      }

      // Trigger ingest for dropped files
      const paths = Array.from(files).map((f) => `sources/${f.name}`);
      await this.plugin.startIngest(paths);
    });

    // ── Ingest from existing files button ───────────────────────
    const actions = container.createDiv("brainfreeze-actions");

    const ingestBtn = actions.createEl("button", {
      text: "Ingest from sources/",
      cls: "brainfreeze-btn brainfreeze-btn-primary",
    });
    ingestBtn.addEventListener("click", async () => {
      const sourceFiles = this.plugin.app.vault
        .getFiles()
        .filter((f) => f.path.startsWith("sources/"));

      if (sourceFiles.length === 0) {
        new Notice("No files in sources/ to ingest");
        return;
      }

      await this.plugin.startIngest(
        sourceFiles.map((f) => f.path)
      );
    });

    // ── Lint button ─────────────────────────────────────────────
    const lintBtn = actions.createEl("button", {
      text: "Run structural lint",
      cls: "brainfreeze-btn",
    });
    lintBtn.addEventListener("click", async () => {
      await this.plugin.runLint();
    });

    // ── Quick search ────────────────────────────────────────────
    const searchContainer = container.createDiv("brainfreeze-search");
    const searchInput = searchContainer.createEl("input", {
      type: "text",
      placeholder: "Search wiki...",
      cls: "brainfreeze-search-input",
    });
    const searchResults = searchContainer.createDiv("brainfreeze-search-results");

    searchInput.addEventListener("input", () => {
      const query = searchInput.value;
      searchResults.empty();
      if (!query || query.length < 2) return;

      const results = this.plugin.index.search(query, 10);
      for (const path of results) {
        const meta = this.plugin.index.getPage(path);
        const item = searchResults.createDiv("brainfreeze-search-item");
        item.createEl("span", {
          text: meta?.title ?? path,
          cls: "brainfreeze-search-title",
        });
        item.createEl("span", {
          text: meta?.category ?? "",
          cls: "brainfreeze-search-category",
        });
        item.addEventListener("click", () => {
          this.plugin.app.workspace.openLinkText(path, "");
        });
      }
    });
  }

  private renderStats(el: HTMLElement): void {
    el.empty();
    const stats = this.plugin.index.getStats();
    const grid = el.createDiv("brainfreeze-stats-grid");

    const items = [
      { label: "Pages", value: stats.total ?? 0 },
      { label: "Entities", value: stats.entity ?? 0 },
      { label: "Concepts", value: stats.concept ?? 0 },
      { label: "Decisions", value: stats.decision ?? 0 },
      { label: "Events", value: stats.event ?? 0 },
      { label: "Strategy", value: stats.strategy ?? 0 },
    ];

    for (const item of items) {
      const card = grid.createDiv("brainfreeze-stat-card");
      card.createEl("div", {
        text: String(item.value),
        cls: "brainfreeze-stat-value",
      });
      card.createEl("div", {
        text: item.label,
        cls: "brainfreeze-stat-label",
      });
    }
  }

  /** Refresh the stats display (called after ingest completes) */
  refresh(): void {
    const statsEl = this.containerEl.querySelector(".brainfreeze-stats");
    if (statsEl) this.renderStats(statsEl as HTMLElement);
  }

  async onClose(): Promise<void> {
    // Cleanup
  }
}
