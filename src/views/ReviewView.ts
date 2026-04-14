import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type BrainfreezePlugin from "../main";
import { DraftPage } from "../llm/types";

export const REVIEW_VIEW_TYPE = "brainfreeze-review";

const REVIEW_STYLES = `
  .bfr-wrap { padding: 12px; }
  .bfr-header { margin-bottom: 16px; }
  .bfr-title { font-size: 0.95em; font-weight: 600; margin: 0 0 4px 0; }
  .bfr-subtitle { font-size: 0.8em; color: var(--text-muted); margin: 0 0 12px 0; }
  .bfr-bulk { display: flex !important; gap: 8px !important; }
  .bfr-bulk button { flex: 1 !important; }
  .bfr-btn { padding: 7px 14px !important; border-radius: 6px !important;
    border: 1px solid var(--background-modifier-border) !important;
    background: var(--background-secondary) !important; color: var(--text-normal) !important;
    cursor: pointer !important; font-size: 0.82em !important; text-align: center !important;
    transition: all 0.15s !important; }
  .bfr-btn:hover { background: var(--background-modifier-hover) !important; }
  .bfr-btn-merge { background: var(--interactive-accent) !important;
    color: var(--text-on-accent) !important; border-color: var(--interactive-accent) !important; }
  .bfr-btn-merge:hover { filter: brightness(1.1); }
  .bfr-btn-reject { color: var(--text-error) !important; border-color: var(--text-error) !important; }
  .bfr-btn-reject:hover { background: var(--text-error) !important; color: white !important; }
  .bfr-list { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
  .bfr-card { background: var(--background-secondary); border-radius: 8px;
    padding: 12px; border: 1px solid var(--background-modifier-border); }
  .bfr-card-header { display: flex !important; align-items: center !important;
    gap: 8px !important; margin-bottom: 8px !important; }
  .bfr-badge { font-size: 0.65em; text-transform: uppercase; letter-spacing: 0.05em;
    padding: 2px 8px; border-radius: 3px; font-weight: 600; flex-shrink: 0; }
  .bfr-badge-create { background: rgba(16, 185, 129, 0.15); color: #10b981; }
  .bfr-badge-update { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
  .bfr-path { font-family: var(--font-monospace); font-size: 0.8em;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .bfr-preview-label { font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--text-muted); margin: 8px 0 4px 0; font-weight: 600; }
  .bfr-preview { font-size: 0.78em; color: var(--text-muted); background: var(--background-primary);
    padding: 8px 10px; border-radius: 4px; overflow: hidden; max-height: 80px;
    line-height: 1.5; white-space: pre-wrap; word-break: break-word;
    border: 1px solid var(--background-modifier-border); }
  .bfr-card-actions { display: flex !important; gap: 6px !important; margin-top: 10px !important;
    padding-top: 10px !important; border-top: 1px solid var(--background-modifier-border) !important; }
  .bfr-card-actions button { flex: 1 !important; }
  .bfr-btn-sm { padding: 4px 10px !important; font-size: 0.78em !important; }
  .bfr-empty { text-align: center; padding: 32px 16px; }
  .bfr-empty-title { font-size: 0.95em; color: var(--text-normal); margin-bottom: 6px; }
  .bfr-empty-sub { font-size: 0.82em; color: var(--text-muted); }
  .bfr-divider { height: 1px; background: var(--background-modifier-border);
    margin: 12px 0; }
`;

export class ReviewView extends ItemView {
  private plugin: BrainfreezePlugin;
  private drafts: DraftPage[] = [];

  constructor(leaf: WorkspaceLeaf, plugin: BrainfreezePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return REVIEW_VIEW_TYPE; }
  getDisplayText(): string { return "review drafts"; }
  getIcon(): string { return "check-circle"; }

  async onOpen(): Promise<void> {
    this.render();
  }

