# 学习通与豆包浏览器助手

面向学习通答题页的用户脚本：提取当前题目，交给豆包网页端辅助分析，再把结果回填到页面。学习通端负责取题与回填，豆包端负责对话与回传，两端通过脚本管理器的跨标签存储通信。

English version: [README.en.md](README.en.md)

## 公开脚本

还没装脚本管理器的话，先装 [Tampermonkey](https://www.tampermonkey.net/)，刷新浏览器，再使用下表的安装链接。

| 脚本 | 用途 | 版本 | 文档与安装 |
|---|---|---:|---|
| 学习通豆包助手 | 取当前题目、发送文字或截图、抓取回复、回填答案、页面绑定 | 1.6.5 | [中文](src/chaoxing-doubao/README.md) · [English](src/chaoxing-doubao/README.en.md) · [安装](https://raw.githubusercontent.com/yanguanbai/Chaoxing-link-Doubao/main/src/chaoxing-doubao/chaoxing-doubao.user.js) |
| 纯文本粘贴助手 | 简答题编辑器只粘纯文本，图片仍按原生粘贴 | 1.2.2 | [中文](src/chaoxing-paste-helper/README.md) · [English](src/chaoxing-paste-helper/README.en.md) · [安装](https://raw.githubusercontent.com/yanguanbai/Chaoxing-link-Doubao/main/src/chaoxing-paste-helper/chaoxing-paste-helper.user.js) |

两个脚本是两份独立文件，脚本列表里会各占一条记录。主脚本不含粘贴助手逻辑，粘贴助手也不随主脚本安装。

## 前置依赖

> [!IMPORTANT]
> **需要截图功能时必须安装并启用 Disable Content-Security-Policy 扩展。**
> 学习通页面带 CSP 限制，会拦下脚本从 jsDelivr 加载的 `html2canvas` 以及画布导出，所以不装扩展时**只有截图会失败，文字发送不受影响**。跨页面传递题目与答案用的是脚本管理器的本地存储，和 CSP 无关。装完后**点一下扩展图标确认已启用**（按标签页生效，刷新页面后仍要保持启用态）。
> 入口：[Chrome 版](https://chrome.google.com/webstore/detail/disable-content-security/ieelmcmcagommplceebfedjlakkhpden) ｜ [另一作者版，含 .crx](https://github.com/WithoutHair/Disable-Content-Security-Policy)

> [!IMPORTANT]
> **纯文本粘贴助手是必须单独安装的第二个脚本，不是可选项。**
> 只装主脚本时，学习通简答题编辑器无法正常接收纯文本，答题流程不完整，脚本不能正常使用。请在装完主脚本后，继续点上表第二行的“安装”链接并确认安装；装好后油猴脚本列表里应当出现两条记录。

- **脚本管理器**：Tampermonkey。仅在 Tampermonkey 上验证过，其它管理器未测试。
- **外部库**：主脚本经 jsDelivr 加载 `html2canvas`，仅用于截图。来源核对见 [DISTRIBUTION.md](DISTRIBUTION.md)。

## 安装

1. 安装并启用 Tampermonkey，允许它在网页上运行脚本；需要截图时再装上面的 CSP 扩展。
2. 点击上表对应脚本的“安装”链接，在扩展弹出的安装页确认。两个脚本各点一次。
3. 刷新学习通答题页面（`mooc-ans` 或 `exam-ans`），页面左侧出现可拖动的答题面板即安装完成。

安装确认需要你在浏览器里点一次；网页无法静默安装扩展或脚本。手动安装：脚本面板“添加新脚本”→ 粘贴 `src/` 下对应文件全文 → 保存。

## 项目布局

- `src/` 下是公开脚本及其文档，每个脚本一个子目录，源码、中文说明、English 说明放在一起。
- `tools/sync-readme-versions.mjs` 用各脚本的 `@version` 回填上表版本列；CI 以 `--check` 运行，版本列与脚本不一致就失败。
- `tools/check-userscript-meta.mjs` 校验脚本元数据齐全、`@version` 为 x.y.z。
- `tools/check-docs.mjs` 校验文档里的 raw 安装链接都指向真实存在的文件，并确认每个脚本的 `@downloadURL` / `@updateURL` 指向自身。
- `.github/workflows/ci.yml` 在 Node 22 与 24 上跑语法检查、元数据检查与上面两项校验。
- `CHANGELOG.md` 记录各脚本的逐版本变更；README 只描述用法，不重复维护版本流水。
- `DISTRIBUTION.md` 记录发行前的来源核对、第三方依赖与许可证范围。

## 兼容与隐私

页面匹配只代表脚本会在该地址运行，不代表每种题目布局都能识别；页面改版后题目定位与回填需要重新适配。题目仅在你主动点击发送后进入豆包网页对话，由豆包平台处理；脚本不上传到自建服务器。详见 [主脚本说明](src/chaoxing-doubao/README.md)。

## 许可证

本仓库采用 [MIT 许可证](LICENSE)，两个公开脚本在头部各自声明 `@license MIT`。`html2canvas` 为第三方项目（MIT），经 CDN 在运行时加载，未纳入本仓库；许可证与核对清单位于 [DISTRIBUTION.md](DISTRIBUTION.md)。

本项目按“现状”提供，不保证持续兼容任何第三方网站；用户应自行核对 AI 输出，不应视其为准确答案或专业建议。项目名称中的第三方商标仅用于说明兼容对象。
