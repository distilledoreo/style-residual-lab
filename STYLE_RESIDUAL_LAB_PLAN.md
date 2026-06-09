# Style Residual Lab — Project Implementation Plan

## Purpose

Build a local-first creative writing style-similarity engine that estimates how closely a new piece of writing matches a target corpus's **style** after factoring out the writing's **topic/content**.

This is **not** a quality grader.  
This is **not** a preference model.  
This is **not** a lyric generator.  
This is a **topic-normalized style similarity system**.

Core idea:

```text
style signal ≈ text embedding − topic/content embedding
```

Conceptually:

```text
(song lyrics) / (song main theme or topic) = subject-agnostic style signal
```

In implementation terms:

```text
style_residual = text_embedding with topic/content vector directions removed
```

The first implementation domain should be **song lyrics**, but the project must be architected so that the same engine can later support fiction, poetry, essays, speeches, scripts, talks, captions, or other creative writing forms.

---

## Core Philosophy

The system should answer:

> "Does this writing handle its subject matter in a way that resembles the target corpus?"

It should **not** merely answer:

> "Does this writing mention the same topics, objects, emotions, or imagery as the target corpus?"

A bad implementation would reward a new lyric just because it mentions mirrors, paper, shame, storms, wounds, journals, or faith.

A better implementation should reward deeper stylistic mechanics:

- line shape
- section behavior
- plainspoken diction
- emotional argument
- metaphor mechanics
- chorus thesis behavior
- bridge turn behavior
- section-to-section motion
- directness of address
- self-cross-examination
- defiant vulnerability
- topic-independent stylistic structure

---

## High-Level Architecture

Use abstract creative-writing units in the core engine:

```text
Project
  Work
    Block
      Atom
```

For lyrics:

```text
Project = album / corpus / folder
Work    = song
Block   = verse / chorus / bridge / intro / outro
Atom    = lyric line
```

For fiction later:

```text
Project = novel / story collection
Work    = chapter / story
Block   = scene / paragraph
Atom    = sentence
```

For poetry later:

```text
Project = collection
Work    = poem
Block   = stanza
Atom    = line
```

The core engine must not hard-code lyrics, choruses, bridges, songs, or The Flowseph Project. Lyrics should be implemented as the first **domain pack**.

---

## Recommended Project Name

Use one of these:

```text
style-residual-lab
```

or:

```text
creative-style-lab
```

If this is specifically for lyrics first, a friendly project name could be:

```text
FlowStyle Lab
```

But the repo and core code should remain generic.

---

## Tech Stack

Use:

- TypeScript
- Node.js
- JSON / JSONL storage
- OpenAI API for embeddings
- OpenAI chat model for topic/content extraction
- Vitest for tests
- CLI-first workflow
- No SQL for MVP
- No React/UI for MVP

Storage should be local-first and file-based.

Environment variables:

```text
OPENAI_API_KEY=
EMBEDDING_MODEL=text-embedding-3-small
TOPIC_MODEL=gpt-4.1-mini
```

If an API key is missing, the app should fail gracefully with a clear error.

---

## Folder Structure

Create this exact structure:

```text
style-residual-lab/
│
├── README.md
├── PLAN.md
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
│
├── data/
│   ├── domains/
│   │   └── lyrics.domain.json
│   │
│   ├── raw/
│   │   ├── target/
│   │   │   └── lyrics/
│   │   │       ├── song-001.txt
│   │   │       ├── song-002.txt
│   │   │       └── ...
│   │   │
│   │   ├── background/
│   │   │   └── lyrics/
│   │   │       ├── generic-001.txt
│   │   │       └── ...
│   │   │
│   │   └── candidates/
│   │       └── lyrics/
│   │           └── candidate-001.txt
│   │
│   ├── processed/
│   │   ├── works.jsonl
│   │   ├── blocks.jsonl
│   │   ├── atoms.jsonl
│   │   └── topics.jsonl
│   │
│   ├── features/
│   │   ├── atom_features.jsonl
│   │   ├── block_features.jsonl
│   │   └── work_features.jsonl
│   │
│   ├── embeddings/
│   │   ├── atom_embeddings.jsonl
│   │   ├── block_embeddings.jsonl
│   │   ├── work_embeddings.jsonl
│   │   ├── topic_embeddings.jsonl
│   │   └── residual_embeddings.jsonl
│   │
│   ├── models/
│   │   ├── target_centroids.json
│   │   ├── background_centroids.json
│   │   ├── style_profile.json
│   │   └── validation_summary.json
│   │
│   └── reports/
│       ├── candidate_scores/
│       ├── validation/
│       └── nearest_neighbors/
│
├── src/
│   ├── cli/
│   │   ├── import-corpus.ts
│   │   ├── extract-topics.ts
│   │   ├── embed-text.ts
│   │   ├── build-residuals.ts
│   │   ├── build-centroids.ts
│   │   ├── score-candidate.ts
│   │   ├── validate-style-model.ts
│   │   └── run-pipeline.ts
│   │
│   ├── core/
│   │   ├── schema.ts
│   │   ├── ids.ts
│   │   ├── jsonl.ts
│   │   ├── normalize.ts
│   │   ├── vector.ts
│   │   ├── stats.ts
│   │   └── config.ts
│   │
│   ├── domains/
│   │   ├── domain-types.ts
│   │   └── lyrics/
│   │       ├── parseLyrics.ts
│   │       ├── lyricsFeatures.ts
│   │       └── lyricsTopicPrompt.ts
│   │
│   ├── embeddings/
│   │   ├── embeddingClient.ts
│   │   ├── embeddingCache.ts
│   │   └── embeddingTypes.ts
│   │
│   ├── llm/
│   │   ├── topicExtractor.ts
│   │   ├── prompts.ts
│   │   └── llmClient.ts
│   │
│   ├── residuals/
│   │   ├── contentBasis.ts
│   │   ├── residualize.ts
│   │   └── residualScoring.ts
│   │
│   ├── scoring/
│   │   ├── centroidScoring.ts
│   │   ├── nearestNeighbor.ts
│   │   ├── overfitRisk.ts
│   │   └── reportBuilder.ts
│   │
│   └── validation/
│       ├── leaveOneWorkOut.ts
│       ├── leaveOneTopicOut.ts
│       └── validationReport.ts
│
├── scripts/
│   ├── seed-example-data.ts
│   └── generate-background-corpus.ts
│
└── tests/
    ├── vector.test.ts
    ├── residualize.test.ts
    ├── parseLyrics.test.ts
    └── scoring.test.ts
```

---

## Package Scripts

`package.json` should include:

```json
{
  "scripts": {
    "import": "tsx src/cli/import-corpus.ts",
    "topics": "tsx src/cli/extract-topics.ts",
    "embed": "tsx src/cli/embed-text.ts",
    "residuals": "tsx src/cli/build-residuals.ts",
    "centroids": "tsx src/cli/build-centroids.ts",
    "validate": "tsx src/cli/validate-style-model.ts",
    "score": "tsx src/cli/score-candidate.ts",
    "pipeline": "tsx src/cli/run-pipeline.ts",
    "test": "vitest"
  }
}
```

Expected usage:

```bash
npm run pipeline
npm run score -- data/raw/candidates/lyrics/new-song.txt
npm run validate
```

---

## Domain Config

Create `data/domains/lyrics.domain.json`:

```json
{
  "domain": "lyrics",
  "workLabel": "song",
  "blockLabel": "section",
  "atomLabel": "line",
  "sectionLabels": [
    "intro",
    "verse",
    "pre-chorus",
    "chorus",
    "post-chorus",
    "bridge",
    "outro",
    "refrain"
  ],
  "embeddingScopes": [
    "atom",
    "block",
    "work",
    "all_choruses",
    "bridge_only",
    "title_plus_chorus"
  ],
  "residualScopes": [
    "block",
    "work",
    "all_choruses",
    "bridge_only"
  ],
  "topicFields": [
    "mainTheme",
    "emotionalSubject",
    "centralSituation",
    "centralImage",
    "contentOnlySummary"
  ]
}
```

