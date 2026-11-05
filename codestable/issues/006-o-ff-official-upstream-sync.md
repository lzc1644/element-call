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

## 2026-10-29：继续同步官方 SDK 迁移

按用户本轮授权，将 `3104478f` 与官方 main `8a987b4d` 做未提交合并：129 个新增提交（109 个非合并提交），处理 18 个冲突路径；回退分支为 `backup/upstream-sync-3104478f`。第一版完成后交接，等待用户确认再进入完整质量检查与提交。

- 改动：采用官方独立 MatrixRTC SDK、鉴权/连接复用、参与者匹配、浮动 tile 与依赖版本；删除被官方迁移替代的旧 LocalMember、Publisher、ConnectionFactory 及旧测试。保留全员结束及失败反馈、自动重连预算、媒体权限预检、Android 路由恢复、悬浮胶囊/成员滚动、共享轮播/全屏/隐藏成员与 PiP 尺寸。弱网发布竞态和“只恢复自己暂停的轨道”迁到 SDK Publisher/LocalMedia，并迁移回归测试；官方已覆盖的发布意图、共享音频与连接重建不另建一套实现。
- SDK 边界修正：终止模块从当前 `participation.slot.members$` 取成员，不重新查询默认 `client.matrixRTC` session。SDK 只补通用的成员事件 ID/创建时间行为，供调用层维持旧事件隔离与成员离开宽限；覆盖非默认 slot、默认 session 不可读取、成员事件更新、跨房间拒绝与 scope 清理。原显式传入 JS-SDK session 的 reader 入口仍可用。
- 验证：冻结依赖安装成功；定向单元合计 21 文件、350 通过、7 跳过，4 文件 Chromium Storybook 共 38 通过；TypeScript、改动文件 oxlint/format 与 SDK/component externals 检查通过。已查看移动端胶囊、共享音量浮层和 300×300 PiP 的真实浏览器截图。完整 gates、各构建目标及连接真实后端的 e2e 尚未执行；浏览器故事是合成媒体场景，不替代原生手机、真实媒体或多宿主通话验收。日志保留了 jsdom CSS 解析及 React ref/设备枚举告警。
- codestable：保留上一轮和其他事项，不关闭；`spec/index.md` 的 SDK/传输描述仍待正式收尾毕业。完整提交清单、冲突处理说明、截图和检查日志见 `agent-workspace/upstream-sync-2026-10-29/`。未 push 或部署。

### 方向确认后的完整验证

用户确认第一版方向并授权继续验证。完整 `pnpm lint`、`pnpm format`、`pnpm test --run`、`pnpm i18n:check` 通过：139 文件、1229 通过、7 个既有跳过；full、embedded、独立 SDK（含声明）、component（含声明）、原 CallViewModel SDK demo 五目标构建通过。用户随后授权生成本地合并提交；未授权 push、部署或关闭事项。

- 修复：真实 e2e 抓到浮动 tile 的入场动画被布局更新替代后可能停在零透明度/缩放，现令仍在场且未拖拽的 tile 收敛到可见状态；新增先红后绿的单元回归，并加强真实浏览器故事。剩余旧媒体选择器迁到 SDK `data-source`；退出菜单、widget 权限批准和自动隐藏控件使用真实交互；多登录/重入用例使用有界 90 秒预算。组件小窗按保留的悬浮底栏检查媒体/底栏各自不越界，不再错误要求二者高度相加不超过容器。
- 验证：完整 134 条 Playwright 清单经分批修复复验，最终逐项为 **104 通过、30 个既有跳过、0 个未解决失败**（Chromium 63、Firefox 35、mobile 6 通过），未新增跳过。覆盖独立 SDK 媒体/加密/数据/重载、传输兼容/联邦/延迟离开、双发起端全员结束、DM、共享轮播/展开、PiP、组件宿主和移动端 8 人滚动。最后两条长网格在断言完成后卡于大量录 trace 的浏览器上下文关闭，改用串行无 trace 后在原 120 秒预算内通过；没有削弱断言。完整逐项证据见 `agent-workspace/upstream-sync-2026-10-29/e2e-combined-results.json`，执行说明见同目录 `verification-final.md`。
- 隔离与边界：独立 Compose project `ec-upstream-sync-20261029` 使用临时数据库和 3040/3001/3002 前端，测试账号只建在本地 Synapse；现已移除该项目容器/网络并停止前端，本机其他服务与原 `public/config.json` 未改。实机原生端及真实硬件释放未验；控制台仍有已记录告警。组件开发 harness 截图的 Tooltip 标签存在样式外露，尚未确认是否为本轮引入，保留为单独的视觉验收项，未据通过的自动化宣称画面无瑕疵。事项及已有 spec 漂移保持开放，不 push 或部署。

## 2026-11-05：同步官方媒体预览与背景处理管线

用户再次授权拉取并合并官方最新 main，保留定制且优先采用官方替代方案。本轮从干净 `69bacd0b` 合入 `d68e761f`，共同官方基线为 `8a987b4d`；新增 52 个提交（40 个非合并提交），解决 7 个文件冲突。回退分支为 `backup/upstream-sync-69bacd0b`。第一版交接后，用户确认继续完整验证并生成本地合并提交；验证结果见下文。未 push、部署或关闭事项。

