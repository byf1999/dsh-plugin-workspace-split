/**
 * dsh-plugin-workspace-split — a global `main` panel that tiles live sessions.
 *
 * The panel mirrors the shipped `main` -> `main.conversation` chain:
 *   main[key=workspace-split]  SplitView  (declares the pane slot)
 *     workspaceSplit.pane (single, session)  PaneHost -> SessionProvider
 *       conversation.content factory (embedded)  -> shipped Chat view
 *
 * Each pane owns one retained Session reference and binds it with the
 * `SessionProvider` standard seat, so embedded occurrences inherit that
 * Session instead of the currently selected one. File links and changes-review
 * cards that the shipped chat opens in the right Sidebar fall back to a reader
 * docked inside the pane while this panel is on screen.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-workspace-split',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const Fragment = React.Fragment

    const NS = 'workspaceSplit'
    const PANEL_ID = 'workspace-split'
    const PANE_SLOT = 'workspaceSplit.pane'
    const STORAGE_KEY = 'dsh.workspace-split.v1'
    /** Shared empty memory map, used when a stored layout predates the feature. */
    const NO_REMEMBERED = Object.freeze({})
    const MAX_TRACKS = 3
    const MIN_TRACKS = 1
    /** Smallest share of the width one column may keep while dragging. */
    const MIN_COL_FRACTION = 0.12
    /** Smallest share of the height one row may keep while dragging. */
    const MIN_ROW_FRACTION = 0.12
    /** Default share of a pane the file preview takes, per dock side. */
    const DEFAULT_PREVIEW_SHARE = Object.freeze({ side: 0.46, stack: 0.48 })
    /** Smallest and largest share of a pane the file preview may take. */
    const MIN_PREVIEW_SHARE = 0.18
    const MAX_PREVIEW_SHARE = 0.78

    const zh = {
      'panel': '分屏视图',
      'title': '分屏视图',
      'intro': '在同一屏幕内并排查看多个工作区的会话',
      'columns': '列',
      'rows': '行',
      'colsAria': '分屏列数',
      'rowsAria': '分屏行数',
      'untitled': '未命名会话',
      'ungrouped': '未归属工作区',
      'chooseSession': '选择会话…',
      'emptyPane': '从上方下拉选择一个会话',
      'noSessions': '还没有可显示的会话，先在左侧新建或打开一个会话。',
      'loading': '正在打开会话…',
      'openFailed': '无法打开该会话：{message}',
      'openInMain': '在主会话区打开',
      'paneAria': '第 {index} 个格子的会话',
      'paneFailed': '这个格子加载失败，换一个会话试试。',
      'noContent': '会话视图不可用',
      'resizeColumn': '拖动调整列宽，双击恢复均分',
      'workspaceAria': '这个格子显示哪个工作区',
      'chooseWorkspace': '工作区…',
      'newSession': '在此工作区新建会话',
      'createFailed': '新建会话失败：{message}',
      'resizeRow': '拖动调整行高（每列独立），双击恢复均分',
      'sidebarFollow': '侧边栏打开会话时留在分屏：新会话进入聚焦格',
      'sidebarFollowOff': '侧边栏已解除联动：点击会话会切回单会话视图',
      'sidebarFollowAria': '侧边栏会话进入分屏',
      'previewTitle': '文件预览',
      'previewClose': '关闭',
      'resizePreview': '拖动调整预览大小，双击恢复默认',
      'previewLoading': '正在读取文件…',
      'previewError': '无法读取这个文件：{message}',
      'previewEmpty': '这个文件是空的',
      'previewMore': '加载更多',
      'previewUnsupported': '这种类型无法在这里预览，可以用系统应用打开。',
      'previewOpenExternal': '用系统应用打开',
      'previewExternalFailed': '系统应用打开失败，可以检查文件是否还存在。',
      'previewFailed': '文件预览加载失败，请稍后重试。',
      'rpcUnavailable': '远端接口不可用',
      'unknown': '未知错误',
      'reviewTitle': '改动评审',
      'reviewTurn': '第 {turn} 轮',
      'reviewFiles': '已编辑 {count} 个文件',
      'reviewEmpty': '这一轮没有可显示的改动',
      'reviewUnexpected': '改动详情返回了意外的内容',
      'reviewError': '无法读取改动：{message}',
      'reviewBinary': '二进制文件，无法显示改动',
      'reviewOversized': '文件太大，无法显示改动',
      'reviewCreated': '这一轮新建了这个文件',
      'reviewDeleted': '这一轮删除了这个文件',
      'reviewFailed': '改动评审渲染失败，请稍后重试。',
      'splitFailed': '分屏视图渲染失败，切换到其它面板再回来可重试。',
    }

    const en = {
      'panel': 'Split view',
      'title': 'Split view',
      'intro': 'Watch several workspaces\u2019 sessions side by side',
      'columns': 'Columns',
      'rows': 'Rows',
      'colsAria': 'Split column count',
      'rowsAria': 'Split row count',
      'untitled': 'Untitled session',
      'ungrouped': 'Ungrouped',
      'chooseSession': 'Choose a session\u2026',
      'emptyPane': 'Pick a session from the menu above',
      'noSessions': 'No session to show yet. Create or open one in the sidebar first.',
      'loading': 'Opening session\u2026',
      'openFailed': 'Could not open this session: {message}',
      'openInMain': 'Open in the main conversation',
      'paneAria': 'Session in pane {index}',
      'paneFailed': 'This pane failed to load. Try another session.',
      'noContent': 'Conversation view unavailable',
      'resizeColumn': 'Drag to resize columns, double-click to reset',
      'workspaceAria': 'Workspace shown in this pane',
      'chooseWorkspace': 'Workspace\u2026',
      'newSession': 'New session in this workspace',
      'createFailed': 'Could not create a session: {message}',
      'resizeRow': 'Drag to resize rows (per column), double-click to reset',
      'sidebarFollow': 'Keep the split view open when a sidebar click opens a Session: it lands in the focused pane',
      'sidebarFollowOff': 'Sidebar follow is off: clicking a Session switches back to the single conversation view',
      'sidebarFollowAria': 'Open sidebar sessions in the split view',
      'previewTitle': 'File preview',
      'previewClose': 'Close',
      'resizePreview': 'Drag to resize the file preview; double-click to reset',
      'previewLoading': 'Reading the file\u2026',
      'previewError': 'Could not read this file: {message}',
      'previewEmpty': 'This file is empty',
      'previewMore': 'Load more',
      'previewUnsupported': 'This file type cannot be previewed here. Open it with the default app instead.',
      'previewOpenExternal': 'Open with default app',
      'previewExternalFailed': 'The default app could not open it. Check that the file still exists.',
      'previewFailed': 'The file preview failed to load. Try again later.',
      'rpcUnavailable': 'Remote API unavailable',
      'unknown': 'unknown error',
      'reviewTitle': 'Changes review',
      'reviewTurn': 'Turn {turn}',
      'reviewFiles': '{count} file(s) edited',
      'reviewEmpty': 'No changes to show for this turn',
      'reviewUnexpected': 'The changes review returned unexpected data',
      'reviewError': 'Could not read the changes: {message}',
      'reviewBinary': 'Binary file; changes cannot be shown',
      'reviewOversized': 'File too large; changes cannot be shown',
      'reviewCreated': 'Created in this turn',
      'reviewDeleted': 'Deleted in this turn',
      'reviewFailed': 'The changes review failed to render. Try again later.',
      'splitFailed': 'The split view failed to render. Switch to another panel and back to retry.',
    }

    const CSS = [
      '.wsplit-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
      '.wsplit-toolbar{flex:none;display:flex;align-items:center;gap:12px;min-height:52px;padding:8px 16px;box-sizing:border-box;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}',
      '.wsplit-heading{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.wsplit-title{font-size:14px;font-weight:600;line-height:20px;white-space:nowrap}',
      '.wsplit-intro{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.wsplit-controls{margin-left:auto;display:flex;align-items:center;gap:14px;flex:none}',
      '.wsplit-field{display:inline-flex;align-items:center;gap:6px}',
      '.wsplit-field-label{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.wsplit-seg{display:inline-flex;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:8px}',
      '.wsplit-seg>button{appearance:none;margin:0;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:20px;padding:2px 10px;cursor:pointer}',
      '.wsplit-seg>button+button{border-left:1px solid var(--dsw-alias-border-l1)}',
      '.wsplit-seg>button:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.wsplit-seg>button[data-active="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}',
      '.wsplit-follow{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:22px;padding:0;appearance:none;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.wsplit-follow:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.wsplit-follow[data-on="true"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.wsplit-follow:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.wsplit-grid-wrap{flex:1;min-height:0;min-width:0;position:relative;display:flex}',
      '.wsplit-grid{flex:1;min-height:0;min-width:0;display:grid;grid-auto-rows:minmax(0,1fr);gap:1px;padding:1px;background:var(--dsw-alias-border-l1)}',
      '.wsplit-col{display:flex;flex-direction:column;gap:1px;min-width:0;min-height:0;position:relative}',
      '.wsplit-cell{position:relative;display:flex;flex-direction:column;min-width:0;min-height:0}',
      '.wsplit-root[data-follow="true"] .wsplit-cell[data-focused="true"]::after{content:"";position:absolute;inset:0;z-index:5;pointer-events:none;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l3)}',
      '.wsplit-cell[data-flash="true"]::after{content:"";position:absolute;inset:0;z-index:5;pointer-events:none;box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary);animation:wsplit-flash .9s ease forwards}',
      '@keyframes wsplit-flash{0%,70%{opacity:1}100%{opacity:0}}',
      '.wsplit-grip{position:absolute;top:0;bottom:0;width:11px;margin-left:-5.5px;z-index:6;display:flex;align-items:stretch;justify-content:center;padding:0;border:0;background:transparent;cursor:col-resize;touch-action:none}',
      '.wsplit-grip-line{width:3px;border-radius:2px;background:transparent;transition:background .12s ease}',
      '.wsplit-grip:hover .wsplit-grip-line,.wsplit-grip:focus-visible .wsplit-grip-line,.wsplit-root[data-resizing="col"] .wsplit-grip-line{background:var(--dsw-alias-brand-primary)}',
      '.wsplit-grip:focus-visible{outline:none}',
      '.wsplit-row-grip{position:absolute;left:0;right:0;height:11px;margin-top:-5.5px;z-index:6;display:flex;align-items:center;padding:0 2px;border:0;background:transparent;cursor:row-resize;touch-action:none}',
      '.wsplit-row-grip-line{flex:1;height:3px;border-radius:2px;background:transparent;transition:background .12s ease}',
      '.wsplit-row-grip:hover .wsplit-row-grip-line,.wsplit-row-grip:focus-visible .wsplit-row-grip-line,.wsplit-root[data-resizing="row"] .wsplit-row-grip-line{background:var(--dsw-alias-brand-primary)}',
      '.wsplit-row-grip:focus-visible{outline:none}',
      '.wsplit-root[data-resizing="col"],.wsplit-root[data-resizing="col"] *{cursor:col-resize;user-select:none}',
      '.wsplit-root[data-resizing="row"],.wsplit-root[data-resizing="row"] *{cursor:row-resize;user-select:none}',
      '.wsplit-pane{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base)}',
      '.wsplit-pane-head{flex:none;display:flex;align-items:center;gap:8px;height:36px;box-sizing:border-box;padding:0 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);min-width:0}',
      '.wsplit-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}',
      '.wsplit-dot[data-running="true"]{background:var(--dsw-alias-state-success-primary)}',
      '.wsplit-workspace-select{flex:0 1 auto;min-width:0;max-width:42%;appearance:none;box-sizing:border-box;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:600;line-height:18px;padding:2px 4px;cursor:pointer;text-overflow:ellipsis}',
      '.wsplit-workspace-select:hover:not(:disabled){border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}',
      '.wsplit-workspace-select:disabled{opacity:.55;cursor:default}',
      '.wsplit-open{flex:none;appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;padding:0 2px;cursor:pointer;border-radius:4px}',
      '.wsplit-open:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.wsplit-select{flex:1;min-width:40px;appearance:none;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;padding:2px 6px;cursor:pointer;text-overflow:ellipsis}',
      '.wsplit-select:hover{border-color:var(--dsw-alias-border-l2)}',
      '.wsplit-new{flex:none;appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:15px;line-height:20px;padding:0 3px;cursor:pointer;border-radius:4px}',
      '.wsplit-new:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.wsplit-new[data-error="true"]{color:var(--dsw-alias-state-error-primary)}',
      '.wsplit-new:disabled{opacity:.35;cursor:default}',
      '.wsplit-pane-body{flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden;position:relative}',
      '.wsplit-pane-body[data-split="side"]{flex-direction:row}',
      '.wsplit-pane-chat{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}',
      '.wsplit-pane-chat>*{flex:1 1 auto;min-width:0;min-height:0}',
      '.wsplit-note{flex:1;display:flex;align-items:center;justify-content:center;padding:18px;text-align:center;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.wsplit-note[data-error="true"]{color:var(--dsw-alias-state-error-primary)}',
      '.wsplit-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:20px;text-align:center}',
      '.wsplit-empty-title{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}',
      '.wsplit-empty-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.wsplit-preview-dock{flex:none;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}',
      '.wsplit-pane-body[data-split="side"]>.wsplit-preview-dock{min-width:120px}',
      '.wsplit-pane-body:not([data-split="side"])>.wsplit-preview-dock{min-height:90px}',
      '.wsplit-preview-grip{flex:none;width:9px;display:flex;align-items:center;justify-content:center;background:transparent;cursor:col-resize;touch-action:none;padding:0;border:0}',
      '.wsplit-preview-grip-line{width:1px;height:100%;background:var(--dsw-alias-border-l1);transition:background .12s ease,width .12s ease}',
      '.wsplit-preview-grip:hover .wsplit-preview-grip-line,.wsplit-preview-grip:focus-visible .wsplit-preview-grip-line{width:3px;background:var(--dsw-alias-brand-primary)}',
      '.wsplit-preview-grip[data-orientation="horizontal"]{width:auto;height:9px;cursor:row-resize}',
      '.wsplit-preview-grip[data-orientation="horizontal"] .wsplit-preview-grip-line{width:100%;height:1px;transition:background .12s ease,height .12s ease}',
      '.wsplit-preview-grip[data-orientation="horizontal"]:hover .wsplit-preview-grip-line,.wsplit-preview-grip[data-orientation="horizontal"]:focus-visible .wsplit-preview-grip-line{width:100%;height:3px;background:var(--dsw-alias-brand-primary)}',
      '.wsplit-preview-grip:focus-visible{outline:none}',
      '.wsplit-pane-body[data-resizing="side"],.wsplit-pane-body[data-resizing="side"] *{cursor:col-resize;user-select:none}',
      '.wsplit-pane-body[data-resizing="stack"],.wsplit-pane-body[data-resizing="stack"] *{cursor:row-resize;user-select:none}',
      '.wsplit-review-files{flex:none;max-height:42%;overflow:auto;padding:4px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.wsplit-review-file{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;text-align:left;padding:4px 10px;cursor:pointer;min-width:0}',
      '.wsplit-review-file:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsplit-review-file[data-active="true"]{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}',
      '.wsplit-review-name{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Consolas,monospace)}',
      '.wsplit-review-count{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.wsplit-review-count[data-kind="added"]{color:var(--dsw-alias-state-success-primary)}',
      '.wsplit-review-count[data-kind="deleted"]{color:var(--dsw-alias-state-error-primary)}',
      '.wsplit-review-diff{flex:1 1 auto;min-height:0;overflow:auto;padding:6px 0 12px;background:var(--dsw-alias-bg-base)}',
      '.wsplit-diff-hunk{display:block;padding:0 12px;margin-top:6px;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Consolas,monospace);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:pre}',
      '.wsplit-diff-line{display:flex;gap:8px;padding:0 12px;white-space:pre;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Consolas,monospace);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}',
      '.wsplit-diff-line[data-sign="added"]{background:rgba(46,160,67,0.14);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 15%,transparent)}',
      '.wsplit-diff-line[data-sign="deleted"]{background:rgba(248,81,73,0.14);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 15%,transparent)}',
      '.wsplit-diff-sign{flex:none;width:1ch;color:var(--dsw-alias-label-secondary)}',
      '.wsplit-diff-src{min-width:0;white-space:pre}',
      '.wsplit-diff-gutter{flex:none;min-width:3ch;text-align:right;color:var(--dsw-alias-label-secondary);user-select:none;font-variant-numeric:tabular-nums}',
      '.wsplit-diff-line[data-sign="added"] .wsplit-diff-sign{color:var(--dsw-alias-state-success-primary)}',
      '.wsplit-diff-line[data-sign="deleted"] .wsplit-diff-sign{color:var(--dsw-alias-state-error-primary)}',
      '.wsplit-preview-head{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}',
      '.wsplit-preview-titles{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.wsplit-preview-name{font-size:13px;font-weight:600;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.wsplit-preview-path{font-family:var(--dsw-font-mono,ui-monospace,Consolas,monospace);font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.wsplit-preview-actions{margin-left:auto;flex:none;display:flex;align-items:center;gap:8px}',
      '.wsplit-preview-btn{appearance:none;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;padding:2px 10px;cursor:pointer}',
      '.wsplit-preview-btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.wsplit-preview-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.wsplit-preview-body{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:auto;background:var(--dsw-alias-bg-base)}',
      '.wsplit-preview-note{flex:1;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.wsplit-preview-note[data-error="true"]{color:var(--dsw-alias-state-error-primary)}',
      '.wsplit-preview-code{padding:8px 0;min-width:max-content;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Consolas,monospace);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}',
      '.wsplit-preview-line{display:flex;gap:12px;padding:0 16px;white-space:pre}',
      '.wsplit-preview-gutter{flex:none;min-width:3.5ch;text-align:right;color:var(--dsw-alias-label-secondary);user-select:none}',
      '.wsplit-preview-src{white-space:pre}',
      '.wsplit-preview-image-wrap{flex:1;min-width:0;min-height:0;display:flex;align-items:center;justify-content:center;padding:16px}',
      '.wsplit-preview-image{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px}',
      '.wsplit-preview-more{flex:none;display:flex;justify-content:center;padding:10px 16px 14px}',
      '.wsplit-preview-alert{flex:none;padding:8px 14px;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}',
      '@media (max-width: 860px){.wsplit-intro{display:none}}',
    ].join('')

    /** Layout effect where available, so a pane picks its preview side before paint. */
    const useLayoutEffect = React.useLayoutEffect === undefined ? React.useEffect : React.useLayoutEffect

    /** Localized display title of one workspace row. */
    function workspaceLabel(workspace, t) {
      if (workspace === undefined || workspace === null) return t('ungrouped')
      const title = typeof workspace.title === 'string' ? workspace.title.trim() : ''
      if (title !== '') return title
      const path = typeof workspace.path === 'string' ? workspace.path : ''
      const base = path.split(/[\\/]/).filter(Boolean).pop()
      return base === undefined ? t('ungrouped') : base
    }

    /** Display label of one Session summary row. */
    function sessionLabel(summary, t) {
      const title = summary !== undefined && typeof summary.title === 'string' ? summary.title.trim() : ''
      return title !== '' ? title : t('untitled')
    }

    /** Clamp one track count into the supported range. */
    function clampTracks(value) {
      const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : MIN_TRACKS
      return Math.min(MAX_TRACKS, Math.max(MIN_TRACKS, number))
    }

    /** Equal share (fraction of the track size) for every track. */
    function equalShares(count) {
      return Array.from({ length: count }, () => 1 / count)
    }

    /**
     * Validate one list of track shares: exactly one positive share per track,
     * normalized to 1 and never thinner than the drag minimum. Anything
     * unexpected falls back to an even split instead of producing broken tracks.
     */
    function normalizeShares(values, count, minFraction) {
      const usable = Array.isArray(values)
        ? values.filter((value) => typeof value === 'number' && Number.isFinite(value) && value > 0).slice(0, count)
        : []
      if (usable.length !== count) return equalShares(count)
      const total = usable.reduce((sum, value) => sum + value, 0)
      if (!(total > 0)) return equalShares(count)
      const scaled = usable.map((value) => value / total)
      const floor = Math.min(minFraction, 1 / count) - 1e-6
      return scaled.every((value) => value >= floor) ? scaled : equalShares(count)
    }

    /** Equal width share of every column. */
    function equalWidths(cols) {
      return equalShares(cols)
    }

    /** Equal height share of every row. */
    function equalHeights(rows) {
      return equalShares(rows)
    }

    /** Validate persisted column fractions. */
    function normalizeWidths(widths, cols) {
      return normalizeShares(widths, cols, MIN_COL_FRACTION)
    }

    /**
     * Validate persisted per-column row fractions: one share list per column,
     * because every column keeps independent row heights.
     */
    function normalizeHeights(matrix, cols, rows) {
      const list = Array.isArray(matrix) ? matrix : []
      const result = []
      for (let column = 0; column < cols; column += 1) {
        result.push(normalizeShares(list[column], rows, MIN_ROW_FRACTION))
      }
      return result
    }

    /**
     * Read the Session the shipped workspace layer currently holds as the main
     * conversation. `previous` lets the caller pick the freshly opened one when
     * more than one reference is still counted during a navigation.
     */
    function mainViewSessionId(snapshot, previous) {
      const ids = Array.isArray(snapshot.ids) ? snapshot.ids : []
      const candidates = []
      for (const id of ids) {
        const summary = snapshot.byId[id]
        if (summary === undefined || summary.retainedBy === undefined) continue
        const held = summary.retainedBy.mainView
        if (typeof held === 'number' && held > 0) candidates.push(id)
      }
      if (candidates.length === 0) return ''
      const fresh = candidates.find((id) => id !== previous)
      return fresh === undefined ? candidates[0] : fresh
    }

    /**
     * Choose the pane that receives a Session opened outside the split (a
     * sidebar click, a Workspace open, a new Session): the focused pane, then
     * an empty pane, then a pane already showing the same Workspace, then 0.
     * A Session that is already shown is handled by the caller (focus only).
     */
    function chooseReceiver(sessionIds, count, workspaceId, workspaceOfPane, focused) {
      const ids = Array.isArray(sessionIds) ? sessionIds : []
      const total = Math.max(1, typeof count === 'number' && Number.isFinite(count) ? Math.floor(count) : 1)
      if (typeof focused === 'number' && focused >= 0 && focused < total) return focused
      for (let index = 0; index < total; index += 1) {
        const id = ids[index]
        if (id === null || id === undefined) return index
      }
      if (workspaceId !== '') {
        for (let index = 0; index < total; index += 1) {
          const id = ids[index]
          if (id === null || id === undefined) continue
          if (workspaceOfPane(id) === workspaceId) return index
        }
      }
      return 0
    }

    /** Default layout: 1 x 2 split with equal tracks and no memory yet. */
    function defaultLayout() {
      return {
        rows: 1,
        cols: 2,
        sessionIds: [],
        colWidths: equalWidths(2),
        rowHeights: normalizeHeights(undefined, 2, 1),
        lastByWorkspace: {},
        sidebarFollow: true,
        previewShare: readPreviewShare(undefined),
      }
    }

    /** Validate the persisted "last Session per Workspace" map. */
    function readRemembered(value) {
      const remembered = {}
      if (value === null || typeof value !== 'object') return remembered
      for (const entry of Object.entries(value)) {
        const key = entry[0]
        const sessionId = entry[1]
        if (key === '' || key === '__proto__' || key === 'constructor' || key === 'prototype') continue
        if (typeof sessionId === 'string' && sessionId !== '') remembered[key] = sessionId
      }
      return remembered
    }

    /** Validate the persisted preview shares; one per dock side. */
    function readPreviewShare(value) {
      const shares = { side: DEFAULT_PREVIEW_SHARE.side, stack: DEFAULT_PREVIEW_SHARE.stack }
      if (value === null || typeof value !== 'object') return shares
      for (const side of ['side', 'stack']) {
        const candidate = value[side]
        if (typeof candidate === 'number' && Number.isFinite(candidate)) {
          shares[side] = Math.min(MAX_PREVIEW_SHARE, Math.max(MIN_PREVIEW_SHARE, candidate))
        }
      }
      return shares
    }

    /** Read the persisted panel layout, falling back to the default 1 x 2 split. */
    function readStoredLayout() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw === null) return defaultLayout()
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return defaultLayout()
        const cols = clampTracks(parsed.cols)
        const rows = clampTracks(parsed.rows)
        return {
          rows,
          cols,
          sessionIds: Array.isArray(parsed.sessionIds) ? parsed.sessionIds.filter((id) => typeof id === 'string') : [],
          colWidths: normalizeWidths(parsed.colWidths, cols),
          rowHeights: normalizeHeights(parsed.rowHeights, cols, rows),
          lastByWorkspace: readRemembered(parsed.lastByWorkspace),
          sidebarFollow: parsed.sidebarFollow !== false,
          previewShare: readPreviewShare(parsed.previewShare),
        }
      } catch (_unreadable) {
        return defaultLayout()
      }
    }

    /** Record one Workspace's last viewed Session (identity kept when unchanged). */
    function withRemembered(remembered, workspaceId, sessionId) {
      if (workspaceId === '' || sessionId === null) return remembered
      if (remembered[workspaceId] === sessionId) return remembered
      return { ...remembered, [workspaceId]: sessionId }
    }

    /** Persist the panel layout; storage failures never break the view. */
    function writeStoredLayout(layout) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
      } catch (_unwritable) {
        /* private mode or quota: the in-memory layout still works */
      }
    }

    /**
     * Build the pickable Session catalog: one group per Workspace (recency
     * ordered) plus trailing ungrouped Sessions, and a round-robin candidate
     * list that starts with one Session per Workspace.
     */
    function buildCatalog(list, workspaceState, t, remembered = {}) {
      const archived = new Set(Array.isArray(workspaceState.archivedSessionIds) ? workspaceState.archivedSessionIds : [])
      /* Blank Sessions are eligible: a pane may hold one while its conversation starts. */
      const has = (id) => {
        const summary = list.byId[id]
        return summary !== undefined && summary.origin !== 'subagent' && !archived.has(id)
      }
      const recency = (a, b) => {
        const left = typeof list.byId[a].updatedAt === 'number' ? list.byId[a].updatedAt : 0
        const right = typeof list.byId[b].updatedAt === 'number' ? list.byId[b].updatedAt : 0
        return right - left
      }
      const groups = []
      const accounted = new Set()
      const bySession = new Map()
      const byPath = new Map()
      const items = Array.isArray(workspaceState.items) ? workspaceState.items : []
      for (const workspace of items) {
        const ids = (Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []).filter(has).sort(recency)
        for (const id of ids) {
          accounted.add(id)
          bySession.set(id, workspace.workspaceId)
        }
        if (typeof workspace.path === 'string') byPath.set(workspace.path, workspace.workspaceId)
        groups.push({ key: workspace.workspaceId, title: workspaceLabel(workspace, t), ids })
      }
      const ungrouped = (Array.isArray(list.ids) ? list.ids : []).filter((id) => has(id) && !accounted.has(id)).sort(recency)
      if (ungrouped.length > 0) groups.push({ key: '', title: t('ungrouped'), ids: ungrouped })

      /* Remembered Sessions come first so fresh panes reopen what was last watched. */
      const ordered = groups.map((group) => {
        const last = group.key === '' ? undefined : remembered[group.key]
        if (last === undefined || !group.ids.includes(last)) return group.ids
        return [last, ...group.ids.filter((id) => id !== last)]
      })
      /* Seed panes with real conversations first; blank Sessions only when nothing else exists. */
      const roundRobin = (pickable) => {
        const result = []
        const lists = ordered.map((ids) => ids.filter(pickable))
        const longest = lists.reduce((length, ids) => Math.max(length, ids.length), 0)
        for (let index = 0; index < longest; index += 1) {
          for (const ids of lists) {
            const id = ids[index]
            if (id !== undefined) result.push(id)
          }
        }
        return result
      }
      let candidates = roundRobin((id) => list.byId[id].blank !== true)
      if (candidates.length === 0) candidates = roundRobin(() => true)
      return { groups, candidates, has, bySession, byPath }
    }

    /**
     * Workspace owning one Session, resolved through the Workspace roster and,
     * while a fresh Session has not reached that roster yet, through its cwd.
     */
    function workspaceIdOf(catalog, list, sessionId) {
      if (sessionId === null) return ''
      const direct = catalog.bySession.get(sessionId)
      if (direct !== undefined) return direct
      const summary = list.byId[sessionId]
      if (summary !== undefined && typeof summary.cwd === 'string') {
        const viaPath = catalog.byPath.get(summary.cwd)
        if (viaPath !== undefined) return viaPath
      }
      return ''
    }

    /** Most recently updated real Session of one Workspace, blank only as a fallback. */
    function pickInGroup(group, list, skip) {
      if (group === undefined || group.ids.length === 0) return null
      const usable = skip === undefined ? group.ids : group.ids.filter((id) => !skip.has(id))
      if (usable.length === 0) return null
      const real = usable.find((id) => list.byId[id].blank !== true)
      return real === undefined ? usable[0] : real
    }

    /**
     * Reconcile the stored pane list with the current grid size and catalog.
     *
     * Panes that already exist keep their assignment; only positions opened by a
     * larger grid are seeded with a round-robin candidate, and a pane the user
     * explicitly cleared stays empty. Assignments whose Session vanished (or now
     * duplicates another pane) are dropped instead of silently substituted.
     */
    function reconcile(prev, count, catalog) {
      const previous = prev.sessionIds
      const ids = []
      const used = new Set()
      let changed = previous.length !== count
      for (let index = 0; index < count; index += 1) {
        const id = index < previous.length ? previous[index] : null
        if (id === null || id === undefined) {
          ids.push(null)
          continue
        }
        ids.push(id)
        if (!catalog.has(id) || used.has(id)) {
          ids[index] = null
          changed = true
          continue
        }
        used.add(id)
      }
      for (let index = previous.length; index < count; index += 1) {
        const next = catalog.candidates.find((id) => !used.has(id))
        if (next === undefined) break
        ids[index] = next
        used.add(next)
        changed = true
      }
      if (!changed) return prev
      return { ...prev, sessionIds: ids }
    }

    /** Human-readable message of a thrown value. */
    function messageOf(error) {
      if (error !== null && typeof error === 'object' && typeof error.message === 'string' && error.message !== '') return error.message
      return String(error)
    }

    /**
     * Diagnostics switch for expected fallbacks: `localStorage` key
     * `dsh.workspace-split.debug` set to `1` turns them into console warnings.
     * Real failures always log.
     */
    const DEBUG = (() => {
      try {
        return typeof localStorage !== 'undefined' && localStorage.getItem('dsh.workspace-split.debug') === '1'
      } catch (_blocked) {
        return false
      }
    })()

    /** Log one expected fallback when diagnostics are on. */
    function note(...args) {
      if (DEBUG) console.warn(...args)
    }

    /** Localized display text of a raw preview failure reason (never a fixed language). */
    function previewReasonOf(reason, t) {
      if (reason === 'rpc-unavailable') return t('rpcUnavailable')
      if (reason === undefined || reason === null || reason === '') return t('unknown')
      return String(reason)
    }

    /** Scheme every file address opens with, as the chat and Sidebar build them. */
    const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'
    /** Image suffixes the in-panel reader renders as an image. */
    const IMAGE_MEDIA_TYPES = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      ico: 'image/x-icon',
      svg: 'image/svg+xml',
    }
    /** Suffixes the in-panel reader renders as line-numbered text. */
    const TEXT_EXTENSIONS = new Set([
      'txt', 'md', 'markdown', 'mdx', 'rst', 'adoc', 'log', 'text',
      'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'mts', 'cts', 'json', 'jsonc', 'json5', 'map',
      'css', 'scss', 'sass', 'less', 'styl', 'html', 'htm', 'xhtml', 'vue', 'svelte', 'astro',
      'xml', 'xsl', 'xsd', 'svgz', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'config', 'env',
      'properties', 'gradle', 'gitignore', 'gitattributes', 'editorconfig', 'npmrc', 'lock',
      'py', 'pyi', 'ipynb', 'ps1', 'psm1', 'psd1', 'sh', 'bash', 'zsh', 'fish', 'bat', 'cmd',
      'go', 'rs', 'java', 'kt', 'kts', 'scala', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hxx', 'cs',
      'rb', 'php', 'lua', 'pl', 'r', 'jl', 'swift', 'dart', 'tex', 'proto', 'graphql', 'gql',
      'sql', 'csv', 'tsv', 'diff', 'patch', 'dockerfile', 'makefile', 'cmake', 'mk', 'sln', 'csproj',
    ])
    /** Suffix-less filenames that are still plain text. */
    const TEXT_FILE_NAMES = new Set([
      'dockerfile', 'makefile', 'gnumakefile', 'rakefile', 'gemfile', 'procfile', 'vagrantfile',
      'license', 'licence', 'notice', 'readme', 'changelog', 'authors', 'contributors', 'copying',
      'hosts', 'passwd', 'gitignore', 'gitattributes', 'editorconfig', 'npmrc', 'nvmrc', 'env',
    ])

    /**
     * The Session and path one `dsh-resource://file/session/…` address names.
     * Only the session scope is read here; any other scope keeps the shipped
     * Sidebar behavior.
     */
    function parseSessionFileAddress(address) {
      if (typeof address !== 'string' || !address.startsWith(FILE_ADDRESS_PREFIX)) return null
      const end = address.search(/[?#]/)
      const body = address.slice(FILE_ADDRESS_PREFIX.length, end === -1 ? undefined : end)
      const parts = body.split('/')
      if (parts[0] !== 'session') return null
      const id = parts[1]
      const segments = parts.slice(2)
      if (id === undefined || id === '' || segments.length === 0) return null
      try {
        return {
          sessionId: decodeURIComponent(id),
          path: segments.map((segment) => decodeURIComponent(segment)).join('/'),
        }
      } catch (_malformed) {
        return null
      }
    }

    /** Final path segment of a workspace path, for the preview heading. */
    function fileNameOf(path) {
      const normalized = String(path).replaceAll('\\', '/')
      const name = normalized.slice(normalized.lastIndexOf('/') + 1)
      return name === '' ? normalized : name
    }

    /** Resource-address prefix of one turn's changes review. */
    const CHANGES_REVIEW_PREFIX = 'dsh-resource://changes-review/session/'

    /**
     * The coordinates one `dsh-resource://changes-review/session/…` address names.
     * Returns `null` for any other address, so the shipped Sidebar keeps those.
     */
    function parseChangesReviewAddress(address) {
      if (typeof address !== 'string' || !address.startsWith(CHANGES_REVIEW_PREFIX)) return null
      const end = address.search(/[?#]/)
      const body = address.slice(CHANGES_REVIEW_PREFIX.length, end === -1 ? undefined : end)
      const parts = body.split('/')
      if (parts.length !== 3) return null
      const [id, seq, turn] = parts
      if (id === '' || id === undefined) return null
      if (!/^\d+$/.test(seq) || !/^[1-9]\d*$/.test(turn)) return null
      try {
        return { sessionId: decodeURIComponent(id), seq: Number(seq), turn: Number(turn) }
      } catch (_malformed) {
        return null
      }
    }

    /**
     * Absolute spelling of one Session path, used only when the Host did not
     * report it: an already absolute path is kept, a relative one joins the
     * Session Workspace root in that root's separator style.
     */
    function absolutePathOf(cwd, path) {
      const raw = String(path)
      const normalized = raw.replaceAll('\\', '/')
      if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith('/')) return raw
      if (typeof cwd !== 'string' || cwd === '') return raw
      const windows = /^[A-Za-z]:[\\/]/.test(cwd) || cwd.startsWith('\\\\') || cwd.includes('\\')
      if (windows) return `${cwd.replace(/[/\\]+$/, '')}\\${normalized.replaceAll('/', '\\')}`
      return `${cwd.replace(/[/\\]+$/, '')}/${normalized}`
    }

    /** How the in-panel reader should render one workspace path. */
    function filePreviewKind(path) {
      const name = fileNameOf(path).toLowerCase()
      const dot = name.lastIndexOf('.')
      if (dot > 0) {
        const extension = name.slice(dot + 1)
        if (IMAGE_MEDIA_TYPES[extension] !== undefined) return 'image'
        if (TEXT_EXTENSIONS.has(extension)) return 'text'
        return 'unsupported'
      }
      if (name.startsWith('.') || TEXT_EXTENSIONS.has(name) || TEXT_FILE_NAMES.has(name)) return 'text'
      return 'unsupported'
    }

    /** Media type of one image suffix, or undefined when it is not an image. */
    function imageMediaTypeOf(path) {
      const name = fileNameOf(path).toLowerCase()
      const dot = name.lastIndexOf('.')
      return dot > 0 ? IMAGE_MEDIA_TYPES[name.slice(dot + 1)] : undefined
    }

    /** Human-readable message of one failed Remote call. */
    function remoteMessageOf(error, fallback) {
      if (error !== null && typeof error === 'object') {
        if (typeof error.message === 'string' && error.message !== '') return error.message
        if (error.details !== undefined && typeof error.details.message === 'string') return error.details.message
      }
      return fallback
    }

    const inject = ['sessions', 'slots', 'locale', 'workspaces', 'layout']

    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'workspace-split: dictionaries')

      /** Workspace navigation service, once the optional dependency is present. */
      let uiWorkspaceApi = null
      ctx.inject(['uiWorkspace'], (scope) => {
        scope.effect(() => {
          uiWorkspaceApi = scope.uiWorkspace
          return () => {
            uiWorkspaceApi = null
          }
        }, 'workspace-split: Workspace navigation')
      })

      /** Callbacks of the mounted split view; alive only while the panel is open. */
      let splitHost = null
      /** Deadline until which a deliberate "leave the split" navigation is not bounced. */
      const leaveGuard = { suppressUntil: 0 }

      /**
       * Sidebar follow, registered for the whole plugin lifetime rather than for
       * one mounted view: the shipped workspace layer ends every sidebar "open
       * session" with `layout.selectPanel(null)`, which swaps this panel for the
       * Conversation. Bouncing the selection back inside that same store
       * notification keeps React from ever rendering the Conversation, and the
       * view adopts the Session the workspace layer just opened.
       */
      ctx.inject(['layout'], (scope) => {
        scope.effect(() => {
          const layout = scope.layout
          const info = layout === null || layout === undefined ? null : layout.panelInfo
          if (info === null || info === undefined) return undefined
          if (typeof info.getSnapshot !== 'function' || typeof info.subscribe !== 'function') return undefined
          let last = info.getSnapshot().activePanelId
          const dispose = info.subscribe(() => {
            const next = info.getSnapshot().activePanelId
            const previous = last
            last = next
            if (next !== null || previous !== PANEL_ID) return
            if (leaveGuard.suppressUntil > Date.now()) return
            const host = splitHost
            if (host === null || host.follow !== true) return
            try {
              layout.selectPanel(PANEL_ID)
              last = PANEL_ID
            } catch (error) {
              console.error('workspace-split: keeping the split view open failed', error)
              return
            }
            host.adopt()
          })
          return () => {
            if (typeof dispose === 'function') dispose()
          }
        }, 'workspace-split: sidebar follow')
      })

      /** Client Remote carrying `workspaceFiles` and the desktop path actions. */
      let fileRemote = null
      ctx.inject(['remote', 'remote.workspaceFiles'], (scope) => {
        scope.effect(() => {
          fileRemote = scope.remote
          return () => {
            fileRemote = null
          }
        }, 'workspace-split: file reads')
      })

      /** Host desktop face used to hand a file to its default application. */
      let desktopFace = null
      ctx.inject(['remote.session'], (scope) => {
        scope.effect(() => {
          let face = null
          try {
            const remote = scope.remote
            face = remote === null || remote === undefined ? null : remote.session
          } catch (error) {
            note('workspace-split: no desktop path face', error)
          }
          desktopFace = face === undefined ? null : face
          return () => {
            desktopFace = null
          }
        }, 'workspace-split: desktop paths')
      })

      /** In-panel reader of the mounted split view, absent while the panel is closed. */
      let previewHost = null

      /**
       * File links in a chat open a right-Sidebar tab that belongs to the
       * on-screen Session. Every global main panel (this split, Plugins,
       * Schedule) has no on-screen Session, so the shipped sidebar throws
       * "no session surface is mounted" and the chat reports that it could not
       * open the file. Catch exactly that failure for a Session file address and
       * read the file inside the split instead; every other call, error and
       * panel path keeps the shipped behavior untouched.
       */
      ctx.inject(['sidebarRight'], (scope) => {
        scope.effect(() => {
          const right = scope.sidebarRight
          if (right === null || right === undefined || typeof right.openResource !== 'function') return undefined
          const original = right.openResource
          if (original.workspaceSplitFallback === true) return undefined
          const wrapped = function openResource(address, options) {
            try {
              return original.call(right, address, options)
            } catch (error) {
              if (previewHost === null) throw error
              if (!messageOf(error).includes('no session surface is mounted')) throw error
              const file = parseSessionFileAddress(address)
              if (file !== null) {
                previewHost.open({ kind: 'file', sessionId: file.sessionId, path: file.path })
                return undefined
              }
              const review = parseChangesReviewAddress(address)
              if (review === null) throw error
              const params = options !== null && typeof options === 'object' ? options.params : undefined
              const index =
                params !== null && typeof params === 'object' && Number.isSafeInteger(params.index) && params.index >= 0
                  ? params.index
                  : undefined
              previewHost.open({ kind: 'review', sessionId: review.sessionId, seq: review.seq, turn: review.turn, index })
              return undefined
            }
          }
          wrapped.workspaceSplitFallback = true
          try {
            right.openResource = wrapped
          } catch (error) {
            console.error('workspace-split: file links keep the shipped sidebar behavior', error)
            return undefined
          }
          if (right.openResource !== wrapped) {
            console.warn('workspace-split: the shipped sidebar refused the file link fallback')
            return undefined
          }
          return () => {
            if (right.openResource === wrapped) right.openResource = original
          }
        }, 'workspace-split: file link fallback')
      })

      /** Sidebar glyph: a four-pane grid; the sidebar supplies the square edge. */
      function SplitPanelIcon({ size }) {
        return h(
          'svg',
          {
            viewBox: '0 0 64 64',
            width: size,
            height: size,
            fill: 'none',
            'aria-hidden': true,
            focusable: false,
            style: { display: 'block' },
          },
          h('rect', { x: 7, y: 7, width: 50, height: 50, rx: 10, stroke: 'currentColor', strokeWidth: 4 }),
          h('path', { d: 'M32 7v50M7 32h50', stroke: 'currentColor', strokeWidth: 4, strokeLinecap: 'round' }),
          h('rect', { x: 15, y: 15, width: 13, height: 13, rx: 3, fill: 'currentColor', opacity: 0.9 }),
          h('rect', { x: 36, y: 36, width: 13, height: 13, rx: 3, fill: 'currentColor', opacity: 0.9 }),
        )
      }

      /** Shipped Chat target, selected as the fixed View of the embedded factory. */
      function FixedChatView(props) {
        return h(Fragment, null, props.renderSlot('conversation.session', { view: 'chat' }))
      }

      /**
       * Contain one pane's failure. An uncaught render error would abdicate the
       * whole `main` entry (the slot core retires the crashing occupant), so one
       * bad Session must never escape its pane. Assembly faults stay loud.
       */
      class PaneBoundary extends React.Component {
        constructor(props) {
          super(props)
          this.state = { failed: false }
        }

        static getDerivedStateFromError(error) {
          if (error !== null && typeof error === 'object' && error.name === 'SlotAssemblyError') throw error
          return { failed: true }
        }

        componentDidCatch(error) {
          console.error('workspace-split: pane crashed', error)
        }

        render() {
          if (this.state.failed) {
            return h('div', { className: 'wsplit-note', 'data-error': 'true' }, t('paneFailed'))
          }
          return this.props.children
        }
      }

      /**
       * Contain any other rendering failure of this panel. An uncaught error
       * retires the whole `main` occupant, which leaves the main column empty.
       */
      class SplitBoundary extends React.Component {
        constructor(props) {
          super(props)
          this.state = { failed: false }
        }

        static getDerivedStateFromError(error) {
          if (error !== null && typeof error === 'object' && error.name === 'SlotAssemblyError') throw error
          return { failed: true }
        }

        componentDidCatch(error) {
          console.error(this.props.tag, error)
        }

        render() {
          if (this.state.failed) {
            return h('div', { className: 'wsplit-note', 'data-error': 'true' }, t(this.props.messageKey))
          }
          return this.props.children
        }
      }

      /**
       * Occupant of the session-scoped pane slot: render the shipped
       * `conversation.content` factory for the Session bound at this position.
       */
      function PaneConversation(props) {
        const { sessionId, useSession, useConversation, useSessions, renderFactorySlot } = props
        const session = useSession((value) => value)
        const conversation = useConversation((value) => value)
        const summaryBlank = useSessions((state) => (state.byId[sessionId] !== undefined ? state.byId[sessionId].blank : undefined))
        if (session === undefined || conversation === undefined) {
          return h('div', { className: 'wsplit-note' }, t('loading'))
        }
        const targeted = conversation.activeTargets !== undefined && conversation.activeTargets.size > 0
        const shellPhase = targeted || (!session.blank && !session.awaitingFirstTurn) || session.running === true
          ? 'active'
          : session.promptAttempted === true
            ? 'engaging'
            : 'blank'
        const parentAvailabilityPending = session.subagent !== null
          && session.subagent !== undefined
          && session.subagent.address.mode === 'continuable'
          && session.subagent.parentAvailable === undefined
        const settling = (shellPhase === 'blank' && session.openState === 'loading' && summaryBlank !== true) || parentAvailabilityPending
        const hero = shellPhase === 'blank' && (session.openState === 'open' || summaryBlank === true)
        const phase = settling ? 'settling' : hero ? 'hero' : 'active'
        return renderFactorySlot(
          'conversation.content',
          { variant: 'embedded', phase, hero },
          {
            slots: { views: FixedChatView },
            fallback: h('div', { className: 'wsplit-note', 'data-error': 'true' }, t('noContent')),
          },
        )
      }

      /** Open one Session in the regular conversation panel. */
      function openInMain(sessionId) {
        const api = uiWorkspaceApi
        if (api === null || typeof api.openSession !== 'function') return
        /* This navigation is meant to leave the split: do not bounce it back. */
        leaveGuard.suppressUntil = Date.now() + 500
        try {
          api.openSession(sessionId)
        } catch (error) {
          console.error('workspace-split: opening the main conversation failed', error)
        }
      }

      /**
       * Read-only reader for one workspace file, docked inside the pane whose
       * chat linked to it: the conversation keeps its place and stays readable
       * next to the preview. A file link would otherwise open a right-Sidebar
       * tab, which belongs to the on-screen Conversation that a global panel
       * never has.
       */
      function FilePreviewDock(props) {
        const { request, onClose, style } = props
        const [state, setState] = React.useState({ phase: 'loading' })
        const [desktop, setDesktop] = React.useState(false)
        const [externalFailed, setExternalFailed] = React.useState(false)
        const controllerRef = React.useRef(null)

        /** The Remote file faces, when the Host exposes them. */
        const filesOf = () => {
          try {
            const remote = fileRemote
            if (remote === null || remote === undefined) return null
            const files = remote.workspaceFiles
            return files === undefined || files === null ? null : files
          } catch (error) {
            note('workspace-split: no Remote file face', error)
            return null
          }
        }

        /** Host desktop face, when this deployment exposes one. */
        const desktopOf = () => {
          const face = desktopFace
          if (face === null || face === undefined) return null
          try {
            return typeof face.canOpenWorkspacePath === 'function' && typeof face.openWorkspacePath === 'function' ? face : null
          } catch (error) {
            note('workspace-split: unusable desktop path face', error)
            return null
          }
        }

        /** Workspace root of the Session that owns the referenced file. */
        const cwdOf = (sessionId) => {
          try {
            const store = ctx.sessions !== undefined && ctx.sessions.list !== undefined ? ctx.sessions.list : null
            if (store === null || typeof store.getSnapshot !== 'function') return ''
            const snapshot = store.getSnapshot()
            const summary = snapshot !== undefined && snapshot.byId !== undefined ? snapshot.byId[sessionId] : undefined
            return summary !== undefined && typeof summary.cwd === 'string' ? summary.cwd : ''
          } catch (error) {
            note('workspace-split: no session cwd for the previewed file', error)
            return ''
          }
        }

        React.useEffect(() => {
          const files = filesOf()
          if (files === null) {
            setState({ phase: 'error', reason: 'rpc-unavailable' })
            return undefined
          }
          const controller = new AbortController()
          controllerRef.current = controller
          const signal = controller.signal
          const kind = filePreviewKind(request.path)
          /** Unwrap one Remote result, or throw its message. */
          const settle = (result) => {
            if (result === null || result === undefined || result.ok !== true) {
              throw new Error(remoteMessageOf(result === null || result === undefined ? null : result.error, 'unknown'))
            }
            return result.value
          }
          const load = async () => {
            setState({ phase: 'loading' })
            if (typeof files.stat !== 'function') throw new Error('RPC unavailable')
            const stat = await files.stat(request.sessionId, request.path, signal)
            if (signal.aborted) return
            const absolutePath = stat !== null && stat !== undefined && stat.ok === true ? stat.value.absolutePath : undefined
            if (kind === 'text') {
              if (typeof files.read !== 'function') throw new Error('RPC unavailable')
              const page = settle(await files.read(request.sessionId, request.path, { offset: 1 }, signal))
              if (signal.aborted) return
              const lines = page.lines === 0 ? [] : String(page.text).split('\n')
              setState({ phase: 'ready', kind, absolutePath, lines, more: page.lines > 0 })
              return
            }
            if (kind === 'image') {
              if (typeof files.readBytes !== 'function') throw new Error('RPC unavailable')
              const file = settle(await files.readBytes(request.sessionId, request.path, {}, signal))
              if (signal.aborted) return
              if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') throw new Error('blob unavailable')
              const mediaType = imageMediaTypeOf(request.path)
              const url = URL.createObjectURL(new Blob([file.data], { type: mediaType === undefined ? 'application/octet-stream' : mediaType }))
              setState({ phase: 'ready', kind, absolutePath: absolutePath === undefined ? file.absolutePath : absolutePath, imageUrl: url })
              return
            }
            setState({ phase: 'ready', kind: 'unsupported', absolutePath })
          }
          load().catch((error) => {
            if (signal.aborted) return
            setState({ phase: 'error', reason: messageOf(error) })
          })
          return () => {
            const current = controllerRef.current
            if (current !== null) current.abort()
          }
        }, [request.sessionId, request.path])

        /** Drop the object URL of the previous image once it is replaced or closed. */
        React.useEffect(() => {
          const url = state.imageUrl
          if (url === undefined) return undefined
          return () => {
            try {
              URL.revokeObjectURL(url)
            } catch (_revoked) {
              /* an already released URL needs no cleanup */
            }
          }
        }, [state.imageUrl])

        /** Whether the Host desktop can hand the file to its default application. */
        React.useEffect(() => {
          const sessionFace = desktopOf()
          if (sessionFace === null) return undefined
          let live = true
          try {
            sessionFace.canOpenWorkspacePath().then(
              (result) => {
                if (live) setDesktop(result !== null && result !== undefined && result.ok === true && result.value === true)
              },
              () => {
                if (live) setDesktop(false)
              },
            )
          } catch (error) {
            note('workspace-split: desktop capability probe failed', error)
            return undefined
          }
          return () => {
            live = false
          }
        }, [])

        React.useEffect(() => {
          const onKeyDown = (event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            onClose()
          }
          window.addEventListener('keydown', onKeyDown, true)
          return () => window.removeEventListener('keydown', onKeyDown, true)
        }, [onClose])

        /** Read the next page of a long text file. */
        const loadMore = () => {
          const current = state
          if (current.phase !== 'ready' || current.kind !== 'text' || current.more !== true) return
          const files = filesOf()
          if (files === null || typeof files.read !== 'function') return
          const controller = new AbortController()
          controllerRef.current = controller
          const signal = controller.signal
          setState({ ...current, loadingMore: true })
          files.read(request.sessionId, request.path, { offset: current.lines.length + 1 }, signal).then(
            (result) => {
              if (signal.aborted) return
              if (result === null || result === undefined || result.ok !== true) {
                const reason = result === null || result === undefined ? null : result.error
                setState({ phase: 'error', reason: remoteMessageOf(reason, undefined) })
                return
              }
              const page = result.value
              const added = page.lines === 0 ? [] : String(page.text).split('\n')
              setState((prev) => {
                if (prev.phase !== 'ready' || prev.kind !== 'text') return prev
                return {
                  ...prev,
                  lines: prev.lines.concat(added),
                  more: added.length > 0,
                  loadingMore: false,
                }
              })
            },
            (error) => {
              if (!signal.aborted) setState({ phase: 'error', message: t('previewError', { message: messageOf(error) }) })
            },
          )
        }

        const name = fileNameOf(request.path)
        /** Host-reported absolute path, or the Workspace-joined spelling. */
        const resolvedPath =
          typeof state.absolutePath === 'string' && state.absolutePath !== ''
            ? state.absolutePath
            : absolutePathOf(cwdOf(request.sessionId), request.path)
        const isAbsolutePath =
          resolvedPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(resolvedPath) || resolvedPath.startsWith('\\\\')
        const canOpenExternal = desktop && isAbsolutePath

        /** Hand the file to the Host desktop's default application. */
        const openExternal = () => {
          const sessionFace = desktopOf()
          if (sessionFace === null || !isAbsolutePath) return
          try {
            sessionFace.openWorkspacePath({ path: resolvedPath }).then(
              (result) => {
                if (result === null || result === undefined || result.ok !== true) setExternalFailed(true)
              },
              () => setExternalFailed(true),
            )
          } catch (error) {
            console.warn('workspace-split: default app launch failed', error)
            setExternalFailed(true)
          }
        }

        const displayPath = resolvedPath
        const actions = []
        if (canOpenExternal) {
          actions.push(
            h(
              'button',
              { key: 'external', type: 'button', className: 'wsplit-preview-btn', onClick: openExternal },
              t('previewOpenExternal'),
            ),
          )
        }
        actions.push(
          h(
            'button',
            { key: 'close', type: 'button', className: 'wsplit-preview-btn', onClick: onClose },
            t('previewClose'),
          ),
        )

        let body
        if (state.phase === 'loading') {
          body = h('div', { className: 'wsplit-preview-note', role: 'status' }, t('previewLoading'))
        } else if (state.phase === 'error') {
          body = h('div', { className: 'wsplit-preview-note', 'data-error': 'true', role: 'alert' }, t('previewError', { message: previewReasonOf(state.reason, t) }))
        } else if (state.kind === 'text') {
          const lines = state.lines
          body = h(
            Fragment,
            null,
            lines.length === 0
              ? h('div', { className: 'wsplit-preview-note' }, t('previewEmpty'))
              : h(
                  'pre',
                  { className: 'wsplit-preview-code' },
                  lines.map((line, index) =>
                    h(
                      'div',
                      { key: index, className: 'wsplit-preview-line' },
                      h('span', { className: 'wsplit-preview-gutter' }, String(index + 1)),
                      h('span', { className: 'wsplit-preview-src' }, line === '' ? ' ' : line),
                    ),
                  ),
                ),
            state.more === true
              ? h(
                  'div',
                  { className: 'wsplit-preview-more' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'wsplit-preview-btn',
                      onClick: loadMore,
                      disabled: state.loadingMore === true,
                    },
                    state.loadingMore === true ? t('previewLoading') : t('previewMore'),
                  ),
                )
              : null,
          )
        } else if (state.kind === 'image') {
          body = h(
            'div',
            { className: 'wsplit-preview-image-wrap' },
            h('img', { className: 'wsplit-preview-image', src: state.imageUrl, alt: name }),
          )
        } else {
          body = h('div', { className: 'wsplit-preview-note' }, t('previewUnsupported'))
        }

        return h(
          'aside',
          {
            className: 'wsplit-preview-dock',
            role: 'region',
            'aria-label': t('previewTitle'),
            style,
          },
          h(
            'div',
            { className: 'wsplit-preview-head' },
            h(
              'div',
              { className: 'wsplit-preview-titles' },
              h('span', { className: 'wsplit-preview-name' }, name),
              h('span', { className: 'wsplit-preview-path', title: displayPath }, displayPath),
            ),
            h('div', { className: 'wsplit-preview-actions' }, actions),
          ),
          h('div', { className: 'wsplit-preview-body' }, body),
          externalFailed
            ? h('div', { className: 'wsplit-preview-alert', role: 'alert' }, t('previewExternalFailed'))
            : null,
        )
      }

      /** Read one same-origin review route; a `404` means the Host no longer serves that record. */
      function reviewFetch(url, signal) {
        return fetch(url, { signal, credentials: 'same-origin' }).then((response) => {
          if (response.status === 404) return null
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.json()
        })
      }

      /**
       * One turn's changes review, docked inside the pane that announced it: the
       * shipped review tab lives in the right Sidebar, which needs an on-screen
       * conversation, so this reads the same routes and renders the same content.
       */
      function ChangesReviewDock(props) {
        const { request, onClose, style } = props
        const [summary, setSummary] = React.useState({ phase: 'loading' })
        const [active, setActive] = React.useState(Number.isSafeInteger(request.index) ? request.index : 0)
        const [diff, setDiff] = React.useState({ phase: 'idle' })

        React.useEffect(() => {
          const controller = new AbortController()
          const query = new URLSearchParams({ sessionId: request.sessionId, seq: String(request.seq) })
          setSummary({ phase: 'loading' })
          reviewFetch(`api/changes.summary?${query}`, controller.signal).then(
            (value) => {
              if (value === null) {
                setSummary({ phase: 'gone' })
                return
              }
              const files = typeof value === 'object' && Array.isArray(value.files) ? value.files : null
              if (files === null) {
                setSummary({ phase: 'error', message: t('reviewUnexpected') })
                return
              }
              setSummary({ phase: 'ready', files })
            },
            (error) => {
              if (controller.signal.aborted) return
              setSummary({ phase: 'error', message: messageOf(error) })
            },
          )
          return () => controller.abort()
        }, [request.sessionId, request.seq])

        const files = summary.phase === 'ready' ? summary.files : []
        const selected = files.length === 0 ? -1 : Math.min(Math.max(active, 0), files.length - 1)

        /* A card that names a file selects it, including when the dock only swaps turns. */
        React.useEffect(() => {
          if (Number.isSafeInteger(request.index)) setActive(request.index)
        }, [request.sessionId, request.seq, request.index])

        React.useEffect(() => {
          if (selected < 0) {
            setDiff({ phase: 'idle' })
            return undefined
          }
          const controller = new AbortController()
          const query = new URLSearchParams({
            sessionId: request.sessionId,
            seq: String(request.seq),
            index: String(selected),
          })
          setDiff({ phase: 'loading' })
          reviewFetch(`api/changes.diff?${query}`, controller.signal).then(
            (value) => setDiff(value === null ? { phase: 'gone' } : { phase: 'ready', value }),
            (error) => {
              if (controller.signal.aborted) return
              setDiff({ phase: 'error', message: messageOf(error) })
            },
          )
          return () => controller.abort()
        }, [request.sessionId, request.seq, selected])

        React.useEffect(() => {
          const onKeyDown = (event) => {
            if (event.key !== 'Escape') return
            event.stopPropagation()
            onClose()
          }
          window.addEventListener('keydown', onKeyDown, true)
          return () => window.removeEventListener('keydown', onKeyDown, true)
        }, [onClose])

        let diffBody
        if (diff.phase === 'idle' || diff.phase === 'loading') {
          diffBody = h('div', { className: 'wsplit-preview-note' }, t('previewLoading'))
        } else if (diff.phase === 'gone') {
          diffBody = h('div', { className: 'wsplit-preview-note' }, t('reviewEmpty'))
        } else if (diff.phase === 'error') {
          diffBody = h(
            'div',
            { className: 'wsplit-preview-note', 'data-error': 'true' },
            t('reviewError', { message: diff.message }),
          )
        } else {
          const value = diff.value === null || typeof diff.value !== 'object' ? {} : diff.value
          const kind = value.kind
          if (kind === 'binary' || kind === 'oversized') {
            diffBody = h(
              'div',
              { className: 'wsplit-preview-note' },
              kind === 'binary' ? t('reviewBinary') : t('reviewOversized'),
            )
          } else {
            const hunks = Array.isArray(value.hunks) ? value.hunks : []
            const rows = []
            if (value.before === false) {
              rows.push(h('div', { key: 'created', className: 'wsplit-preview-note' }, t('reviewCreated')))
            }
            if (value.after === false) {
              rows.push(h('div', { key: 'deleted', className: 'wsplit-preview-note' }, t('reviewDeleted')))
            }
            hunks.forEach((hunk, hunkIndex) => {
              const oldStart = Number.isSafeInteger(hunk.oldStart) ? hunk.oldStart : 0
              const oldLines = Number.isSafeInteger(hunk.oldLines) ? hunk.oldLines : 0
              const newStart = Number.isSafeInteger(hunk.newStart) ? hunk.newStart : 0
              const newLines = Number.isSafeInteger(hunk.newLines) ? hunk.newLines : 0
              const header = `@@ -${String(oldStart)},${String(oldLines)} +${String(newStart)},${String(newLines)} @@`
              rows.push(h('span', { key: `hunk:${hunkIndex}`, className: 'wsplit-diff-hunk' }, header))
              const lines = Array.isArray(hunk.lines) ? hunk.lines : []
              let oldNo = oldStart
              let newNo = newStart
              lines.forEach((raw, lineIndex) => {
                const line = String(raw)
                const head = line.slice(0, 1)
                const sign = head === '+' ? 'added' : head === '-' ? 'deleted' : 'context'
                const oldLabel = head === '+' ? '' : String(oldNo)
                const newLabel = head === '-' ? '' : String(newNo)
                if (head !== '+') oldNo += 1
                if (head !== '-') newNo += 1
                rows.push(
                  h(
                    'div',
                    { key: `line:${hunkIndex}:${lineIndex}`, className: 'wsplit-diff-line', 'data-sign': sign },
                    h('span', { className: 'wsplit-diff-gutter' }, oldLabel),
                    h('span', { className: 'wsplit-diff-gutter' }, newLabel),
                    h('span', { className: 'wsplit-diff-sign' }, head === '' ? ' ' : head),
                    h('span', { className: 'wsplit-diff-src' }, line.slice(1)),
                  ),
                )
              })
            })
            diffBody = h(
              'div',
              { className: 'wsplit-review-diff' },
              rows.length === 0 ? h('div', { className: 'wsplit-preview-note' }, t('reviewEmpty')) : rows,
            )
          }
        }

        let body
        if (summary.phase === 'loading') {
          body = h('div', { className: 'wsplit-preview-note' }, t('previewLoading'))
        } else if (summary.phase === 'gone') {
          body = h('div', { className: 'wsplit-preview-note' }, t('reviewEmpty'))
        } else if (summary.phase === 'error') {
          body = h('div', { className: 'wsplit-preview-note', 'data-error': 'true' }, t('reviewError', { message: summary.message }))
        } else if (files.length === 0) {
          body = h('div', { className: 'wsplit-preview-note' }, t('reviewEmpty'))
        } else {
          body = h(
            Fragment,
            null,
            h(
              'div',
              { className: 'wsplit-review-files' },
              files.map((file, position) =>
                h(
                  'button',
                  {
                    key: `${String(position)}:${String(file.path)}`,
                    type: 'button',
                    className: 'wsplit-review-file',
                    'data-active': position === selected ? 'true' : 'false',
                    title: String(file.display),
                    onClick: () => setActive(position),
                  },
                  h('span', { className: 'wsplit-review-name' }, String(file.display)),
                  Number.isSafeInteger(file.added) && file.added > 0
                    ? h('span', { className: 'wsplit-review-count', 'data-kind': 'added' }, `+${String(file.added)}`)
                    : null,
                  Number.isSafeInteger(file.deleted) && file.deleted > 0
                    ? h('span', { className: 'wsplit-review-count', 'data-kind': 'deleted' }, `-${String(file.deleted)}`)
                    : null,
                ),
              ),
            ),
            diffBody,
          )
        }

        return h(
          'aside',
          { className: 'wsplit-preview-dock', role: 'region', 'aria-label': t('reviewTitle'), style },
          h(
            'div',
            { className: 'wsplit-preview-head' },
            h(
              'div',
              { className: 'wsplit-preview-titles' },
              h(
                'span',
                { className: 'wsplit-preview-name' },
                files.length === 0 ? t('reviewTitle') : t('reviewFiles', { count: files.length }),
              ),
              h('span', { className: 'wsplit-preview-path', title: t('reviewTurn', { turn: request.turn }) },
                t('reviewTurn', { turn: request.turn })),
            ),
            h(
              'div',
              { className: 'wsplit-preview-actions' },
              h(
                'button',
                { type: 'button', className: 'wsplit-preview-btn', onClick: onClose, title: t('previewClose') },
                t('previewClose'),
              ),
            ),
          ),
          h('div', { className: 'wsplit-preview-body' }, body),
        )
      }

      /**
       * Retain one Session reference for a pane and bind it around the pane
       * slot. The reference is released when the pane unmounts or switches.
       */
      function PaneHost({ sessionId, SessionProvider, renderSlot }) {
        const [state, setState] = React.useState({ reference: null, error: null })
        React.useEffect(() => {
          if (sessionId === null) {
            setState({ reference: null, error: null })
            return undefined
          }
          let reference = null
          try {
            reference = ctx.sessions.retain(sessionId, { source: 'workspaceSplit' })
          } catch (error) {
            setState({ reference: null, error: messageOf(error) })
            return undefined
          }
          let cancelled = false
          setState({ reference, error: null })
          reference.ready.then(
            () => {
              if (!cancelled) setState({ reference, error: null })
            },
            (error) => {
              if (!cancelled) setState({ reference: null, error: messageOf(error) })
            },
          )
          return () => {
            cancelled = true
            try {
              reference.release()
            } catch (error) {
              console.error('workspace-split: releasing a Session reference failed', error)
            }
          }
        }, [sessionId])

        if (sessionId === null) {
          return h(
            'div',
            { className: 'wsplit-empty' },
            h('div', { className: 'wsplit-empty-title' }, t('emptyPane')),
            h('div', { className: 'wsplit-empty-hint' }, t('intro')),
          )
        }
        if (state.error !== null) {
          return h('div', { className: 'wsplit-note', 'data-error': 'true' }, t('openFailed', { message: state.error }))
        }
        if (state.reference === null) {
          return h('div', { className: 'wsplit-note' }, t('loading'))
        }
        return h(SessionProvider, { session: state.reference }, renderSlot(PANE_SLOT, {}))
      }

      /**
       * One pane: Workspace switcher, Session picker, "new session" shortcut and
       * the live embedded chat.
       */
      function PaneCard({
        index,
        sessionId,
        catalog,
        list,
        onPick,
        onSwitchWorkspace,
        onNewSession,
        busy,
        errorText,
        preview,
        onClosePreview,
        previewShare,
        onPreviewShare,
        SessionProvider,
        renderSlot,
      }) {
        const summary = sessionId === null ? undefined : list.byId[sessionId]
        const running = summary !== undefined && summary.running === true
        const workspaceId = workspaceIdOf(catalog, list, sessionId)
        const workspaceValue = sessionId === null ? '' : workspaceId === '' ? '__loose' : workspaceId
        /* New Sessions go to the pane's Workspace, else to the most recent one. */
        const targetWorkspace = workspaceValue === '' || workspaceValue === '__loose'
          ? (catalog.groups.find((group) => group.key !== '') ?? { key: '' }).key
          : workspaceValue
        const workspaceOptions = [
          h('option', { key: '__choose', value: '' }, t('chooseWorkspace')),
          ...catalog.groups.map((group) =>
            h('option', { key: group.key === '' ? '__loose' : group.key, value: group.key === '' ? '__loose' : group.key }, group.title),
          ),
        ]
        const sessionOptions = [
          h('option', { key: '__empty', value: '' }, t('chooseSession')),
          ...catalog.groups
            .filter((group) => group.ids.length > 0)
            .map((group) =>
              h(
                'optgroup',
                { key: group.key === '' ? '__loose' : group.key, label: group.title },
                group.ids.map((id) => h('option', { key: id, value: id }, sessionLabel(list.byId[id], t))),
              ),
            ),
        ]
        const paneBusy = busy === true
        const newDisabled = paneBusy || targetWorkspace === ''
        /* Wide panes read side by side; narrow ones stack chat over preview. */
        const bodyRef = React.useRef(null)
        const [wide, setWide] = React.useState(false)
        useLayoutEffect(() => {
          const node = bodyRef.current
          if (node === null || typeof ResizeObserver !== 'function') return undefined
          const measure = () => setWide(node.clientWidth >= 640)
          measure()
          const observer = new ResizeObserver(measure)
          observer.observe(node)
          return () => observer.disconnect()
        }, [])
        /* Preview share: local while dragging, committed to the layout on release. */
        const [dragShare, setDragShare] = React.useState(null)
        /* Detaches the window listeners of a drag that never reached pointerup. */
        const dragCleanupRef = React.useRef(null)
        React.useEffect(() => () => {
          if (dragCleanupRef.current !== null) dragCleanupRef.current()
        }, [])
        const shares = previewShare === undefined || previewShare === null ? DEFAULT_PREVIEW_SHARE : previewShare
        const dockSide = wide ? 'side' : 'stack'
        const share = dragShare === null ? shares[dockSide] : dragShare
        const resetShare = () => onPreviewShare(dockSide, DEFAULT_PREVIEW_SHARE[dockSide])
        /** Drag the divider between the conversation and the docked preview. */
        const beginPreviewResize = (event) => {
          if (preview === null) return
          if (event.button !== undefined && event.button !== 0) return
          const node = bodyRef.current
          if (node === null) return
          const vertical = wide
          const rect = node.getBoundingClientRect()
          const total = vertical ? rect.width : rect.height
          if (!(total > 0)) return
          event.preventDefault()
          const start = vertical ? event.clientX : event.clientY
          const from = share
          let latest = from
          const onMove = (moveEvent) => {
            const delta = (vertical ? moveEvent.clientX : moveEvent.clientY) - start
            /* Moving the divider left/up grows a right/bottom dock. */
            latest = Math.min(MAX_PREVIEW_SHARE, Math.max(MIN_PREVIEW_SHARE, from - delta / total))
            setDragShare(latest)
          }
          const detach = () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onEnd)
            window.removeEventListener('pointercancel', onEnd)
            dragCleanupRef.current = null
          }
          const onEnd = () => {
            detach()
            setDragShare(null)
            onPreviewShare(dockSide, latest)
          }
          dragCleanupRef.current = detach
          window.addEventListener('pointermove', onMove)
          window.addEventListener('pointerup', onEnd)
          window.addEventListener('pointercancel', onEnd)
        }
        const body = sessionId === null && errorText !== null
          ? h('div', { className: 'wsplit-note', 'data-error': 'true' }, t('createFailed', { message: errorText }))
          : h(
              PaneBoundary,
              { key: sessionId === null ? '__empty' : sessionId },
              h(PaneHost, { key: sessionId === null ? '__empty' : sessionId, sessionId, SessionProvider, renderSlot }),
            )
        /* The dock keeps the share of the readable space the divider last left it. */
        const dockStyle = wide ? { width: `${(share * 100).toFixed(2)}%` } : { flexBasis: `${(share * 100).toFixed(2)}%` }
        return h(
          'section',
          { className: 'wsplit-pane' },
          h(
            'div',
            { className: 'wsplit-pane-head' },
            h('span', { className: 'wsplit-dot', 'data-running': running ? 'true' : 'false', 'aria-hidden': true }),
            h(
              'select',
              {
                className: 'wsplit-workspace-select',
                value: workspaceValue,
                disabled: paneBusy,
                title: t('workspaceAria'),
                'aria-label': t('workspaceAria'),
                onChange: (event) => {
                  const value = event.target.value
                  if (value !== '') onSwitchWorkspace(index, value)
                },
              },
              workspaceOptions,
            ),
            h(
              'select',
              {
                className: 'wsplit-select',
                value: sessionId === null ? '' : sessionId,
                onChange: (event) => onPick(index, event.target.value === '' ? null : event.target.value),
                'aria-label': t('paneAria', { index: index + 1 }),
                title: t('paneAria', { index: index + 1 }),
              },
              sessionOptions,
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'wsplit-new',
                disabled: newDisabled,
                'data-error': errorText !== null ? 'true' : 'false',
                title: errorText === null ? t('newSession') : t('createFailed', { message: errorText }),
                'aria-label': t('newSession'),
                onClick: () => onNewSession(index, targetWorkspace),
              },
              paneBusy ? '\u2026' : '\uff0b',
            ),
            sessionId === null
              ? null
              : h(
                  'button',
                  {
                    type: 'button',
                    className: 'wsplit-open',
                    title: t('openInMain'),
                    'aria-label': t('openInMain'),
                    onClick: () => openInMain(sessionId),
                  },
                  '\u2197',
                ),
          ),
          h(
            'div',
            {
              className: 'wsplit-pane-body',
              ref: bodyRef,
              'data-split': preview === null ? 'none' : wide ? 'side' : 'stack',
              'data-resizing': dragShare === null ? undefined : dockSide,
            },
            h('div', { className: 'wsplit-pane-chat' }, body),
            preview === null
              ? null
              : h(
                  'div',
                  {
                    key: 'preview-grip',
                    className: 'wsplit-preview-grip',
                    role: 'separator',
                    tabIndex: 0,
                    'data-orientation': wide ? 'vertical' : 'horizontal',
                    'aria-orientation': wide ? 'vertical' : 'horizontal',
                    'aria-label': t('resizePreview'),
                    'aria-valuenow': Math.round(share * 100),
                    'aria-valuemin': Math.round(MIN_PREVIEW_SHARE * 100),
                    'aria-valuemax': Math.round(MAX_PREVIEW_SHARE * 100),
                    title: t('resizePreview'),
                    onPointerDown: beginPreviewResize,
                    onDoubleClick: resetShare,
                    onKeyDown: (event) => {
                      const key = event.key
                      if (key === 'Enter' || key === ' ' || key === 'Home') {
                        event.preventDefault()
                        resetShare()
                        return
                      }
                      const vertical = wide
                      const back = vertical ? 'ArrowLeft' : 'ArrowUp'
                      const forward = vertical ? 'ArrowRight' : 'ArrowDown'
                      if (key !== back && key !== forward) return
                      event.preventDefault()
                      const step = key === back ? 0.02 : -0.02
                      const next = Math.min(MAX_PREVIEW_SHARE, Math.max(MIN_PREVIEW_SHARE, share + step))
                      onPreviewShare(dockSide, next)
                    },
                  },
                  h('div', { className: 'wsplit-preview-grip-line' }),
                ),
            preview === null
              ? null
              : h(
                  SplitBoundary,
                  {
                    key: preview.kind === 'review' ? 'review' : 'preview',
                    tag:
                      preview.kind === 'review'
                        ? 'workspace-split: changes review crashed'
                        : 'workspace-split: file preview crashed',
                    messageKey: preview.kind === 'review' ? 'reviewFailed' : 'previewFailed',
                  },
                  preview.kind === 'review'
                    ? h(ChangesReviewDock, { request: preview, onClose: onClosePreview, style: dockStyle })
                    : h(FilePreviewDock, { request: preview, onClose: onClosePreview, style: dockStyle }),
                ),
          ),
        )
      }

      /**
       * Memoized pane: a column drag re-renders the panel per pointer move, and
       * panes keep their identity while only the grid tracks change.
       */
      const MemoPaneCard = React.memo(PaneCard)

      /** Track count selector (columns or rows). */
      function TrackField({ labelKey, ariaKey, value, onChange }) {
        const buttons = []
        for (let count = MIN_TRACKS; count <= MAX_TRACKS; count += 1) {
          buttons.push(
            h(
              'button',
              {
                key: count,
                type: 'button',
                'data-active': count === value ? 'true' : 'false',
                'aria-pressed': count === value,
                onClick: () => onChange(count),
              },
              String(count),
            ),
          )
        }
        return h(
          'div',
          { className: 'wsplit-field' },
          h('span', { className: 'wsplit-field-label' }, t(labelKey)),
          h('div', { className: 'wsplit-seg', role: 'group', 'aria-label': t(ariaKey) }, buttons),
        )
      }

      /** The global main panel: toolbar plus the rows x columns grid of panes. */
      function SplitView(props) {
        const { useSessions, useWorkspaces, SessionProvider, renderSlot } = props
        const list = useSessions((state) => state)
        const workspaceState = useWorkspaces((state) => state)
        const [layout, setLayout] = React.useState(readStoredLayout)
        /** Live track-resize gesture: axis, boundary index, origin, size, start shares. */
        const [drag, setDrag] = React.useState(null)
        /** Pane that receives Sessions opened from the sidebar, and its adoption flash. */
        const [focusIndex, setFocusIndex] = React.useState(null)
        const [flashIndex, setFlashIndex] = React.useState(null)
        /** Open file reference, read in place instead of in the right Sidebar. */
        const [preview, setPreview] = React.useState(null)
        const closePreview = React.useCallback(() => setPreview(null), [])
        /** Persist the share of a pane the docked preview occupies, per dock side. */
        const setPreviewShare = React.useCallback((side, value) => {
          setLayout((prev) => {
            const shares = prev.previewShare === undefined || prev.previewShare === null ? DEFAULT_PREVIEW_SHARE : prev.previewShare
            const clamped = Math.min(MAX_PREVIEW_SHARE, Math.max(MIN_PREVIEW_SHARE, value))
            if (shares[side] === clamped) return prev
            return { ...prev, previewShare: { ...shares, [side]: clamped } }
          })
        }, [])
        /** Sidebar navigation lands in a pane instead of swapping this panel away. */
        const follow = layout.sidebarFollow !== false
        const followRef = React.useRef(follow)
        followRef.current = follow
        const focusedRef = React.useRef(focusIndex)
        focusedRef.current = focusIndex
        const listReady = list.phase === 'ready'
        const workspacesReady = workspaceState.phase === 'ready'
        /** Locale change proxy: catalog labels must be rebuilt in the active language. */
        const localeMarker = t('ungrouped')
        const remembered = layout.lastByWorkspace === undefined ? NO_REMEMBERED : layout.lastByWorkspace
        const catalog = React.useMemo(
          () => buildCatalog(list, workspaceState, t, remembered),
          [list, workspaceState, localeMarker, remembered],
        )

        React.useEffect(() => {
          if (!listReady || !workspacesReady) return
          setLayout((prev) => reconcile(prev, prev.rows * prev.cols, catalog))
        }, [listReady, workspacesReady, catalog, layout.rows, layout.cols])

        /* Remember what each Workspace last showed, so switching back reopens it. */
        React.useEffect(() => {
          if (!listReady || !workspacesReady) return
          setLayout((prev) => {
            let map = prev.lastByWorkspace === undefined ? NO_REMEMBERED : prev.lastByWorkspace
            for (const id of prev.sessionIds) {
              if (id === null || id === undefined) continue
              const summary = list.byId[id]
              if (summary === undefined || summary.blank === true) continue
              map = withRemembered(map, workspaceIdOf(catalog, list, id), id)
            }
            if (map === (prev.lastByWorkspace === undefined ? NO_REMEMBERED : prev.lastByWorkspace)) return prev
            return { ...prev, lastByWorkspace: map }
          })
        }, [listReady, workspacesReady, layout.sessionIds, catalog, list])

        /** Latest layout, readable from the unmount flush without re-subscribing. */
        const layoutRef = React.useRef(layout)
        layoutRef.current = layout
        /** Latest render data, readable from the synchronous panel observer. */
        const listRef = React.useRef(list)
        listRef.current = list
        const workspaceStateRef = React.useRef(workspaceState)
        workspaceStateRef.current = workspaceState
        const rememberedRef = React.useRef(remembered)
        rememberedRef.current = remembered
        /** Session the workspace layer holds as the main conversation (for diffing). */
        const mainViewRef = React.useRef('')
        mainViewRef.current = mainViewSessionId(list)
        React.useEffect(() => {
          /* A live drag rewrites state per pointermove: persist once it settles. */
          if (drag !== null) return
          writeStoredLayout(layout)
        }, [layout, drag])
        React.useEffect(
          () => () => {
            writeStoredLayout(layoutRef.current)
          },
          [],
        )

        const widths = normalizeWidths(layout.colWidths, layout.cols)
        /** Per-column row shares: every column has its own row heights. */
        const heights = normalizeHeights(layout.rowHeights, layout.cols, layout.rows)
        const gridRef = React.useRef(null)

        /** Start a column resize between track `index` and `index + 1`. */
        const beginColumnResize = (index) => (event) => {
          if (event.button !== undefined && event.button !== 0) return
          const wrap = gridRef.current
          if (wrap === null) return
          const width = wrap.getBoundingClientRect().width
          if (!(width > 0)) return
          event.preventDefault()
          event.stopPropagation()
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch (_uncapturable) {
            /* pointer capture is best-effort; the document listener still tracks */
          }
          setDrag({ axis: 'col', index, column: 0, start: event.clientX, size: width, shares: widths })
        }

        /** Start a row resize inside one column, between rows `index` and `index + 1`. */
        const beginRowResize = (column, index) => (event) => {
          if (event.button !== undefined && event.button !== 0) return
          const container = event.currentTarget.parentElement
          if (container === null) return
          const size = container.getBoundingClientRect().height
          if (!(size > 0)) return
          event.preventDefault()
          event.stopPropagation()
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch (_uncapturable) {
            /* pointer capture is best-effort; the document listener still tracks */
          }
          setDrag({ axis: 'row', index, column, start: event.clientY, size, shares: heights[column] })
        }

        /** Track the pointer while a resize is live; shares stay clamped. */
        const moveDrag = (event) => {
          if (drag === null) return
          const { axis, index, column, start, size, shares } = drag
          if (index < 0 || index + 1 >= shares.length) return
          const total = shares[index] + shares[index + 1]
          const floor = Math.min(axis === 'col' ? MIN_COL_FRACTION : MIN_ROW_FRACTION, total / 2)
          const delta = ((axis === 'col' ? event.clientX : event.clientY) - start) / size
          const first = Math.min(total - floor, Math.max(floor, shares[index] + delta))
          if (axis === 'col') {
            setLayout((prev) => {
              if (prev.cols !== shares.length) return prev
              const next = shares.slice()
              next[index] = first
              next[index + 1] = total - first
              return { ...prev, colWidths: next }
            })
            return
          }
          setLayout((prev) => {
            if (prev.rows !== shares.length) return prev
            const matrix = normalizeHeights(prev.rowHeights, prev.cols, prev.rows)
            const target = matrix[column]
            if (target === undefined || target.length !== shares.length) return prev
            const next = target.slice()
            next[index] = first
            next[index + 1] = total - first
            matrix[column] = next
            return { ...prev, rowHeights: matrix }
          })
        }

        const endResize = () => setDrag(null)

        /** Keyboard for a column boundary: arrows nudge, Enter/Space/Home resets. */
        const nudgeColumn = (index) => (event) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'Home') {
            event.preventDefault()
            setLayout((prev) => ({ ...prev, colWidths: equalWidths(prev.cols) }))
            return
          }
          const step = event.key === 'ArrowLeft' ? -0.02 : event.key === 'ArrowRight' ? 0.02 : 0
          if (step === 0) return
          event.preventDefault()
          setLayout((prev) => {
            const base = normalizeWidths(prev.colWidths, prev.cols)
            if (index + 1 >= base.length) return prev
            const total = base[index] + base[index + 1]
            const floor = Math.min(MIN_COL_FRACTION, total / 2)
            const first = Math.min(total - floor, Math.max(floor, base[index] + step))
            const next = base.slice()
            next[index] = first
            next[index + 1] = total - first
            return { ...prev, colWidths: next }
          })
        }

        /** Keyboard for one column's row boundary: arrows nudge, Enter/Space/Home resets. */
        const nudgeRow = (column, index) => (event) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'Home') {
            event.preventDefault()
            setLayout((prev) => {
              const matrix = normalizeHeights(prev.rowHeights, prev.cols, prev.rows)
              matrix[column] = equalHeights(prev.rows)
              return { ...prev, rowHeights: matrix }
            })
            return
          }
          const step = event.key === 'ArrowUp' ? -0.02 : event.key === 'ArrowDown' ? 0.02 : 0
          if (step === 0) return
          event.preventDefault()
          setLayout((prev) => {
            if (prev.rows < 2) return prev
            const matrix = normalizeHeights(prev.rowHeights, prev.cols, prev.rows)
            const base = matrix[column]
            if (base === undefined || index + 1 >= base.length) return prev
            const total = base[index] + base[index + 1]
            const floor = Math.min(MIN_ROW_FRACTION, total / 2)
            const first = Math.min(total - floor, Math.max(floor, base[index] + step))
            base[index] = first
            base[index + 1] = total - first
            return { ...prev, rowHeights: matrix }
          })
        }

        /** Assign a Session to one pane; a Session already shown elsewhere swaps places. */
        const pick = React.useCallback((index, sessionId) => {
          setLayout((prev) => {
            if (index < 0) return prev
            const ids = prev.sessionIds.slice()
            while (ids.length <= index) ids.push(null)
            if (sessionId !== null) {
              const existing = ids.indexOf(sessionId)
              if (existing !== -1 && existing !== index) ids[existing] = ids[index]
            }
            ids[index] = sessionId
            return { ...prev, sessionIds: ids }
          })
        }, [])

        /** Per-pane "creating a Session" flags and the last creation error. */
        const [busy, setBusy] = React.useState({})
        const [paneErrors, setPaneErrors] = React.useState({})
        const markBusy = (index, value) =>
          setBusy((prev) => {
            if ((prev[index] === true) === value) return prev
            const next = { ...prev }
            if (value) next[index] = true
            else delete next[index]
            return next
          })
        const clearPaneError = (index) =>
          setPaneErrors((prev) => {
            if (prev[index] === undefined) return prev
            const next = { ...prev }
            delete next[index]
            return next
          })

        /** Create (or reuse the Workspace's blank) Session without leaving the split. */
        const createInWorkspace = React.useCallback(
          (index, workspaceId) => {
            if (workspaceId === '') return
            const api = uiWorkspaceApi
            if (api === null || typeof api.connectWorkspace !== 'function') {
              note('workspace-split: uiWorkspace.connectWorkspace is unavailable')
              return
            }
            markBusy(index, true)
            Promise.resolve()
              .then(() => api.connectWorkspace(workspaceId))
              .then((created) => {
                if (typeof created !== 'string' || created === '') throw new Error('no Session id returned')
                clearPaneError(index)
                pick(index, created)
              })
              .catch((error) => {
                console.error('workspace-split: creating a Session failed', error)
                setPaneErrors((prev) => ({ ...prev, [index]: messageOf(error) }))
              })
              .finally(() => markBusy(index, false))
          },
          [pick],
        )

        /** Point one pane at a Workspace: what it last showed, else its newest Session. */
        const switchWorkspace = React.useCallback(
          (index, workspaceValue) => {
            if (workspaceValue === '') return
            clearPaneError(index)
            const key = workspaceValue === '__loose' ? '' : workspaceValue
            const group = catalog.groups.find((item) => item.key === key)
            const shownElsewhere = new Set()
            for (let position = 0; position < layout.sessionIds.length; position += 1) {
              if (position === index) continue
              const shown = layout.sessionIds[position]
              if (shown !== null && shown !== undefined) shownElsewhere.add(shown)
            }
            const last = key === '' ? undefined : remembered[key]
            const fromMemory = last !== undefined && group !== undefined && group.ids.includes(last) && !shownElsewhere.has(last)
              ? last
              : null
            const chosen = fromMemory !== null
              ? fromMemory
              : pickInGroup(group, list, shownElsewhere) ?? pickInGroup(group, list)
            if (chosen !== null) {
              pick(index, chosen)
              return
            }
            if (key !== '') createInWorkspace(index, key)
          },
          [catalog, list, pick, createInWorkspace, layout.sessionIds, remembered],
        )

        /** "New session" button: a fresh/blank Session of that Workspace in this pane. */
        const newSession = React.useCallback(
          (index, workspaceId) => {
            if (workspaceId === '') return
            clearPaneError(index)
            createInWorkspace(index, workspaceId)
          },
          [createInWorkspace],
        )

        /** Manual pick from the Session chooser also dismisses a stale failure. */
        const assignSession = React.useCallback(
          (index, sessionId) => {
            clearPaneError(index)
            pick(index, sessionId)
          },
          [pick],
        )

        /** Flash one pane so an adopted Session is obvious without a layout jump. */
        const flashTimer = React.useRef(undefined)
        const flashPane = React.useCallback((index) => {
          setFlashIndex(index)
          if (flashTimer.current !== undefined) window.clearTimeout(flashTimer.current)
          flashTimer.current = window.setTimeout(() => {
            flashTimer.current = undefined
            setFlashIndex(null)
          }, 1000)
        }, [])
        React.useEffect(
          () => () => {
            if (flashTimer.current !== undefined) window.clearTimeout(flashTimer.current)
          },
          [],
        )

        /**
         * Adopt the Session the sidebar just opened: point a pane at it and keep
         * the split mounted. Reads the live service snapshots because this runs
         * synchronously inside the workspace layer's navigation.
         */
        const adoptOpenedSession = React.useCallback(() => {
          const sessionStore = ctx.sessions !== undefined && ctx.sessions.list !== undefined ? ctx.sessions.list : null
          const workspaceStore = ctx.workspaces !== undefined && ctx.workspaces.list !== undefined ? ctx.workspaces.list : null
          if (sessionStore === null || workspaceStore === null) return
          const sessionsSnapshot = sessionStore.getSnapshot()
          const workspaceSnapshot = workspaceStore.getSnapshot()
          if (sessionsSnapshot === undefined || workspaceSnapshot === undefined) return
          const opened = mainViewSessionId(sessionsSnapshot, mainViewRef.current)
          mainViewRef.current = opened
          if (opened === '') return
          const state = layoutRef.current
          const count = state.rows * state.cols
          const ids = Array.isArray(state.sessionIds) ? state.sessionIds : []
          const existing = ids.indexOf(opened)
          if (existing !== -1 && existing < count) {
            setFocusIndex(existing)
            flashPane(existing)
            return
          }
          const catalogNow = buildCatalog(sessionsSnapshot, workspaceSnapshot, t, rememberedRef.current)
          const target = chooseReceiver(
            ids,
            count,
            workspaceIdOf(catalogNow, sessionsSnapshot, opened),
            (id) => workspaceIdOf(catalogNow, sessionsSnapshot, id),
            focusedRef.current,
          )
          setPaneErrors((prev) => {
            if (prev[target] === undefined) return prev
            const next = { ...prev }
            delete next[target]
            return next
          })
          pick(target, opened)
          setFocusIndex(target)
          flashPane(target)
        }, [flashPane, pick])

        /** Publish this view to the plugin-level observers (sidebar follow, file links). */
        React.useEffect(() => {
          const host = {
            get follow() {
              return followRef.current === true
            },
            adopt: adoptOpenedSession,
          }
          splitHost = host
          previewHost = { open: (request) => setPreview(request) }
          return () => {
            if (splitHost === host) splitHost = null
            previewHost = null
          }
        }, [adoptOpenedSession])

        /**
         * Grid as columns of cells: each column is its own vertical stack so its
         * rows can be resized independently from every other column.
         */
        const columns = []
        const focusedPane = focusIndex !== null && focusIndex < layout.rows * layout.cols ? focusIndex : null
        /** The preview belongs to the pane that shows that Session, else pane 0. */
        const previewOwner = preview === null ? -1 : layout.sessionIds.indexOf(preview.sessionId)
        const previewForPane = (sessionId, index) => {
          if (preview === null) return null
          if (sessionId !== null && sessionId === preview.sessionId) return preview
          return previewOwner < 0 && index === 0 ? preview : null
        }
        for (let column = 0; column < layout.cols; column += 1) {
          const columnHeights = heights[column]
          const cells = []
          for (let row = 0; row < layout.rows; row += 1) {
            const index = row * layout.cols + column
            const stored = layout.sessionIds[index]
            const paneSessionId = stored === undefined || stored === null ? null : stored
            cells.push(
              h(
                'div',
                {
                  key: index,
                  className: 'wsplit-cell',
                  style: { flex: `${columnHeights[row]} 1 0` },
                  'data-focused': focusedPane === index ? 'true' : 'false',
                  'data-flash': flashIndex === index ? 'true' : 'false',
                  /* Any interaction inside a pane makes it the sidebar's receiver. */
                  onPointerDownCapture: () => {
                    if (focusIndex !== index) setFocusIndex(index)
                  },
                },
                h(MemoPaneCard, {
                  index,
                  sessionId: paneSessionId,
                  catalog,
                  list,
                  onPick: assignSession,
                  onSwitchWorkspace: switchWorkspace,
                  onNewSession: newSession,
                  busy: busy[index] === true,
                  errorText: paneErrors[index] === undefined ? null : paneErrors[index],
                  preview: previewForPane(paneSessionId, index),
                  onClosePreview: closePreview,
                  previewShare: layout.previewShare,
                  onPreviewShare: setPreviewShare,
                  SessionProvider,
                  renderSlot,
                  /* Locale change proxy: pane labels must follow a language switch. */
                  localeMarker,
                }),
              ),
            )
          }
          const rowGrips = []
          if (layout.rows > 1) {
            let cumulative = 0
            for (let row = 0; row < layout.rows - 1; row += 1) {
              cumulative += columnHeights[row]
              rowGrips.push(
                h(
                  'div',
                  {
                    key: `row-grip-${row}`,
                    className: 'wsplit-row-grip',
                    style: { top: `${cumulative * 100}%` },
                    role: 'separator',
                    tabIndex: 0,
                    'aria-orientation': 'horizontal',
                    'aria-label': t('resizeRow'),
                    'aria-valuenow': Math.round(columnHeights[row] * 100),
                    'aria-valuemin': Math.round(MIN_ROW_FRACTION * 100),
                    'aria-valuemax': Math.round(100 - MIN_ROW_FRACTION * 100),
                    title: t('resizeRow'),
                    onPointerDown: beginRowResize(column, row),
                    onPointerMove: moveDrag,
                    onPointerUp: endResize,
                    onPointerCancel: endResize,
                    onLostPointerCapture: endResize,
                    onKeyDown: nudgeRow(column, row),
                    onDoubleClick: () =>
                      setLayout((prev) => {
                        const matrix = normalizeHeights(prev.rowHeights, prev.cols, prev.rows)
                        matrix[column] = equalHeights(prev.rows)
                        return { ...prev, rowHeights: matrix }
                      }),
                  },
                  h('div', { className: 'wsplit-row-grip-line' }),
                ),
              )
            }
          }
          columns.push(h('div', { key: `col-${column}`, className: 'wsplit-col' }, cells, rowGrips))
        }
        const hasSessions = catalog.candidates.length > 0
        const grips = []
        if (widths.length > 1) {
          let cumulative = 0
          for (let index = 0; index < widths.length - 1; index += 1) {
            cumulative += widths[index]
            grips.push(
              h(
                'div',
                {
                  key: `grip-${index}`,
                  className: 'wsplit-grip',
                  style: { left: `${cumulative * 100}%` },
                  role: 'separator',
                  tabIndex: 0,
                  'aria-orientation': 'vertical',
                  'aria-label': t('resizeColumn'),
                  'aria-valuenow': Math.round(widths[index] * 100),
                  'aria-valuemin': Math.round(MIN_COL_FRACTION * 100),
                  'aria-valuemax': Math.round(100 - MIN_COL_FRACTION * 100),
                  title: t('resizeColumn'),
                  onPointerDown: beginColumnResize(index),
                  onPointerMove: moveDrag,
                  onPointerUp: endResize,
                  onPointerCancel: endResize,
                  onLostPointerCapture: endResize,
                  onKeyDown: nudgeColumn(index),
                  onDoubleClick: () => setLayout((prev) => ({ ...prev, colWidths: equalWidths(prev.cols) })),
                },
                h('div', { className: 'wsplit-grip-line' }),
              ),
            )
          }
        }
        return h(
          Fragment,
          null,
          h('style', { key: 'style' }, CSS),
          h(
            'div',
            {
              className: 'wsplit-root',
              'data-workspace-split': '',
              'data-resizing': drag === null ? 'false' : drag.axis,
              'data-follow': follow ? 'true' : 'false',
            },
            h(
              'div',
              { className: 'wsplit-toolbar' },
              h(
                'div',
                { className: 'wsplit-heading' },
                h('span', { className: 'wsplit-title' }, t('title')),
                h('span', { className: 'wsplit-intro' }, hasSessions ? t('intro') : t('noSessions')),
              ),
              h(
                'div',
                { className: 'wsplit-controls' },
                h(TrackField, {
                  labelKey: 'columns',
                  ariaKey: 'colsAria',
                  value: layout.cols,
                  onChange: (cols) =>
                    setLayout((prev) => ({
                      ...prev,
                      cols,
                      colWidths: equalWidths(cols),
                      rowHeights: normalizeHeights(prev.rowHeights, cols, prev.rows),
                    })),
                }),
                h(TrackField, {
                  labelKey: 'rows',
                  ariaKey: 'rowsAria',
                  value: layout.rows,
                  onChange: (rows) =>
                    setLayout((prev) => ({
                      ...prev,
                      rows,
                      rowHeights: normalizeHeights(prev.rowHeights, prev.cols, rows),
                    })),
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'wsplit-follow',
                    'data-on': follow ? 'true' : 'false',
                    'aria-pressed': follow,
                    title: follow ? t('sidebarFollow') : t('sidebarFollowOff'),
                    'aria-label': t('sidebarFollowAria'),
                    onClick: () =>
                      setLayout((prev) => ({ ...prev, sidebarFollow: prev.sidebarFollow === false })),
                  },
                  h(
                    'svg',
                    {
                      viewBox: '0 0 16 16',
                      width: 14,
                      height: 14,
                      fill: 'none',
                      'aria-hidden': true,
                      focusable: false,
                    },
                    h('rect', { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2, stroke: 'currentColor', strokeWidth: 1.2 }),
                    h('path', { d: 'M6 2.5v11', stroke: 'currentColor', strokeWidth: 1.2 }),
                    h('path', {
                      d: 'M8.5 8h4M11 6l1.5 2L11 10',
                      stroke: 'currentColor',
                      strokeWidth: 1.2,
                      strokeLinecap: 'round',
                      strokeLinejoin: 'round',
                    }),
                  ),
                ),
              ),
            ),
            h(
              'div',
              { className: 'wsplit-grid-wrap', ref: gridRef },
              h(
                'div',
                {
                  className: 'wsplit-grid',
                  style: { gridTemplateColumns: widths.map((value) => `${value.toFixed(6)}fr`).join(' ') },
                },
                columns,
              ),
              grips,
            ),
          ),
        )
      }

      /**
       * Registration wrapper: a panel failure shows a note instead of leaving the
       * whole main column empty.
       */
      function GuardedSplitView(props) {
        return h(SplitBoundary, { tag: 'workspace-split: panel crashed', messageKey: 'splitFailed' }, h(SplitView, props))
      }

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          { name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: () => t('panel'), locale: NS },
          SplitPanelIcon,
        ),
      )

      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            locale: NS,
            children: { [PANE_SLOT]: { kind: 'single', scope: 'session' } },
          },
          GuardedSplitView,
        ),
      )

      ctx.slots.inject(PANE_SLOT, () => ctx.slots.register({ name: PANE_SLOT, locale: NS }, PaneConversation))
    }

    return { inject, apply }
  },
})
