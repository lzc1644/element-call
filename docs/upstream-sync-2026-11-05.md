# 官方上游同步：2026-11-05

## 同步范围与当前状态

- 官方仓库：<https://github.com/element-hq/element-call>，同步分支为 `main`。
- 上次官方基线：`8a987b4d46de3fa26dc5dcd20bf85abe1ad3889c`，2026-10-29。
- 本次官方目标：`d68e761f7afdcf8fb2346b90380aebf35be7e7c1`，2026-11-05 10:03:52 UTC。
- 本地合并前：`69bacd0b20d5a0bb6d6aeb9ab47fc8c67e4ba56d`。
- 新增 **52 个上游提交：40 个非合并提交、12 个合并提交**。部分开发提交早于 10 月 29 日，但在本次区间才进入官方 main。
- 本地回退分支：`backup/upstream-sync-69bacd0b`。

本轮已完成 7 个文件的冲突处理，并在用户确认第一版方向后通过完整质量检查、五个构建目标和隔离真实后端的浏览器验收。用户已授权生成本地合并提交；没有 push、部署或关闭既有事项。原生手机和真实媒体硬件验收仍是下述边界。

## 本次官方更新

### 入会前预览与实际入会复用同一批媒体轨道

[#4407](https://github.com/element-hq/element-call/pull/4407)

- SDK 新增 `createLocalMedia`，可在连接媒体后端前捕获摄像头、麦克风。
- lobby 改用 SDK 的 `LocalMedia` 和 `LobbyMediaViewModel`，不再通过 `usePreviewTracks` 单独创建 LiveKit 预览。
- 入会时直接移交预览的原生轨道、静音状态和处理器输出，避免再次捕获和重复初始化处理器。
- 音视频同时开启时合并权限请求；全部关闭时不预先打开设备。相机关闭后释放，相应指示灯也应关闭。
- 敲门等待页、组件入口及调用方一并适配。

### 背景处理改为可切换的统一管线

[#4282](https://github.com/element-hq/element-call/pull/4282)、[#4283](https://github.com/element-hq/element-call/pull/4283)

- 预览和通话共用背景处理管线，摄像头请求携带所需处理器，避免先发布未经处理的画面再启用效果。
- 处理器初始化、重启、销毁按同一处理器串行执行，兼容已经初始化的预览输出移交。
- 支持在关闭的相机重新开启时安装处理器，不为切换处理器无谓替换相机。
- 跳过 MediaPipe WASM 加载器的 Node polyfill transform，修复 `ModuleFactory not set` 类加载失败。
- 设置由布尔模糊值迁移到 `none`、`blur`、`image:<id>`；旧模糊设置自动继承。
- 新增内置背景 `arc`、`glow` 及效果解析/切换能力。

**界面范围：当前摄像头菜单和设置页仍提供模糊开关；本次上游没有加入完整的背景图片选择或自定义图片上传界面。**

### 音视频设备菜单使用 Compound 的滚动与吸附实现

[#4281](https://github.com/element-hq/element-call/pull/4281)

- 统一两种设备菜单的宽度和 Safari 外框表现。
- 改用 Compound `MenuScrollArea` / `MenuScrollSection`，替代定制滚动、分隔与渐变处理。
- 麦克风电平作为列表底部的吸附项；菜单仍按调用容器的尺寸限制高度。
- Compound Web 更新为 `^10.5.0`，包含所需菜单能力。

### 新增标准 `m.livekit` 传输类型支持

[#4389](https://github.com/element-hq/element-call/pull/4389)

- 媒体后端按偏好声明多个传输类型：先 `m.livekit`，再旧 `livekit`。
- 自动发现按类型偏好选取，而非单纯取服务器列表中最先出现的 LiveKit 项。
- 继续兼容旧传输配置。
- Matrix JS SDK 固定版本更新为 `a9ef09fbf2f1644c8663d0aeaf6a921cd16e7b01`。

### 修复响应式视图切换后不再更新的问题

[#4410](https://github.com/element-hq/element-call/pull/4410)

`useBehavior` 改用显式订阅与状态保存。针对 React Compiler 对 snapshot getter 的记忆化问题，切到初始值相同的新 behavior 时，也能继续接收新对象的后续更新，并补充相应回归测试。

### React 组件新增 npm 发布流程，修正宿主集成

[#4374](https://github.com/element-hq/element-call/pull/4374)、[#4394](https://github.com/element-hq/element-call/pull/4394)、[#4404](https://github.com/element-hq/element-call/pull/4404)

- 官方 release 构建并发布 `@element-hq/element-call-component`；普通 main/PR 运行 dry-run。补充 npm README 与许可证。
- 组件与 embedded 发布共用 release notes 的并发锁，避免相互覆盖追加内容。
- 修正 SDK 间接导入造成的 Matrix JS SDK 重复打包，补齐组件 externals 与检查脚本。
- 组件开发 harness 的宿主 CSS、Compound 样式和字体不再被错误加上 Element Call 容器作用域；仍约束 Element Call 自身样式。
- 宿主样式隔离测试改用真正属于 Element Call 的 CSS 特征，允许宿主主动加载 Compound。

### 翻译、Android 包装与测试依赖更新

- [#4400](https://github.com/element-hq/element-call/pull/4400)：Localazy 上传、下载只处理 `app.json`，避免引入不相关 JSON 文件。
- [#4398](https://github.com/element-hq/element-call/pull/4398)：Android Gradle wrapper `8.14.5 → 8.14.6`，Maven publish 插件 `0.36.0 → 0.37.0`。
- [#4393](https://github.com/element-hq/element-call/pull/4393)、[#4396](https://github.com/element-hq/element-call/pull/4396)、[#4397](https://github.com/element-hq/element-call/pull/4397)、[#4399](https://github.com/element-hq/element-call/pull/4399)、[#4402](https://github.com/element-hq/element-call/pull/4402)、[#4406](https://github.com/element-hq/element-call/pull/4406)：更新 Playwright 后端所用 Element Web develop 镜像，最终为 `a798012` 对应的固定 digest。这不是对现有自托管服务的部署。

## 自托管定制如何处理

| 已有能力                                                           | 本次处理                                                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 全员结束、发送失败反馈与手动重试、普通本机挂断                     | 保留；授权仍读取实际 `rtcParticipation.slot`，没有改回默认 session 或另建通话核心。                                      |
| 弱网恢复、发布暂停/恢复串行化、只恢复自己暂停的轨道                | 保留 SDK Publisher/LocalMedia 中的定制，同时采用官方的预览轨道移交。                                                     |
| 自动重连预算、错误页手动恢复                                       | 保留。                                                                                                                   |
| Android 麦克风重新启用后的音频路由恢复                             | 保留，仍由既有 AudioOutputSession 能力重新应用选择。                                                                     |
| skip-lobby 媒体权限预检                                            | 保留能力，替换实现：薄 hook 复用官方 LobbyMediaViewModel，不再保留第二套捕获状态机；同一个 LocalMedia 从预检移交至入会。 |
| 原 lobby 即使全静音也预开麦克风申请权限                            | 采用官方替代方案：全静音不打开设备；不继续保留额外预授权。                                                               |
| 旧 widget 宿主不支持 RTC 发现时立即使用配置 fallback               | 保留，并与官方多传输类型偏好合并。                                                                                       |
| 移动端悬浮胶囊、自动隐藏、底栏周围透明、成员末行滚动空间           | 保留，设备菜单内部采用官方组件。                                                                                         |
| 顶栏固定、共享轮播、共享音量/全屏/隐藏成员、窄屏共享展开、PiP 尺寸 | 保留。                                                                                                                   |

### 合并中补齐的媒体生命周期边界

- `LobbyMediaViewModel.ready$` 由同一 VM 在本轮调和结束后发布：等待在途捕获、相机释放和麦克风静音完成，再允许 direct join 移交媒体。测试记录首次 `ready=true` 时的真实轨道状态，而不是只看最终状态。
- `LocalMedia.stop()` 与 `takeTracks()` 均推进代际并清空在途去重请求；停止或移交前尚未返回的捕获后来成功时，停止返回流全部轨道并返回 `[]`，不会重新填入已移交的 lobby 媒体列表。新一代仍可捕获，旧请求的清理不会删除新去重条目。移交前等待 `getUserMedia` 的两条回归已先失败后通过。
- `CapturedTrack.reacquire()` 在设备切换授权返回后检查轨道是否已结束；已停止的所有者不再接纳新轨道，而是停止返回流。
- 处理器初始化/重启也由 CapturedTrack 跟踪。在停止或移交时取消旧所有者的接纳权，停止迟到的效果输出，并排队销毁旧处理器；移交使用可选的 `processorToInitialize` 传递未完成的效果意图，发布端等待重新安装效果后才发布。已就绪的处理器仍直接复用输出，不重复初始化。回归覆盖接收端已排队初始化时，旧输出清理及销毁仍先完成。
- 上述捕获停止、停止后重启、设备切换停止、处理器停止/移交和就绪屏障均有回归证据。轨道释放由 SDK 负责，view/hook 没有自行接管内部轨道清理。

## 完整验证结果

- 冻结依赖安装、`pnpm lint`（TypeScript、oxlint、knip、externals）、`pnpm format`、`pnpm i18n:check` 全部通过。
- `pnpm test --run`：**145 个文件，1290 通过、7 个既有跳过、0 失败**，包含 64 条真实 Chromium Storybook 用例。没有新增跳过。
- `build:full`、`build:embedded`、`build:sdk`、`build:component`、`build:sdk-target-based-on-call-view-model` 五目标全部通过，SDK 与组件包含类型声明构建。
- 旧 CallViewModel SDK 的原 Vite 配置触发 Rolldown 内部崩溃。改为复用官方 `vitePluginsConfig({ mode, html: false })` 后，默认生产压缩构建通过；删除不再使用的旧 polyfill 插件和直接依赖，冻结锁文件安装及完整 gates 再次通过。没有把诊断时的关闭压缩作为交付方案。
- 处理器跨后端移交的集成测试移至 LiveKit backend 测试目录，SDK 通用层不直接导入 LiveKit。新增异步用例使用既有 `flushPromises`，lint 暴露的问题均已修正。

### 真实后端的完整浏览器清单

| 项目            |    通过 | 既有跳过 |
| --------------- | ------: | -------: |
| Chromium        |      63 |        1 |
| Firefox         |      35 |       29 |
| Mobile Chromium |       6 |        0 |
| **合计**        | **104** |   **30** |

完整清单共 134 条，最终逐项没有未解决失败。覆盖 standalone 注册/入会/设备切换，SDK 对端媒体、加密、数据、重载与离开，传输兼容/联邦/延迟离开，加密 widget 双发起端全员结束、DM、PiP、共享轮播/展开、组件双实例/宿主样式/桥接/缩放，以及移动端 8 人末行滚动。

结果来自两个批次，不能解释为首个全量命令一次通过：首批 49 条通过，首页首批停在加载页，部分 widget 用例因隔离 runner 的开发 URL 仍指向被其他服务使用的 3000 而失败。只修正临时副本 URL 到 3040 并复用已完成的开发缓存后，排除已有有效结果，剩余 84 条得到 55 通过、29 个既有跳过。没有修改生产 URL、增加重试、放宽断言或新增跳过。逐项回执为 `e2e-combined-results.json`。

### 实际画面与验收边界

另有两条临时浏览器检查通过：直接比较 lobby 和入会后相机的原生轨道 ID，确认移交不换轨；检查长音频设备菜单和组件容器缩放时的菜单高度。已查看实际 standalone 预览/滚动菜单、组件菜单/缩放、Chromium/Firefox 小窗，以及 Android/iPhone 模拟共享画面。此前组件开发 harness 的 Tooltip 标签外露未在本轮小窗截图中重现；采用的是官方宿主 CSS 修正。

后端使用独立 Compose project `ec-upstream-sync-20261105`、新临时数据库和回环监听端口，前端运行于 3040/3001/3002。只有临时副本使用开发配置及 runner 端口调整，原 `public/config.json` 和其他本地服务未改动。测试完成后移除该测试项目容器/网络，前端由 Playwright 退出；日志、图片和测试数据保留在忽略目录。

这些是合成音视频设备连接真实 Matrix/SFU 后端的结果。Android/iPhone 均为 Chromium 模拟，尚未验收原生 Element X/SchildiChat/WebKit 或真实麦克风、相机硬件释放。日志保留 jsdom CSS/play 提示、ResizeObserver、wake-lock 权限、React 与构建告警，不作零告警声明。

详细日志位于本地忽略目录 `agent-workspace/upstream-sync-2026-11-05/`；执行索引为 `verification-final.md`，图片在 `visual-final-results/` 及 e2e 结果目录。持续事项为 [同步官方上游并验证自托管功能](../codestable/issues/006-o-ff-official-upstream-sync.md)，既有 spec 漂移仍待正式收尾。

## 全部 52 个上游提交

以下为 `8a987b4d..d68e761f` 的 `git log --reverse`，保留原始英文提交标题。短 ID 可用于查看 diff。

```text
7a48b09c Hold both device menus at 296px, framed in Safari too
9e6f2e89 Size and scroll the device menus with Compound's menu
f2976be1 Add CI to publish to npm
2e6c7d14 add agpl to component package
c713b139 review: audioMeter instead of `iconsAndLabels === "audio"`
17caded8 clean up css calc in ts code
2abe7ea0 better docs for the sub test trick
cffdb585 rop the device list's custom fade under the mete
38ef1add use compound web sticky patch
8ef1dee2 bump compound web
287f711d Update publish-embedded-packages.yaml
94ee13c6 Add support for m.livekit
35ce907e Update ghcr.io/element-hq/element-web:develop Docker digest to 431f742 (#4393)
a6764b4e Keep the SDK's matrix-js-sdk imports out of the component bundl
216bd4b9 Move component publishing into its own workflow
79bd2890 Install the component's dependencies with layered.sh
b9c10ac5 Add readme for component (npm page)
346074ce zizmor proposals + review description
a91471b5 Merge pull request #4374 from element-hq/toger5/publish-component-npm
844051e2 Merge pull request #4394 from element-hq/toger5/duplicated-js-sdk-bundle
6cffe649 Update ghcr.io/element-hq/element-web:develop Docker digest to 60ff051 (#4396)
e78b4b2e Update embedded package dependencies
aa9125f0 Update ghcr.io/element-hq/element-web:develop Docker digest to dfd40c1 (#4397)
7b6f697c Update ghcr.io/element-hq/element-web:develop Docker digest to 84af053 (#4399)
b4a632b6 Merge pull request #4398 from element-hq/renovate/embedded-package-dependencies
c30bb324 Download and upload only app.json from Localazy
d46840ce Merge pull request #4400 from element-hq/localazy-download-only-app-json
ba27855a Update ghcr.io/element-hq/element-web:develop Docker digest to fc21073 (#4402)
dff4e0f1 use compound release.
517edc12 Extend comment
1dad38ed Use a generic instead of a type assertion in useRoomEncryptionSystem
e3390989 Merge branch 'main' into spec/background-effects/1-device-menus
60a8fa54 Merge pull request #4281 from element-hq/spec/background-effects/1-device-menus
818906ee Merge pull request #4404 from element-hq/toger5/fix-storybook-docgen-parse
321340a1 Switch JS SDK to a9ef09fbf2f1644c8663d0aeaf6a921cd16e7b01
3914aec5 Merge pull request #4389 from element-hq/johannes/m_livekit
f930f73c Update ghcr.io/element-hq/element-web:develop Docker digest to a798012 (#4406)
1aa91bf2 Add the old useBehavior implementation as reference
00463c3e Merge pull request #4410 from element-hq/toger5/abb-back-use-behavior-impl
734ecbbe [SDK] Capture local media ahead of the join and hand it to the participation
69c57bd5 Run the lobby on the SDK's local media and keep its tracks through the join
922a9bbb Merge pull request #4407 from element-hq/toger5/lobby-local-media
3f5f707c Attach background effects through one switchable pipeline
146dd3ae Start every camera track with the pipeline on
a0aaa8e0 Ask one question about whether background effects can run
52d5b694 [SDK] Build a processor set on a camera that is off when it turns on
22083299 Turn a camera back on rather than replace it for its processor
0d60eabe Name the upstream cause behind the transformer's update override
1e17a641 Merge pull request #4282 from element-hq/spec/background-effects/2-pipeline
33f4d504 Choose a background effect, not only blur on or off
cc994abe review duplicated BackgoundEffects files One is now called backgroundEffectCatalog
d68e761f Merge pull request #4283 from element-hq/spec/background-effects/3-choose-effect
```