- 官方实现：采用 SDK `createLocalMedia` 与 lobby 轨道移交、统一背景效果管线及效果设置/内置素材、多类型传输偏好（`m.livekit` 优先）、Compound 设备菜单、修正后的 `useBehavior`、组件打包/发布和宿主 CSS 处理。当前仍是模糊开关，没有将底层图片背景能力宣称为完整选择界面。
- 定制整合：保留全员结束和 slot 授权、失败反馈/重试、自动重连、发布暂停所有权与串行恢复、Android 路由、旧 widget 配置回退、悬浮胶囊、成员滚动、共享控制/布局和 PiP。skip-lobby 预检改为复用官方 LobbyMediaViewModel 的薄 hook，同一 LocalMedia 从预检进入通话，不保留旧 `usePreviewTracks` 捕获实现；全静音 lobby 改用官方不打开设备的行为。
- 生命周期回归：VM 在相机释放和麦克风静音调和完成后才发布 `ready$`，测试捕获首次就绪时的轨道状态；SDK 在 stop 和 takeTracks 时均推进代际并清空 pending，丢弃迟到授权流；允许新一轮捕获且旧请求不删除新去重条目；设备切换 reacquire 返回时检查已停止所有者并清理全部返回轨道；处理器 init/restart 的停止与移交取消旧接纳权、停止迟到输出并按序销毁，未完成效果通过可选 `processorToInitialize` 交给发布端，等待安装后再发布，已就绪输出继续复用。回归覆盖接收端 init 已排队时的旧输出清理顺序。均在真正轨道/状态所有者内处理，不让 view/hook 另建清理协议。
- 第一版证据：冻结依赖安装、TypeScript 通过；10 个不同文件定向单元最终 230 通过、6 个既有跳过（最终 SDK 三文件批次 67 通过，其他未变用例复用有效证据且不重复计数）。生命周期回归先红后绿；初次异步用例时序与合并重复导入已修正。改动文件格式化且无残留冲突。当时尚未执行完整 gates、构建及真实后端验收；本版已由下述完整证据替代，原生手机仍未验收。日志保留继承的 jsdom CSS/play 未实现提示。
- 更新清单与全部 52 个提交见 [本次同步报告](../../docs/upstream-sync-2026-11-05.md)；具体计划、冲突名单、红绿回归和验证日志在 `agent-workspace/upstream-sync-2026-11-05/`。既有 spec 漂移及其他开放事项保持原状态，不把本地合并写成已部署事实。

### 2026-11-05：确认后的完整验证

- 最新架构反馈已修正：`takeTracks()` 撤销移交前尚未登记的捕获，deferred getUserMedia → 移交 → resolve 后返回 `[]`、停止全部迟到轨道、保持 `tracks$` 为空。额外覆盖移交后新捕获不加入旧 promise，且旧 finalizer 不删除新一代去重条目；两条新增回归先红后绿，修复仍位于 SDK 所有者。
- 全部仓库 gates 通过：冻结锁文件安装、lint（types/oxlint/knip/externals）、format、test、i18n；完整 Vitest 为 **145 文件、1290 通过、7 个既有跳过**，含 64 条 Chromium Storybook 用例。full、embedded、SDK、component 和旧 CallViewModel SDK 五目标构建全部通过，含 SDK/component 声明。
- 构建修复：旧 SDK 入口复用官方共享 Vite 插件配置，解决原配置下的 Rolldown 内部崩溃；删除不再使用的旧 polyfill 插件及直接依赖。交付仍采用默认生产压缩，而非诊断用的关闭压缩。跨 backend 的处理器集成测试移至 LiveKit 测试目录，保持 SDK 导入边界。
- 浏览器：完整 134 条清单最终逐项为 **104 通过、30 个既有跳过、0 个未解决失败**（Chromium 63、Firefox 35、mobile 6 通过）。分批保留首批 49 个有效通过，再对剩余 84 条取得 55 通过/29 跳过；首批首页加载超时及 widget 隔离 URL 指向 3000 的问题已在修正临时 runner 后消除。未修改生产 URL、放宽断言或增加跳过。逐项回执为 `e2e-combined-results.json`。
- 实际渲染：另两条临时浏览器检查验证 lobby→通话原生摄像轨道 ID 不变、滚动设备菜单及开着菜单缩放组件。已查看 standalone、component、Chromium/Firefox 小窗及 Android/iPhone 模拟共享截图。本轮采用官方 CSS 修正后，小窗截图未再出现上一轮 Tooltip 标签外露。
- 隔离与边界：独立测试项目 `ec-upstream-sync-20261105` 和新数据库使用回环端口，前端为 3040/3001/3002，原配置和其他服务不改。测试后移除自身容器/网络并停止前端；数据、日志与图片保留。原生客户端、WebKit 和真实设备释放未验收；ResizeObserver、wake-lock、React 等告警仍在日志中。完整执行索引为 `verification-final.md`，既有事项及 spec 漂移保持开放。
