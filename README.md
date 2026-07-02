# OpenTeleprompter

MacBook 灵动岛提词器。原生 macOS 应用，Swift 6 + SwiftUI/AppKit。

## 功能

- **会议模式**：粘贴提词稿，朗读时灵动岛展开跟随，已念部分变浅，跳读鲁棒。
- **面试模式**：通过系统音频捕获面试官提问，VAD 判定结束（或快捷键 ⌘⌥Space 手动触发），调用 OpenAI 兼容 LLM 生成回答后作为提词稿。
- 灵动岛连续 10 秒未检测到语音时自动收起。

## 要求

- macOS 14+
- Xcode 16+（`swift test` 需要 Swift Testing framework，要求 Xcode 而非仅 Command Line Tools）

## 在 Xcode 里运行

```bash
open Package.swift   # 在 Xcode 里点 Run
```

首次运行会依次申请：麦克风、语音识别、屏幕录制（系统音频）权限。

## 命令行

```bash
# 确保使用 Xcode 的工具链（Command Line Tools 不含 Testing framework）
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer

swift build                        # 构建
swift test                         # 跑全部单元测试（Core 层 42 个用例）
swift run TeleprompterApp          # 直接运行（首次可能因缺少 bundle 签名弹权限框）
```

## 设置

从菜单栏图标打开 Settings：

- **LLM**：baseURL（如 `https://api.openai.com`）+ API Key（Keychain 存储）+ model 名（如 `gpt-4o-mini`）+ 系统 prompt
- **语音**：中文普通话 / 英文切换
- **会议稿件**：朗读文本
- **灵动岛**：无语音自动收起时长（3–30 秒）

## 全局快捷键

- `⌘⌥ Space`：面试模式下手动触发"问题结束"，立即调用 LLM
- `⌘⇧ T`：显隐灵动岛

## 架构

```
TeleprompterApp (SwiftUI + AppKit 壳)
  ├── Window: NotchPanel / NotchGeometry / IslandWindowController
  ├── Views:  IslandRootView + Compact/Listening/Thinking/Teleprompter/Settings
  ├── Coordinators: Meeting / Interview
  ├── Hotkeys: Carbon RegisterEventHotKey
  └── 依赖 ↓

TeleprompterCore (纯 Swift 库，全部可测)
  ├── Speech:   SpeechRecognizer (SFSpeech) / MicAudioTap (AVAudioEngine)
  │             / SystemAudioTap (ScreenCaptureKit) / VAD
  ├── Matching: TokenNormalizer / FuzzyMatcher / ReadingTracker
  ├── LLM:      LLMConfig / LLMClient (OpenAI /v1/chat/completions 流式) / SSEStreamParser
  ├── State:    IslandState / SessionMode / TeleprompterPayload
  └── Storage:  Preferences (UserDefaults) / KeychainStore (API Key)
```

## 核心算法：ReadingTracker

跳读鲁棒的朗读追踪器。关键设计：

1. 用 `lastObservedTokenCount` 跟踪 ASR 累积文本，每次 ingest 计算增量 `deltaCount`
2. 把最近 `max(tailLength, deltaCount+2)` 个 token 作为指纹
3. 在 `[cursor - searchBack, cursor + searchAhead)` 窗口内用编辑距离做滑动匹配
4. 置信度 ≥ `confidenceThreshold` 才更新 cursor
5. matched 长度 = `min(gap, deltaCount)`，其余标为 `.skipped`（用户真的跳过了）
6. 允许回读：cursor 后退时把撤销区间恢复为 `.unread`

## 测试

```bash
swift test   # 42 个用例覆盖 TokenNormalizer、FuzzyMatcher、ReadingTracker、LLM、SSE
```

## 不在当前版本范围

- 签名 / 公证 / DMG 打包
- Sparkle 自动更新
- 多稿件管理
- Anthropic 原生协议（已可走 OpenAI 兼容代理）