---

## Core Types

Implement in `src/core/schema.ts`:

```ts
export type DomainName = string;

export interface Work {
  id: string;
  domain: DomainName;
  set: "target" | "background" | "candidate";
  title: string;
  sourcePath: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface Block {
  id: string;
  workId: string;
  domain: DomainName;
  type: string;
  index: number;
  text: string;
  atomIds: string[];
}

export interface Atom {
  id: string;
  workId: string;
  blockId: string;
  domain: DomainName;
  indexInWork: number;
  indexInBlock: number;
  text: string;
}

export interface TopicProfile {
  workId: string;
  mainTheme: string;
  emotionalSubject: string;
  centralSituation: string;
  centralImage: string;
  contentOnlySummary: string;
}

export interface EmbeddingRecord {
  id: string;
  ownerType: "work" | "block" | "atom" | "topic";
  ownerId: string;
  scope: string;
  model: string;
  textHash: string;
  vector: number[];
}

export interface ResidualRecord {
  id: string;
  ownerType: "work" | "block" | "atom";
  ownerId: string;
  scope: string;
  sourceEmbeddingId: string;
  topicEmbeddingIds: string[];
  vector: number[];
}

export interface CentroidRecord {
  id: string;
  set: "target" | "background";
  domain: DomainName;
  ownerType: "work" | "block" | "atom";
  scope: string;
  blockType?: string;
  count: number;
  vector: number[];
}
```

---

## JSONL Storage Helpers

Implement `src/core/jsonl.ts`.

Required functions:

```ts
export async function readJsonl<T>(path: string): Promise<T[]>;
export async function writeJsonl<T>(path: string, records: T[]): Promise<void>;
export async function appendJsonl<T>(path: string, record: T): Promise<void>;
export async function upsertJsonl<T>(
  path: string,
  records: T[],
  keyFn: (record: T) => string
): Promise<void>;
```

Rules:

- Create parent directories if missing.
- Preserve valid JSONL.
- Do not silently overwrite records unless the CLI explicitly supports `--force`.
- Use deterministic IDs when possible.

---

## Deterministic IDs

Implement `src/core/ids.ts`.

Use stable hashes so rerunning the pipeline does not create duplicate IDs.

Example:

```ts
createId("work", sourcePath)
createId("block", workId, blockIndex, blockText)
createId("atom", blockId, atomIndex, atomText)
```

---

## Lyrics Parser

Implement `src/domains/lyrics/parseLyrics.ts`.

Requirements:

1. Read `.txt` files.
2. Detect section headers such as:
   - `[Verse 1]`
   - `[Verse 2]`
   - `[Chorus]`
   - `[Final Chorus]`
   - `[Bridge]`
   - `[Intro]`
   - `[Outro]`
3. Normalize section labels:
   - `[Verse 1]`, `[Verse 2]`, `[Verse]` → `verse`
   - `[Chorus]`, `[Final Chorus]` → `chorus`
   - `[Bridge]` → `bridge`
   - `[Intro]` → `intro`
   - `[Outro]` → `outro`
4. If no bracketed labels exist, split blocks by blank lines.
5. Split blocks into lyric lines.
6. Ignore empty lines.
7. Preserve original full text in the `Work` record.
8. Output works, blocks, and atoms.

Add tests for:

- labeled lyrics
- unlabeled lyrics
- repeated choruses
- final chorus labels
- empty lines
- unusual capitalization

---

## Import Command

Implement `src/cli/import-corpus.ts`.

It should import:

```text
data/raw/target/lyrics/*.txt
data/raw/background/lyrics/*.txt
data/raw/candidates/lyrics/*.txt
```

Outputs:

