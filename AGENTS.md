# AGENTS.md

## Cursor Cloud specific instructions

Style Residual Lab is a **CLI-only** TypeScript project (no HTTP server, no Docker). All commands run via `npm run …` and `tsx`.

### Quick reference

| Task | Command |
|------|---------|
| Install deps | `npm install` (also runs on VM startup) |
| Unit tests | `npm test` |
| Type-check | `npx tsc --noEmit` |
| Self-contained E2E | `npm run experiment:burns` |
| Score a candidate | `STYLE_LAB_DATA_ROOT=data/experiments/robert-burns npm run score -- <path-to-candidate.txt>` |

See `README.md` for full pipeline, corpus layout, and optional OpenAI configuration.

### Environment

- Copy `.env.example` to `.env` if missing. `OPENAI_API_KEY` is optional; without it the pipeline uses local keyword topics and `@xenova/transformers` (`Xenova/all-MiniLM-L6-v2`).
- Node.js 22+ and npm (lockfile: `package-lock.json`).

### Gotchas

- **No lint script** — validation is `npm test` and `npx tsc --noEmit`.
- **First local embed run** may download the Hugging Face model (~tens of MB); needs network once.
- **`npm run pipeline`** requires target corpus under `target-corpus/` (gitignored). Prefer `npm run experiment:burns` for portable E2E without local corpus files.
- **Burns experiment** writes to `data/experiments/robert-burns/` via `STYLE_LAB_DATA_ROOT`; set that env var when scoring against that run.
- **Private experiments** need files under `private-corpus/licensed-works/` (gitignored); use `npm run check:modern-private` before `experiment:modern-private`.
