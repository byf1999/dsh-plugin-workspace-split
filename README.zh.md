[English](./README.md) | **简体中文**

# 多工作区分屏视图

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI
插件：在一个 `行 × 列` 网格里同时渲染多个**实时会话**，把两个以上的工作区并排放在
一屏里——不只是看，而是直接使用：每个格子都是真实对话，不是缩略图。

```
┌───────────────────────────┬───────────────────────────┐
│ 工作区 A · 会话 1         │ 工作区 B · 会话 2         │
│ ……对话内容……              │ ……对话内容……              │
│ ……输入框……                │ ……输入框……                │
├───────────────────────────┼───────────────────────────┤
│ 工作区 C · 会话 3         │ 工作区 D · 会话 4         │
└───────────────────────────┴───────────────────────────┘
```

## 功能

- **网格化的实时会话** —— 1–3 列 × 1–3 行（最多 9 格），每格都是带输入框、可流式输出的真实会话。
- **可拖动、按列独立的布局** —— 拖动列间分隔条调整列宽；每列各自保留**自己的**行高。
- **逐格路由** —— 每个格子可切换工作区或会话，用自带的“新建会话”流程在该格所属工作区新建会话，
  或用 `↗` 把会话弹回普通单会话视图。
- **侧边栏联动** —— 分屏打开时，从左侧边栏打开会话会填入某个格子，而不是替换整个分屏视图；
  想要原生行为时可用行内开关关闭。
- **格内文件预览** —— 会话里的文件链接会在本格内停靠一个只读阅读器（宽格在右侧、窄格在下方），
  分隔条可拖动；文本带行号与分页，图片直接显示，其它类型提供“用系统应用打开”。
- **格内改动评审** —— 回答末尾的“已编辑文件”汇总会在同一个停靠区打开评审：列出本轮改动文件及增删行数，
  并可查看所选文件的统一 diff。
- **记住布局** —— 行列数、尺寸、各格会话与联动开关保存在 `localStorage` 的
  `dsh.workspace-split.v1` 下。
- **中英文界面** —— 全部可见文案均已本地化。

## 兼容性

| 项目 | 值 |
| --- | --- |
| Harness 运行时 | `>= 0.2.1-rc.3`（`engines.dsh`） |
| Harness 界面 | Web（`platform: "web"`），桌面端或浏览器 |
| React | 由 Harness 客户端模块表提供 |

格子渲染的是自带的会话视图，并读取若干客户端服务（`sessions`、`slots`、`locale`、
`workspaces`、`layout`，以及可选的 `remote`、`sidebarRight`、`uiWorkspace`）。
它们属于已发布的客户端 API，但未来的 Harness 可能改名；`engines.dsh` 声明了实测范围，
服务缺失时插件会降级（该格显示提示，而不是让整个主区域崩掉）。

## 安装

### 从插件市场安装

1. 在 Harness Web UI 打开**插件 → 发现**。
2. 添加包含本插件的市场索引地址，找到 **Workspace Split View / 多工作区分屏视图**，点击**安装**。
3. 重启 DeepSeek Harness，让配置档重新加载 bundle。

### 用 `plugin_manager` 工具安装

让 agent 调用 `plugin_manager` 的 `install_bundle`，target 填
`dsh-plugin-workspace-split`（从 npm 安装）或某个 checkout 的绝对目录（开发用 `link:` 安装）。
如果配置档把它保持为禁用状态，请启用该 bundle，然后重启。

### 从本地 checkout 安装（开发）

调用 `plugin_manager` 的 `install_bundle`，target 填本目录的绝对路径
（配置档会保存为 `link:` 依赖）；若配置档将其保持禁用，请启用后重启 Harness。

无需构建步骤：`client.js` 就是普通浏览器模块，`index.js` 是空的 Host 入口。

## 卸载

在**插件**页禁用或移除该 bundle：网格面板消失，主列回到普通单会话视图；
从配置档卸载包还会移除侧边栏面板按钮。`localStorage` 里的布局键可单独删除。

## 使用

