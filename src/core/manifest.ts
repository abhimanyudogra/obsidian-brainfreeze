import { Vault } from "obsidian";
import { sha256 } from "../utils/crypto";

export interface ManifestSource {
  sha256: string;
  size_bytes: number;
  last_ingested: string;
  produced_pages: string[];
}

export interface ManifestData {
  version: number;
  updated: string;
  sources: Record<string, ManifestSource>;
}

const MANIFEST_PATH = ".manifest.json";

/**
 * Manages .manifest.json — the source-hash tracking file for idempotent delta ingests.
 * SHA-256 per source file; unchanged files are skipped on re-ingest.
 */
export class ManifestManager {
  private data: ManifestData = { version: 1, updated: "", sources: {} };
  private vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  async load(): Promise<void> {
    // Read via adapter, not vault, because Obsidian's file cache excludes
    // dot-prefixed paths — getAbstractFileByPath(".manifest.json") returns
    // null even when the file exists. save() already uses the adapter;
    // loading the same way keeps them symmetric.
    try {
      if (await this.vault.adapter.exists(MANIFEST_PATH)) {
        const raw = await this.vault.adapter.read(MANIFEST_PATH);
        this.data = JSON.parse(raw);
      }
    } catch (err) {
      console.error("Brainfreeze: manifest load failed, starting empty:", err);
      this.data = { version: 1, updated: "", sources: {} };
    }
  }

  async save(): Promise<void> {
    this.data.updated = new Date().toISOString();
    const json = JSON.stringify(this.data, null, 2);
    await this.vault.adapter.write(MANIFEST_PATH, json);
  }

  /**
   * Check if a source file has changed since last ingest.
   * Returns true if the file is new or modified (should be ingested).
   * Returns false if unchanged (should be skipped).
   */
  hasChanged(sourcePath: string, content: string): boolean {
    const hash = sha256(content);
    const existing = this.data.sources[sourcePath];
    return !existing || existing.sha256 !== hash;
  }

  /** Record a successful ingest of a source file */
  recordIngest(
    sourcePath: string,
    content: string,
    producedPages: string[]
  ): void {
    this.data.sources[sourcePath] = {
      sha256: sha256(content),
      size_bytes: Buffer.byteLength(content, "utf-8"),
      last_ingested: new Date().toISOString(),
      produced_pages: producedPages,
    };
  }

  /** Get the list of pages produced by a source */
  getProducedPages(sourcePath: string): string[] {
    return this.data.sources[sourcePath]?.produced_pages ?? [];
  }

  /** Get all tracked sources */
  getSources(): Record<string, ManifestSource> {
    return this.data.sources;
  }
}
