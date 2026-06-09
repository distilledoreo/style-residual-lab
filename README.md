# Style Residual Lab

Style Residual Lab is a local-first TypeScript CLI for estimating whether unseen text matches a target corpus's writing style after reducing topic/content signal.

It is not a text quality grader, preference model, release-readiness judge, or text generator. The primary diagnostic is topic-normalized style similarity:

```text
style residual = text embedding - projection onto topic/content embedding directions
```

## Setup

```bash
npm install
cp .env.example .env
```

`OPENAI_API_KEY` is optional. When it is missing, the pipeline uses local keyword topic extraction and a real local Transformers embedding model by default.
Embedding provider selection is explicit:

```text
EMBEDDING_PROVIDER=local   # default without OPENAI_API_KEY; uses a real local Transformers model
EMBEDDING_PROVIDER=openai  # uses text-embedding-3-small or EMBEDDING_MODEL
EMBEDDING_PROVIDER=hash    # deterministic test fallback only; not valid for model-quality claims
```

The default local model is:

```text
LOCAL_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
```

This is a practical CPU-friendly sentence-transformer model for Windows/Node local evaluation. It is not identical to OpenAI embeddings, so reports distinguish local embedding results from OpenAI embedding results.

## Add Target Corpus Text

Put target corpus text files in:

```text
data/raw/target/lyrics/
```

`target-corpus/` is a local-only folder (gitignored). It seeds target files during import. Put background/control text in:

```text
data/raw/background/lyrics/
```

Run:

```bash
npm run pipeline
```

To run an isolated experiment without overwriting the default `data/` outputs, set:

```text
STYLE_LAB_DATA_ROOT=data/experiments/my-run
STYLE_LAB_TARGET_CORPUS_ROOT=path/to/target-corpus
```

The target corpus root should contain one directory per work, each with a `work.txt` file. The default remains `target-corpus/`.

## Lyrics Domain (Default)

Lyrics are the default domain (`STYLE_LAB_DOMAIN=lyrics`). Raw inputs live under `data/raw/{target,background,candidates}/lyrics/`. Works may use verse/chorus/bridge section headers; the parser normalizes those into domain-specific blocks.

## Adapt To Another Text Domain

The core model uses domain-neutral `work -> block -> atom` records. The same residual pipeline can run on another text domain by setting `STYLE_LAB_DOMAIN` and providing plain `.txt` files under domain-specific raw folders:

```text
data/raw/target/<domain>/
data/raw/background/<domain>/
data/raw/candidates/<domain>/
```

For example:

```powershell
$env:STYLE_LAB_DOMAIN='essay'
$env:STYLE_LAB_SECTION_TYPES='introduction,body,conclusion'
npm run import -- --domain essay
npm run split-dataset
npm run topics
npm run embed
npm run residuals
npm run centroids
npm run train-style-model
npm run evaluate-style-model
npm run score -- data/raw/candidates/essay/new-essay.txt
```

Generic-domain files should use this normalized text format:

```text
Title: Work Title

[Block Type]
First atom, line, sentence, paragraph, beat, or unit.
Second atom.

[Another Block Type]
More text.

----

Title: Another Work

[Block Type]
Text for the next work.
```

If block headers are missing, the importer treats blank-line-separated paragraphs as generic `section` blocks and nonblank lines as atoms. Set `STYLE_LAB_SECTION_TYPES` to the block types you want reported in section-level scoring. Examples: `claim,evidence,turn`, `scene,dialogue,description`, `setup,development,resolution`, or `introduction,body,conclusion`.

### Target Corpus Formatting Prompt

Use this prompt with an LLM when your source corpus is inconsistent, mixed-format, or hard to parse:

```text
Convert the following target corpus into Style Residual Lab generic-domain text format.

Rules:
- Preserve the author's original wording exactly.
- Do not summarize, rewrite, modernize, correct, or style-transfer the text.
- Split the corpus into works.
- Give each work a `Title:` line.
- Insert block headers in square brackets using this section taxonomy: <SECTION_TYPES>.
- Put one meaningful atom per line. An atom can be a sentence, paragraph beat, dialogue turn, lyric line, joke setup/punchline, or other smallest useful unit for this domain.
- Separate works with a line containing only `----`.
- Do not include commentary outside the formatted corpus.

Domain: <DOMAIN_NAME>
Section taxonomy: <SECTION_TYPES>
Corpus:
<PASTE_CORPUS>
```

### Generic AI / Imitation Corpus Prompt

Use this prompt to create background negatives that help the model learn what *not* to accept:

```text
Create a background corpus for Style Residual Lab.

Goal:
Generate works in the same domain and on similar subjects as the target corpus, but do not copy the target author's distinctive phrasing, exact lines, rare metaphors, named motifs, or source-specific structure.

Produce three negative families:
1. generic_ai: competent, generic examples in this domain,
2. same_topic_generic_ai_near_miss: same topics and situations as the target works, but generic style,
3. attempted_lookalike: plausible imitation attempts that intentionally try to resemble the target at a high level while avoiding direct quotation.

Format:
- Use Style Residual Lab generic-domain text format.
- Include `Title:` for every work.
- Include `Synthetic-Control-Type:` with one of:
  - generic_ai
  - same_topic_generic_ai_near_miss
  - attempted_lookalike
- Use these block headers: <SECTION_TYPES>.
- Separate works with `----`.
- Do not quote or closely paraphrase the target corpus.

Domain: <DOMAIN_NAME>
Section taxonomy: <SECTION_TYPES>
Target corpus summary or representative non-sensitive excerpts:
<TARGET_CONTEXT>

Generate <N> works.
```

## Private Licensed Corpora

For private, local-only experiments with copyrighted or licensed text, put files under:

```text
private-corpus/licensed-works/
```

Use an ignored private data root so imported raw text and derived artifacts are not committed:

```powershell
$env:STYLE_LAB_TARGET_CORPUS_ROOT='private-corpus/licensed-works'
$env:STYLE_LAB_DATA_ROOT='data/private/my-target-run'
npm run pipeline
```

Do not place copyrighted text in committed fixtures, public experiment folders, pull requests, issue comments, or shared reports. The repo tracks only placeholder README files in `private-corpus/`; actual work files in that tree are ignored.

For the two modern private experiments, use this local-only layout:

```text
private-corpus/licensed-works/user-target/
private-corpus/licensed-works/green-day/
private-corpus/licensed-works/modern-background/
```

Each work can be a direct `.txt` file or a directory containing `work.txt`. Check readiness without printing corpus text:

```powershell
npm run audit:modern-experiments
npm run check:modern-private
npm run check:selected-target
```

Run the full private experiments when the readiness checks pass:

```powershell
npm run experiment:modern-private
npm run experiment:selected-target
```

These commands require at least 12 target files and 50 modern background files by default. Override `MODERN_MIN_TARGET_WORKS` and `MODERN_MIN_BACKGROUND_WORKS` for stricter runs.

To specifically test whether topic-normalized residuals reject same-topic generic text and attempted lookalikes rather than rewarding topic proximity, run the near-miss variant:

```powershell
npm run experiment:modern-private-nearmiss
```

This copies the private target and modern background corpora into an ignored private data root, adds synthetic same-topic generic near-miss controls plus attempted-lookalike candidate drafts as background negatives, and then runs the full pipeline. The held-out report includes `sameTopicGenericNearMissRejection` and `attemptedLookalikeRejection` acceptance gates. A run is not accepted if these hard negatives pass as target-style, even when broad background metrics look good.

To build a matched-topic hard-negative benchmark after a private experiment has imported, split, and embedded the full corpus, run:

```powershell
$env:STYLE_LAB_DATA_ROOT='data/private/green-day-vs-modern-hard'
npm run hard-negatives -- --per-target 8 --split-aware
npm run residuals
npm run centroids
npm run train-style-model
npm run evaluate-style-model
```

`--split-aware` selects hard negatives within the existing train/validation/test split, so held-out target works do not influence training-split negative selection. The default strategy is `per-target-nearest`, which keeps the nearest background works for each target by raw embedding similarity. A stricter mitigation strategy is also available:

```powershell
npm run hard-negatives -- --per-target 8 --split-aware --strategy target-centroid
```

`target-centroid` selects background works closest to the raw target centroid within each split, directly stress-testing whether raw centroid similarity remains too strong.

To import a locally downloaded CSV/JSON/JSONL dataset into an ignored private corpus, use:

```powershell
npm run import:local-dataset -- --source data/private/downloads/tcc_ceds_music.csv --dest private-corpus/licensed-works/modern-background --text-column lyrics --title-column track_name --author-column artist_name --source-type openly_licensed --source-description "Mendeley Data Music Dataset: Lyrics and Metadata from 1950 to 2019, DOI 10.17632/3t9vbwxgr5.3, CC BY 4.0"
```

The importer writes one local `work.txt` per work plus a source manifest. It does not make the imported text safe to commit; keep it under `private-corpus/` and `data/private/`.

## Commands

```bash
npm run generate-background-corpus
npm run import
npm run split-dataset
npm run topics
npm run embed
npm run residuals
npm run centroids
npm run train-style-model
npm run evaluate-style-model
npm run score -- data/raw/candidates/lyrics/new-work.txt
```

Reports are written to `data/reports/model_training/` and `data/reports/candidate_scores/`.

