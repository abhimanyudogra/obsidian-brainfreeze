<div align="center">

# obsidian-brainfreeze

**Build persistent memory palaces from your documents**

Drop files. Review LLM-generated wiki pages. Watch your knowledge graph grow — with provenance tracking on every claim.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-plugin-7c3aed)](https://obsidian.md)

</div>

---

An [Obsidian](https://obsidian.md) plugin that implements the [brainfreeze](https://github.com/abhimanyudogra/brainfreeze) enhanced LLM Wiki pattern. You bring your documents and your LLM API key. The plugin builds and maintains a provenance-tracked knowledge graph — and your data never leaves your machine except for LLM inference calls to the provider you choose.

## How it works

```mermaid
flowchart LR
    A["Drop files into\nthe sidebar"] --> B["Plugin calls\nyour LLM"]
    B --> C{{"You review\nfindings in chat"}}
    C --> D["Drafts appear\nin .drafts/"]
    D --> E{{"You approve\nor reject"}}
    E --> |merge| F["Pages go live\ngraph updates"]
    E --> |reject| G["Drafts discarded"]

    style C fill:#fbbf24,stroke:#d97706,color:#000
    style E fill:#fbbf24,stroke:#d97706,color:#000
```

Yellow nodes are where you stay in the loop. The plugin never writes to your live wiki without your approval.

## Features

**Ingest panel** (left sidebar)
- Drag-and-drop file zone — copies files to `sources/`, triggers ingest
- Vault stats dashboard (page counts by category)
- FlexSearch-powered instant search across all wiki pages

**Review panel** (right sidebar)
- Draft cards with content previews
- Per-draft approve/reject or bulk merge-all/reject-all
- Click to preview any draft in the Obsidian editor

**In-memory search index**
- Two layers: structured frontmatter map + FlexSearch full-text
- Sub-5ms queries across hundreds of pages
- Incremental updates on file changes — no manual rebuild needed

**Structural lint** (10 checks, zero LLM cost)
- Broken wikilinks, orphan pages, missing provenance tags
- Provenance count mismatches, empty template sections
- Category-folder mismatches, active contradictions, stale dependencies

**Provenance tracking**
- Every factual claim tagged: `[^e]` extracted, `[^i]` inferred, `[^a]` ambiguous
- Frontmatter rollup counts validated by lint
- Ambiguous claims require an open-questions section — enforced, not optional

**Manifest-based delta ingest**
- SHA-256 hash per source file in `.manifest.json`
- Re-ingesting unchanged files is a no-op — no duplicates, no guessing

## Installation

### From Community Plugins (coming soon)

Settings → Community Plugins → Browse → search "Brainfreeze"

### Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/abhimanyudogra/obsidian-brainfreeze/releases)
2. Create `<your-vault>/.obsidian/plugins/brainfreeze/`
3. Copy the three files into that folder
4. Settings → Community Plugins → enable "Brainfreeze"

### Build from source

```bash
git clone https://github.com/abhimanyudogra/obsidian-brainfreeze.git
cd obsidian-brainfreeze
npm install
npm run build
# Copy main.js, manifest.json, styles.css to your vault's plugin folder
```

## Setup

1. Open Obsidian Settings → Brainfreeze
2. Select your **LLM provider** (Anthropic, OpenAI, or Ollama for fully local)
3. Enter your **API key** (stored locally in the vault, never sent to us — there is no "us")
4. Pick a **vault type** (Personal Finance, Career, Health, or Custom)
5. Copy the matching `CLAUDE.md` from [brainfreeze](https://github.com/abhimanyudogra/brainfreeze) into your vault root
6. Drop files into the sidebar and start ingesting

## Privacy

This plugin is designed around a single principle: **your data is yours**.

- **No servers.** There is no backend. No telemetry. No analytics. No accounts.
- **No data collection.** Your API key is stored in your vault's local `.obsidian/` config — it never leaves your machine except in direct API calls to your chosen LLM provider.
- **Fully open source.** Every line of code is auditable. If you don't trust the claim, read `src/main.ts`.
- **Ollama option.** For maximum privacy, select Ollama as your provider — runs entirely on your machine with zero external API calls.

## Supported LLM Providers

| Provider | Status | Notes |
|---|---|---|
| **Anthropic (Claude)** | Implemented | Recommended. Claude Sonnet 4 default. |
| **OpenAI (GPT)** | Planned | API key + model selector ready in settings |
| **Ollama (local)** | Planned | Zero cloud — runs on localhost:11434 |

## Architecture

```
src/
├── main.ts                 # Plugin entry — registers views, commands, file watchers
├── settings.ts             # Settings tab — API key, provider, vault type
├── views/
│   ├── IngestView.ts       # Left sidebar — drop zone, stats, search
│   └── ReviewView.ts       # Right sidebar — draft review + merge/reject
├── core/
│   ├── search-index.ts     # FlexSearch + frontmatter Map (two-layer index)
│   ├── manifest.ts         # .manifest.json SHA-256 tracking
│   └── lint.ts             # 10-check structural lint
├── llm/
│   ├── provider.ts         # Abstract LLM interface
│   ├── anthropic.ts        # Claude API via @anthropic-ai/sdk
│   └── types.ts            # Shared types
└── utils/
    └── crypto.ts           # SHA-256 hashing
```

Built on the [brainfreeze](https://github.com/abhimanyudogra/brainfreeze) pattern — 11 enhancements over Karpathy's base LLM Wiki including drafts-folder review gates, three-state provenance, typed YAML relations, and split lint. See the brainfreeze README for the full methodology.

## Contributing

PRs welcome. The main areas that need work:

- [ ] OpenAI provider implementation (`src/llm/openai.ts`)
- [ ] Ollama provider implementation (`src/llm/ollama.ts`)
- [ ] Pre-ingest conversation modal (currently uses Notice; should be a rich modal)
- [ ] Lint results modal (currently logs to console; should be a UI panel)
- [ ] Vector embeddings for semantic search (v0.2)
- [ ] Page template auto-scaffolding on first install
- [ ] Obsidian Community Plugin submission

## Credits

- **[brainfreeze](https://github.com/abhimanyudogra/brainfreeze)** — the enhanced LLM Wiki pattern this plugin implements
- **[Andrej Karpathy](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)** — the original LLM Wiki concept
- **[Obsidian](https://obsidian.md)** — the knowledge platform this runs on

## License

MIT
