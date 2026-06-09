\# Goal: Build a Validated Style-Similarity Model for Target-Corpus Lyrics



\## Core Objective



Continue developing this project until it can reliably predict whether unseen song lyrics match the target corpus style with high confidence, using a held-out validation dataset.



This is \*\*not\*\* a lyric quality grader.

This is \*\*not\*\* a preference model.

This is \*\*not\*\* a lyric generator.



The goal is to build a subject-agnostic \*\*style membership model\*\*:



```text

Given unseen lyrics, predict whether they belong stylistically to the target corpus, even if the theme/topic has not appeared in the corpus before.

```



The core theory remains:



```text

style signal ≈ song lyrics − song topic/content

```



The system should estimate a topic-normalized style signal using embeddings, residual vectors, section-level comparisons, and validation against held-out data.



\---



\## Success Definition



The project is successful when it can:



1\. Import a target corpus of song lyrics.

2\. Import or generate background/control lyrics.

3\. Split the dataset into train/validation/test sets without leakage.

4\. Build topic-normalized style residuals.

5\. Train and/or calibrate a style-membership model.

6\. Evaluate the model on held-out lyrics that were not used in training.

7\. Report whether the model can distinguish target-style lyrics from non-target-style lyrics.

8\. Report confidence honestly, including uncertainty and failure cases.

9\. Demonstrate that the model is not merely detecting topic overlap, copied phrases, or exact-neighbor similarity.



\---



\## High-Level Acceptance Criteria



The model should aim for these held-out metrics:



```text

ROC-AUC >= 0.90

Balanced accuracy >= 0.85

Target-style recall >= 0.85

False positive rate <= 0.15

Calibration error <= 0.10 if confidence scores are reported

```



If the dataset is too small to support these metrics honestly, the system must say so in the validation report instead of pretending success.



Do not overfit the model to pass these thresholds.

Do not tune on the final test set.

Do not leak held-out songs into centroid construction, residual construction, prompt examples, or calibration.



\---



\## Important Distinction



The model should predict:



```text

“Does this lyric resemble the target corpus’s style?”

```



Not:



```text

“Is this lyric good?”

“Would Joseph like this?”

“Is this lyric release-worthy?”

“Is this lyric about the same topic?”

```



The model may include diagnostic sub-scores, but the primary score is:



```text

Target Style Membership Probability

```



\---



\## Required Final Output



When the pipeline is complete, a command like this should work:



```bash

npm run train-style-model

npm run evaluate-style-model

npm run score -- data/raw/candidates/lyrics/candidate-song.txt

```



It should produce reports like:



```text

data/reports/model\_training/training\_summary.md

data/reports/model\_training/heldout\_evaluation.json

data/reports/model\_training/heldout\_evaluation.md

data/reports/candidate\_scores/candidate-song.score.json

data/reports/candidate\_scores/candidate-song.report.md

```



Candidate reports should include:



```text

Target Style Membership Probability

Confidence Level

Topic-Normalized Style Similarity

Background Similarity

Style Margin

Nearest Target Neighbor

Overfit / Memorization Risk

Section-Level Style Match

Line-Level Diagnostics if available

Warnings and Limitations

```



\---



\## Dataset Requirements



The project should support these dataset groups:



```text

target\_positive/

&#x20; Real lyrics from the target corpus.



background\_negative/

&#x20; Lyrics that should not be considered target-style.



candidate/

&#x20; New lyrics to score.



heldout/

&#x20; Automatically created by the pipeline or manually defined.

```



The target-positive corpus should be split into:



```text

train

validation

test

```



The background-negative corpus should also be split into:



```text

train

validation

test

```



Use deterministic splitting with a seed.



The split metadata must be saved so results are reproducible.



\---



\## Negative / Background Corpus Strategy



The background corpus should not be only random generic lyrics.



Implement support for several negative/control types:



```text

generic\_pop

generic\_indie

generic\_worship\_or\_spiritual

ornate\_poetic

nihilistic

overly\_preachy

topic\_matched\_wrong\_style

mutated\_target\_style

llm\_generated\_near\_miss

```



The most important controls are:



```text

topic\_matched\_wrong\_style

mutated\_target\_style

```



These help test whether the model is detecting style rather than subject matter.



\---



\## Synthetic Background Generation



Add a script:



```bash

npm run generate-background-corpus

```



This should generate background/control lyrics using an LLM.



The generated background corpus should include:



