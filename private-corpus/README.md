# Private Corpus Area

Use this directory for local-only corpora that should not be committed, such as copyrighted or licensed lyrics you supply for private testing.

Recommended layout:

```text
private-corpus/copyrighted-lyrics/
  user-target/
    Song One/
      lyrics.txt
    Song Two/
      lyrics.txt
  green-day/
    Song One/
      lyrics.txt
  modern-background/
    Other Artist - Song One/
      lyrics.txt
    Other Artist - Song Two/
      lyrics.txt
```

The import command expects one directory per work or collection entry, each with a `lyrics.txt` file. Keep raw copyrighted lyrics out of shared branches, pull requests, issue attachments, logs, and committed test fixtures.

Run readiness checks before the full experiments:

```powershell
npm run check:modern-private
npm run check:selected-songwriter
```

When ready, run:

```powershell
npm run experiment:modern-private
npm run experiment:selected-songwriter
```

By default, each experiment requires at least 12 target lyric files and 50 modern background lyric files. Override with:

```powershell
$env:MODERN_MIN_TARGET_WORKS='20'
$env:MODERN_MIN_BACKGROUND_WORKS='200'
```

## Importing A Local Dataset Download

If you download a permitted lyrics dataset such as the Mendeley Data `tcc_ceds_music.csv` file, import it into the ignored modern background corpus with:

```powershell
npm run import:local-lyrics-dataset -- --source data/private/downloads/tcc_ceds_music.csv --dest private-corpus/copyrighted-lyrics/modern-background --lyrics-column lyrics --title-column track_name --artist-column artist_name --source-type openly_licensed --source-description "Mendeley Data Music Dataset: Lyrics and Metadata from 1950 to 2019, DOI 10.17632/3t9vbwxgr5.3, CC BY 4.0"
```

For very large files, add `--limit 500` or another number for a bounded local experiment. The importer writes one `lyrics.txt` per song and a `manifest.json` with source metadata. The lyric files remain ignored by Git.