```text
data/processed/works.jsonl
data/processed/blocks.jsonl
data/processed/atoms.jsonl
```

CLI options:

```bash
npm run import
npm run import -- --set target
npm run import -- --set background
npm run import -- --set candidate
npm run import -- --force
```

---

## Topic Extraction

Implement `src/llm/topicExtractor.ts` and `src/cli/extract-topics.ts`.

For each `Work`, generate a `TopicProfile`.

The topic extractor must describe **content only**.

It must not describe:

- style
- tone
- quality
- genre
- rhyme
- structure
- diction
- voice
- artistic effect

Use this instruction:

```text
Describe what this song is about without describing how it is written. Do not mention style, voice, structure, rhyme, tone, quality, or genre. Return only JSON.
```

Expected JSON:

```json
{
  "mainTheme": "",
  "emotionalSubject": "",
  "centralSituation": "",
  "centralImage": "",
  "contentOnlySummary": ""
}
```

Cache topic profiles in:

```text
data/processed/topics.jsonl
```

If a topic profile already exists for a work ID, do not regenerate it unless `--force` is passed.

---

## Embedding Generation

Implement:

```text
src/embeddings/embeddingClient.ts
src/embeddings/embeddingCache.ts
src/cli/embed-text.ts
```

Use OpenAI embeddings.

Default model:

```text
text-embedding-3-small
```

Embed these scopes:

1. full work text
2. each block text
3. each atom text
4. each topic field individually
5. combined topic profile text
6. optional all-choruses scope
7. optional bridge-only scope
8. optional title-plus-chorus scope

Store embeddings in:

```text
data/embeddings/work_embeddings.jsonl
data/embeddings/block_embeddings.jsonl
data/embeddings/atom_embeddings.jsonl
data/embeddings/topic_embeddings.jsonl
```

Cache by hash of:

```text
model + ownerType + ownerId + scope + text
```

Do not regenerate existing embeddings unless `--force` is passed.

---

## Vector Math

Implement `src/core/vector.ts`.

Required functions:

```ts
export function dot(a: number[], b: number[]): number;
export function norm(a: number[]): number;
export function normalize(a: number[]): number[];
export function add(a: number[], b: number[]): number[];
export function subtract(a: number[], b: number[]): number[];
export function scale(a: number[], scalar: number): number[];
export function cosine(a: number[], b: number[]): number;
export function meanVector(vectors: number[][]): number[];
export function orthonormalize(vectors: number[][]): number[][];
export function projectOntoBasis(vector: number[], basis: number[][]): number[];
export function residualize(vector: number[], contentVectors: number[][]): number[];
```

`residualize` should:

1. Normalize and orthonormalize content vectors.
2. Project the text vector onto the content basis.
3. Subtract the projection from the text vector.
4. Normalize the remaining residual vector.
5. Return the normalized residual.

Pseudo-code:

```ts
export function residualize(textVector: number[], contentVectors: number[]): number[] {
  const basis = orthonormalize(contentVectors);
  const projection = projectOntoBasis(textVector, basis);
  const residual = subtract(textVector, projection);
  return normalize(residual);
}
```

Add Vitest tests for all vector functions.

---

## Residual Building

Implement:

```text
src/residuals/contentBasis.ts
src/residuals/residualize.ts
src/cli/build-residuals.ts
```

For every work and block embedding:

1. Find the related work's topic embeddings.
2. Use topic embeddings as the content basis.
3. Residualize the work/block embedding against the topic basis.
4. Store residual vectors in:

```text
data/embeddings/residual_embeddings.jsonl
```

For atoms/lines, residuals are optional in MVP. Still embed atoms, but prioritize residual scoring for blocks and works first.

---

## Centroid Building

Implement `src/cli/build-centroids.ts`.

Build target centroids:

```text
target work residual centroid
target block residual centroid
target chorus residual centroid
target verse residual centroid
target bridge residual centroid
```

Build background centroids:

