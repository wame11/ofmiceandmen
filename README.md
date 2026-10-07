# Of Mice and Men — Revision Notes

A GCSE revision site built from Ethan's exercise-book notes on *Of Mice and Men*.
Static site, no build step, hosted on GitHub Pages.

## What's in it

- **Home / cover** → **Exam essentials** (AO1–AO4 + Context at a glance) → **Characters** → **Settings** → **Incidents** → **Notes & Quotes** → **Paragraphs**
- A spider diagram for every character and setting that fits on one laptop screen with no scrolling: themed legs round a hub, dashed lines linking related points (point at one to trace its link), text sized to fit the window. It collapses to a list on phones and prints on one landscape page.
- Click any section of a spider diagram (or its 🔍 button) to zoom in on it: big text, ← → to move between sections, and buttons that follow each link to the point at the other end
- Instant search (`Ctrl`/`⌘` + `K`) across every leg, incident, note, quote and paragraph, plus famous quotes that aren't in the book, with *Quotes only* and *Context only* filters
- Add your own notes, quotes, context points and spider legs anywhere, or start a brand-new diagram (e.g. Carlson, Whit) from a blank template. They're shown in blue and saved online so they appear on every device.
- A random quote quiz and a print button that prints any page cleanly on A4

## Conventions (from the notes)

| In the notes | Meaning |
| --- | --- |
| `"double quotes"` | a quotation from the novel (highlighted yellow) |
| `★` | a context / teacher point (AO4) |
| `[p.X]` → **Book p.X** | page X of the exercise book |
| **Not in my notes** / hollow dot ○ | added to help revision — not from the exercise book |

## Editing the notes

`data/of_mice_and_men_notes.json` is the single source of truth. Edit it on GitHub and the site
updates on the next deploy — nothing else needs changing. Keep the conventions above and the
site will highlight, star and badge things automatically.

Each character and setting has **branches** (the themed legs round the hub) and **links**:

```json
"branches": [
  { "title": "Temper",
    "nodes": ["Gets angry quickly"],
    "extra": ["His anger never lasts — he softens and tells Lennie about the rabbits"] }
],
"links": [
  ["I could get along so easy", "Guys like us"]
]
```

- `nodes` are from the exercise book; `extra` are added points, shown with a hollow dot and *Not in my notes*.
- A link joins two points with a dashed line. Each end is a short piece of the point's text, so
  it keeps working if you reorder things — just make sure the piece only appears in one point.
- The diagram works out where each branch goes and how big the text can be, so there's no layout to edit.

`famousQuotes` is the bank of well-known quotes that aren't in the book. Each one has the
`quote`, `who` says it, what it's `about` (a character or setting id, or `themes`), the `chapter`,
what it `shows`, and `also` — extra search words, e.g. `"fat of the land"` so you can find
*"fatta the lan'"* without spelling it like Lennie.

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
