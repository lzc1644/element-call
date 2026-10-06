---
kind: issue
title: 自部署前端尽力结束全员通话
type: feature
status: open
created: 2026-10-06
---

# 自部署前端尽力结束全员通话

## 接手先读

本文件是用户已确认方案的执行交接。**第一版已提交；Android/iOS Element X 实测暴露了宿主收发权限问题，本轮已修复共享事件信封并通过定向测试，待部署新版及真机复测；还不是完整验收或关闭。** 实际改动、检查与未验证项见文末执行记录。用户最终选择的是**尽力通知所有参与端退出**，接受异常设备可能未退出；不要恢复此前讨论过的服务端强制结束、全员确认或复杂恢复方案。

这是本地用户确认的功能范围，不表示已有上游 issue 或维护者批准。后续模型接到实现指令后，以本文件为需求入口，先读取根 AGENTS.md、docs/agents/workflow.md，以及架构、代码风格和测试指南。当前稳定背景见 [Project Spec](../spec/index.md)。

## 目标与明确边界

任意当前通话参与者可以通过现有“为所有人结束”操作，发送结束通知并退出；正常在线、使用新版自部署前端的其他参与端收到有效通知后一起退出。普通挂断仍只影响当前设备，结束后允许主动重新发起通话。

覆盖电脑网页、手机网页，以及配置为加载同一自部署 Element Call 前端的 Element X、SchildiChat Next。用户没有使用桌面原生客户端。应用连接自部署 Matrix 服务器并不足够，必须实际加载修改后的通话页面；具体应用与系统版本需在实机验收时记录。

只修改当前前端仓库，保持 standalone、widget、React component 的共用通话逻辑可用，兼顾 embedded 与 SDK 构建。

明确不做：

- 不新增后端服务或容器，不修改官方 Matrix、LiveKit、授权服务镜像。
- 不调用 LiveKit 管理 API，不强制断开未支持本事件的客户端。
- 不等待全员确认、不统计谁没有退出、不因有人仍在线要求用户重试。
- 不自动重复发送，不新增回执、超时踢人、历史补查、恢复检查或重连阻断机制。
- 不新增 v2 事件、参与实例目标列表或通话代际协议。
- 不承诺离线、系统暂停、漏收事件或使用旧前端的设备一定退出。

手机后台或短暂断网后，如果现有正常同步送达通知且通过现有校验，就处理退出；不额外追查。该限制是用户接受的范围，不是必须补齐的缺陷。

## 当前证据与修改落点

当前链路是 `terminateCall()` 用 `callTermination` 编码 → 发送宿主已允许的 `io.element.call.reaction`，其中 `io.element.call.terminate` 字段承载原结束载荷 → `CallTerminationReader` 校验 → 一次性 `leave$` → 现有媒体与宿主退出流程。新版本统一使用此信封；只在接收侧保留初版独立 `io.element.call.terminate` 事件兼容，不做双发或发送失败后 fallback。

接手时复核这些实现，避免依据过期行号修改：

| 位置 | 当前行为及用途 |
| --- | --- |
| `src/callTermination/index.ts` | 统一编码与识别新信封/旧事件，沿用 `terminated_by`、`timestamp`、可选 `reason` 载荷及 sender 一致性校验 |
| `src/callTermination/CallTerminationReader.ts` | 两种编码共用实时、解密、房间、参与者、加入时间和去重检查；同账号设备及自己的服务器回显均可接收 |
| `src/state/CallViewModel/CallViewModel.ts` | 成功发送才退出，失败保持通话；发送/重试有并发抑制，`leave$` 一次性且可重放 |
| `src/components/CallFooterViewModel.tsx` | 映射发送中/失败状态与可用动作，保留第一版可见反馈 |
| `src/button/EndCallMenuButton.tsx`、`src/components/CallFooter.tsx` | 复用菜单、二次确认与 footer，增加发送和失败状态 |
| `src/widget.ts`、`src/HostBridge.ts` | 已声明结束事件收发并提供宿主挂断接口；验证实际宿主是否支持 |
| `src/room/CallView.tsx`、本地成员生命周期 | 复用退出及宿主通知，不另建平行清理流程 |

## 可观察行为与实现顺序

### 1. 修复接收端同账号多设备退出

