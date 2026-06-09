# Private Corpus Area

Use this directory for local-only corpora that should not be committed, such as copyrighted or licensed text you supply for private testing.

Recommended layout:

```text
private-corpus/licensed-works/
  user-target/
    Work One/
      work.txt
    Work Two/
      work.txt
  green-day/
    Work One/
      work.txt
  modern-background/
    Other Author - Work One/
      work.txt
    Other Author - Work Two/
      work.txt
```

The import command expects one directory per work or collection entry, each with a `work.txt` file. Keep raw copyrighted text out of shared branches, pull requests, issue attachments, logs, and committed test fixtures.

Run readiness checks before the full experiments:

```powershell
npm run check:modern-private
npm run check:selected-target
```

When ready, run:

```powershell
npm run experiment:modern-private
npm run experiment:selected-target
```

By default, each experiment requires at least 12 target work files and 50 modern background work files. Override with:

```powershell
$env:MODERN_MIN_TARGET_WORKS='20'
$env:MODERN_MIN_BACKGROUND_WORKS='200'
```

## Importing A Local Dataset Download

If you download a permitted text dataset (for example, the Mendeley Data `tcc_ceds_music.csv` lyrics dataset), import it into the ignored modern background corpus with:

```powershell
npm run import:local-dataset -- --source data/private/downloads/tcc_ceds_music.csv --dest private-corpus/licensed-works/modern-background --text-column lyrics --title-column track_name --author-column artist_name --source-type openly_licensed --source-description "Mendeley Data Music Dataset: Lyrics and Metadata from 1950 to 2019, DOI 10.17632/3t9vbwxgr5.3, CC BY 4.0"
```

For very large files, add `--limit 500` or another number for a bounded local experiment. The importer writes one `work.txt` per work and a `manifest.json` with source metadata. The work files remain ignored by Git.