  async loadDrafts(): Promise<void> {
    const adapter = this.plugin.app.vault.adapter;
    this.drafts = [];

    const scanDir = async (dir: string) => {
      if (!(await adapter.exists(dir))) return;
      const listing = await adapter.list(dir);
      for (const file of listing.files) {
        if (file.endsWith(".md")) {
          const content = await adapter.read(file);
          const livePath = file.replace(/^\.drafts\//, "");
          const isUpdate = !!this.plugin.app.vault.getAbstractFileByPath(livePath);
          this.drafts.push({ path: livePath, content, action: isUpdate ? "update" : "create" });
        }
      }
      for (const subdir of listing.folders) {
        await scanDir(subdir);
      }
    };

    await scanDir(".drafts");
    console.log(`Brainfreeze: found ${this.drafts.length} drafts for review`);
    this.render();
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();

    const style = document.createElement("style");
    style.textContent = REVIEW_STYLES;
    container.appendChild(style);

    const wrap = container.createDiv({ cls: "bfr-wrap" });

    if (this.drafts.length === 0) {
      const empty = wrap.createDiv({ cls: "bfr-empty" });
      empty.createEl("div", { text: "No drafts pending review", cls: "bfr-empty-title" });
      empty.createEl("div", { text: "Ingest a file to generate drafts", cls: "bfr-empty-sub" });
      return;
    }

    // ── Header ──────────────────────────────────────────────────
    const header = wrap.createDiv({ cls: "bfr-header" });
    header.createEl("div", {
      text: `${this.drafts.length} draft${this.drafts.length > 1 ? "s" : ""} ready`,
      cls: "bfr-title",
    });
    header.createEl("div", {
      text: "Review each page below, then merge or reject",
      cls: "bfr-subtitle",
    });

    const bulk = header.createDiv({ cls: "bfr-bulk" });

    const mergeAllBtn = bulk.createEl("button", { text: "Merge all", cls: "bfr-btn bfr-btn-merge" });
    mergeAllBtn.title = "Approve all drafts and promote them to live wiki pages";
    mergeAllBtn.addEventListener("click", () => this.mergeAll());

    const rejectAllBtn = bulk.createEl("button", { text: "Reject all", cls: "bfr-btn bfr-btn-reject" });
    rejectAllBtn.title = "Discard all drafts without saving to wiki";
    rejectAllBtn.addEventListener("click", () => this.rejectAll());

    // ── Draft cards ────────────────────────────────────���────────
    const list = wrap.createDiv({ cls: "bfr-list" });

    for (let i = 0; i < this.drafts.length; i++) {
      const draft = this.drafts[i];
      const card = list.createDiv({ cls: "bfr-card" });

      // Header row: badge + path
      const cardHeader = card.createDiv({ cls: "bfr-card-header" });
      const badge = cardHeader.createEl("span", {
        text: draft.action,
        cls: `bfr-badge bfr-badge-${draft.action}`,
      });
      badge.title = draft.action === "create"
        ? "This is a new page that doesn't exist yet"
        : "This will update an existing page";

      cardHeader.createEl("span", { text: draft.path, cls: "bfr-path" });

      // Extract title from frontmatter for display
      const titleMatch = draft.content.match(/^title:\s*(.+)$/m);
      if (titleMatch) {
        card.createEl("div", {
          text: titleMatch[1].trim(),
          attr: { style: "font-size: 0.9em; font-weight: 600; margin-bottom: 6px;" },
        });
      }

      // Preview label + content
      card.createEl("div", { text: "PREVIEW", cls: "bfr-preview-label" });

      const body = draft.content.replace(/^---[\s\S]*?---\n/, "");
      const previewLines = body.split("\n").filter(Boolean).slice(0, 5).join("\n");
      const previewText = previewLines.substring(0, 300) + (previewLines.length > 300 ? "..." : "");
      card.createEl("pre", { text: previewText, cls: "bfr-preview" });

      // Per-card action buttons
      const cardActions = card.createDiv({ cls: "bfr-card-actions" });

      const openBtn = cardActions.createEl("button", { text: "Open", cls: "bfr-btn bfr-btn-sm" });
      openBtn.title = "Open this draft in the editor to review the full content";
      openBtn.addEventListener("click", () => {
        // Write to a temp visible location so Obsidian can open it
        const tempPath = `_review_${draft.path.replace(/\//g, "_")}`;
        this.plugin.app.vault.adapter.write(tempPath, draft.content).then(() => {
          this.plugin.app.workspace.openLinkText(tempPath, "");
        });
      });

      const mergeOneBtn = cardActions.createEl("button", { text: "Merge", cls: "bfr-btn bfr-btn-sm bfr-btn-merge" });
      mergeOneBtn.title = "Approve this draft and promote it to a live wiki page";
      mergeOneBtn.addEventListener("click", () => this.mergeOne(i));

      const rejectOneBtn = cardActions.createEl("button", { text: "Reject", cls: "bfr-btn bfr-btn-sm bfr-btn-reject" });
      rejectOneBtn.title = "Discard this draft";
      rejectOneBtn.addEventListener("click", () => this.rejectOne(i));
    }
  }

  // ── Actions ─────────────────────────────────────────────────

  private async mergeAll(): Promise<void> {
    const adapter = this.plugin.app.vault.adapter;
    let promoted = 0;

    for (const draft of this.drafts) {
      try {
        const parts = draft.path.split("/");
        parts.pop();
        let current = "";
        for (const part of parts) {
          current = current ? `${current}/${part}` : part;
          if (!(await adapter.exists(current))) {
            try { await adapter.mkdir(current); } catch { /* exists */ }
          }
        }
        await adapter.write(draft.path, draft.content);
        try { await adapter.remove(`.drafts/${draft.path}`); } catch { /* ok */ }
        promoted++;
      } catch (err) {
        console.error(`Brainfreeze: failed to promote ${draft.path}:`, err);
        new Notice(`Failed: ${draft.path}`);
      }
    }

    new Notice(`Merged ${promoted} pages — check the graph view`);
    this.drafts = [];
    this.render();
    await this.plugin.index.rebuild();
    this.plugin.refreshViews();
  }

  private async mergeOne(index: number): Promise<void> {
    const adapter = this.plugin.app.vault.adapter;
    const draft = this.drafts[index];

    try {
      const parts = draft.path.split("/");
      parts.pop();
      let current = "";
      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (!(await adapter.exists(current))) {
          try { await adapter.mkdir(current); } catch { /* exists */ }
        }
      }
      await adapter.write(draft.path, draft.content);
      try { await adapter.remove(`.drafts/${draft.path}`); } catch { /* ok */ }
      new Notice(`Merged: ${draft.path}`);
    } catch (err) {
      new Notice(`Failed: ${draft.path}`);
      return;
    }

    this.drafts.splice(index, 1);
    this.render();
    await this.plugin.index.rebuild();
    this.plugin.refreshViews();
  }

  private async rejectOne(index: number): Promise<void> {
    const draft = this.drafts[index];
    try { await this.plugin.app.vault.adapter.remove(`.drafts/${draft.path}`); } catch { /* ok */ }
    new Notice(`Rejected: ${draft.path}`);
    this.drafts.splice(index, 1);
    this.render();
  }

  private async rejectAll(): Promise<void> {
    for (const draft of this.drafts) {
      try { await this.plugin.app.vault.adapter.remove(`.drafts/${draft.path}`); } catch { /* ok */ }
    }
    new Notice("All drafts rejected");
    this.drafts = [];
    this.render();
  }

  async onClose(): Promise<void> {}
}
