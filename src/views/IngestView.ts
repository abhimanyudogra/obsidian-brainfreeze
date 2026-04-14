import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type BrainfreezePlugin from "../main";

export const INGEST_VIEW_TYPE = "brainfreeze-ingest";

const VIEW_STYLES = `
  .bf-wrap { padding: 12px; }
  .bf-title { font-size: 1.1em; font-weight: 600; margin: 0 0 14px 0;
    padding-bottom: 8px; border-bottom: 1px solid var(--background-modifier-border); }

  .bf-health { margin-bottom: 14px; }
  .bf-health-label { display: flex !important; justify-content: space-between !important;
    align-items: center !important; margin-bottom: 4px !important; }
  .bf-health-text { font-size: 0.8em; font-weight: 600; }
  .bf-health-score { font-size: 0.8em; font-weight: 700; }
  .bf-health-bar { width: 100%; height: 6px; border-radius: 3px;
    background: var(--background-modifier-border); overflow: hidden; }
  .bf-health-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease, background 0.5s ease; }
  .bf-health-details { font-size: 0.72em; color: var(--text-muted); margin-top: 4px; line-height: 1.4; }

  .bf-grid { display: grid !important; grid-template-columns: 1fr 1fr !important;
    gap: 6px !important; margin-bottom: 14px !important; }
  .bf-card { display: flex !important; align-items: baseline !important;
    gap: 6px !important; padding: 8px 10px !important; border-radius: 6px !important;
    background: var(--background-secondary) !important; }
  .bf-val { font-size: 1.2em; font-weight: 700; }
  .bf-lbl { font-size: 0.75em; color: var(--text-muted); }

  .bf-drop { border: 2px dashed var(--background-modifier-border); border-radius: 8px;
    padding: 18px 14px; text-align: center; margin-bottom: 14px; cursor: pointer;
    transition: all 0.2s; }
  .bf-drop:hover, .bf-drop-active { border-color: var(--interactive-accent);
    background: var(--background-modifier-hover); }
  .bf-drop p { margin: 2px 0; font-size: 0.88em; }
  .bf-drop-sub { font-size: 0.78em !important; color: var(--text-muted); }

  .bf-actions { display: flex !important; gap: 6px !important; margin-bottom: 14px !important;
    flex-wrap: wrap !important; }
  .bf-btn { flex: 1 1 calc(50% - 3px) !important; padding: 7px 8px !important; border-radius: 6px !important;
    border: 1px solid var(--background-modifier-border) !important;
    background: var(--background-secondary) !important; color: var(--text-normal) !important;
    cursor: pointer !important; font-size: 0.78em !important; text-align: center !important;
    transition: all 0.15s !important; min-width: 0 !important; }
  .bf-btn:hover { background: var(--background-modifier-hover) !important; }
  .bf-btn-primary { background: var(--interactive-accent) !important;
    color: var(--text-on-accent) !important; border-color: var(--interactive-accent) !important; }
  .bf-btn-primary:hover { filter: brightness(1.1); }
  .bf-btn-full { flex: 1 1 100% !important; }
  .bf-btn-warn { color: var(--text-accent) !important; border-color: var(--text-accent) !important; }

  .bf-search { margin-bottom: 12px; }
  .bf-search input { width: 100%; padding: 8px 10px; border: 1px solid var(--background-modifier-border);
    border-radius: 6px; background: var(--background-primary); color: var(--text-normal);
    font-size: 0.85em; box-sizing: border-box; }
  .bf-search input:focus { border-color: var(--interactive-accent); outline: none; }
  .bf-results { max-height: 300px; overflow-y: auto; margin-top: 4px; }
  .bf-result { display: flex; justify-content: space-between; align-items: center;
    padding: 6px 8px; cursor: pointer; border-radius: 4px; gap: 8px; }
  .bf-result:hover { background: var(--background-modifier-hover); }
  .bf-result-title { font-size: 0.85em; flex: 1; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; }
  .bf-result-cat { font-size: 0.7em; color: var(--text-muted);
    background: var(--background-secondary); padding: 1px 6px; border-radius: 3px; }

  .bf-init { text-align: center; padding: 24px 12px; }
  .bf-init-title { font-size: 1em; font-weight: 600; margin-bottom: 8px; }
  .bf-init-desc { font-size: 0.82em; color: var(--text-muted); margin-bottom: 16px; line-height: 1.5; }
`;

