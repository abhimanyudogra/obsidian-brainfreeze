import { App, PluginSettingTab, Setting } from "obsidian";
import type BrainfreezePlugin from "./main";
import { VaultType, LLMProvider } from "./llm/types";

export interface BrainfreezeSettings {
  llmProvider: LLMProvider;
  anthropicApiKey: string;
  anthropicModel: string;
  openaiApiKey: string;
  openaiModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  vaultType: VaultType;
}

export const DEFAULT_SETTINGS: BrainfreezeSettings = {
  llmProvider: "anthropic",
  anthropicApiKey: "",
  anthropicModel: "claude-sonnet-4-20250514",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3.1",
  vaultType: "personal-finance",
};

export class BrainfreezeSettingTab extends PluginSettingTab {
  plugin: BrainfreezePlugin;

  constructor(app: App, plugin: BrainfreezePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Brainfreeze" });
    containerEl.createEl("p", {
      text: "Your data stays on your machine. API calls go directly to your LLM provider — nothing flows through our servers (there are no servers).",
      cls: "setting-item-description",
    });

    // ── Vault type ──────────────────────────────────────────────

    new Setting(containerEl)
      .setName("Vault type")
      .setDesc("Determines the page templates, routing rules, and schema")
      .addDropdown((dd) =>
        dd
          .addOption("personal-finance", "Personal Finance")
          .addOption("career", "Career")
          .addOption("health", "Health")
          .addOption("custom", "Custom")
          .setValue(this.plugin.settings.vaultType)
          .onChange(async (v) => {
            this.plugin.settings.vaultType = v as VaultType;
            await this.plugin.saveSettings();
          })
      );

    // ── LLM provider ────────────────────────────────────────────

    containerEl.createEl("h3", { text: "LLM Provider" });

    new Setting(containerEl)
      .setName("Provider")
      .setDesc("Which LLM service to use for ingest and query operations")
      .addDropdown((dd) =>
        dd
          .addOption("anthropic", "Anthropic (Claude)")
          .addOption("openai", "OpenAI (GPT)")
          .addOption("ollama", "Ollama (local)")
          .setValue(this.plugin.settings.llmProvider)
          .onChange(async (v) => {
            this.plugin.settings.llmProvider = v as LLMProvider;
            await this.plugin.saveSettings();
            this.display(); // re-render to show relevant key field
          })
      );

    // Show provider-specific settings
    if (this.plugin.settings.llmProvider === "anthropic") {
      new Setting(containerEl)
        .setName("Anthropic API key")
        .setDesc("Get one at console.anthropic.com — stored locally, never sent to us")
        .addText((text) =>
          text
            .setPlaceholder("sk-ant-...")
            .setValue(this.plugin.settings.anthropicApiKey)
            .onChange(async (v) => {
              this.plugin.settings.anthropicApiKey = v;
              await this.plugin.saveSettings();
            })
        )
        .then((setting) => {
          const input = setting.controlEl.querySelector("input");
          if (input) input.type = "password";
        });

      new Setting(containerEl)
        .setName("Model")
        .setDesc("claude-sonnet-4-20250514 recommended for balance of speed and quality")
        .addText((text) =>
          text
            .setValue(this.plugin.settings.anthropicModel)
            .onChange(async (v) => {
              this.plugin.settings.anthropicModel = v;
              await this.plugin.saveSettings();
            })
        );
    }

    if (this.plugin.settings.llmProvider === "openai") {
      new Setting(containerEl)
        .setName("OpenAI API key")
        .setDesc("Get one at platform.openai.com")
        .addText((text) =>
          text
            .setPlaceholder("sk-...")
            .setValue(this.plugin.settings.openaiApiKey)
            .onChange(async (v) => {
              this.plugin.settings.openaiApiKey = v;
              await this.plugin.saveSettings();
            })
        )
        .then((setting) => {
          const input = setting.controlEl.querySelector("input");
          if (input) input.type = "password";
        });
    }

    if (this.plugin.settings.llmProvider === "ollama") {
      new Setting(containerEl)
        .setName("Ollama server URL")
        .setDesc("Default: http://localhost:11434")
        .addText((text) =>
          text
            .setValue(this.plugin.settings.ollamaUrl)
            .onChange(async (v) => {
              this.plugin.settings.ollamaUrl = v;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Model")
        .addText((text) =>
          text
            .setValue(this.plugin.settings.ollamaModel)
            .onChange(async (v) => {
              this.plugin.settings.ollamaModel = v;
              await this.plugin.saveSettings();
            })
        );
    }

    // ── Privacy note ────────────────────────────────────────────

    containerEl.createEl("h3", { text: "Privacy" });
    const privacyNote = containerEl.createEl("div", {
      cls: "brainfreeze-privacy-note",
    });
    privacyNote.createEl("p", {
      text: "Brainfreeze is fully open source. Your API key is stored in this vault's local config. When you ingest or query, your file contents are sent to your chosen LLM provider for processing. No data is sent anywhere else.",
    });
    privacyNote.createEl("p", {
      text: "For maximum privacy, use Ollama (runs entirely on your machine — no API calls at all).",
    });
  }
}