```text
background work residual centroid
background block residual centroid
background chorus residual centroid
background verse residual centroid
background bridge residual centroid
```

Store in:

```text
data/models/target_centroids.json
data/models/background_centroids.json
```

Centroid calculation:

```text
centroid = normalized mean vector of all residual vectors in that group
```

---

## Candidate Scoring

Implement `src/cli/score-candidate.ts`.

Given a candidate lyric file:

1. Parse it as a candidate work.
2. Extract or load its topic profile.
3. Generate embeddings.
4. Build residual vectors.
5. Compare candidate residuals to target centroids.
6. Compare candidate residuals to background centroids if available.
7. Calculate:
   - target similarity
   - background similarity
   - style margin
   - nearest target work similarity
   - overfit risk
   - section-level scores
8. Write JSON and Markdown reports.

Output files:

```text
data/reports/candidate_scores/<candidate>.score.json
data/reports/candidate_scores/<candidate>.report.md
```

Suggested scoring:

```text
style_margin = target_similarity - background_similarity
```

If no background centroid exists, use target similarity only, but include a warning:

```text
WARNING: No background corpus found. Score is less reliable because there is no contrast set.
```

---

## Overfit Risk

Implement `src/scoring/overfitRisk.ts`.

Calculate:

```text
nearest_target_similarity = max cosine(candidate_residual, each target residual)
```

Suggested thresholds:

```text
nearestTargetSimilarity >= 0.92 = high
0.84–0.92 = moderate
< 0.84 = low
```

Important:

Do not treat overfit risk as automatically bad. Report it separately.

Ideal candidate:

```text
high target centroid similarity
low background similarity
not extremely close to one existing work
```

Problem candidate:

```text
high target centroid similarity
high nearest-target similarity
```

This may mean the candidate is imitating or recycling one specific existing work.

---

## Section-Level Scoring

Candidate reports should score sections separately when possible:

```text
verse style similarity
chorus style similarity
bridge style similarity
all-choruses style similarity
whole-work style similarity
```

For lyrics, this matters because a candidate may match the target style overall while having a weak chorus or bridge.

Report missing sections:

```text
No bridge found.
No chorus found.
```

But do not automatically fail the candidate. This app measures style similarity, not rule compliance.

---

## Basic Feature Extraction

Implement basic feature extraction, but do not make it the main score yet.

Files:

```text
src/domains/lyrics/lyricsFeatures.ts
data/features/atom_features.jsonl
data/features/block_features.jsonl
data/features/work_features.jsonl
```

Atom/line features:

```text
word count
character count
question mark present
exclamation mark present
first-person pronoun count
second-person pronoun count
punctuation count
```

Block features:

```text
line count
average words per line
repeated line count
section type
```

Work features:

```text
line count
block count
chorus count
verse count
bridge count
average words per line
```

These are for future modeling and diagnostics. Do not overbuild them in MVP.

---

## Validation

Implement `src/cli/validate-style-model.ts`.

Validation is mandatory. Without validation, the system may just become a topic-overlap detector.

### Leave-One-Work-Out Validation

For each target work:

1. Remove it from centroid construction.
2. Rebuild temporary target centroids.
3. Score the removed work.
4. Store the result.

This tests whether the model generalizes across works rather than memorizing them.

### Leave-One-Topic-Out Validation

Group target works by `mainTheme`.

For each theme group:

1. Remove all works with that `mainTheme`.
2. Rebuild temporary target centroids.
3. Score the removed works.
4. Store the results.

This directly tests the goal:

> Can the system still recognize target style when a theme/topic is absent from the training centroid?

### Validation Reports

Write reports to:

```text
data/reports/validation/
```

Reports should include:

```text
mean similarity
median similarity
lowest scoring held-out works
highest nearest-neighbor risks
warnings if validation suggests topic overfitting
```

---

## Background Corpus

The background corpus is optional but strongly recommended.

It should include writing that may share similar subjects but does **not** share the target style.

