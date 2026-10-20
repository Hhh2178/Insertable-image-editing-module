# IMAGE-EDITOR-MODULE-20261019-01 模块拆解

状态：PRD 已确认；目标 1/3、目标 2/3 和目标 3/3 均已通过。表中源码和测试路径已实现，导出以 `package.json` 与 `index.ts` 为准，执行证据见[实施方案](../plans/IMAGE-EDITOR-MODULE-20261019-01-实施方案.md)。

## 总体依赖方向

```text
core  ←  react
  ↑        ↑
server  ←  example host UI
  ↑
adapters/apimart
```

准确约束：

- `core` 是只含通用类型/纯函数的依赖根。
- `react` 只能依赖 `core` 和 React peer dependency。
- `server` 依赖 `core`，但图片读取、鉴权主体、provider 与配置由构造参数注入。
- `adapters/apimart` 实现 server 使用的 provider contract；Node HTTP、凭证和 Sharp 都留在 server 侧依赖图。
- `examples/react-express` 是宿主组合示例，可以依赖所有入口；生产 UI 入口不得依赖示例代码。
- 不允许模块层引用 `Plan`、`ProductData`、来源应用路径或特定宿主 store。

## 目标目录与职责

| 目标路径 | 公开/内部职责 | 依赖 | 主要验收 |
| --- | --- | --- | --- |
| `src/core/types.ts` | source、edit input/result/failure、provider 与 service contracts | TypeScript 类型 | 已实现；分离 imageRef/previewUrl |
| `src/core/validation.ts` | 必填文本、2,000 字数、来源和 overlay 输入结构检查 | 无 | 已测空白、长度边界和错误 code |
| `src/core/prompt.ts` | 标注前缀、用户原文、保真后缀和混合语言语义 | 无 | 已测中英/混合语言、原文保留、标注分支 |
| `src/core/image-coordinates.ts` | contain 区域映射、留白 inside 判定、归一化点 | 无 | 已实现并测零尺寸/留白 |
| `src/core/errors.ts` | 错误阶段、提交状态、无敏感明文的错误构造 | 无 | 已测 cause 不进入安全序列化 |
| `src/react/ImageEditorDialog.tsx` | 受控弹窗、Canvas、工具栏、文本计数、提交/宿主回调 | `core`、React | 已实现；React/坐标/叠合回归测试 7/7 |
| `src/react/editor.css` | 组件范围内 token/layout/responsive 样式 | CSS | 不产生宿主全局样式副作用 |
| `src/server/decode-overlay.ts` | Data URL/Base64 严格解析、overlay 解码和尺寸检查 | Sharp/Node Buffer | 已测格式、大小、像素和尺寸限制 |
| `src/server/compose-marked-image.ts` | 合成 PNG 副本，不更改输入 Buffer | Sharp | 已测输出尺寸和输入不可变 |
| `src/server/edit-image.ts` | 编排校验→受控 loader→合成→prompt→provider→结果 | `core`、注入依赖 | 已测调用顺序、单图和 ID 保留 |
| `src/adapters/apimart/client.ts` | 注入 fetch、APIMart Authorization、超时、上传/任务/轮询 | Node fetch | 已测 mock transport；不在 browser export graph |
| `src/adapters/apimart/normalize-result.ts` | 解析 string/array 图片 URL 和 task id | `core` | 已测有效 HTTP(S)、空/不安全结果拒绝 |
| `examples/react-express/server.ts` | Express mock loader/provider 与 Vite 页面组合 | 所有显式入口 | mock 路由测试 2/2；无真实 key |
| `tests/` | core、React、server、adapter 和边界集成测试 | 对应测试工具 | TDD 与真实模块行为断言，不测 mock 自己 |

## 接口不变量

1. `sourceId` 标识宿主版本；`imageRef` 是服务端受控 loader 的不透明引用；`previewUrl` 仅供浏览器展示。三者不得互相回退/替代。
2. 模块创建/绑定 `operationId` 后，在请求、错误和结果中保持一致。结果写回归属由宿主按两个 ID 检查。
3. `markedOverlayPngDataUrl` 是透明 PNG 编辑层；本地服务先按源图像素尺寸合成，APIMart adapter 每个任务最多接收一张最终图片。
4. `onDispatched` 指宿主浏览器 transport 调用 fetch 的时点，不代表远端响应或供应商受理。`submissionState` 在服务端错误中标记提交状态。
5. `ImageEditFailure` 对外仅返回 `code/stage/safeMessage/retryable/submissionState`；内部异常不隐式转 JSON。
6. `onError` 后 UI 不清草稿。宿主以原 source 重新打开时恢复草稿；成功后再清理。未知提交状态锁定自动重试。
7. 模块不负责保存宿主历史版本、不直接抓取 arbitrary URL，也不在前端读取供应商 key。

## TDD 微任务与顺序

| ID | 先写的行为测试 | 实现后完成条件 |
| --- | --- | --- |
| MOD-01 | prompt 构造与输入边界测试 | core 输出与 PRD 原文/后缀完全一致 |
| MOD-02 | contain 坐标和零尺寸测试 | UI 画布与原图归一化位置一致 |
| MOD-03 | 错误脱敏和 submissionState 序列化测试 | safe errors 不序列化敏感 cause |
| MOD-04 | 画布绘制历史/清空/导出测试 | UI 壳工具行为符合 PRD，源图不可变 |
| MOD-05 | overlay Data URL/格式/大小/尺寸测试 | 恶意或错尺寸 overlay 在合成前被拒绝 |
| MOD-06 | Sharp 合成输出合同测试 | 输出是同像素尺寸 PNG，源 Buffer 原样不变 |
| MOD-07 | edit use case 编排测试 | provider 总是只收到一张最终图，宿主 loader 被调用 |
| MOD-08 | APIMart upload/task/poll 协议测试 | 模型参数、结果解析和 unknown 错误状态正确 |
| MOD-09 | React execute 状态时序测试 | 准备失败留窗、派发关闭、失败保留草稿、成功清理 |
| MOD-10 | example host integration test | 固定 sourceId，成功只追加到对应版本，不触碰真实供应商 |
| MOD-11 | package export/import boundary test | browser entry 不带 server/Sharp/Node/provider key |
| MOD-12 | 干净环境安装、构建和 mock 页面检查 | 不读取来源 checkout，指南命令与真实 scripts 一致 |

每个微任务先运行针对测试观察预期 RED，再实现、GREEN、必要的局部重构。目标 2 UI 壳和目标 3 core/server/adapter/example mock 验收均已完成；画布在真实浏览器中验证与原图叠合、标注编辑失败后恢复草稿并重试成功。

## 已知决策与待测参数

- APIMart 默认模型/size/resolution：`gemini-nano-banana-2.1` / `auto` / `1K`。
- 图像单图输入：无标注原图；有标注合成图。不会传原图+合成图两张。
- source 和 overlay 字节上限默认为 20 MiB；解码像素上限默认为 24,000,000，且合成图还需满足 upload 字节上限。
- UI package peer 支持 React 18+；当前环境通过 Node 24 构建，生产依赖安全审计通过。干净 tarball 安装尚未执行。
- 本任务不创建 .env 实例文件、不写入真实 key、不设置公共发布仓库。
