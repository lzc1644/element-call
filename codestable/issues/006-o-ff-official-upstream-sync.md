---
kind: issue
title: 同步官方上游并验证自托管功能
type: ff
status: open
created: 2026-10-13
---

# 同步官方上游并验证自托管功能

按用户要求，将官方 `element-hq/element-call` main 的 `b158c4fc` 合入本地 `02b76c0d`：新增 140 个上游提交（107 个非合并提交），解决 13 个冲突。优先采用官方连接/鉴权、快捷音频菜单、组件集成及唯一布局计算入口；保留全员结束、弱网恢复、媒体切换、移动端悬浮胶囊、共享全屏/隐藏成员和小窗尺寸。备份分支为 `backup/upstream-sync-02b76c0d`。代码合并与检查完成，用户已授权生成本地合并提交；未 push、部署或关闭既有事项。

- 改动：窄屏共享展开迁入 `src/state/layoutMedia.ts` 并补纯函数与移动端双循环回归；fork 消费者适配官方 `useBehavior/useValueBehavior` 和 SDK slot/API；组合官方菜单可见性与胶囊隐藏动画/滚动空间。`vite-component.config.ts` 补结束通话所需 SDK external。现有 e2e 按真实 hover、widget 权限批准、轮播可视区域及官方“大通话发言人 + 成员列表”布局修正，未强制点击或减少参与者总数。旧 issue 005 仅被格式化。
- 验证：完整 `pnpm lint`、`pnpm format`、`pnpm test --run`、`pnpm i18n:check` 通过（124 文件、1095 通过、9 个既有跳过）；full/embedded/SDK/component 四目标构建通过。隔离 Docker 后端的最终 Chromium/mobile 批次 19 条 e2e 全部通过，另有 5 条组件通话与新鉴权/回退集成测试通过；覆盖加密群通话双方分别结束后 widget 关闭、消息输入恢复及 membership 清空，共享轮播、小窗视频播放/恢复、8 人移动端最后一行访问、窄屏共享展开/恢复、音频设备菜单和组件宿主交互。
- 测试隔离：合并树的临时副本使用 3002 前端、3001 component harness、独立 Compose project 和独立数据目录；只在本地 Synapse 创建测试账号/房间。原 `public/config.json` 校验和未变，用户 3000 dev 仍返回 200，其他服务未动。测试结束后新容器/网络已停止并移除，忽略目录中的数据、日志和失败 traces 保留。
- 边界：Android/iPhone 用 Chromium 设备模拟，不代表原生 Element X、SchildiChat 或 WebKit 实机验收。不是全仓库 e2e 全跑，也没有核验真实麦克风硬件释放。运行日志包含 React ref、ResizeObserver 和部分密钥准备告警，不能描述为“控制台零告警”。详细执行记录、完整上游提交列表及测试证据在忽略的 `agent-workspace/upstream-sync/`。
- codestable：既有事项不关闭；已知漂移是 `spec/index.md` 的“首个参与者选择整个通话 backend”描述，新官方结构按发布端传输及订阅连接管理。正式收尾时复核并回写这一事实，本轮不把本地合并写成已部署现实。
