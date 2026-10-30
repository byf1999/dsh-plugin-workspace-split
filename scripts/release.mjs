#!/usr/bin/env node
/**
 * Release helper for dsh-plugin-workspace-split.
 *
 *   node scripts/release.mjs verify [--release]   checks before a commit / publish
 *   node scripts/release.mjs index [--timestamp]  regenerate market/index.json
 *   node scripts/release.mjs pack                 release gate + `npm pack`
 *
 * `--release` adds the publish gates (no placeholder metadata, market index
 * matching the manifest). `pack` runs the release gate itself.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = join(ROOT, 'client.js')
const HOST = join(ROOT, 'index.js')
const ICON = join(ROOT, 'icon.svg')
const MARKET_INDEX = join(ROOT, 'market', 'index.json')
const DIST = join(ROOT, 'dist')

const PLACEHOLDERS = [/your-github-name/i, /you@example\.com/i, /Your Name/i, /TODO/i]
const REQUIRED_FIELDS = [
  'name',
  'version',
  'description',
  'license',
  'author',
  'repository',
  'homepage',
  'keywords',
  'files',
  'exports',
  'engines',
  'publishConfig',
  'dsh',
]

const problems = []
const warnings = []

function fail(message) {
  problems.push(message)
}

function warn(message) {
  warnings.push(message)
}

function readText(path) {
  return readFileSync(path, 'utf8')
}

function readJson(path) {
  return JSON.parse(readText(path))
}

function report() {
  for (const message of warnings) console.warn(`warn: ${message}`)
  for (const message of problems) console.error(`error: ${message}`)
  if (problems.length === 0) {
    console.log(`ok: ${warnings.length} warning(s), 0 error(s)`)
    return 0
  }
  console.error(`failed: ${problems.length} error(s)`)
  return 1
}

/* ------------------------------------------------------------------ manifest */

function manifestChecks() {
  let pkg
  try {
    pkg = readJson(join(ROOT, 'package.json'))
  } catch (error) {
    fail(`package.json does not parse: ${error.message}`)
    return null
  }

  for (const field of REQUIRED_FIELDS) {
    if (pkg[field] === undefined || pkg[field] === null || pkg[field] === '') fail(`package.json is missing "${field}"`)
  }
  if (pkg.private === true) fail('package.json is still private and refuses to publish')
  if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) {
    fail(`version "${String(pkg.version)}" is not a semver version`)
  }
  if (pkg.type !== 'module') fail('package.json must set "type": "module"')
  if (pkg.license !== 'MIT') warn(`license is "${String(pkg.license)}"; the LICENSE file says MIT`)
  if (pkg.publishConfig === undefined || pkg.publishConfig.access !== 'public') {
    fail('publishConfig.access must be "public" for a registry publish')
  }
  if (Array.isArray(pkg.files) === false) {
    fail('package.json "files" must list the runtime files')
  } else {
    for (const expected of ['client.js', 'index.js', 'cordis.patch.yml', 'icon.svg']) {
      if (pkg.files.includes(expected) === false) fail(`"files" does not ship ${expected}`)
    }
  }

  const bundle = pkg.dsh !== undefined && pkg.dsh.bundle !== undefined ? pkg.dsh.bundle : {}
  if (bundle.patch !== './cordis.patch.yml') fail('dsh.bundle.patch must point at "./cordis.patch.yml"')
  const client = pkg.dsh !== undefined && pkg.dsh.client !== undefined ? pkg.dsh.client : {}
  if (client.platform !== 'web') fail('dsh.client.platform must be "web"')
  if (Array.isArray(client.inject) === false || client.inject.length === 0) fail('dsh.client.inject must list the client packages')
  else for (const name of client.inject) if (typeof name !== 'string' || name.startsWith('@deepseek-ai/') === false) fail(`dsh.client.inject entry ${String(name)} is not a @deepseek-ai package`)
  if (pkg.exports === undefined || pkg.exports['./client'] !== './client.js') fail('exports["./client"] must point at "./client.js"')

  const engines = pkg.engines !== undefined && typeof pkg.engines.dsh === 'string' ? pkg.engines.dsh : ''
  if (engines === '') fail('engines.dsh must declare the tested Harness runtime range')
  else if (pkg.dsh !== undefined && pkg.dsh.engines !== undefined) fail('engines.dsh belongs at the top level, not under dsh')

  const patch = readText(join(ROOT, 'cordis.patch.yml'))
  if (patch.includes(`name: '${pkg.name}'`) === false) fail(`cordis.patch.yml does not name ${pkg.name}`)
  if (patch.includes('- id: ') === false) fail('cordis.patch.yml has no inserted row')

  return pkg
}

