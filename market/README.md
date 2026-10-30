# Plugin market assets

This directory holds the [plugin market](https://deepseek-ai.github.io/deepseek-harness/)
index for `dsh-plugin-workspace-split`.

- `index.json` — the generated market index (format 1) that a Harness profile
  registers under **Plugins → Discover**. It is produced by
  `npm run market` and must match `package.json` (name, version, author,
  repository, homepage and `engines.dsh`).

## Generate the index

```bash
npm run market                      # timestamp = now
SOURCE_DATE_EPOCH=1750000000 npm run market   # reproducible timestamp
```

The script reads `package.json`, both `locale/*.json` metadata files and
`icon.svg`, then inlines the icon as a `data:image/svg+xml;base64,…` URI, so the
index is self-contained: hosting one JSON file is enough.

## Publish the npm package

1. Fill in the placeholders in `package.json` (`author`, `repository`, `bugs`,
   `homepage`). `npm run pack` refuses to build while they remain.
2. Bump `version` (semver) and update `CHANGELOG.md`.
3. Run `npm run market` so `index.json` names the new version.
4. Run `npm run pack` — it runs the release gate, then writes the tarball to
   `dist/` and prints its size and SHA-256.
5. `npm publish dist/<tarball> --access public` (or `npm publish` from the
   plugin root).

## Host the index

`index.json` is a static file; serve it from any HTTPS location, for example
`https://your-host.example/dsh-plugins/index.json`. Two shapes work:

- **npm source** (default, what `npm run market` writes): the index only names
  `name` and `version`; the profile's plugin manager resolves them through npm
  (`source.type: "npm"`). Publish to npm first, then point the index at it.
- **git source**: hand-edit the version entry to

  ```json
  "source": { "type": "git", "url": "https://github.com/your-github-name/dsh-plugin-workspace-split", "commit": "<40-hex-commit>" }
  ```

  and keep the index's `repository` URL pointing at the same public repository.
  The profile installs `git+<url>.git#<commit>`.

Then add the index URL in the Harness Web UI (**Plugins → Discover → index
sources**) or ask the agent to configure it. Market index format 1 is validated
by `@deepseek-ai/dsh-plugin-market-index`; `npm run check` re-validates the
essential rules locally (required localized fields, declared category/label ids,
icon size, version source, timestamp bounds).

## Release checklist

- [ ] `author`, `repository`, `bugs`, `homepage` hold real values
- [ ] `version` bumped and `CHANGELOG.md` updated
- [ ] `npm run check` passes (syntax, manifest, locale parity, CSS, address
      parsers, market index)
- [ ] `npm run market` regenerated `index.json` for the new version
- [ ] `npm run pack` passes the release gate and its tarball is inspected
      (`tar -tzf dist/*.tgz` — no `scripts/`, `market/` or development files)
- [ ] `npm publish` succeeded and the index is served over HTTPS
- [ ] a fresh profile installs from the index and opens the split view