For lyric use, background examples could include:

```text
generic heartbreak lyrics
generic worship-style lyrics
vague inspirational lyrics
ornate poetry-style lyrics
nihilistic despair lyrics
AI-generated generic lyrics
same-theme but wrong-style lyrics
```

The background corpus helps prevent the score from meaning only:

```text
this candidate is semantically close to the target corpus
```

Instead, the score should mean:

```text
this candidate is closer to the target style than to the background/control style
```

---

## Candidate Markdown Report Format

Each candidate report should include:

```markdown
# Candidate Style Report: <title>

## Summary

- Overall style score:
- Target similarity:
- Background similarity:
- Style margin:
- Overfit risk:
- Nearest target work:

## Section Scores

| Section | Target Similarity | Background Similarity | Style Margin |
|---|---:|---:|---:|
| Verse | | | |
| Chorus | | | |
| Bridge | | | |
| Whole Work | | | |

## Nearest Target Works

| Rank | Title | Similarity |
|---:|---|---:|

## Warnings

- No background corpus found.
- No bridge found.
- No chorus found.
- High nearest-neighbor similarity.
- Weak validation confidence.

## Interpretation

This score measures topic-normalized style similarity, not quality, preference, release readiness, or originality.
```

---

## JSON Score Report Format

Example:

```json
{
  "candidateId": "work_xyz",
  "title": "Candidate Song",
  "overallStyleScore": 84,
  "targetSimilarity": 0.81,
  "backgroundSimilarity": 0.34,
  "styleMargin": 0.47,
  "nearestTargetWork": {
    "id": "work_abc123",
    "title": "Example Song",
    "similarity": 0.72
  },
  "overfitRisk": "moderate",
  "sectionScores": {
    "verse": {
      "targetSimilarity": 0.78,
      "backgroundSimilarity": 0.33,
      "styleMargin": 0.45
    },
    "chorus": {
      "targetSimilarity": 0.86,
      "backgroundSimilarity": 0.38,
      "styleMargin": 0.48
    },
    "bridge": {
      "targetSimilarity": 0.79,
      "backgroundSimilarity": 0.40,
      "styleMargin": 0.39
    }
  },
  "warnings": [
    "No bridge found."
  ]
}
```

---

## README Requirements

Write a README explaining:

1. What the project does.
2. What it does not do.
3. The concept of topic-normalized style residuals.
4. How to add target lyrics.
5. How to add background/control lyrics.
6. How to score a candidate.
7. How validation works.
8. Limitations.

The limitations section must say:

```text
- Embeddings do not perfectly separate topic and style.
- Residualization is experimental.
- Topic extraction quality matters.
- Small corpora can overfit.
- Background corpus quality matters.
- Scores should be treated as diagnostics, not truth.
- The system does not measure objective lyric quality.
```

---

## Implementation Order

Build in this order:

1. Project skeleton and config.
2. JSONL read/write helpers.
3. Deterministic IDs.
4. Lyrics parser.
5. Import command.
6. Vector math and tests.
7. Embedding client and cache.
8. Topic extractor and cache.
9. Basic feature extraction.
10. Residual builder.
11. Centroid builder.
12. Candidate scorer.
13. Validation commands.
14. Reports.
15. README.

Do not build a UI until the CLI pipeline works end-to-end.

---

## Codex Task Plan

Do not ask Codex to build the entire app in one prompt. Use small tasks.

### Codex Task 1 — Scaffold

```text
Create a TypeScript Node CLI project called style-residual-lab.

Use JSON/JSONL storage only. Do not use SQL. Create the folder structure described in PLAN.md. Add package.json, tsconfig.json, .env.example, README stub, and Vitest setup.

Do not implement business logic yet. Only scaffold the project and create placeholder files.
```

### Codex Task 2 — Core Utilities

```text
Implement JSONL read/write helpers, deterministic ID generation, text normalization, config loading, and vector math utilities.

Add Vitest tests for vector operations including dot, cosine, normalize, meanVector, orthonormalize, projectOntoBasis, and residualize.
```

