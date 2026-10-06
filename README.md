# Of Mice and Men — Revision Notes

A GCSE revision site built from Ethan's exercise-book notes on *Of Mice and Men*.
Static site, no build step, hosted on GitHub Pages.

## What's in it

- **Home / cover** → **Exam essentials** (AO1–AO4 + Context at a glance) → **Characters** → **Settings** → **Incidents** → **Notes & Quotes** → **Paragraphs**
- An interactive spider diagram for every character and setting (collapses to a list on phones)
- Instant search (`Ctrl`/`⌘` + `K`) across every node, incident, note, quote and paragraph, with *Quotes only* and *Context only* filters
- Add your own notes, quotes, context points and spider legs anywhere, or start a brand-new diagram (e.g. Carlson, Whit) from a blank template. They're shown in blue and saved online so they appear on every device.
- A random quote quiz and a print button that prints any page cleanly on A4

## Conventions (from the notes)

| In the notes | Meaning |
| --- | --- |
| `"double quotes"` | a quotation from the novel (highlighted yellow) |
| `★` | a context / teacher point (AO4) |
| `[p.X]` → **Book p.X** | page X of the exercise book |

## Editing the notes

`data/of_mice_and_men_notes.json` is the single source of truth. Edit it on GitHub and the site
updates on the next deploy — nothing else needs changing. Keep the conventions above and the
site will highlight, star and badge things automatically.

## Your added notes

Notes added through the site are stored in the same Firebase Realtime Database the site has
always used, under the `omam/` path (`omam/notes/...` and `omam/diagrams/...`), so they sync
between devices. The original notes in the JSON are never modified by the site.

## Files

```
index.html                    page shell, search / quiz / new-diagram overlays
assets/css/style.css          1930s Americana theme, spider diagram, animations, print styles
assets/js/app.js              router, rendering, spider legs, search, notes sync, quiz
assets/js/firebase-config.js  Firebase project config
data/of_mice_and_men_notes.json   the notes
```
