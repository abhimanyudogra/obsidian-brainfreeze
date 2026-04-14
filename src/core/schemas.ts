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

### Relations format — must be YAML block-lists of quoted wikilink strings

When a relation has targets, write it like this:

\`\`\`yaml
relations:
  derives-from:
    - "[[concepts/convolutional-neural-networks]]"
  depends-on:
    - "[[entities/imagenet-dataset]]"
    - "[[concepts/dropout-regularization]]"
\`\`\`

**Never** write relations as inline flow arrays with bare wikilinks:

\`\`\`yaml
# WRONG — YAML parses [[x]] as a nested array, not a wikilink string
depends-on: [[entities/imagenet-dataset], [concepts/dropout-regularization]]
# WRONG — same mistake in single-entry form
derives-from: [[concepts/something]]
\`\`\`

Same rule for \`sources:\` and any other list-of-wikilink fields — always block-list form with quoted \`"[[...]]"\` strings.

## Provenance tagging

Every factual claim carries an inline tag:
- \`[^e<n>]\` **extracted** — directly from a raw source
- \`[^i<n>]\` **inferred** — LLM synthesis. Definition line must start with \`inferred from [^X1], [^X2], ... — rationale\` where each \`[^X]\` is an existing parent tag on the same page (\`[^e]\`, \`[^i]\`, or \`[^a]\`). Parent citations turn provenance into a DAG — lint walks it to detect drift.
- \`[^a<n>]\` **ambiguous** — sources disagree

Example:

\`\`\`
Total income was $148,200 [^i1] giving an effective federal rate of 24% [^i2].

[^e1]: extracted — W-2 Box 1 = $145,000
[^e2]: extracted — 1099-DIV = $3,200
[^i1]: inferred from [^e1], [^e2] — total income = W-2 + 1099-DIV
[^i2]: inferred from [^i1] — effective rate from total income and known AGI
\`\`\`

Max inference depth is 3 hops to an extracted leaf. Deeper chains are a lint error — ground the claim in a new \`[^e]\` or split the page.

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
      "content": "---\\ntitle: Example\\ncategory: entity\\nstatus: active\\ncreated: YYYY-MM-DD\\nupdated: YYYY-MM-DD\\ntags: []\\nrelations:\\n  supports: []\\n  contradicts: []\\n  supersedes: []\\n  derives-from: []\\n  depends-on: []\\n  relates-to: []\\nprovenance:\\n  extracted: 1\\n  inferred: 0\\n  ambiguous: 0\\nsources: []\\n---\\n\\n# Example\\n\\n## What it is\\nDescription [^e1]\\n\\n## Citations\\n[^e1]: extracted — source.json field_name"
    }
  ]
}
\`\`\`

## Hard rules
- Never create pages outside the five category folders
- Every numeric claim needs a provenance tag
- Every \`[^i]\` must cite parents via \`inferred from [^X1], [^X2]\` — no orphan inferences
- Max inference depth of 3 hops to an extracted leaf — deeper chains must be split
- Use the current date (provided in each ingest operation) for \`created\` and \`updated\` — never guess a date from your training cutoff
- Relations are YAML block-lists of quoted wikilink strings (see Relations format above) — never inline flow arrays with bare \`[[...]]\`
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