### Codex Task 3 — Lyrics Parser

```text
Implement the lyrics domain parser.

It should read .txt files from data/raw/target/lyrics, data/raw/background/lyrics, and data/raw/candidates/lyrics. It should parse bracketed section labels like [Verse 1], [Chorus], [Bridge]. If labels are missing, split by blank lines. Output works.jsonl, blocks.jsonl, and atoms.jsonl.

Add tests for labeled and unlabeled lyrics.
```

### Codex Task 4 — Topic Extraction

```text
Implement topic extraction using the OpenAI API.

For each work, create a TopicProfile with mainTheme, emotionalSubject, centralSituation, centralImage, and contentOnlySummary. The prompt must explicitly forbid style/tone/quality/structure descriptions.

Cache results in data/processed/topics.jsonl and skip existing records unless --force is passed.
```

### Codex Task 5 — Embeddings

```text
Implement embedding generation using the OpenAI embeddings API.

Embed works, blocks, atoms, individual topic fields, and combined topic profiles. Cache by hash of model + owner type + owner ID + scope + text. Store output as JSONL in data/embeddings.
```

### Codex Task 6 — Residuals and Centroids

```text
Implement topic-normalized residual vectors.

For each work and block embedding, find that work's topic embeddings, orthonormalize them into a content basis, subtract the content projection, normalize the residual, and store the result.

Then build target and background centroids by scope and section type.
```

### Codex Task 7 — Candidate Scoring

```text
Implement score-candidate.

Given a candidate lyric file, parse it, extract topic profile, embed it, build residuals, compare residuals to target and background centroids, calculate style margin, nearest target similarity, overfit risk, and section-level scores.

Write both JSON and Markdown reports.
```

### Codex Task 8 — Validation

```text
Implement leave-one-work-out and leave-one-topic-out validation.

Reports should show mean similarity, median similarity, lowest held-out works, highest overfit risks, and warnings if the model appears to be relying too much on topic overlap.
```

---

## First Real Milestone

The first working version should support:

```bash
npm run pipeline
npm run score -- data/raw/candidates/lyrics/new-song.txt
```

And produce:

```text
data/reports/candidate_scores/new-song.score.json
data/reports/candidate_scores/new-song.report.md
```

That is the first point where the app actually exists.

---

## Definition of Done for MVP

The MVP is done when it can:

1. import a lyric corpus,
2. parse songs into sections and lines,
3. extract topic profiles,
4. embed works, sections, lines, and topic profiles,
5. build topic-normalized residual style vectors,
6. build target and background centroids,
7. score a new candidate lyric,
8. report nearest-neighbor overfit risk,
9. run leave-one-work-out validation,
10. run leave-one-topic-out validation,
11. produce readable Markdown and JSON reports.

---

## Things This Project Should Not Do Yet

Do not build these in MVP:

```text
React UI
SQL database
user accounts
cloud sync
fine-tuned model
lyric generation
preference training
manual line-rating workflow
complex dashboards
```

Those can come later.

The MVP should prove the core theory first:

```text
Can we approximate subject-agnostic style similarity by removing topic/content embedding directions from text embeddings?
```

---

## Biggest Technical Risk

The weakest part of the concept is topic removal.

Embeddings do not neatly separate:

```text
topic
style
tone
genre
structure
emotion
imagery
```

So the residual vector is experimental.

That is why validation is not optional.

Without validation, the system may simply reward topic overlap.

The most important safeguards are:

```text
leave-one-work-out validation
leave-one-topic-out validation
same-topic-different-style background controls
nearest-neighbor overfit risk
section-specific scoring
```

---

## Final Practical Note

Start CLI-only.

Do not build the interface first.

The correct build sequence is:

```text
files → parser → topics → embeddings → residuals → centroids → scoring → validation → reports → UI later
```

Once the CLI reports are useful, a UI can be built around them.

