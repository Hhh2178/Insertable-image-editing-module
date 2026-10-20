# 图像编辑功能板块

这是独立的、可移植的图像编辑模块仓库，按已确认的 `IMAGE-EDITOR-MODULE-20261019-01` PRD 拆分。模块包含 React 编辑器、纯逻辑、Node 服务端处理、Sharp 标注合成和 APIMart 图像任务适配器，并提供不调用外部服务的本地 mock 示例。

**当前阶段：目标 1/3 文档门禁、目标 2/3 UI 壳验收和目标 3/3 跨层实现/本地 mock 集成验收均已通过。** 当前实现和验证证据见[开发追踪](liran_docs/04-开发追踪.md)。仓库没有已配置的远端，也没有发布 npm 包。

## 模块入口

| 导入入口 | 能力 | 适用环境 |
| --- | --- | --- |
| `image-editing-module` 或 `/core` | 类型、输入校验、提示词、错误合同、坐标换算 | 浏览器或 Node |
| `image-editing-module/react` | React 编辑器弹窗和局部样式 | React 18+ 前端 |
| `image-editing-module/server` | 注入 loader/provider 的编辑服务、PNG 解码与 Sharp 合成 | Node 服务端 |
| `image-editing-module/adapters/apimart` | APIMart 上传、Nano Banana 2.1 任务提交/轮询和结果规范化 | 仅 Node 服务端 |

接口和宿主边界见[架构方案](liran_docs/02-架构方案.md)，跨项目接线步骤见[接入指南](liran_docs/guides/接入指南.md)。`previewUrl` 只用于浏览器显示；服务端只用宿主提供的受控 `imageRef` loader 读图。编辑结果带回固定的 `sourceId` / `operationId`，由宿主追加为新版本。

有笔迹时，后端先把透明 PNG 合成到所选原图副本，再将合成图作为唯一模型输入；无笔迹时发送原图一张。提示词保留用户原文和保真后缀。APIMart 凭证只由服务端读取。本仓库不执行真实 APIMart 请求，也不在示例设置密钥。

## 安装、测试和构建

需要 Node.js 20 或更新版本及 npm。根 Harness 命令和产品功能命令如下：

```powershell
npm ci
npm run harness:check
npm run harness:test
npm test
npm run build
```

`npm test` 覆盖 core、React 交互/坐标/画布叠合样式、Express mock 服务、Sharp 图像处理、APIMart mock 协议和浏览器导入边界。`npm run build` 同时做类型检查、构建独立预览页，再生成四个显式模块入口及 React CSS。

本地启动 React + Express mock 示例：

```powershell
npm run example
```

默认仅监听 `127.0.0.1:3020`。示例使用仓库内合成 SVG，服务端本地转换并通过 mock provider 返回占位结果；页面交互不需要 APIMart key，不会把图片发送到外部。可通过 `PORT` 环境变量更换本地端口。`npm run dev` 单独启动仅包含 UI 壳的 Vite 预览。

构建后的模块入口位于 `dist/module/`。`npm pack --dry-run --json` 已验证本地分发清单包含四个导出入口、声明文件和 React CSS（63 个文件）；项目设置为 `private`，不得将包发布到公共 npm。当前验证没有生成或发布 tarball。

## 后续在其它产品接入

1. 宿主冻结当前图片版本的 `sourceId` 与不透明 `imageRef`，将 `previewUrl` 仅传给前端展示。
2. 前端导入 `image-editing-module/react`，接入其 execute 函数和关闭、成功、结构化错误回调；宿主继续管理进度与版本历史。
3. 宿主服务先鉴权，再提供受控 loader 和图片权限；接入 `image-editing-module/server`。
4. 服务端密钥管理注入 APIMart key getter，再使用 `image-editing-module/adapters/apimart`。密钥不可进入浏览器包、props、错误或日志。
5. mock 验收通过后由宿主保存结果并按返回的两个 ID 追加到对应版本。迟到结果不得写到用户后来选中的其它图片。

详细操作、失败恢复、图片安全和验收表见[接入指南](liran_docs/guides/接入指南.md)。本次不接入新品图生成器或另外四个项目；宿主接入需单独确认范围。

## Harness 与文档入口

- [规则与范围](AGENTS.md)
- [正式 PRD 1.0](liran_docs/requirements/IMAGE-EDITOR-MODULE-20261019-01-PRD.md)
- [分阶段计划](liran_docs/plans/IMAGE-EDITOR-MODULE-20261019-01-实施方案.md)
- [当前状态](liran_docs/04-开发追踪.md)
- [验收清单](liran_docs/08-测试用例.md)
- [页面验收记录](liran_docs/09-真机实测.md)
- [文档路由](liran_docs/03-索引.md)
