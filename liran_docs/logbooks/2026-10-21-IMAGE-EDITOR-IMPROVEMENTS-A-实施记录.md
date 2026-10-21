# IMAGE-EDITOR-IMPROVEMENTS · 批次 A 实施记录

日期：2026-10-21。任务：`IMAGE-EDITOR-IMPROVEMENTS-20261021-01`。用户明确说“开始动工”，确认 A 的 PRD 并授权实现 A；B–G 仍锁定。

## 实施范围

- 修改 `src/adapters/apimart/normalize-result.ts`：在已知的 APIMart 结果字段内收集 URL 字符串；支持结果记录数组和 URL 字符串数组；逐候选校验 HTTP(S)、主机名与无用户名/密码约束。遇到无效项继续下一个候选，不扫描任意未知字段。
- 修改 `tests/adapters/apimart.test.ts`：覆盖 URL 数组中首项非字符串/不安全、后项有效；空数组、全部非法候选、旧字符串输出，以及未知字段不被递归误识别。
- 更新批次 A 的 PRD 状态、转换审计、索引、唯一开发追踪和本实施记录。
- 未修改 A+、其他项目、模型/尺寸/任务合同或公共导出；没有调用真实供应商。

## TDD 与验证

1. 红灯：`node --import tsx --test tests/adapters/apimart.test.ts`，修复前新增嵌套 URL 数组用例失败（期望有效安全 URL，实际 `undefined`）。
2. 绿灯：同一命令修复后通过；adapter 9/9。
3. `npm test`：退出 0，core 8、UI/坐标 14、server 12、adapter 9、guidance 12、client-boundary 1，共 56 项通过。
4. `npm run build`：退出 0，TypeScript 检查、Vite build 与模块构建均通过。
5. `npm run harness:check`：退出 0；`npm run harness:test`：退出 0，11/11。
6. `git diff --check`：退出 0；仅提示工作副本 LF 将转换 CRLF。
7. `npm pack --dry-run --json`：退出 0，包内容 95 项。
8. 在系统临时目录创建隔离消费者，安装本地 tarball 并从 `image-editing-module/adapters/apimart` 公共入口执行 mock 生成：退出 0，拒绝首个不安全 URL 并成功选择安全后项。临时验证目录位于仓库外；未删除临时产物。

## 状态与限制

批次 A 的解析范围与 AC 已实现并通过自动化验证，无公共 API 变化。未对真实 APIMart 服务发请求。A 之外的批次 B–G 未启动；宿主集成、真实模型验收及发布不在本记录范围。最终提交和远端推送待本轮安全暂存后完成。