/* -------------------------------------------------------------------- syntax */

function syntaxCheck() {
  for (const file of [HOST, CLIENT]) {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' })
    if (result.status !== 0) fail(`${file} does not parse (node --check)`)
  }
}

function moduleIdCheck(pkg) {
  const source = readText(CLIENT)
  const match = /__ModuleLoader__\.load\(\{\s*id:\s*'([^']+)'/.exec(source)
  if (match === null) fail('client.js has no __ModuleLoader__ factory id')
  else if (match[1] !== pkg.name) fail(`client.js factory id "${match[1]}" differs from the package name "${pkg.name}"`)
}

/* ------------------------------------------------------------- dictionaries */

function dictKeys(source, marker) {
  const start = source.indexOf(marker)
  if (start === -1) return null
  const end = source.indexOf('\n    }\n', start)
  if (end === -1) return null
  const block = source.slice(start, end)
  return [...block.matchAll(/^\s*'([^']+)':/gm)].map((match) => match[1])
}

function localeChecks() {
  const source = readText(CLIENT)
  const zh = dictKeys(source, 'const zh = {')
  const en = dictKeys(source, 'const en = {')
  if (zh === null || en === null) {
    fail('client.js dictionaries are not recognizable (const zh / const en)')
    return
  }
  if (zh.length !== en.length) fail(`client.js dictionary length differs: zh ${zh.length}, en ${en.length}`)
  const missingInEn = zh.filter((key) => en.includes(key) === false)
  const missingInZh = en.filter((key) => zh.includes(key) === false)
  for (const key of missingInEn) fail(`client.js locale key "${key}" is missing from en`)
  for (const key of missingInZh) fail(`client.js locale key "${key}" is missing from zh`)
  const duplicated = zh.filter((key, index) => zh.indexOf(key) !== index)
  for (const key of new Set(duplicated)) fail(`client.js locale key "${key}" is declared twice in zh`)

  for (const language of ['en', 'zh']) {
    let meta
    try {
      meta = readJson(join(ROOT, 'locale', `${language}.json`)).meta
    } catch (error) {
      fail(`locale/${language}.json does not parse: ${error.message}`)
      continue
    }
    if (meta === undefined || typeof meta.title !== 'string' || meta.title === '') fail(`locale/${language}.json meta.title is empty`)
    if (meta === undefined || typeof meta.description !== 'string' || meta.description === '') fail(`locale/${language}.json meta.description is empty`)
  }
}

/* --------------------------------------------------------------- batch scan */

function bomCheck() {
  for (const path of listFiles(ROOT).filter((file) => /\.(js|mjs|json|md|yml|svg)$/.test(file) && file.includes('node_modules') === false)) {
    const bytes = readFileSync(path)
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail(`${relative(path)} starts with a UTF-8 BOM`)
  }
}

function relative(path) {
  return path.slice(ROOT.length + 1).replaceAll('\\', '/')
}

function listFiles(directory) {
  const result = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue
    const full = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...listFiles(full))
    else result.push(full)
  }
  return result
}

/* ---------------------------------------------------------------- CSS usage */

