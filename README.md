# RAZ Tests — LLI Word Check

Four-part vocabulary checks on RAZ readers for children aged 4–5, by LexiLink Ideation.

**Live page:** https://lexilink-ideation.github.io/RAZ-tests/

Each reader's check has four sections, run by a teacher sitting with the child:

1. **Picture → word** — the child names an object from an original picture.
2. **Read & spell** — the child reads a word aloud, then spells it with letter tiles.
3. **Read aloud** — the child reads a sentence from the book; the teacher taps any missed words.
4. **Describe** — the child talks about an original scene; the teacher ticks what they name.

Scores (Got it / With help / Not yet) are saved in the browser on the device used for testing.
The Results tab can download them as CSV.

## How quizzes get here
Quizzes are generated on the teacher's Mac by the LLI Vocab Assessment pipeline
(`python3 -m pipeline.reader build-site <this folder>`), which writes:

- `data/readers.json` — the list of readers
- `data/quizzes/<reader-id>.json` — one quiz with its pictures

Only single words and short sentences from each reader are used; pictures are original drawings.
No pages or illustrations from the books are reproduced.

## Settings
GitHub Pages: Settings → Pages → Deploy from a branch → `main` / root.
