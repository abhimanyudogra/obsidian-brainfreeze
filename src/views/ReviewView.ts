import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type BrainfreezePlugin from "../main";
import { DraftPage } from "../llm/types";

export const REVIEW_VIEW_TYPE = "brainfreeze-review";

/**
 * Right sidebar view — draft review panel.
 * Shows pending drafts from .drafts/ with approve/reject controls per page.
 */
export class ReviewView extends ItemView {
  private plugin: BrainfreezePlugin;
  private drafts: DraftPage[] = [];

  constructor(leaf: WorkspaceLeaf, plugin: BrainfreezePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return REVIEW_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Review Drafts";
  }

  getIcon(): string {
    return "check-circle";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  /** Load drafts from .drafts/ and display them */
  async loadDrafts(): Promise<void> {
    const draftFiles = this.plugin.app.vault
      .getFiles()
      .filter((f) => f.path.startsWith(".drafts/") && f.extension === "md");

    this.drafts = [];
    for (const file of draftFiles) {
      const content = await this.plugin.app.vault.read(file);
      const livePath = file.path.replace(/^\.drafts\//, "");
      const isUpdate = !!this.plugin.app.vault.getAbstractFileByPath(livePath);

      this.drafts.push({
        path: livePath,
        content,
        action: isUpdate ? "update" : "create",
      });
    }

    this.render();
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("brainfreeze-review-view");

    if (this.drafts.length === 0) {
      const empty = container.createDiv("brainfreeze-review-empty");
      empty.createEl("p", { text: "No drafts pending review" });
      empty.createEl("p", {
        text: "Run an ingest to generate drafts",
        cls: "brainfreeze-muted",
      });
      return;
    }

    // ── Header with bulk actions ────────────────────────────────
    const header = container.createDiv("brainfreeze-review-header");
    header.createEl("h4", {
      text: `${this.drafts.length} drafts ready for review`,
    });

    const bulkActions = header.createDiv("brainfreeze-review-bulk");

    const mergeAllBtn = bulkActions.createEl("button", {
      text: "Merge all",
      cls: "brainfreeze-btn brainfreeze-btn-primary",
    });
    mergeAllBtn.addEventListener("click", async () => {
      await this.mergeAll();
    });

    const rejectAllBtn = bulkActions.createEl("button", {
      text: "Reject all",
      cls: "brainfreeze-btn brainfreeze-btn-danger",
    });
    rejectAllBtn.addEventListener("click", async () => {
      await this.rejectAll();
    });

    // ── Per-draft cards ─────────────────────────────────────────
    const list = container.createDiv("brainfreeze-review-list");
    for (const draft of this.drafts) {
      const card = list.createDiv("brainfreeze-review-card");

      const titleRow = card.createDiv("brainfreeze-review-title-row");
      const badge = titleRow.createEl("span", {
        text: draft.action,
        cls: `brainfreeze-badge brainfreeze-badge-${draft.action}`,
      });
      titleRow.createEl("span", {
        text: draft.path,
        cls: "brainfreeze-review-path",
      });

      // Preview button — opens the draft file in the editor
      const previewBtn = card.createEl("button", {
        text: "Preview",
        cls: "brainfreeze-btn brainfreeze-btn-sm",
      });
      previewBtn.addEventListener("click", () => {
        const draftPath = `.drafts/${draft.path}`;
        this.plugin.app.workspace.openLinkText(draftPath, "");
      });

      // Content preview (first 3 lines of body, after frontmatter)
      const body = draft.content.replace(/^---[\s\S]*?---\n/, "");
      const preview = body.split("\n").filter(Boolean).slice(0, 3).join("\n");
      card.createEl("pre", {
        text: preview.substring(0, 200) + (preview.length > 200 ? "..." : ""),
        cls: "brainfreeze-review-preview",
      });
    }
  }

  /** Promote all drafts to live folders */
  private async mergeAll(): Promise<void> {
    let promoted = 0;
    for (const draft of this.drafts) {
      try {
        // Create parent directories if needed
        const dir = draft.path.substring(0, draft.path.lastIndexOf("/"));
        if (dir && !this.plugin.app.vault.getAbstractFileByPath(dir)) {
          await this.plugin.app.vault.createFolder(dir);
        }

        // Write or overwrite the live file
        const existing = this.plugin.app.vault.getAbstractFileByPath(draft.path);
        if (existing) {
          await this.plugin.app.vault.modify(existing as any, draft.content);
        } else {
          await this.plugin.app.vault.create(draft.path, draft.content);
        }

        // Remove the draft
        const draftFile = this.plugin.app.vault.getAbstractFileByPath(
          `.drafts/${draft.path}`
        );
        if (draftFile) await this.plugin.app.vault.delete(draftFile);

        promoted++;
      } catch (err) {
        new Notice(`Failed to promote ${draft.path}: ${err}`);
      }
    }

    new Notice(`Merged ${promoted} pages`);
    this.drafts = [];
    this.render();

    // Rebuild index with new pages
    await this.plugin.index.rebuild();
    this.plugin.refreshViews();
  }

  /** Discard all drafts */
  private async rejectAll(): Promise<void> {
    for (const draft of this.drafts) {
      const draftFile = this.plugin.app.vault.getAbstractFileByPath(
        `.drafts/${draft.path}`
      );
      if (draftFile) await this.plugin.app.vault.delete(draftFile);
    }

    new Notice("All drafts rejected");
    this.drafts = [];
    this.render();
  }

  async onClose(): Promise<void> {
    // Cleanup
  }
}
