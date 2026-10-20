# IMAGE-ITERATION-20261020-01 模块拆解

状态：PRD 1.0 已确认；目标 1/3 文档合同、目标 2/3 UI 壳验收、目标 3/3 服务编排与本地 mock 集成均已完成。仅适用于新增指导重生链路，原编辑模块拆解见 [IMAGE-EDITOR-MODULE-20261019-01](IMAGE-EDITOR-MODULE-20261019-01-模块拆解.md)。

## 依赖方向

```text
guidance/core ← guidance/react
      ↑              ↑
guidance/server ← example host
      ↑
host-injected model and storage functions
```

指导层只认识通用上下文、prompt 和注入回调；不认识 `Plan`、`ProductData`、用户 store、商品 API 或指定服务商。图像编辑仍调用当前既有 `ImageEditorDialog` 和 `createEditImageService`。

## 微任务和测试先行顺序

| ID | 目标文件 | 先写的失败行为测试 | 实现后合同 |
| --- | --- | --- | --- |
| ITER-01 | `src/guidance/types.ts`、`prompt.ts`、`validation.ts` | 模板 input/output 边界；空/超长拒绝；extra key 和非法状态拒绝 | 纯逻辑、版本化模板、完整 prompt 输出 |
| ITER-02 | `src/guidance/server.ts` | 非空/空 guidance 调用次数；校验失败不生成；修订 prompt 直传 | 注入 loader/rewrite/host validator/generator，无默认 provider |
| ITER-03 | `src/guidance/server.ts` | 生图失败后 retry 不再 rewrite；未知受理不二次提交 | pending candidate 固定来源和 operation，区分 retry 类型 |
| ITER-04 | `src/react/GuidedRegenerationDialog.tsx` 和 UI shell | 计数/空文本分流/关闭时序/失败恢复/重复提交 | 可选 guidance React 导出，不耦合宿主路由 |
| ITER-05 | `src/App.tsx`、`examples/react-express/server.ts` | 三操作 mock 新版本及结果预览；来源分支正确 | 本地可见图片结果、session 版本和失败注入 |
| ITER-06 | `package.json`、`scripts/check-client-boundary.mjs` | package contract 与 browser dependency boundary | 新路径 exports 和 server/browser 隔离 |
| ITER-07 | README、架构、接入指南、Harness 与验证 | Harness 发现缺失文件/坏链接；文档接口和 exports 对齐 | 接入说明反映实装 API，旧编辑文档保持原结论 |

## 不变量

1. 非空指导成功路径仅一次文本改写，且普通生图收到完整 `revisedImagePrompt`，不能重新拼回旧 prompt。
2. 空白指导不触发文本模型；图像编辑也不触发指导改写。
3. 服务端按已授权 source ID 装载真实上下文；客户端只能发送 operation ID、来源 ID、模式和用户指导。
4. 宿主负责策划 schema 校验、模型路由、密钥、普通生图、版本持久化与权限；模块不把这些职责挪进公共接口。
5. 候选改写与已生成图片的版本 prompt 分开保存；编辑短指令不覆盖完整生成 prompt。
6. 生成失败只重试图像；受理未知不自动重发；所有结果绑定提交时固定的来源版本。
7. 所有新的生产函数均应由具体行为测试驱动；不得先写实现后补测试。

## 文档/验证路由

- 需求和验收：[`IMAGE-ITERATION-20261020-01-PRD`](../requirements/IMAGE-ITERATION-20261020-01-PRD.md)、[`08-测试用例`](../08-测试用例.md)
- 实施顺序：[`实施方案`](../plans/IMAGE-ITERATION-20261020-01-实施方案.md)
- UI 页面：[`UI 壳验收`](../ui-shells/IMAGE-ITERATION-20261020-01-UI壳验收.md)
- 唯一状态：[`04-开发追踪`](../04-开发追踪.md)