function cssChecks() {
  const source = readText(CLIENT)
  const declared = new Set([...source.matchAll(/'\.([a-z][a-z0-9-]*)\{/g)].map((match) => match[1]))
  const used = new Set()
  for (const match of source.matchAll(/className: '([^']*)'/g)) for (const token of match[1].split(/\s+/)) if (token !== '') used.add(token)
  for (const match of source.matchAll(/`([^`]*)`/g)) for (const token of match[1].split(/[\s${}]+/)) if (token.startsWith('wsplit')) used.add(token)
  for (const name of used) if (declared.has(name) === false) fail(`class "${name}" is used in client.js but has no CSS rule`)
  for (const name of declared) if (used.has(name) === false) warn(`class "${name}" is declared in client.js but never used`)
}

/* ---------------------------------------------------------- placeholder gate */

function placeholderCheck(pkg, release) {
  const targets = [
    ['author', typeof pkg.author === 'string' ? pkg.author : ''],
    ['repository.url', pkg.repository !== undefined && typeof pkg.repository.url === 'string' ? pkg.repository.url : ''],
    ['bugs.url', pkg.bugs !== undefined && typeof pkg.bugs.url === 'string' ? pkg.bugs.url : ''],
    ['homepage', typeof pkg.homepage === 'string' ? pkg.homepage : ''],
  ]
  const found = targets.filter(([, value]) => PLACEHOLDERS.some((pattern) => pattern.test(value))).map(([field]) => field)
  if (found.length === 0) return
  if (release) {
    fail(`publish metadata still holds placeholders (${found.join(', ')}); set the real author / repository / homepage / bugs URLs`)
    return
  }
  warn(`publish metadata still holds placeholders (${found.join(', ')}); fill them in before a release`)
}

/* ------------------------------------------------------------ parser checks */

function extractFunction(source, name) {
  const anchor = source.indexOf(`function ${name}(`)
  if (anchor === -1) return null
  let quote = null
  let depth = 0
  let lineComment = false
  let blockComment = false
  for (let index = source.indexOf('{', anchor); index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }
    if (quote !== null) {
      if (char === '\\') index += 1
      else if (char === quote) quote = null
      continue
    }
    if (char === '/' && next === '/') {
      lineComment = true
      index += 1
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      index += 1
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(anchor, index + 1)
    }
  }
  return null
}

function extractConst(source, name) {
  const match = new RegExp(`^\\s*const ${name} = .*$`, 'm').exec(source)
  return match === null ? null : match[0]
}

function parserChecks() {
  const source = readText(CLIENT)
  const pieces = [
    extractConst(source, 'FILE_ADDRESS_PREFIX'),
    extractFunction(source, 'parseSessionFileAddress'),
    extractConst(source, 'CHANGES_REVIEW_PREFIX'),
    extractFunction(source, 'parseChangesReviewAddress'),
  ]
  if (pieces.some((piece) => piece === null)) {
    fail('client.js address parsers are not recognizable for the regression check')
    return
  }
  let parsers
  try {
    parsers = new Function(`${pieces.join('\n')}\nreturn { parseSessionFileAddress, parseChangesReviewAddress }`)()
  } catch (error) {
    fail(`address parsers do not evaluate: ${error.message}`)
    return
  }

  const fileCases = [
    ['dsh-resource://file/session/sess-1/src/a.ts', { sessionId: 'sess-1', path: 'src/a.ts' }],
    ['dsh-resource://file/session/sess-1/a%20b/c.md', { sessionId: 'sess-1', path: 'a b/c.md' }],
    ['dsh-resource://file/session/sess-1/C%3A%5Cwork%5Ca.md?x=1#frag', { sessionId: 'sess-1', path: 'C:\\work\\a.md' }],
    ['dsh-resource://file/session//a.md', null],
    ['dsh-resource://file/session/sess-1', null],
    ['dsh-resource://file/workspace/sess-1/a.md', null],
    ['dsh-resource://file/session/sess-1/%E0%A4%A', null],
    ['dsh-resource://changes-review/session/sess-1/4/1', null],
    ['https://example.com/a.md', null],
    [null, null],
  ]
  for (const [address, expected] of fileCases) {
    const actual = parsers.parseSessionFileAddress(address)
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail(`parseSessionFileAddress(${JSON.stringify(address)}) = ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
    }
  }

  const reviewCases = [
    ['dsh-resource://changes-review/session/sess-1/42/3', { sessionId: 'sess-1', seq: 42, turn: 3 }],
    ['dsh-resource://changes-review/session/sess%201/42/3?index=2', { sessionId: 'sess 1', seq: 42, turn: 3 }],
    ['dsh-resource://changes-review/session/sess-1/42/0', null],
    ['dsh-resource://changes-review/session/sess-1/4a/1', null],
    ['dsh-resource://changes-review/session/sess-1/42', null],
    ['dsh-resource://changes-review/session//42/1', null],
    ['dsh-resource://file/session/sess-1/a.md', null],
    [undefined, null],
  ]
  for (const [address, expected] of reviewCases) {
    const actual = parsers.parseChangesReviewAddress(address)
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail(`parseChangesReviewAddress(${JSON.stringify(address)}) = ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
    }
  }
}

/* ------------------------------------------------------------ market index */

const DATA_ICON = /^data:image\/(?:svg\+xml|png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/
const MAX_ICON_BYTES = 32 * 1024
const LOCALE_ID = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/

function localizedText(value, path, { required }) {
  if (value === undefined || value === null) {
    if (required) fail(`${path} is missing`)
    return
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    fail(`${path} must be an object of language ids to text`)
    return
  }
  const entries = Object.entries(value)
  if (entries.length === 0) fail(`${path} is empty`)
  if (value.en === undefined) fail(`${path} must hold an "en" entry`)
  for (const [language, text] of entries) {
    if (LOCALE_ID.test(language) === false) fail(`${path}.${language} is not a language id`)
    if (typeof text !== 'string' || text.trim() === '') fail(`${path}.${language} is empty`)
  }
}

function marketIndexChecks(pkg, release) {
  if (existsSync(MARKET_INDEX) === false) {
    fail('market/index.json is missing; run `npm run market`')
    return
  }
  let index
  try {
    index = readJson(MARKET_INDEX)
  } catch (error) {
    fail(`market/index.json does not parse: ${error.message}`)
    return
  }
  if (index.format !== 1) fail('market/index.json format must be 1')
  localizedText(index.title, '$.title', { required: true })
  localizedText(index.description, '$.description', { required: false })

  const metadata = index.metadata !== undefined && typeof index.metadata === 'object' ? index.metadata : {}
  const categories = metadata.categories !== undefined ? metadata.categories : {}
  const labels = metadata.labels !== undefined ? metadata.labels : {}
  for (const [id, value] of Object.entries(categories)) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(`metadata.categories.${id} is not a kebab-case id`)
    localizedText(value !== undefined ? value.title : undefined, `metadata.categories.${id}.title`, { required: true })
  }
  for (const [id, value] of Object.entries(labels)) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(`metadata.labels.${id} is not a kebab-case id`)
    localizedText(value !== undefined ? value.title : undefined, `metadata.labels.${id}.title`, { required: true })
  }

  const plugins = Array.isArray(index.plugins) ? index.plugins : []
  if (plugins.length !== 1) fail(`market/index.json must list exactly one plugin, found ${plugins.length}`)
  const entry = plugins[0] !== undefined ? plugins[0] : {}
  if (entry.name !== pkg.name) fail(`index plugin name "${String(entry.name)}" differs from the package name "${pkg.name}"`)
  localizedText(entry.title, '$.plugins[0].title', { required: true })
  localizedText(entry.description, '$.plugins[0].description', { required: true })
  if (typeof entry.author !== 'string' || entry.author === '') fail('$.plugins[0].author is empty')
  if (typeof entry.homepage !== 'string' || /^https?:\/\//.test(entry.homepage) === false) fail('$.plugins[0].homepage must be an absolute http(s) URL')
  const repositoryUrl = entry.repository !== undefined ? entry.repository.url : undefined
  if (typeof repositoryUrl !== 'string' || /^https?:\/\//.test(repositoryUrl) === false) fail('$.plugins[0].repository.url must be an absolute http(s) URL')

  if (typeof entry.icon === 'string' && entry.icon.startsWith('data:')) {
    const match = DATA_ICON.exec(entry.icon)
    if (match === null) fail('$.plugins[0].icon is not a supported data: URL (svg+xml, png, jpeg or webp; base64)')
    else if (Buffer.from(match[1], 'base64').length > MAX_ICON_BYTES) fail('$.plugins[0].icon is larger than 32 KiB decoded')
  } else {
    warn('$.plugins[0].icon is not inlined; a hosted icon must be same-origin or https')
  }

  const entryMetadata = entry.metadata !== undefined ? entry.metadata : {}
  if (entryMetadata.category !== undefined && Object.hasOwn(categories, entryMetadata.category) === false) {
    fail(`plugin category "${entryMetadata.category}" is not declared in metadata.categories`)
  }
  for (const label of Array.isArray(entryMetadata.labels) ? entryMetadata.labels : []) {
    if (Object.hasOwn(labels, label) === false) fail(`plugin label "${label}" is not declared in metadata.labels`)
  }
  if (Array.isArray(entryMetadata.keywords) === false) warn('$.plugins[0].metadata.keywords is not an array')

  const versions = Array.isArray(entry.versions) ? entry.versions : []
  if (versions.length === 0) fail('$.plugins[0].versions is empty')
  const version = versions[0] !== undefined ? versions[0] : {}
  if (version.version !== pkg.version) fail(`index version "${String(version.version)}" differs from package.json "${pkg.version}"`)
  if (Number.isSafeInteger(version.publishTimestamp) === false || version.publishTimestamp < 0 || version.publishTimestamp > 1e11) {
    fail('version.publishTimestamp must be integer Unix seconds below 1e11')
  }
  const source = version.source !== undefined ? version.source : {}
  if (source.type !== 'npm' && source.type !== 'git') fail('version.source.type must be "npm" or "git"')
  if (source.type === 'npm' && source.registry !== undefined && /^https?:\/\//.test(String(source.registry)) === false) {
    fail('version.source.registry must be an absolute http(s) URL')
  }
  if (source.type === 'git') {
    if (typeof source.url !== 'string' || /^https:\/\//.test(source.url) === false) fail('version.source.url must be an https URL')
    if (typeof source.commit !== 'string' || /^[0-9a-f]{40}$/.test(source.commit) === false) fail('version.source.commit must be a 40-character hex commit')
  }
  const versionEngines = version.engines !== undefined ? version.engines.dsh : undefined
  if (versionEngines !== undefined && versionEngines !== pkg.engines.dsh) fail('version.engines.dsh differs from package.json engines.dsh')
  if (release && entry.author !== undefined && PLACEHOLDERS.some((pattern) => pattern.test(entry.author))) {
    fail('market/index.json still holds placeholder author / repository values')
  }
}

/* ------------------------------------------------------------- verify driver */

function verify({ release }) {
  const pkg = manifestChecks()
  if (pkg === null) return report()
  syntaxCheck()
  moduleIdCheck(pkg)
  localeChecks()
  bomCheck()
  cssChecks()
  parserChecks()
  placeholderCheck(pkg, release)
  marketIndexChecks(pkg, release)
  return report()
}

/* ------------------------------------------------------------- index writer */

function publishedRepositoryUrl(pkg) {
  const raw = pkg.repository !== undefined && typeof pkg.repository.url === 'string' ? pkg.repository.url : pkg.homepage
  return String(raw).replace(/^git\+/, '').replace(/\.git$/, '')
}

function writeIndex() {
  const pkg = readJson(join(ROOT, 'package.json'))
  const en = readJson(join(ROOT, 'locale', 'en.json')).meta
  const zh = readJson(join(ROOT, 'locale', 'zh.json')).meta
  const icon = readText(ICON)
  const timestampArgument = process.argv.slice(3).find((argument) => argument.startsWith('--timestamp='))
  const fromArgument = timestampArgument === undefined ? Number.NaN : Number(timestampArgument.slice('--timestamp='.length))
  const fromEnvironment = process.env.SOURCE_DATE_EPOCH === undefined ? Number.NaN : Number(process.env.SOURCE_DATE_EPOCH)
  const timestamp = Number.isSafeInteger(fromArgument) ? fromArgument : Number.isSafeInteger(fromEnvironment) ? fromEnvironment : Math.floor(Date.now() / 1000)
  const author = typeof pkg.author === 'string' ? pkg.author.replace(/\s*<[^>]*>.*$/, '').trim() : ''

  const index = {
    format: 1,
    title: {
      en: 'Workspace Split View plugin index',
      zh: '多工作区分屏视图插件索引',
    },
    description: {
      en: 'A plugin market index for the dsh-plugin-workspace-split Harness UI plugin.',
      zh: 'dsh-plugin-workspace-split 多工作区分屏插件的市场索引。',
    },
    metadata: {
      categories: {
        layout: { title: { en: 'Layout', zh: '布局' } },
      },
      labels: {
        workspace: { title: { en: 'Workspace', zh: '工作区' } },
        sessions: { title: { en: 'Sessions', zh: '会话' } },
        preview: { title: { en: 'File preview', zh: '文件预览' } },
        diff: { title: { en: 'Changes review', zh: '改动评审' } },
      },
      sortKeys: {},
    },
    plugins: [
      {
        name: pkg.name,
        title: { en: en.title, zh: zh.title },
        description: { en: en.description, zh: zh.description },
        icon: `data:image/svg+xml;base64,${Buffer.from(icon, 'utf8').toString('base64')}`,
        author,
        homepage: pkg.homepage,
        repository: { url: publishedRepositoryUrl(pkg) },
        metadata: {
          category: 'layout',
          keywords: pkg.keywords.filter((keyword) => keyword !== 'dsh' && keyword !== 'dsh-plugin'),
          labels: ['workspace', 'sessions', 'preview', 'diff'],
        },
        versions: [
          {
            version: pkg.version,
            publishTimestamp: timestamp,
            source: { type: 'npm' },
            engines: { dsh: pkg.engines.dsh },
          },
        ],
      },
    ],
  }

  mkdirSync(dirname(MARKET_INDEX), { recursive: true })
  writeFileSync(MARKET_INDEX, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  console.log(`wrote ${relative(MARKET_INDEX)} (${pkg.name}@${pkg.version}, timestamp ${timestamp})`)
}

/* ------------------------------------------------------------------- pack */

function pack() {
  const status = verify({ release: true })
  if (status !== 0) {
    console.error('pack: the release gate failed; fix the errors above first')
    return 1
  }
  mkdirSync(DIST, { recursive: true })
  const command = `npm pack --pack-destination "${DIST}"`
  const result = spawnSync(command, { cwd: ROOT, stdio: 'inherit', shell: true })
  if (result.status !== 0) {
    console.error('pack: npm pack failed')
    return 1
  }
  const tarballs = readdirSync(DIST).filter((name) => name.endsWith('.tgz'))
  tarballs.sort((left, right) => statSync(join(DIST, right)).mtimeMs - statSync(join(DIST, left)).mtimeMs)
  const tarball = tarballs[0]
  if (tarball === undefined) {
    console.error('pack: npm pack produced no tarball')
    return 1
  }
  const path = join(DIST, tarball)
  const bytes = readFileSync(path)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  console.log(`tarball: ${relative(path)}`)
  console.log(`size:    ${(bytes.length / 1024).toFixed(1)} KiB`)
  console.log(`sha256:  ${sha256}`)
  return 0
}

/* -------------------------------------------------------------------- main */

const command = process.argv[2] === undefined ? 'verify' : process.argv[2]
const release = process.argv.includes('--release')

if (command === 'verify') {
  process.exitCode = verify({ release })
} else if (command === 'index') {
  writeIndex()
  process.exitCode = verify({ release: false })
} else if (command === 'pack') {
  process.exitCode = pack()
} else {
  console.error(`unknown command "${command}"; use verify, index or pack`)
  process.exitCode = 2
}
