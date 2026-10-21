# IMAGE-EDITOR-IMPROVEMENTS-20261021-01 · 批次 A 流程评分

评分范围仅为 APIMart 结果 URL 数组解析修复；B–G 不计入本子批次。来源证据见[A 批次需求整理](IMAGE-EDITOR-IMPROVEMENTS-20261021-01-A-需求整理.md)和[正式 PRD](IMAGE-EDITOR-IMPROVEMENTS-20261021-01-A-PRD.md)。

| 维度 | 分数/20 | 证据 |
| --- | ---: | --- |
| 项目现状 | 4 | 解析器及 adapter 用法明确；失败可由当前 helper 的字段处理和既有测试缺口定位。 |
| 修改规模 | 3 | 预计仅改一个纯函数及 adapter 测试，不新增公共 API。 |
| 依赖与修改后影响 | 4 | helper 被 APIMart adapter 的上传/生成结果规范化调用；该 helper 输出影响成功 URL，但不改调用签名。 |
| 风险与回滚 | 5 | URL 安全验证仍保留；限定字段和旧字符串回归；可局部回退 helper。 |
| 验证复杂度 | 4 | 可用确定性单元/adapter 测试、全量测试、构建、Harness 和 tarball smoke 验收；无需真实模型。 |
| **总分** | **20/100** | **轻量流程**：单一解析缺陷、窄范围、可自动回归。 |

本评分不覆盖多模型配置、尺寸工具、任务恢复、prompt-only、诊断、发布或宿主接入；如范围扩展须重新评分。
