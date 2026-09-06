# VEX V5 编程教学仿真（vex-sim）

面向机器人教学的可编程 VEX V5 仿真器：左侧编写 C++ 风格代码，右侧 3D 场地实时驱动 Clawbot 执行。内置静态检查、AI 代码生成、超声波传感器仿真、if/else/while 控制流，以及「走到旗帜」训练模式与 merit 积分激励。

纯前端静态 Web（HTML + Three.js），无后端，浏览器即开即用。

## 功能特性

- **代码编辑器**：C++ 风格代码分色高亮、行号、Tab 自动缩进、静态错误检查（缺分号 / 括号配对 / 未定义标识符 / 缺 `#include "vex.h"` / 缺 `int main`），点击错误行自动定位
- **控制流支持**：`if / else / while` 递归下降解析（AST）+ 执行栈分帧执行，`while(DistanceSensor.distance(mm) > N)` 自动折叠为超声波跟随
- **3D 仿真**：Three.js 空场地 + Clawbot（底盘 / 4 轮 / 升降臂 / 可开合爪）+ 可吸附球，相机绕机器人旋转、滚轮缩放（render-on-demand，打字零卡顿）
- **超声波传感器**：车头测距，只认场地围栏内壁，实时 HUD 读数 + 近距红色警示 + 激光线可视化
- **AI 代码生成**：中 / 英文一句话需求 → VEX C++，支持一键测试、复制
- **训练模式**：随机终点旗帜、到达检测、自动复位、彩虹 Congrats + 彩带 + merit 积分（localStorage 持久化）
- **开场影片**：支持多支队伍视频轮播（随机不重复）；默认未附带视频文件，放入即可启用（见下）

## 运行

直接双击打开 `index.html`（`file://`），或任意静态服务器：

```bash
python3 -m http.server 8000   # 然后访问 http://localhost:8000
```

## 加入开场视频（可选）

开场影片默认不随仓库附带（多为各队伍发布内容）。如需启用：

1. 将视频压缩为 720p H.264（`-crf 27 -movflags +faststart -profile:v main`）与首帧海报，命名如 `intro-16610a.mp4` / `intro-16610a.jpg`，放入仓库根目录；
2. 在 `app.js` 的 `INTRO_VIDEOS` 数组中增加一条 `{ team: '队号', src: '文件名.mp4', poster: '文件名.jpg' }`；
3. 刷新页面即可在开场界面看到并随机轮播。

> 云端分享（CloudStudio 网关不支持 HTTP Range 时 Safari 会黑屏）：`app.js` 已内置 `fetch → blob → createObjectURL` 兼容路径，无需额外处理。

## 代码结构

| 文件 | 职责 |
| --- | --- |
| `index.html` | 布局与全部样式、编辑器 / 场景 / 浮层 DOM |
| `app.js` | 编辑器接线、高亮、错误面板、开场影片、训练模式、merit |
| `linter.js` | 静态检测 + 命令 / 控制流解析（AST）+ 默认代码模板 |
| `sim.js` | 命令分帧执行引擎（顺序帧 + 循环帧栈） |
| `scene.js` | Three.js 场景：场地、Clawbot、球、旗帜、相机、帧回调检测 |
| `ai.js` | 中 / 英文自然语言 → VEX C++ 规则引擎 |
| `three.min.js` | three@0.149.0 本地 UMD（r150+ 移除 UMD，需锁定 r149） |

**核心数据流**：学生代码 → `linter.parseBlock`(AST) → `sim.execStack`(分帧推进) → `SceneAPI.robot.*`(驱动) → scene 帧回调（到达 / 吸附 / 超声波 / 相机跟随）。

## 测试

- `.workbuddy/tests/test_sensor.js`：linter / ai / sim 引擎 / DOM 冒烟回归（31 项）
- `.workbuddy/tests/test_controlflow.js`：if/else/while AST、条件表达式、循环执行（20 项）

## 工程日志

完整开发过程见 [`工程日志-VEX编程教学仿真.md`](./工程日志-VEX编程教学仿真.md)。

## 许可证

[MIT](./LICENSE) © 2026 yu55037728-cpu