## Migration From Lyric-Specific Paths

If you have existing local data from before this rename, move folders and files once:

```powershell
# Seed corpus folder
Rename-Item lyric-corpus target-corpus -ErrorAction SilentlyContinue
Get-ChildItem target-corpus -Directory | ForEach-Object {
  $old = Join-Path $_.FullName "lyrics.txt"
  $new = Join-Path $_.FullName "work.txt"
  if (Test-Path $old) { Rename-Item $old $new }
}

# Private corpus tree
Rename-Item private-corpus/copyrighted-lyrics private-corpus/licensed-works -ErrorAction SilentlyContinue
Get-ChildItem private-corpus/licensed-works -Recurse -Filter lyrics.txt | ForEach-Object {
  Rename-Item $_.FullName work.txt
}
# In each manifest.json, rename the top-level "songs" array to "works"
```

## Alternate Corpus Experiment

Run a public-domain Robert Burns experiment with local embeddings:

```bash
npm run experiment:burns
```

This prepares a small target corpus of public-domain Burns lyric excerpts, writes all outputs under `data/experiments/robert-burns/`, generates the standard synthetic background controls, and runs the same import, split, topic, embedding, residual, centroid, training, and held-out evaluation pipeline. The fixture exists for portability testing and cross-corpus sanity checks; because it uses short excerpts and synthetic controls, its metrics should be treated as diagnostic rather than high-confidence evidence about Burns's full style.

## Validation

Evaluation uses deterministic train/validation/test splits for both target and background works. Synthetic background controls are stratified by control type so train, validation, and test each see every generated negative/control family when enough examples exist.

Training compares multiple simple models:

- residual target-minus-background centroid margin,
- residual target-minus-background centroid margin plus a target-centroid similarity floor,
- residual target-minus-background centroid margin plus a recall-tolerant target-centroid similarity floor,
- residual target-minus-near-miss contrast margin when same-topic generic near-miss controls are available,
- residual target-minus-near-miss contrast margin with a recall-tolerant stricter threshold,
- raw target-minus-background centroid margin,
- residual target centroid similarity,
- raw target centroid similarity.

The selected threshold is chosen on the validation split only and then applied unchanged to the test split. For dual-gate residual models, validation also selects a minimum target-centroid similarity floor. The standard dual gate optimizes the same validation metrics as the other models. The strict dual gate prefers the highest target-similarity floor that still meets the configured validation acceptance thresholds, allowing the configured recall floor rather than requiring perfect validation recall. A candidate must clear both the residual margin threshold and the target-similarity floor to be accepted by either dual-gate model. The near-miss contrast model uses train-split same-topic generic and attempted-lookalike controls as an additional negative centroid and scores target similarity against the stronger of broad-background similarity and hard-negative similarity. When the strict contrast model still meets validation acceptance, selection prefers it because the intended use is adversarial rejection of plausible failed drafts, not maximizing permissive recall. Handcrafted domain traits are not used for classification or model selection; they are only optional diagnostics so the core experiment lives or dies on raw embeddings versus topic-normalized residual embeddings.

The strict contrast model also applies a small operational contrast margin floor, configured by `STYLE_LAB_MIN_CONTRAST_MARGIN` and defaulting to `0.05`, when that floor still passes validation acceptance. This prevents near-zero positive margins from counting as confident style matches.

Reports include held-out metrics, false positives, false negatives, uncertain cases, nearest target neighbor, overfit risk, raw-vs-residual comparison, leave-one-work-out diagnostics, leave-one-topic-out diagnostics, and limitations. Success requires a residual embedding model to meet the target metrics and beat raw embedding baselines. If the run misses that bar, the held-out report includes a residual-focused failure report instead of claiming success.

When same-topic generic near-miss controls or attempted-lookalike controls are present, success also requires rejecting those controls. This is a hard check for the failure mode where residualization still rewards topic-adjacent, generic AI-like text instead of isolating a durable style signal.

Candidate scoring also includes a lexical leakage gate against the target corpus. A candidate cannot be labeled target-style if it reuses exact source lines, distinctive short source phrases, or a long contiguous source-corpus token run beyond the configured limits. The gate is separate from embedding similarity: it is an anti-memorization safeguard, not evidence of style quality. Candidate reports list the matched source wording so a passing embedding score can still be rejected when it is really corpus quotation.

See `docs/experiments/near-miss-contrast.md` for the current near-miss contrast experiment results and the remaining candidate-generation caveat.

## Limitations

- Embeddings do not perfectly separate topic and style.
- Residualization is experimental.
- Topic extraction quality matters.
- Small corpora can overfit.
- Background corpus quality matters.
- Scores should be treated as diagnostics, not truth.
- The system does not measure objective text quality.