移除按 `sender === localUserId` 整体忽略通知的规则。同账号另一设备发送的事件必须经过与其他用户相同的校验，并可触发退出。

继续保留真实 Matrix sender 与载荷一致性、当前房间、通话参与者、实时事件来源、加入时间、解密与事件去重规则；不能为提高送达率直接接受所有房间历史事件。现有过滤只是尽力防护，不宣称实现严格的新旧通话隔离。

自己的服务器回显也可能触发接收路径，因此发送成功的本地退出与收到事件的退出必须合并成一次有效离开。沿用事件 ID 去重，并在当前通话生命周期防止重复释放媒体、重复宿主挂断；不依赖网络回显顺序。

### 2. 明确发送状态与失败反馈

在 view model 管理 `idle`、`sending`、`failed` 状态，视图只渲染和调用动作。

| 状态／结果 | 用户行为与系统处理 |
| --- | --- |
| 空闲 | 保留现有“仅自己离开”与“为所有人结束”入口、现有显示条件及二次确认 |
| 用户确认 | 发送一次现有结束事件，显示“正在发送结束通知”，禁用重复结束操作 |
| Matrix 确认发送成功 | 触发本地退出；不等待其他设备，也不声称所有设备已经退出 |
| 发送失败 | 留在通话并显示“结束通知未发送”，提供可选“重试”和“仅自己离开” |
| 手动重试 | 只在没有进行中的发送时再次尝试；优先使用 SDK 对失败事件的重试能力，避免遗留本地待发送副本 |
| 仅自己离开 | 使用现有挂断流程，不追加新的全员结束通知 |

去掉发送失败也无条件退出的 `finally` 行为。失败提示对应**通知未发送**，与“有人没有退出”完全无关。不要增加应用层自动重试或全员等待计时器；请求仍进行中时不能并行发第二次。

发送与离开竞态需有针对性检查：自己先手动离开、同时收到他人的结束通知、发送结果随后返回，都不能重复触发退出或更新已销毁视图。已交给网络的请求不能承诺撤回。

### 3. 沿用媒体及宿主退出流程

收到有效通知后通过现有生命周期停止媒体、离开 MatrixRTC，并通过 HostBridge 通知应用挂断。验证声音停止、麦克风释放及宿主通话页退出；不以菜单关闭代替实际结束。

复用现有菜单、提示组件与翻译机制，不新增共享组件。所有行为受 ObservableScope 生命周期约束，不读取页面全局、不按宿主品牌分叉逻辑。新增英文翻译键，其他语言按项目既有翻译流程处理。

## 验证与质量承诺

本版承诺是：正常在线且使用新版前端的参与者能通过现有消息通道一起退出，异常设备不妨碍其他人结束；通过下述测试支撑功能、跨宿主兼容性及失败反馈。

### 单元测试与 Storybook

- 有效通知使不同账号参与者和同账号其他设备退出。
- 自己的回显与发送成功前后交错、重复事件、并发结束只产生一次有效退出。
- 保留错误房间、非参与者、非法载荷、历史／加入前事件及延迟解密的现有回归测试。
- 发送成功退出；失败仍在通话且状态可见；重试可成功；重复点击不并发发送；仅自己离开仍可用。
- 生命周期销毁后的发送回调不产生重复清理或资源泄漏。
- 为二次确认、发送中、失败及手机布局增加／更新故事，并验证可访问名称与交互。

### E2E 与实机

- standalone 双参与端：一端结束，另一端真正离开通话。
- widget 与 component：收到通知后媒体退出与宿主生命周期正常；另一通话实例不受影响。
- 实际 Element X／SchildiChat Next 与网页相互发起结束，核实自部署前端加载版本、事件传递和宿主挂断。
- 同账号网页与手机同时参与，任一端操作后其余在线端退出。
- 记录手机锁屏、前后台切换和短暂断网结果；未即时退出不作为“必须全退”的失败，不据此扩大方案。
- 核心接收路径覆盖加密房间；手机浏览器模拟不能代替原生应用验收。

没有设备或宿主测试环境时，明确记录哪些没有验证，不编造跨端通过结果。保持项目已有覆盖率要求。

## 实施交接、部署与关闭

