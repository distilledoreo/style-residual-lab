# Local Raw Inputs

This directory is local-only and is not committed to the repository.

Expected layout (domain subfolders; default domain is `lyrics`):

```text
data/raw/
  target/<domain>/
  background/<domain>/
  candidates/<domain>/
```

Populate target works from `target-corpus/` with `npm run import`, or copy `.txt` files here directly before running the pipeline.
