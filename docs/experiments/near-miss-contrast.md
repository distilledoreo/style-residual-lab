# Near-Miss Contrast Experiment

## Hypothesis

Centroid margin alone can accept same-topic generic text because those controls may be slightly closer to the target centroid than to the broad background centroid. Adding a same-topic generic near-miss centroid as an explicit contrast set should reject those controls while preserving held-out target recall.

## Method

The `residual_near_miss_contrast` model uses train-split `same_topic_generic_ai_near_miss` controls as an additional negative centroid. Its score is:

```text
target similarity - max(background similarity, near-miss similarity)
```

The threshold is selected on the validation split and then applied unchanged to the held-out test split.

## Result

Run:

```powershell
npm run experiment:modern-private-nearmiss
```

Latest private near-miss/lookalike benchmark result:

- Selected model: `residual_near_miss_contrast_strict`
- Operational contrast margin floor: `0.050`
- Held-out accuracy: `1.000`
- Held-out balanced accuracy: `1.000`
- Held-out recall: `1.000`
- Held-out false-positive rate: `0.000`
- Same-topic generic near-miss false-positive rate: `0.000`
- Attempted-lookalike false-positive rate: `0.000`
- Residual beats raw baseline: `true`

This passes the current benchmark gate.

## Attempted-Lookalike Extension

The benchmark now also includes `attempted_lookalike` controls: fuller candidate-style drafts designed to imitate the target corpus while staying generic, literal, or over-explanatory. The contrast model uses both `same_topic_generic_ai_near_miss` and `attempted_lookalike` train-split controls as hard-negative centroid material.

The benchmark is only considered accepted when both held-out hard-negative families are rejected.

When the recall-tolerant strict contrast model still meets validation acceptance, model selection prefers that stricter boundary. This is intentional: the practical use case is adversarial rejection of plausible failed drafts, so a stricter accepted boundary is more useful than the most permissive perfect-validation boundary.

## Remaining Caveat

Before the attempted-lookalike extension, the known generic candidate `The Common Denominator` still passed the selected model. After adding attempted lookalikes and selecting the strict contrast model, it is rejected:

- Candidate selected model: `residual_near_miss_contrast_strict`
- Candidate selected score: `0.041`
- Decision threshold: `0.050`
- Candidate decision: `not target-style`

This rejects the known failed draft while preserving all current held-out targets. Future iterations should still add more diverse lookalike attempts and tune a calibrated abstain/review band before treating this as a stable production-quality boundary.

## Candidate Memorization Safeguard

Candidate reports now include a lexical leakage gate before the final target-style decision is accepted. The gate rejects exact source-line reuse, distinctive short phrase reuse, and long contiguous token overlap with target-corpus text. This catches a different failure mode than the embedding nearest-neighbor overfit score: a generated work can be globally distant in embedding space while still borrowing memorable wording or motifs from one source work.

The leakage gate is intentionally reported as a separate safeguard rather than folded into the residual score. Passing it only means the candidate avoided obvious corpus quotation; it does not prove that the residual model has isolated pure style or that the work is artistically successful.