export class IngestView extends ItemView {
  private plugin: BrainfreezePlugin;

  constructor(leaf: WorkspaceLeaf, plugin: BrainfreezePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return INGEST_VIEW_TYPE; }
  getDisplayText(): string { return "brainfreeze"; }
  getIcon(): string { return "brain"; }

  async onOpen(): Promise<void> {
    await this.renderFull();
  }

  private async renderFull(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();

    const style = document.createElement("style");
    style.textContent = VIEW_STYLES;
    container.appendChild(style);

    const wrap = container.createDiv({ cls: "bf-wrap" });

    // ── Header ──────────────────────────────────────────────────
    wrap.createEl("div", { text: "brainfreeze", cls: "bf-title" });

    // ── If vault not initialized, show init screen ──────────────
    if (!this.plugin.initialized) {
      const init = wrap.createDiv({ cls: "bf-init" });
      init.createEl("div", { text: "Welcome to brainfreeze", cls: "bf-init-title" });
      init.createEl("div", {
        text: "This vault hasn't been set up yet. Click below to create the schema, templates, and folder structure.",
        cls: "bf-init-desc",
      });
      const initBtn = init.createEl("button", {
        text: "Initialize vault",
        cls: "bf-btn bf-btn-primary bf-btn-full",
      });
      initBtn.title = "Create CLAUDE.md, templates, and the five category folders";
      initBtn.addEventListener("click", async () => {
        await this.plugin.initializeVault();
        await this.renderFull();
      });
      return;
    }

    // ── Health score ────────────────────────────────────────────
    const healthWrap = wrap.createDiv({ cls: "bf-health" });
    await this.renderHealth(healthWrap);

    // ── Stats ───────────────────────────────────────────────────
    const statsEl = wrap.createDiv({ cls: "bf-stats-wrap" });
    this.renderStats(statsEl);

    // ── Drop zone ───────────────────────────────────────────────
    const drop = wrap.createDiv({ cls: "bf-drop" });
    drop.createEl("p", { text: "Drop files here to ingest" });
    drop.createEl("p", { text: "or select from vault", cls: "bf-drop-sub" });

    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.addClass("bf-drop-active"); });
    drop.addEventListener("dragleave", () => drop.removeClass("bf-drop-active"));
    drop.addEventListener("drop", async (e) => {
      e.preventDefault();
      drop.removeClass("bf-drop-active");
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const vault = this.plugin.app.vault;
      try { await vault.createFolder("sources"); } catch { /* exists */ }

      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const buffer = await file.arrayBuffer();
        const destPath = `sources/${file.name}`;
        try {
          const existing = vault.getAbstractFileByPath(destPath);
          if (existing) {
            await vault.modifyBinary(existing as any, buffer);
          } else {
            await vault.createBinary(destPath, buffer);
          }
          paths.push(destPath);
        } catch (err) {
          // Use adapter as fallback
          try {
            await vault.adapter.writeBinary(destPath, Buffer.from(buffer));
            paths.push(destPath);
          } catch (err2) {
            new Notice(`Failed: ${file.name}`);
            console.error("Brainfreeze drop error:", err2);
          }
        }
      }

      if (paths.length > 0) {
        await new Promise(r => setTimeout(r, 300));
        await this.plugin.startIngest(paths);
      }
    });

    // ── Action buttons (2x2 grid) ───────────────────────────────
    const actions = wrap.createDiv({ cls: "bf-actions" });

    const ingestBtn = actions.createEl("button", { text: "Ingest sources", cls: "bf-btn bf-btn-primary" });
    ingestBtn.title = "Ingest all files in sources/ folder";
    ingestBtn.addEventListener("click", async () => {
      const sourceFiles = this.plugin.app.vault.getFiles().filter(f => f.path.startsWith("sources/"));
      if (sourceFiles.length === 0) { new Notice("No files in sources/"); return; }
      await this.plugin.startIngest(sourceFiles.map(f => f.path));
    });

    const reviewBtn = actions.createEl("button", { text: "Review", cls: "bf-btn" });
    reviewBtn.title = "Open the review panel to approve or reject drafts";
    reviewBtn.addEventListener("click", () => this.plugin.openReviewPanel());

    const lintBtn = actions.createEl("button", { text: "Lint", cls: "bf-btn" });
    lintBtn.title = "Run structural lint checks (broken links, missing provenance, etc.)";
    lintBtn.addEventListener("click", () => this.plugin.runLint());

    const reconstructBtn = actions.createEl("button", { text: "Reconstruct", cls: "bf-btn bf-btn-warn" });
    reconstructBtn.title = "Rebuild the entire wiki from all sources — use when quality has drifted";
    reconstructBtn.addEventListener("click", async () => {
      const confirm = window.confirm(
        "This will rebuild all wiki pages from your source files. " +
        "Existing pages will be replaced by new drafts after you review them. Continue?"
      );
      if (confirm) await this.plugin.reconstruct();
    });

    // ── Search ──────────────────────────────────────────────────
    const searchWrap = wrap.createDiv({ cls: "bf-search" });
    const searchInput = searchWrap.createEl("input", { type: "text", placeholder: "Search wiki..." });
    const searchResults = searchWrap.createDiv({ cls: "bf-results" });

    searchInput.addEventListener("input", () => {
      const q = searchInput.value;
      searchResults.empty();
      if (!q || q.length < 2) return;
      for (const path of this.plugin.index.search(q, 10)) {
        const meta = this.plugin.index.getPage(path);
        const item = searchResults.createDiv({ cls: "bf-result" });
        item.createEl("span", { text: meta?.title ?? path, cls: "bf-result-title" });
        item.createEl("span", { text: meta?.category ?? "", cls: "bf-result-cat" });
        item.addEventListener("click", () => this.plugin.app.workspace.openLinkText(path, ""));
      }
    });
  }

  private async renderHealth(el: HTMLElement): Promise<void> {
    el.empty();
    const { score, breakdown } = await this.plugin.getHealthScore();

    // Color: green (>75) → yellow (40-75) → red (<40)
    let color: string;
    if (score >= 75) color = "#10b981";
    else if (score >= 40) color = "#f59e0b";
    else color = "#ef4444";

    const label = el.createDiv({ cls: "bf-health-label" });
    label.createEl("span", { text: "Health", cls: "bf-health-text" });
    const scoreEl = label.createEl("span", { text: `${score}%`, cls: "bf-health-score" });
    scoreEl.style.color = color;

    const bar = el.createDiv({ cls: "bf-health-bar" });
    const fill = bar.createDiv({ cls: "bf-health-fill" });
    fill.style.width = `${score}%`;
    fill.style.background = color;

    if (breakdown.length > 0 && breakdown[0] !== "All checks passed") {
      el.createEl("div", { text: breakdown.join(" · "), cls: "bf-health-details" });
    }
  }

  private renderStats(el: HTMLElement): void {
    el.empty();
    const stats = this.plugin.index.getStats();
    const grid = el.createDiv({ cls: "bf-grid" });

    for (const [label, key] of [
      ["pages", "total"], ["entities", "entity"], ["concepts", "concept"],
      ["decisions", "decision"], ["events", "event"], ["strategy", "strategy"],
    ]) {
      const card = grid.createDiv({ cls: "bf-card" });
      card.createEl("span", { text: String(stats[key] ?? 0), cls: "bf-val" });
      card.createEl("span", { text: label, cls: "bf-lbl" });
    }
  }

  refresh(): void {
    this.renderFull();
  }

  async onClose(): Promise<void> {}
}
