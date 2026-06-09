# Local Raw Inputs

This directory is local-only and is not committed to the repository.

Expected layout:

```text
data/raw/
  target/lyrics/
  background/lyrics/
  candidates/lyrics/
```

Populate target works from `target-corpus/` with `npm run import`, or copy `.txt` files here directly before running the pipeline.
