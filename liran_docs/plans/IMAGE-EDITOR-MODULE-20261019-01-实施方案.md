# 图像编辑模块提取与接入实施方案

任务：IMAGE-EDITOR-MODULE-20261019-01。PRD 1.0 已确认；按深度 UI 流程分为 3 个目标。目标 1/3 文档门禁、目标 2/3 UI 壳验收、目标 3/3 实现和本地 mock 集成已通过。

## 阶段 0：提交基线与规划 Harness（本轮）

- 来源新品图生成器先提交并推送 `7da64f7ec6dedb6defbf0fe700ad9d62e990c742`，本地与远端核对一致。
- 在本仓库建立本地 Git、规则、文档路由、需求整理、架构方案、当前状态、测试清单和离线 Harness 检查。
- 不拷贝来源源码、不改其依赖或服务，不配置新远端、不创建对外服务。
- 交付条件：方案可独立阅读，真实命令通过，当前限制与未决项清楚。

## 目标 1/3：文档、模块拆分与验收准备

前置已满足：正式 PRD 1.0 用户确认、来源版本核对、独立 Harness 可运行。接口合同、模块任务和测试门禁完成，目标 1 已通过。

| 微观任务 | 目标文件/目录 | 完成条件 |
| --- | --- | --- |
| DOC-01 冻结公开类型边界 | `liran_docs/02-架构方案.md`、`src/core/types.ts` 设计映射 | imageRef 与 previewUrl 分离，sourceId/operationId 语义明确，server/provider 不进入 browser exports |
| DOC-02 对齐图片/提示词/错误合同 | `liran_docs/02-架构方案.md`、`liran_docs/guides/接入指南.md` | 单图、透明 overlay、原文/前后缀、状态与错误范围互相一致 |
| DOC-03 展开代码任务与依赖方向 | `liran_docs/modules/IMAGE-EDITOR-MODULE-20261019-01-模块拆解.md` | 每个模块入口、文件职责、依赖、TDD顺序、完成与回滚条件清楚 |
| DOC-04 建立验收矩阵 | `liran_docs/08-测试用例.md`、`09-真机实测.md` | AC-01–AC-10 映射到自动测试、mock 浏览器、图像/安全验证；无真实模型调用 |
| DOC-05 Harness 与状态审计 | `03-索引.md`、`04-开发追踪.md`、验证记录 | 索引、计划、PRD、任务、验证命令一致；目标1完成证据记录 |

目标 1 退出门禁已通过：PRD 确认状态真实；模块图与 API 契约无冲突；关键公共类型可由测试表达；任务覆盖全部 REQ/AC；范围和验证命令明确。

首个目标不创建远端/发布、不修改宿主、不访问密钥，不安装第三方依赖。React/Node 兼容矩阵和解码像素限制由目标 3 基于实际依赖与资源预算验证后写入。

## 目标 2/3：独立编辑器 UI 壳

此目标在目标 1 完成后开始，先实现可独立预览的编辑器 UI 和交互状态，不接真实服务/API。

- 整理 ImageEditorDialog、Canvas 标注层、工具栏、样式；使用模块自己的局部样式，不复制宿主卡片或全局状态。
- 使用 synthetic preview source、mock execute 和明确的 dispatch/success/error/loading 状态。
- 检查桌面与窄屏、contain 留白映射、空白/超长文案、工具可达性和失败后输入保留。
- 页面样式由 Codex 检查；样式和交互壳通过后才进入目标 3。
- 不接入真实 APIMart、宿主登录、上传或项目版本历史。

目标 2 验收已通过：独立 Vite 预览使用合成 SVG 和 mock execute；完成桌面页面实际截图检查；React/坐标测试 6/6 和生产构建通过。目标 3 已解锁。窄屏需在最终 Express 示例页面补充验收记录。

## 目标 3/3：TDD 实现与隔离演示验收（已通过）

此目标在目标 2 UI 壳页面检查通过后解锁。按无副作用 core 到注入式服务、provider adapter、示例接线的顺序实现。每项先写测试并观察它因行为缺失而失败，再实现最小代码。

| 顺序 | 任务 | 主要路径 | 核心验证 |
| --- | --- | --- | --- |
| 1 | core types、指令校验、prompt builder、坐标 | `src/core/`、`tests/core/` | 原文保留、提示词前后缀、长度/空值校验、contain 映射、无运行时依赖 |
| 2 | 浏览器 overlay 导出合同 | `src/react/`、`tests/react/` | PNG 尺寸、透明背景、undo/redo、来源草稿隔离与重复提交门禁 |
| 3 | 服务用例、输入解码/限制、Sharp 合成 | `src/server/`、`tests/server/` | loader 注入、同尺寸、字节/像素限制、错误阶段、provider 单图参数 |
| 4 | APIMart 上传/提交/轮询/结果 | `src/adapters/apimart/`、`tests/adapters/` | injected fetch、string/array URL、超时/unknown、不泄漏 key、不发送第二张图 |
| 5 | Express 示例路由及可运行 mock app | `examples/react-express/` | 自包含安装、mock 成功/失败、来源固定和结果追加示意 |
| 6 | exports/build/文档与依赖边界 | `package.json`、各入口、README/指南 | 客户端子路径不能导入 server；没有来源 checkout 依赖 |

必须验证单图输入、原文/后缀保留、string/array URL、标注尺寸、错误分阶段、未知提交状态及来源 ID。不发真实模型请求。

此阶段不得照搬现有远程主机过滤并称为完整防护；先冻结 loader 安全责任与默认拒绝边界，再接入服务。

目标 3 交付已包括 package exports/scripts、构建产物 pack dry-run、mock React + Express 示例和同步更新的接入指南。干净 tarball 安装及宿主实际产品集成仍不在范围内。

## 交付分发准备（不含发布）

- 形成明确导出、依赖/peer 依赖和带版本分发产物，提供最小 React + Express 接入示例。
- 仅在用户指定的宿主范围内接入；不自动修改另外四项目。来源项目也不默认重构，需另行确认接入时间与分支。
- 宿主负责 sourceId、当前版本、登录、loader、key getter、操作进度与成功追加；模块负责完整编辑流程。
- 对比接入前后合同：选图正确、单图请求/后缀/模型参数一致、错误保留草稿、成功不覆盖历史、迟到结果不写错版本。

## 内部验收与交付

已完成独立模块自动验证、浏览器 mock 验收、接入说明审阅与安全边界检查。真实模型调用不属于本次 PRD；若后续需要，再单独取得授权并记录实际请求模型、最终 prompt 和结果。

首版无需公共 npm 发布或云部署。验收后提供仓库标签/版本和本地构建产物；用户明确要求归档后再归档，不删除来源功能。

## 分阶段回退

规划阶段无业务回退。提取阶段只在新仓库工作，不影响已推送来源基线。宿主接入应独立提交，保留原入口与适配器以便正常 Git revert；不使用 reset --hard、clean 或强制推送。未通过验证的模块不能替换来源项目的现用链路。

## 预期验证门禁

最终验证执行 `npm run harness:check`、`npm run harness:test`、`npm test`、`npm run build`、`npm audit --omit=dev`、`npm pack --dry-run --json` 和真实浏览器本地 mock 流程；详见[验证记录](../validations/2026-10-19-模块实现验证.md)。
