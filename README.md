**English** | [简体中文](./README.zh.md)

# Workspace Split View

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI
plugin that renders several **live sessions** at once in a `rows × columns`
grid, so two or more workspaces can be watched side by side — and used, not
just watched: every pane is the real conversation, not a thumbnail.

```
┌───────────────────────────┬───────────────────────────┐
│ workspace A · session 1   │ workspace B · session 2   │
│ … conversation …          │ … conversation …          │
│ … composer …              │ … composer …              │
├───────────────────────────┼───────────────────────────┤
│ workspace C · session 3   │ workspace D · session 4   │
└───────────────────────────┴───────────────────────────┘
```

## Features

- **Grid of live conversations** — 1–3 columns × 1–3 rows (up to 9 panes), each
  cell showing a real session with its composer and streaming output.
- **Resizable, per-column layout** — drag a column divider to resize columns;
  every column keeps its *own* row heights.
- **Per-pane routing** — swap a pane's workspace or session, create a session in
  that pane's workspace with the shipped new-session flow, or pop the session
  out to the normal conversation view with `↗`.
- **Sidebar follow** — while split view is open, opening a session from the left
  sidebar fills a pane instead of replacing the split view. An inline switch
  turns this off when the native behaviour is wanted.
- **In-pane file preview** — file links in a pane open a read-only reader docked
  beside (wide pane) or below (narrow pane) that pane's conversation, with a
  draggable divider, text line numbers and paging, inline images, and
  *Open with default app*.
- **In-pane changes review** — the *edited files* summary at the end of an answer
  opens the same dock as a review: the turn's changed-file list with line counts
  and the unified diff of the selected file.
- **Remembers your layout** — tracks, sizes, assignments and the follow switch
  live in `localStorage` under `dsh.workspace-split.v1`.
- **English and Chinese UI** — every visible string is localized.

## Compatibility

| Requirement | Value |
| --- | --- |
| Harness runtime | `>= 0.2.1-rc.3` (`engines.dsh`) |
| Harness UI | Web (`platform: "web"`), desktop or browser |
| React | supplied by the Harness client module table |

The pane renders the shipped chat view and reads a few client services
(`sessions`, `slots`, `locale`, `workspaces`, `layout`, optional `remote`,
`sidebarRight`, `uiWorkspace`). They are part of the released client API, but a
future Harness may rename them; `engines.dsh` states the tested range, and the
plugin fails closed (a per-pane note, not a broken shell) when one is missing.

## Install

### From a plugin market

1. In the Harness Web UI open **Plugins → Discover**.
2. Add the market index URL that lists this plugin, find **Workspace Split
   View**, and press **Install**.
3. Restart DeepSeek Harness so the profile reloads its bundles.

### With the `plugin_manager` tool

Ask the agent to run `plugin_manager` with `install_bundle`, target
`dsh-plugin-workspace-split` (registry install) or the absolute directory of a
checkout (development `link:` install). Enable the bundle if the profile keeps
it disabled, then restart.

### From a checkout (development)

Run `plugin_manager` with action `install_bundle` and the absolute path of this
directory as the target (the profile keeps it as a `link:` dependency), enable
the bundle if your profile leaves it disabled, then restart Harness.

No build step: `client.js` is a plain browser module and `index.js` is an empty
Host entry point.

## Uninstall

Disable or remove the bundle in **Plugins**; the grid panel disappears and the
main column returns to the single conversation view. Removing the package from
the profile also removes the sidebar panel button. Your `localStorage` layout
key can be deleted independently.

## Usage

1. Click the four-pane grid icon in the left sidebar's panellist (below
   *Plugins* / *Schedules*) to open **Split view** in the central column.
2. Pick `Columns` and `Rows` (1–3 each). The first time a pane appears it shows
   one session per workspace, most recently updated first; new panes continue
   round-robin across workspaces. A pane you clear by hand stays empty.
3. Drag a column divider to resize columns (12% minimum each); double-click it,
   or focus it and press Enter/Space/Home, to reset to an even split; ←/→ nudges
   by 2%. With more than one row, each column also has its own horizontal
   dividers that only change that column's row heights.
4. Each pane header holds: a **workspace chooser** (the workspace's newest
   session, or a fresh one), a **session chooser** grouped by workspace, `＋`
   (new session in that pane's workspace), and `↗` (open in the normal view).
5. The toolbar's right-most button toggles **sidebar follow** (on by default).
   The receiving pane is the one you last clicked, else the first empty pane,
   else a pane already showing that workspace, else pane 0; an adopted pane
   flashes once.
6. File links and the end-of-answer **N files edited** card open a reader docked
   in the same pane. Drag its thin divider to resize the dock (18–78% of the
   pane), double-click it (or focus it and press Enter/Home) to restore the
   default share, or nudge it with ←/→ by 2%. `Esc` or *Close* dismisses it;
   text files page with *Load more*, images render inline, everything else
   offers *Open with default app*.

## How it works

The plugin is one client module (`client.js`) plus one Host row. The panel
mirrors the shipped `main` → `main.conversation` chain:

```
main[key=workspace-split]              SplitView      (declares the pane slot)
  workspaceSplit.pane (single, session) PaneHost → SessionProvider
    conversation.content factory        shipped Chat view (embedded variant)
```

Each pane retains one Session reference and binds it with the `SessionProvider`
standard seat, so an embedded conversation follows its own session instead of
the one selected in the main column. The layout is a CSS grid whose
`grid-template-columns` come from persisted fractions; dividers are absolutely
positioned and driven by pointer events with keyboard equivalents.

Two shipped surfaces assume the right Sidebar is mounted, which it is not while
a global panel occupies `main`:

- a file link calls `sidebarRight.openResource("dsh-resource://file/…")`;
- the edited-files card calls `sidebarRight.openResource(
  "dsh-resource://changes-review/session/<session>/<seq>/<turn>", {params:{index}})`.

The plugin wraps `ctx.sidebarRight.openResource`: a file address becomes the
in-pane reader, a changes-review address becomes the in-pane review (reading the
shipped tab's own same-origin routes `api/changes.summary` and
`api/changes.diff`), and every other address or error keeps the shipped
behaviour. Both docks are read-only and keep the conversation visible.

## Development

```bash
npm run check    # syntax, manifest, locale parity, CSS usage, market index
npm run market   # regenerate market/index.json (npm source)
npm run market -- --git --commit=<40-hex>   # …or point it at a Git commit instead
npm run pack     # release gate + npm pack tarball in ./dist
```

There is no bundler: `client.js` is loaded as-is by the Harness client module
loader (`window.__ModuleLoader__.load({ id, factory })`, `require('react')`
only). Keep it plain ES2022 with `React.createElement` calls. UI strings live in
the `zh` / `en` dictionaries next to `CSS` in `client.js`; plugin metadata lives
in `locale/en.json` and `locale/zh.json`.

Set `localStorage['dsh.workspace-split.debug'] = '1'` to turn expected-fallback
diagnostics into console warnings.

## Limitations

- While a global panel is active the right Sidebar is unmounted, so its tabs are
  unavailable; this plugin covers the two click paths above, not every
  sidebar-dependent action.
- Follow mode intercepts session switches; use a pane's `↗` or the toolbar
  switch to reach the native single-conversation behaviour.
- Review diffs are read-only and show one file at a time.
- The Harness client services used here are released API, not a formal stable
  contract; a Harness upgrade outside the declared range may need a plugin
  update.

## License

[MIT](./LICENSE)