1\. Generic lyrics on random themes.

2\. Generic lyrics on themes similar to the target corpus.

3\. Lyrics with similar emotional topics but different style mechanics.

4\. Near-miss lyrics that intentionally imitate the target style poorly.

5\. Mutated versions of target lyrics where topic is preserved but style mechanics are damaged.



For mutated target examples, preserve the broad topic but alter one or more of the following:



```text

remove concrete metaphor control

make the chorus generic

remove self-cross-examination

flatten the bridge turn

make the diction ornate or generic

turn moral/spiritual stakes into slogans

make the narrator purely self-pitying

remove final-chorus development

add competing metaphors

```



Generated data must be marked clearly as synthetic.



Never mix synthetic background lyrics into the target-positive corpus.



\---



\## Topic Extraction Requirements



The topic extractor must create content-only profiles.



It should extract:



```text

mainTheme

emotionalSubject

centralSituation

centralImage

contentOnlySummary

```



The topic extractor must not describe:



```text

style

voice

tone

quality

structure

rhyme

genre

artistic technique

```



This matters because topic profiles are used to remove content signal from the lyric embedding.



If topic extraction leaks style language, the residual model may become invalid.



\---



\## Embedding Requirements



Embed at minimum:



```text

full work

each block/section

all choruses combined

bridge only if present

title + chorus

topic fields

combined topic profile

```



Optional but useful:



```text

individual lines

line plus previous/next line

line within section context

```



Embedding records must include:



```text

embedding model

input hash

owner type

owner ID

scope

vector

```



All embeddings must be cached.



Do not regenerate embeddings unless `--force` is passed.



\---



\## Style Residual Requirements



For each work and section:



1\. Get the text embedding.

2\. Get the topic/content embeddings.

3\. Build an orthonormal content basis from topic embeddings.

4\. Subtract the projection of the text embedding onto the content basis.

5\. Normalize the residual.

6\. Store the residual vector.



This is the topic-normalized style vector.



The system should support comparing both:



```text

raw embedding similarity

residual style similarity

```



The reports should show whether residuals improve held-out performance over raw embeddings.



\---



\## Model Types to Try



Implement a model comparison pipeline.



Start simple and interpretable.



Compare at least:



```text

nearest target centroid

target-minus-background centroid margin

logistic regression on similarity features

logistic regression on residual + handcrafted features

random forest or gradient boosted trees if practical

one-class target style model if useful

```



The system should not assume the most complex model is best.



The model selected as “best” should be the one with strongest held-out validation performance and lowest evidence of topic overfitting.



\---



\## Feature Set



The model should compute candidate features such as:



```text

raw\_target\_similarity

raw\_background\_similarity

raw\_style\_margin



residual\_target\_similarity

residual\_background\_similarity

residual\_style\_margin



chorus\_residual\_target\_similarity

chorus\_residual\_background\_similarity

chorus\_style\_margin



bridge\_residual\_target\_similarity

bridge\_residual\_background\_similarity

bridge\_style\_margin



title\_chorus\_similarity\_to\_target

nearest\_target\_neighbor\_similarity

nearest\_background\_neighbor\_similarity

overfit\_risk\_score



line\_count

section\_count

chorus\_count

bridge\_present

average\_line\_length

question\_mark\_density

first\_person\_density

second\_person\_density

repeated\_line\_ratio

final\_chorus\_change\_score if detectable

```



These features are not all assumed to matter.

The model should report which features actually help prediction.



\---



\## Held-Out Evaluation



Implement:



```bash

npm run evaluate-style-model

```



This must run evaluation on held-out data only.



Reports should include:



```text

accuracy

balanced accuracy

precision

recall

F1

ROC-AUC

confusion matrix

false positives

false negatives

calibration curve or calibration summary

threshold analysis

```



The report must show examples of:



```text

highest-confidence correct target predictions

highest-confidence correct background predictions

false positives

false negatives

uncertain cases

nearest target neighbor for each tested lyric

```



\---



\## Anti-Overfitting Tests



The project must include validation designed to catch overfitting.



Implement these tests:



\### 1. Leave-One-Work-Out



Each target song is removed from the target centroid/model, then scored as unseen.



\### 2. Leave-One-Topic-Out



Group target songs by extracted mainTheme. Remove an entire theme group, train on the rest, then test the held-out theme group.



\### 3. Same-Topic Wrong-Style Test