1. 复核上述落点，先实现核心修复与对应单测、UI 状态。
2. 第一版运行最小必要检查后交接方向，不在用户反馈前自动做完整质量 pass；遵循仓库 workflow。
3. 方向确认后完成故事、E2E、实机验证及 `pnpm lint`、`pnpm format`、`pnpm test`、`pnpm i18n:check`，检查 full、embedded、SDK、component 构建。
4. 在本文追加实际改动、测试结果和未验证项。本次执行授权按计划实现，不授权自动 commit、push、部署或关闭 issue。
5. 发布时只更新现有前端静态资源，各网页和应用重新加载新版通话页；无需后端部署改动。部署须另有授权。
6. 用户授权关闭时，再把实际成立的能力和尽力退出边界回写 Project Spec，按 cs 关闭约定处理本 issue。不要提前把计划写成当前已实现能力。

## 第一版执行记录（2026-10-06）

本节保留首次交接时的实现与验证结果。第一版后来按用户授权提交为 `6e6a6c79`，并合入 `dev`；这些检查当时不包含原生宿主实机兼容性验证。

### 已实现

- `CallTerminationReader` 只删除同账号 sender 的整体排除；仍保留实时来源、房间、sender/载荷一致性、当前或短暂离开的参与者、加入时间、解密和事件 ID 去重检查。自己的未发送事件仍不接收，服务器回显可接收。
- `CallViewModel` 提供受 scope 约束的 `idle/sending/failed` 状态。发送成功才触发本地挂断；失败不退出，由状态提供可见反馈并记录日志。请求进行中时不再发送第二次。
- 手动重试用事务 ID 的 `room.getEventForTxnId()` 找回 SDK 失败事件，优先 `resendEvent()` 复用同一事件。这样也覆盖没有 `MatrixError.event` 的普通网络错误和 widget 错误；不扫描只适用于 detached ordering 的 pending 列表。若请求在创建本地事件前就失败，下一次手动重试才创建新事件。
- 所有退出来源在 `leave$` 的 `take(1)` 收敛；scope-bound `shareReplay(1)` 保留退出原因，构造阶段或消费者订阅之前发生的退出不会丢失。采用反馈中的生命周期修正：先保留结果，再由唯一内部订阅调用现有 `requestDisconnect()`，避免迟订阅丢失原因或重复宿主挂断。
- 离开或 scope 结束后，不再接受结束操作，也不让发送回调更新 UI 状态或再次退出。只丢弃 `NOT_SENT` 的失败副本；不取消已在网络中进行的请求。没有新增自动重试、等待计时器、确认回执或其他恢复机制。
- `CallFooterViewModel` 映射状态，发送中动作变为 `undefined`，反馈存在时保持工具栏可见。`CallFooter` 复用 Compound `Alert`/`Button`，失败提供“重试”和“仅自己离开”；`EndCallMenuButton` 保留现有参与人数显示条件和二次确认，只禁用不可用的全员结束动作。没有新增共享组件、页面全局读取或宿主品牌分支。
- 新增三条英文翻译，运行既有提取器；未手改其他语言。现有两个故事的 snapshot 默认值已适配新字段，新状态故事尚待方向确认后补齐。

### 第一版局部 UI（实现方向，尚未做浏览器布局验收）

```text
空闲：工具栏 [麦克风] [视频] […] [挂断菜单]
                                ├ 仅自己离开
                                └ 为所有人结束 → 原有二次确认

发送中：┌ 正在发送结束通知                         ┐
        └ [麦克风] [视频] […] [挂断菜单]           ┘
                              ├ 仅自己离开（可用）
                              └ 为所有人结束（禁用）

失败：  ┌ 结束通知未发送  [重试] [仅自己离开]       ┐
        └ [麦克风] [视频] […] [挂断菜单]           ┘
```

提示与操作共置于原工具栏，窄容器改为上下排列；菜单展开仍使用原菜单，不新建平行弹层。实际英文文案分别为 `Sending end notification…`、`End notification not sent`、`Retry`。待后续故事验证手机布局、展开菜单的可见面/点击面、裁切和相邻内容边界。

### 已运行的最小检查

