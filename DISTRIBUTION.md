# 发行来源说明

此文件记录发行前的来源核对范围，不替代法律意见，也不授予任何额外权利。

## 当前发行集合

根 README 表格列出的两个 `.user.js` 脚本是当前公开发行集合，分别位于 `src/chaoxing-doubao/` 与 `src/chaoxing-paste-helper/`。文档、许可证和本说明文件不随脚本安装到浏览器。

## 初步静态检查

- 主脚本声明一个外部依赖：`@require https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js`，`html2canvas` 是独立项目，以 MIT 许可发布，未收录进本仓库，运行时由脚本管理器从 CDN 下载。CDN 不可达时截图功能失效，文字发送不受影响。
- 粘贴助手声明 `@grant none`，没有 `@require` / `@resource` 外部依赖。
- 两个公开脚本头部均声明 `@license MIT`，与仓库根目录的 [MIT 许可证](LICENSE) 一致。许可证声明不等于完成了全部代码来源审计。
- 原有 `@author Bart` 保留；仓库账户名不能单独证明或推翻这个署名。
- 脚本匹配学习通与豆包页面，使用这两家的页面结构与编辑接口；这是运行目标与数据来源，不等同于复制第三方源码。
- 截图依赖浏览器扩展 Disable Content-Security-Policy 松开页面 CSP，该扩展是用户自行安装的独立软件，不属于本仓库发行内容。
- Tampermonkey 是独立浏览器扩展，本仓库不分发它。

## 发布前人工核对

1. 确认两个公开脚本均由 Bart 编写，或已取得其中所有第三方代码的再发行许可。
2. 检查内嵌代码、复制粘贴片段、图片与 README 内容的来源；保留上游要求的版权与许可证文本。
3. 确认仓库账户有权发布这些脚本，并检查 Git 历史中是否存在不应公开的密钥、个人信息或无权分发材料。
4. 发布时核实每个 raw 安装/更新地址返回的是对应脚本（路径为 `src/<脚本名>/<脚本名>.user.js`），并确认脚本管理器能识别版本更新。
5. 检查仓库与文档中不包含真实账号、考试标识、题目与答案等个人数据。

## 外部依赖

| 依赖 | 版本 | 许可 | 分发方式 |
|---|---|---|---|
| html2canvas | 1.4.1 | MIT | 运行时经 jsDelivr 加载，未收录 |
| Tampermonkey | — | 各自许可 | 用户自行从扩展商店安装 |
| Disable Content-Security-Policy | — | 各自许可 | 用户自行从扩展商店安装 |

html2canvas 项目地址：https://github.com/niklasvh/html2canvas ，所用版本的许可证文本：https://github.com/niklasvh/html2canvas/blob/v1.4.1/LICENSE 。

## 许可证

本仓库整体采用 [MIT 许可证](LICENSE)，覆盖两个公开脚本与文档。各脚本头部保留自己的 `@license` 声明，与本仓库 LICENSE 一致。

运行时加载的 `html2canvas` 版权与许可归原作者，未随本仓库分发；如需离线打包，应随附其许可证原文。