Use background lyrics that share similar topics with the target corpus but are intentionally written in a different style.



The model should reject these if it truly detects style.



\### 4. Nearest-Neighbor Memorization Risk



For every candidate or held-out item, calculate the nearest target work similarity.



High target-style score plus extremely high nearest-neighbor similarity should trigger a warning.



Suggested thresholds:



```text

nearestTargetSimilarity >= 0.92 = high memorization risk

0.84–0.92 = moderate memorization risk

< 0.84 = low memorization risk

```



These thresholds can be reported, but they should be configurable.



\### 5. Raw vs Residual Comparison



Evaluate both raw embeddings and topic-normalized residual embeddings.



The report should answer:



```text

Did residualization improve subject-agnostic style prediction?

```



If residuals do not improve performance, the report should say so.



\---



\## Confidence Scoring



The model may report confidence only if calibrated.



Confidence should not simply equal similarity.



Implement calibration using the validation set if possible.



Possible methods:



```text

Platt scaling

isotonic regression

temperature scaling

simple validation-bin calibration

```



If calibration is not implemented or data is too small, use language like:



```text

style score

similarity score

margin score

```



Do not call it “probability” unless calibration exists.



\---



\## Reports



Create Markdown and JSON reports.



Training report should include:



```text

dataset size

target count

background count

synthetic count

train/validation/test split

models compared

best model selected

metrics

feature importance

overfitting warnings

limitations

next recommended data improvements

```



Candidate score report should include:



```text

candidate title/path

overall target-style score

confidence/probability if calibrated

target residual similarity

background residual similarity

style margin

nearest target neighbors

nearest background neighbors

section-level scores

overfit risk

diagnostic warnings

```



\---



\## Project Commands



Implement or update these scripts:



```json

{

&#x20; "import": "tsx src/cli/import-corpus.ts",

&#x20; "topics": "tsx src/cli/extract-topics.ts",

&#x20; "embed": "tsx src/cli/embed-text.ts",

&#x20; "residuals": "tsx src/cli/build-residuals.ts",

&#x20; "centroids": "tsx src/cli/build-centroids.ts",

&#x20; "generate-background-corpus": "tsx src/cli/generate-background-corpus.ts",

&#x20; "split-dataset": "tsx src/cli/split-dataset.ts",

&#x20; "train-style-model": "tsx src/cli/train-style-model.ts",

&#x20; "evaluate-style-model": "tsx src/cli/evaluate-style-model.ts",

&#x20; "score": "tsx src/cli/score-candidate.ts",

&#x20; "pipeline": "tsx src/cli/run-pipeline.ts",

&#x20; "test": "vitest"

}

```



\---



\## Definition of Done



The project is complete when:



1\. The full pipeline runs from raw lyrics to trained model.

2\. The model evaluates on held-out data.

3\. The system produces validation reports.

4\. The reports honestly show whether the model generalizes.

5\. The candidate scorer can score a new lyric not in the corpus.

6\. The system distinguishes topic similarity from style similarity better than raw embedding similarity alone.

7\. The final report clearly states whether the model meets the acceptance criteria.



\---



\## Failure Conditions



If the model cannot meet the target metrics, do not fake success.



Instead, produce a failure report explaining:



```text

which metrics failed

whether the dataset is too small

whether background controls are too weak

whether topic leakage is likely

whether residualization helped

what data should be added next

which failure examples confused the model

```



The system should be allowed to conclude:



```text

Current corpus is insufficient for high-confidence style prediction.

```



That is a valid outcome.



\---



\## Development Instructions



Work incrementally.



Do not build a UI yet.



Build in this order:



1\. Dataset split system.

2\. Background corpus generator.

3\. Feature extraction expansion.

4\. Residual feature builder.

5\. Model training pipeline.

6\. Held-out evaluation pipeline.

7\. Calibration.

8\. Candidate scoring.

9\. Reports.

10\. README updates.



After each step:



```bash

npm test

npm run pipeline

npm run evaluate-style-model

```



Fix errors before moving on.



Do not rewrite the architecture unless necessary.



Do not use SQL.



Keep JSON/JSONL storage.



Keep the system modular so lyrics are one domain pack, not hard-coded into the core engine.



\---



\## Final Target



The final system should answer this question:



```text

Given lyrics about a new subject, can the system determine whether the writing style resembles the target corpus after accounting for topic/content?

```



The final report should make this answer clear, evidence-based, and reproducible.



