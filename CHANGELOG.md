# 更新日志

记录本仓库两个用户脚本的版本变更。README 只描述通用用法，逐版本明细以此文件为准。

- 版本号以脚本头 `@version` 为准；文件名和提交信息不作为版本依据。
- 未特别标注的条目均属于主脚本 `chaoxing-doubao.user.js`；粘贴助手 `chaoxing-paste-helper.user.js` 单独成节。
- `1.6.0` 之前的版本没有逐条留档，不做补录，也不据旧 README 的措辞反推。

---

## 主脚本 `chaoxing-doubao.user.js`

### 1.6.2

- 发布整理：脚本改名为标准 `.user.js` 形式，`@downloadURL` / `@updateURL` 统一指向 GitHub 仓库。
- 新增安装首页 `index.html`、MIT 许可证与第三方依赖声明。

### 1.6.1

- 新增“打开豆包”按钮。
- 发送规则、文字或截图时，没有可用豆包页面就尝试打开目标页，新页面读取待处理消息。
- 豆包页面增加心跳登记，减少重复打开页面和消息漏收。

### 1.6.0

- 修复路由变化时重复创建面板、重复注册监听；避免在 iframe 内重复运行。
- 豆包页面绑定管理移入设置菜单，支持查看状态、改绑和清除绑定。
- 记忆“自动下一题”“跳过已答题目”两个开关。
- 文字与截图优先取当前可见题目区域，取不到时直接报错，不再整页发送。
- 判断题按页面实际选项输出：显示“正确/错误”返回文字，显示“A/B”返回字母。

### 1.6.0 之前

未留档。

---

## 粘贴助手 `chaoxing-paste-helper.user.js`

### 1.2.1

- 随主脚本一起整理发布元数据：补 `@license`、`@homepageURL`、`@supportURL`、`@downloadURL`、`@updateURL`。
- 功能沿用：识别剪贴板中有图片时走原生粘贴，只有文本时转为纯文本粘贴并保留换行。

### 1.2.1 之前

未留档。

---

## 文档变更

不属于脚本版本，仅记录 README / 仓库结构的调整。

- 仓库结构重建：脚本移入 `src/<脚本名>/`，每个脚本配中英两份 README；根目录对齐同账号的脚本仓库结构（`README.md`、`README.en.md`、`DISTRIBUTION.md`、`LICENSE`、`.gitignore`、`CHANGELOG.md`）。`@downloadURL` / `@updateURL` 与所有 raw 安装链接同步改到 `src/` 路径。
- 引入 CI 与配套工具，`ci.yml` 在 Node 20/22 上跑语法检查、脚本元数据检查、README 版本列校验与文档链接校验；`tools/sync-readme-versions.mjs` 用 `@version` 回填根 README 版本列，`tools/check-docs.mjs` 校验 raw 安装链接与更新地址。
- 补英文文档：根目录 `README.en.md`，两个脚本各配 `README.en.md`，与中文版章节一一对应。
- 移除安装首页 `index.html`，安装入口统一放在根 README 表格的 raw 链接，避免两处链接各自失效。
- `THIRD-PARTY-NOTICES.md` 并入 `DISTRIBUTION.md`，改为记录发行来源核对、外部依赖与许可证范围。
- 安装章节按仓库发行方式重写：raw 一键安装、扩展按 `@updateURL` 自动检查更新、Greasy Fork 发布位与双装冲突提示。
- 补上原先漏写的前置依赖：Disable Content-Security-Policy 扩展必须单独安装；粘贴助手是独立的第二个用户脚本，不是主脚本的可选模块；补充截图失败的排查顺序。
- 文档改为通用写法：README 不再绑定具体版本号，逐版本明细移入本文件。

---

## 发布检查清单

1. 改脚本头 `@version`，并在本文件新增对应版本小节。
2. 确认 `@downloadURL` / `@updateURL` 指向 `src/<脚本名>/<脚本名>.user.js`，即 `main` 分支上的实际路径。
3. README 只在功能取舍或安装方式变化时才需要改；纯版本号变化不动 README。
4. 覆盖安装验证：绑定、开关设置应当保留。
