# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-30

First public release. It consolidates the earlier `0.x` iterations into one
reviewed bundle.

### Added

- **Split view panel**: a `rows x columns` grid of live sessions (each axis
  1–3, so up to 9 panes), opened from the left sidebar's panellist and rendered
  in the central column.
- **Grid resizing**: column dividers and per-column row dividers, both dragged
  with the pointer, reset with a double-click / Enter / Home, and nudged by 2%
  with the arrow keys; each column keeps its own row heights.
- **Per-pane controls**: choose another workspace (its newest session, or a new
  one), choose any session grouped by workspace, create a session with `＋`, and
  jump to the full conversation with `↗`.
- **Sidebar following**: while split view is open, a left-sidebar click, a
  workspace open, or *New session* lands in a pane instead of leaving split
  view. The toolbar switch turns it off; `↗` always escapes to the normal panel.
- **Session memory**: each workspace remembers the session its pane last showed.
- **In-pane file preview**: file links in a pane open in a read-only reader
  docked beside (wide pane) or below (narrow pane) that pane's chat, with a
  draggable divider and a persisted share, line numbers and paging for text,
  inline images, and *Open with default app* for everything else.
- **In-pane changes review**: an answer's *edited files* summary opens the same
  dock as a review — the turn's changed-file list with line counts and the
  unified diff of the selected file — instead of the unavailable right Sidebar.
- **Resilience**: error boundaries around the panel, each pane, the reader and
  the review, a locale dictionary for English and Chinese, and layout persistence
  in `localStorage` (`dsh.workspace-split.v1`).

### Packaging

- Unscoped npm package `dsh-plugin-workspace-split` with MIT `LICENSE`, both
  READMEs, a CHANGELOG, an explicit `files` whitelist and `publishConfig`.
- `engines.dsh` states the tested Harness runtime (`>= 0.2.1-rc.3`), so the
  profile's compatibility check can refuse an older runtime instead of failing
  at render time.
- `market/index.json` (plugin market format 1) with localized titles,
  descriptions, category, labels and an inlined SVG icon, plus a release helper
  (`scripts/release.mjs`) that validates the manifest, the dictionaries, the CSS
  usage, the resource-address parsers and the market index, and refuses to pack
  while publish metadata still holds placeholders.

### Fixed

- Both the file-link and the changes-review click paths no longer throw
  `sidebarRight: no session surface is mounted` while a global panel is active.
