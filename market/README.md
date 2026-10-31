# Plugin market assets

This directory holds the [plugin market](https://github.com/deepseek-ai/deepseek-harness)
index for `dsh-plugin-workspace-split`.

DSH's plugin market is **not a central upload service**: a market is a static JSON
index (format 1) that a Harness profile registers as an *index source* under
**Plugins → Discover**. Publishing therefore means:

1. make the package installable — either a **Git commit** (no npm account needed)
   or an **npm version**;
2. host `market/index.json` over HTTPS;
3. add that URL as an index source in Discover.

- `index.json` — the generated market index. It is produced by
  `npm run market` and must match `package.json` (name, version, author,
  repository, homepage and `engines.dsh`).

## Generate the index

```bash
# Git source (what this repository publishes; no npm account needed)
node scripts/release.mjs index --git --commit="$(git rev-parse HEAD)"

# npm source (after `npm publish`)
npm run market
```

Optional flags: `--timestamp=<unix seconds>` (or `SOURCE_DATE_EPOCH`) pins
`publishTimestamp`; `--path=<dir>` adds a package directory for a monorepo.
The script reads `package.json`, both `locale/*.json` metadata files and
`icon.svg`, then inlines the icon as a `data:image/svg+xml;base64,…` URI, so the
index is self-contained: hosting one JSON file is enough.

## Publish from GitHub (git source)

This repository keeps the package at the repository root, so no `path` is
needed.

```bash
# 1. push the plugin itself
git add -A && git commit -m "release 1.0.0" && git push

# 2. point the index at the pushed commit
node scripts/release.mjs index --git --commit="$(git rev-parse HEAD)"

# 3. commit and push the index
git add market/index.json && git commit -m "market: index for 1.0.0" && git push
```

The index then contains:

```json
"source": {
  "type": "git",
  "url": "https://github.com/byf1999/dsh-plugin-workspace-split",
  "commit": "<40-character commit>"
}
```

and the profile installs
`git+https://github.com/byf1999/dsh-plugin-workspace-split.git#<commit>`.
A Git source installs exactly that commit, so bump `version`, commit, push and
regenerate the index for every release.

## Publish to npm (alternative)

1. Fill in the real `author`, `repository`, `bugs`, `homepage` in
   `package.json` (`npm run pack` refuses to build while placeholders remain).
2. `npm login` and `npm publish --access public` (or
   `npm publish dist/<tarball>` from `npm run pack`).
3. Regenerate the index with the npm source and push it.

## Host the index

The index must be served over HTTPS **at its final URL**: the Host fetches it
with the process `fetch` and refuses redirects. Two zero-setup options:

- **raw GitHub** (works immediately, no Pages configuration):
  `https://raw.githubusercontent.com/byf1999/dsh-plugin-workspace-split/master/market/index.json`
  (use the branch you actually pushed — this repository uses `master`).
- **GitHub Pages**: enable *Settings → Pages → Deploy from a branch*, then use
  `https://byf1999.github.io/dsh-plugin-workspace-split/market/index.json`.

A hosted icon (instead of the inlined one) must be same-origin or `https:`; the
inlined icon avoids that question entirely.

## Add the index to Harness

1. Open **Plugins → Discover** (the Discover tab mounts when the
   `@deepseek-ai/dsh-experimental-plugin-market-bundle` bundle is enabled).
2. With no source configured, press **Add index source**; afterwards use the
   market menu → **Manage index sources…**.
3. Paste the index URL from above and save. The market is read immediately;
   the read is cached for 10 minutes (the toolbar refresh button re-reads it).
4. Find **Workspace Split View / 多工作区分屏视图**, open its page, press
   **Install**, confirm the trust prompt, then restart DeepSeek Harness.

Anyone else can install it the same way by adding your index URL — that is what
"publishing to the plugin market" means for DSH today. A central or community
catalog, if you want the plugin listed there too, is a pull request against that
catalog's index repository; DSH itself only reads the sources a user configures.

## Publish to the community market (recommended)

The public markets most profiles already use — the **DSH Plugin Market**
(`realguan/dsh-plugin-market`) and the catalog index served by
`dsh-plugin-catalog` — are generated from the curated list
[`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).
Listing there is the real "upload to the plugin market" step; it needs no npm
account.

1. Add the `dsh-plugin` topic to the GitHub repository.
2. In `awesome-dsh-plugin`, open one pull request adding a single file named
   `data/plugins/byf1999__dsh-plugin-workspace-split.yml`; copy
   [`awesome-entry.yml`](./awesome-entry.yml) for its content.
3. Push fixes to the same branch if CI asks for them (the CI checks
   `dsh.bundle`, repository age ≥ 1 day, formatting, and the `dsh-plugin`
   topic).
4. After the merge the catalog website regenerates, and
   `realguan/dsh-plugin-market` rebuilds its DSH index daily (03:17 UTC), so the
   plugin appears in Discover for everyone using that market — the GitHub Pages
   address within ~10 minutes, the jsDelivr address within ~12 hours.

Optional extras the catalog reads from this repository:

- `screenshots.json` beside `package.json` (1–8 repository-relative image paths)
  gives the plugin a screenshot carousel in storefronts such as dsh-market.
- Publishing to npm links the package to the entry and adds a download figure;
  the published `repository` field must point back at the listed repository.
- A raster `icon:` tile (GitHub-hosted png/jpg/jpeg/webp, ~96px) overrides the
  fallback avatar; the inlined SVG in `market/index.json` is unrelated to it.

## Release checklist

- [ ] `author`, `repository`, `bugs`, `homepage` hold real values
- [ ] `version` bumped and `CHANGELOG.md` updated
- [ ] `npm run check` passes (syntax, manifest, locale parity, CSS, address
      parsers, market index)
- [ ] plugin commit pushed, then `index --git --commit="$(git rev-parse HEAD)"`
      (or `npm run market` after an npm publish)
- [ ] the regenerated `market/index.json` is committed and pushed, and its URL
      returns HTTP 200 without a redirect
- [ ] a fresh profile adds the index URL, shows the entry, installs it and the
      split view opens after a restart