| 检查 | 结果与证据范围 |
| --- | --- |
| 五个相关文件的 `pnpm test:unit --run` | **138 通过、4 跳过**；覆盖原接收校验回归、同账号其他设备、自己的未发送事件/服务器回显、发送和重试的并发抑制、失败留在通话、仅自己离开、发送前后退出竞态、scope 销毁后的回调、迟订阅和一次宿主挂断，以及 UI 的可访问名称/动作 |
| `pnpm exec tsc --noEmit --pretty false` | 通过；因新增必填 snapshot 字段而额外检查类型图，防止现有消费者编译断裂，不等于四目标构建通过 |
| 修改代码文件的 `pnpm exec oxlint` | 通过；未运行完整 lint 中的 knip 和 component externals 等 gate |
| 修改文件的 `pnpm exec oxfmt` | 通过；未对全仓库运行格式化 |
| `pnpm i18n` | 提取成功；未运行最终 `i18n:check` gate |

定向单测文件：

- `src/callTermination/CallTerminationReader.test.ts`
- `src/state/CallViewModel/CallViewModel.test.ts`（兼容模式和 matrix_2_0 共用行为）
- `src/components/CallFooterViewModel.test.ts`
- `src/components/CallFooter.test.tsx`
- `src/button/EndCallMenuButton.test.tsx`

完整命令及日志保存在忽略的 `agent-workspace/end-call-for-everyone/`；这里的执行记录和提交后的测试才是持久证据。先前窄检查发现的按钮尺寸类型与测试断言/lint 问题均已修正，上表是最后一次结果。

### 明确未验证与下一阶段

- 尚未新增/运行本功能的 Storybook 状态故事与 E2E spec；只更新已有故事的 snapshot 默认字段。
- 尚未验证真实 standalone 双端、同账号网页/手机、加密房间送达、widget/component 退出及多实例隔离；宿主挂断目前只有共享逻辑单测，不能代替媒体停止、麦克风释放和宿主通话页退出的实机证据。
- 尚未测试 Element X、SchildiChat Next、锁屏、前后台切换和短暂断网，未记录或声称这些宿主通过。
- 未运行完整 `pnpm lint`、`pnpm format`、`pnpm test`、`pnpm i18n:check` 或 full/embedded/SDK/component 构建，未做覆盖率检查。
- widget 通道复用同一个本地 SDK 事件，但该 SDK 的 widget 发送接口不透传事务 ID；不额外承诺传输失败后服务端绝无重复通知。现有事件去重和通话生命周期的一次性离开仍保持不变。

用户确认本版方向后，继续原计划第 3 步。关闭候选仍是“新版在线参与端通过现有事件尽力退出、失败可见且可手动重试、普通挂断仅当前设备、没有全员必退保证”；**尚不回写 Project Spec，也不关闭本 issue**。

## 原生 widget 收发修复（2026-10-06）

### 用户复现与根因

用户在已配置自部署通话前端的 Android/iOS Element X 上点击“为所有人结束”，看到 `End notification not sent`；同一手机也不响应网页端结束。截图只证明发送失败，不提供具体 SDK 异常或客户端版本。

前端早已同时请求独立 `io.element.call.terminate` 的发送和接收能力，缺失的不是 capability 声明，而是**宿主实际授予的权限**：

