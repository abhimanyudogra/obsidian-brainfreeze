import { Vault } from "obsidian";
import { CLAUDE_MD, TEMPLATES, INDEX_MD, LOG_MD } from "./schemas";

/**
 * Initialize a vault with the brainfreeze scaffold.
 * Creates CLAUDE.md, templates, category folders, index, log, manifest.
 */
export async function initVault(vault: Vault): Promise<void> {
  const adapter = vault.adapter;

  // Create category folders
  for (const folder of ["entities", "concepts", "decisions", "events", "strategy", "templates", "sources", ".drafts"]) {
    if (!(await adapter.exists(folder))) {
      await adapter.mkdir(folder);
    }
  }

  // Write schema
  await adapter.write("CLAUDE.md", CLAUDE_MD);

  // Write templates
  for (const [name, content] of Object.entries(TEMPLATES)) {
    await adapter.write(`templates/${name}.md`, content);
  }

  // Write stubs
  await adapter.write("index.md", INDEX_MD);

  const today = new Date().toISOString().split("T")[0];
  await adapter.write("log.md", LOG_MD + `\n## [${today}] init | vault scaffolded by brainfreeze plugin\n\nCreated schema, templates, and folder structure.\n`);

  await adapter.write(".manifest.json", JSON.stringify({ version: 1, updated: "", sources: {} }, null, 2));

  // Gitignore
  if (!(await adapter.exists(".gitignore"))) {
    await adapter.write(".gitignore", ".obsidian/workspace*\n.trash/\n*.tmp\n");
  }
}

/** Check if a vault has been initialized */
export async function isVaultInitialized(vault: Vault): Promise<boolean> {
  return vault.adapter.exists("CLAUDE.md");
}
