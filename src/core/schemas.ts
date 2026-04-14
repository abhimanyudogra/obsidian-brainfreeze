/**
 * Bundled vault schemas and templates.
 * These are written to disk on vault init — no network fetch needed.
 */

export const CLAUDE_MD = `# Wiki Schema — brainfreeze

LLM-maintained knowledge wiki. Obsidian reads, the LLM writes, plain markdown is the contract.

## Page categories

| Folder | Contains | Examples |
|---|---|---|
| \`entities/\` | People, organizations, accounts, tools | employer.md, bank-account.md, doctor.md |
| \`concepts/\` | Reusable knowledge, rules, definitions | tax-brackets.md, sleep-hygiene.md |
| \`decisions/\` | Choices under consideration | max-401k.md, change-jobs.md |
| \`events/\` | Time-bounded occurrences | tax-year-2025.md, annual-physical.md |
| \`strategy/\` | Long-horizon plans tying decisions together | retirement-plan.md, career-growth.md |

## Frontmatter

Every page has YAML frontmatter:

\`\`\`yaml
---
title: Page Title
category: entity | concept | decision | event | strategy
status: active | superseded | archived | draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: []
relations:
  supports: []
  contradicts: []
  supersedes: []
  derives-from: []
  depends-on: []
  relates-to: []
provenance:
  extracted: 0
  inferred: 0
  ambiguous: 0
sources: []
---
\`\`\`

## Provenance tagging

Every factual claim carries an inline tag:
- \`[^e<n>]\` **extracted** — directly from a raw source
- \`[^i<n>]\` **inferred** — LLM synthesis across extracted facts
- \`[^a<n>]\` **ambiguous** — sources disagree

## Operations

### Ingest
1. Read source files fully
2. Report key facts, surprises, and planned pages as a JSON response
3. Write pages using the templates (frontmatter + required sections)
4. Every numeric claim gets a provenance tag

### Query
Answer questions with inline citations to wiki pages.

### Lint
Structural: broken links, orphan pages, missing provenance, count mismatches.
Semantic: re-read sources, verify claims still match.

## Response format for ingest

Respond as JSON:
\`\`\`json
{
  "conversation": "Key facts, surprises, open questions (plain text)",
  "pages": [
    {
      "path": "entities/example.md",
      "action": "create",
      "content": "---\\ntitle: Example\\ncategory: entity\\nstatus: active\\ncreated: 2026-04-13\\nupdated: 2026-04-13\\ntags: []\\nrelations:\\n  supports: []\\n  contradicts: []\\n  supersedes: []\\n  derives-from: []\\n  depends-on: []\\n  relates-to: []\\nprovenance:\\n  extracted: 1\\n  inferred: 0\\n  ambiguous: 0\\nsources: []\\n---\\n\\n# Example\\n\\n## What it is\\nDescription [^e1]\\n\\n## Citations\\n[^e1]: extracted — source.json field_name"
    }
  ]
}
\`\`\`

## Hard rules
- Never create pages outside the five category folders
- Every numeric claim needs a provenance tag
- Use Obsidian wikilinks: [[entities/example]] or [[entities/example|alias]]
- Cross-link between related pages using the relations frontmatter
`;

export const TEMPLATES: Record<string, string> = {
  "entity": `---
title: "{{Title}}"
category: entity
status: active
created: "{{date}}"
updated: "{{date}}"
tags: []
relations:
  supports: []
  contradicts: []
  supersedes: []
  derives-from: []
  depends-on: []
  relates-to: []
provenance:
  extracted: 0
  inferred: 0
  ambiguous: 0
sources: []
---

# {{Title}}

## What it is
_(description)_

## Key facts
- _(no content yet)_

## Relationships
_(how this entity connects to others)_

## History
_(notable events)_

## Open questions & data gaps
- _(no content yet)_

## Citations
`,

  "concept": `---
title: "{{Title}}"
category: concept
status: active
created: "{{date}}"
updated: "{{date}}"
tags: []
relations:
  supports: []
  contradicts: []
  supersedes: []
  derives-from: []
  depends-on: []
  relates-to: []
provenance:
  extracted: 0
  inferred: 0
  ambiguous: 0
sources: []
---

# {{Title}}

## Definition
_(precise definition)_

## Rules and mechanics
- _(no content yet)_

## Current values
- _(no content yet)_

## Open questions & data gaps
- _(no content yet)_

## Citations
`,

  "decision": `---
title: "{{Title}}"
category: decision
status: active
decision-state: open
created: "{{date}}"
updated: "{{date}}"
tags: []
relations:
  supports: []
  contradicts: []
  supersedes: []
  derives-from: []
  depends-on: []
  relates-to: []
provenance:
  extracted: 0
  inferred: 0
  ambiguous: 0
sources: []
---

# {{Title}}

## The question
_(one-sentence framing)_

## Options
### Option 1
- Pro:
- Con:

### Option 2
- Pro:
- Con:

## Decision
_(undecided / chosen option)_

## Follow-up actions
- [ ] _(no content yet)_

## Open questions & data gaps
- _(no content yet)_

## Citations
`,

  "event": `---
title: "{{Title}}"
category: event
status: active
event-date: "{{date}}"
created: "{{date}}"
updated: "{{date}}"
tags: []
relations:
  supports: []
  contradicts: []
  supersedes: []
  derives-from: []
  depends-on: []
  relates-to: []
provenance:
  extracted: 0
  inferred: 0
  ambiguous: 0
sources: []
---

# {{Title}}

## Summary
_(what happened, when, why it matters)_

## Key numbers
| Metric | Value | Source |
|---|---|---|
| | | |

## Open questions & data gaps
- _(no content yet)_

## Citations
`,

  "strategy": `---
title: "{{Title}}"
category: strategy
status: active
horizon: medium
created: "{{date}}"
updated: "{{date}}"
tags: []
relations:
  supports: []
  contradicts: []
  supersedes: []
  derives-from: []
  depends-on: []
  relates-to: []
provenance:
  extracted: 0
  inferred: 0
  ambiguous: 0
sources: []
---

# {{Title}}

## Objective
_(one sentence)_

## Current posture
_(where you are now)_

## Component decisions
- _(no content yet)_

## Open questions & data gaps
- _(no content yet)_

## Citations
`,
};

export const INDEX_MD = `# Wiki Index

Catalog of every active page. Updated on every ingest.

## Entities
_(no entries yet)_

## Concepts
_(no entries yet)_

## Decisions
_(no entries yet)_

## Events
_(no entries yet)_

## Strategy
_(no entries yet)_
`;

export const LOG_MD = `# Activity Log

Newest first.

---
`;