1. 点左侧边栏面板列表里的四分格图标（在*插件* / *计划任务*下方），在中央列打开**分屏视图**。
2. 选择 `列` 和 `行`（各 1–3）。格子首次出现时按工作区各填一个会话，最近更新的在前；
   新格子继续在工作区之间轮转。手动清空的格子会保持空。
3. 拖动列间分隔条调整列宽（每列至少 12%）；双击分隔条，或聚焦后按 Enter/Space/Home
   恢复均分；←/→ 每次微调 2%。行数大于 1 时，每列还有独立的横向分隔条，只改变该列的行高。
4. 每个格子头部包含：**工作区选择**（该工作区最新会话，或新建）、按工作区分组的
   **会话选择**、`＋`（在该格所属工作区新建会话）、`↗`（在普通视图中打开）。
5. 工具栏最右侧按钮切换**侧边栏联动**（默认开启）。接收会话的格子依次是：你最后点击的格子、
   第一个空格子、已显示该工作区的格子、第 0 格；被接管的格子会闪一下。
6. 文件链接和回答末尾的**已编辑 N 个文件**卡片会在同一格内打开阅读器。拖动细分隔条调整
   占比（格子的 18–78%），双击（或聚焦后 Enter/Home）恢复默认，←/→ 每次微调 2%；
   `Esc` 或**关闭**收起；文本文件可用**加载更多**分页，图片内联显示，其它类型提供
   **用系统应用打开**。

## 实现要点

插件只有一个客户端模块（`client.js`）和一行 Host 入口。面板复刻自带的
`main` → `main.conversation` 链路：

```
main[key=workspace-split]                 SplitView    （声明格子插槽）
  workspaceSplit.pane（single, session）  PaneHost → SessionProvider
    conversation.content 工厂              自带 Chat 视图（embedded 变体）
```

每格持有一个 Session 引用，并用 `SessionProvider` 标准座位绑定，
所以嵌入的会话跟随自己的会话，而不是主列当前选中的会话。布局是 CSS grid，
`grid-template-columns` 来自持久化的比例；分隔条绝对定位，由指针事件驱动，
并提供等效的键盘操作。

自带界面有两处假定右侧栏已挂载，而全局面板占用 `main` 时并非如此：

- 文件链接调用 `sidebarRight.openResource("dsh-resource://file/…")`；
- 已编辑文件卡片调用 `sidebarRight.openResource(
  "dsh-resource://changes-review/session/<session>/<seq>/<turn>", {params:{index}})`。

插件包裹了 `ctx.sidebarRight.openResource`：文件地址转为格内阅读器，改动评审地址转为格内评审
（读取右侧栏自己的同源路由 `api/changes.summary` 与 `api.changes.diff`），其它地址和错误保持原生行为。
两个停靠区均为只读，且不遮挡对话。

## 开发

```bash
npm run check    # 语法、manifest、中英文键对齐、CSS 引用、市场索引
npm run market   # 重新生成 market/index.json（npm 源）
npm run market -- --git --commit=<40 位提交>   # 或改为指向某个 Git 提交
npm run pack     # 发布检查 + 在 ./dist 打出 npm tarball
```

没有打包器：`client.js` 由 Harness 客户端模块加载器直接加载
（`window.__ModuleLoader__.load({ id, factory })`，只允许 `require('react')`）。
请保持普通 ES2022 写法，使用 `React.createElement` 调用。界面文案在 `client.js` 中
`CSS` 旁边的 `zh` / `en` 字典里；插件元数据在 `locale/en.json`、`locale/zh.json`。

把 `localStorage['dsh.workspace-split.debug']` 设为 `'1'`，可让预期降级路径输出诊断日志。

## 已知限制

- 全局面板激活时右侧栏被卸载，其页签不可用；本插件只覆盖上述两条点击路径，而非所有依赖侧边栏的操作。
- 联动模式会拦截会话切换；用格子的 `↗` 或工具栏开关回到原生单会话行为。
- 改动 diff 只读，且一次显示一个文件。
- 这里用到的 Harness 客户端服务是已发布 API，而非正式稳定契约；超出声明范围升级 Harness
  时可能需要同步更新插件。

## 许可证

[MIT](./LICENSE)