- [Element X iOS 的 acquireCapabilities](https://github.com/element-hq/element-x-ios/blob/4640f9cec070d3277c476c467d99da46beae7ebe/ElementX/Sources/Services/ElementCall/ElementCallWidgetDriver.swift#L179-L183) 忽略动态请求列表，返回 `getElementCallRequiredPermissions()`。
- [Element X Android 的 JoinedRustRoom](https://github.com/element-hq/element-x-android/blob/2cda8a03159b91eb70ed1510d8980eff05ef99be/libraries/matrix/impl/src/main/kotlin/io/element/android/libraries/matrix/impl/room/JoinedRustRoom.kt#L478-L485) 使用同一个固定权限提供器。
- [Rust SDK 权限列表](https://github.com/matrix-org/matrix-rust-sdk/blob/161e46235dfb5ab93561671cd5819fdf6bad5715/bindings/matrix-sdk-ffi/src/widget.rs#L162-L202) 允许双向 `io.element.call.reaction`，不含独立的 `io.element.call.terminate`。
- [Rust widget 状态机](https://github.com/matrix-org/matrix-rust-sdk/blob/161e46235dfb5ab93561671cd5819fdf6bad5715/crates/matrix-sdk/src/widget/machine/mod.rs#L508-L516) 拒绝未授予的发送；接收侧也按 `allow_reading` 过滤（同文件约 211 行）。这能同时解释两个方向的不通。

以上是固定版本的宿主源码证据，不冒充对用户设备日志的直接采集；具体应用版本仍待实机复测记录。

### 修复与范围

- `callTermination` 统一定义编码、识别和解析。所有新发送，无论 standalone、widget、SDK 或 component，都用已允许的通话事件类型，内容为：

  ```json
  {
    "io.element.call.terminate": {
      "terminated_by": "@participant:server",
      "timestamp": 12345
    }
  }
  ```

  外层 event type 是 `io.element.call.reaction`。不带 `emoji`、`name` 或表情 relation，不伪造一条用户表情。
- reader 的 parse、实时准入和延迟解密路径共同调用模块识别器；旧独立事件仍可接收，所有房间/参与者/sender/时间/去重校验保持不变。
- VM 只调用编码器和发送常量，发送状态、SDK 手动重试、一次退出、HostBridge 与媒体清理流程不变。没有 Android/iOS/Element X 品牌分支、自动 fallback、自动重试、新后端或全员确认机制。
- widget 声明双向的新传输，旧独立类型仅保留接收；其旧接收能力仍取决于宿主是否允许。**新手机端不能替旧网页端绕过原生白名单，双方都必须重新加载新前端。**
- `ReactionsReader` 明确忽略结束信封，避免表情显示/声音副作用；普通表情仍按原路径处理。SDK 的 timeline 类型声明为“普通表情或结束信封”，不靠错误类型断言压制检查。
- 按模块边界反馈，把已有事件常量提取到无资产的 `src/reactions/events.ts`；原 `reactions/index.ts` 重导出维持兼容。控制协议不再静态引入表情音效，也不增加新的抽象层。

### 定向验证

- 八个相关文件的 `pnpm test:unit --run`：**180 通过、4 个原有跳过**。包括原接收校验套件在新/旧两种编码上运行、非通话房间成员拒绝、普通/非法信封拒绝、VM 的新发送内容、失败/重试/生命周期及现有表情/UI 回归。
- 新 `CallTerminationTransport.test.ts` 用**真实 RoomWidgetClient**配合模拟 Rust 宿主允许列表，复现旧发送拒绝与旧接收过滤；验证“widget 发 → 网页 reader 收”“网页发 → widget SDK 实时 timeline → reader 收”，覆盖不同账号和同账号其他设备，并断言没有表情更新。这不是手机 WebView/Rust 二进制实测，也不包含真实加密网络交换。
- `pnpm exec tsc --noEmit --pretty false`：通过；修改文件的 `oxlint`、`oxfmt`：通过。
- 新 `playwright/widget/end-call-for-everyone.spec.ts` 覆盖加密群通话中从任一 widget 结束后双方通话页关闭、消息输入恢复及 MatrixRTC membership 清空。`playwright test --list ... --project=chromium` 能发现两条用例；**没有运行用例**，本地 `localhost:3000`、`app.m.localhost` 和 `synapse.m.localhost` 探测均拒绝连接，只有无关容器在运行。未启动或改动后端服务。
- 本轮没有 UI 布局或新渲染状态，不新增故事；首版待补的 Storybook 状态、四目标构建、完整 gates 和覆盖率仍未完成。日志与源码取证临时副本在忽略的 `agent-workspace/end-call-widget-compat/`。

### 部署后的实机复测

1. 仅发布修改后的前端静态资源；网页和手机通话页都重新加载新版本，记录客户端/系统版本与实际加载的前端版本。部署另需授权。
2. 在加密群通话中，分别由网页、Android、iOS 发起全员结束；核实本机和在线对端退出、声音停止、麦克风释放与宿主通话页关闭。
3. 同账号网页和手机重复以上双向操作；普通挂断仍只离开当前设备。锁屏/断网等情形沿用原“尽力通知”边界，不增加追查。
4. 若仍出现警告，提供 `[CallViewModel] Failed to send call termination notification` 对应的完整错误和应用版本，区分权限、加密、网络等实际失败；不直接据此增加重试或第二通道。

本轮在 `dev` 上完成修改，**未 commit、push、部署或关闭**。真实 Element X/SchildiChat Next 尚待用户复测，不能把传输模拟通过写成全平台验收通过。
