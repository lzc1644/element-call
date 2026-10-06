---
kind: issue
title: "合并 main 两端历史并保留本地通讯修复"
type: ff
status: closed
created: 2026-10-04
---

# 合并 main 两端历史并保留本地通讯修复

整合本地 6 个提交与远端 3 个提交，以本机合并前 `61f4e38b` 的最终状态保留通讯修复，同时接入远端大屏共享、全屏和成员隐藏行为；不重新激活本地历史中已被后续提交替代的布局方案。

- 改动：`TileStore`、`TileViewModel`、`SpotlightTile` 合并轮播与作用域生命周期；合并双方故事并适配测试；按国际化提取器清理两个未使用文案键。
- 通讯保留：`CallTerminationReader`、`LocalMember`、`Publisher`、远端连接工厂及入会前媒体准备代码与本机合并前逐字节一致；共享 `CallViewModel` 的终止、入会、离会及媒体开关逻辑未被覆盖。
- 验证：完整 lint、format 通过；全量单元和 Storybook 测试 893 通过、9 跳过；full、embedded、SDK、component 四种构建通过。真实通话 e2e 未运行：测试后端容器停止，默认应用端口被 Discourse 占用，不改动现有服务。
- codestable：无稳定规格变更；保留原有未跟踪的 `spec/index.md` 和 `vision/index.md`，不将它们夹带提交。
