# VEX V5 编程教学仿真（vex-sim）· 工程日志

> 项目代号：**vex-sim** ｜ 文档生成：2026-09-06 ｜ 最新部署：https://aca91a0ce4c84b87b19228d080b17caa.app.workbuddy.link
>
> 从立项到当前迭代的完整开发记录：功能演进、技术决策、问题排查、测试与部署运维。

---

## 1. 项目概览

**定位**：面向机器人教学的可编程 VEX V5 仿真器 —— 左侧编写 C++ 风格代码，右侧 3D 场地实时驱动 Clawbot 执行；内置静态检查、AI 代码生成、超声波传感器仿真，以及"走到旗帜"训练模式与 merit 积分激励。

**形态**：纯前端静态 Web（HTML + Three.js），无后端；CloudStudio 托管，浏览器即开即用。

**当前代码构成**（`vex-sim/`）：

| 文件 | 规模 | 职责 |
|---|---|---|
| `index.html` | ~29 KB | 布局与全部样式、编辑器/场景/浮层 DOM |
| `app.js` | ~34 KB | 编辑器接线、高亮、错误面板、按钮、开场影片、训练模式、merit |
| `linter.js` | ~23 KB | 静态检测 + 命令/控制流解析（AST）+ 默认代码模板 |
| `sim.js` | ~10 KB | 命令分帧执行引擎（顺序帧 + 循环帧栈） |
| `scene.js` | ~23 KB | Three.js 场景：场地、Clawbot、球、旗帜、相机、帧回调检测 |
| `ai.js` | ~7 KB | 中/英文自然语言 → VEX C++ 规则引擎 |
| `models.js` | 2.9 MB | xRC 真实模型导出物（已弃用保留，无页面引用） |
| `three.min.js` | 608 KB | three@0.149.0（r150+ 移除 UMD，必须锁 r149） |

**多媒体资源**：14 支队伍开场影片（ffmpeg 720p CRF27）+ 14 张首帧海报。

**核心数据流**：

```
学生代码 → linter.parseBlock(AST) → extractCommands
        → sim.execStack(分帧推进) → SceneAPI.robot.*(驱动)
        → scene 帧回调：到达检测 / 推球 / 超声波 / 相机跟随
```

---

## 2. 版本演进大事记

### v1 ｜ 立项与骨架（08-18）
左编辑 + 右 3D 的首版：`textarea` 透明层叠 `pre` 高亮层、行号槽、Tab/自动缩进；`linter.js` 纯函数静态检查（缺分号/括号配对/未定义标识符/缺 `#include "vex.h"`/缺 `int main`）；命令只取 `main()` 体、自定义函数递归展开；单位换算 1 单位 = 1 ft；`sim.js` 命令队列逐帧执行 drive/turn/arm/claw/wait/print；`scene.js` 手写轨道控制（无 OrbitControls 依赖）。

### v2 ｜ 错误定位 + AI 代码生成栏（08-18）
点击错误项改为真正滚动定位（`locateLine` 把错误行滚到可视区中央 + 闪烁）；新增 `ai.js`：中/英文需求 → VEX C++，支持动作词 + 数量单位（含中文数字"一~十"、`then` 分隔）、一键测试（独立 lint → 提取 → 运行，不动编辑器内容）、复制全部/选中。

### v3–v4 ｜ AI 栏覆盖式 + 点击穿透修复（08-18）
AI 面板由"挤压布局"改为覆盖式（absolute + z-index，场地尺寸不变，展开时背景模糊）；**问题根因**：`scene.js` 的 `setPointerCapture` 吞掉了面板内按钮的 click —— pointerdown 命中 `#aiPanel,#console` 等即 return。

### v5 ｜ High Stakes 场地 + Clawbot 重制（08-18）
按参考图手写 12 ft 场地（泡沫垫 36 格、棋盘格围栏、联盟桩/中立桩/Mobile Goal/吊环/角旗）+ 红黑 Clawbot。后因教学需要全部简化（见 v9）。

### v6–v7 ｜ 保存/退出 + 电影级开场（08-19）
移除顶栏 `headStatus` 文案（界面精简，保留空实现兼容旧调用）；「保存」+ ⌘/Ctrl+S + 脏状态亮黄点（localStorage `vexsim_saved_code_v1`）；左上 ⏻ 退出（脏则弹确认框）；**开场电影界面**：全屏 intro.mp4、任意点击浮出 Enter（细体大字距 hover 变宽）、点 Enter 0.9s 淡出进入；`#introMenu` 队伍视频菜单（三角按钮呼出、当前视频置顶 NOW、Switch/Cancel 二次确认）。

### v8 系列 ｜ 编辑器性能攻坚（08-20）
编辑器存在打字延迟 / 文字不显示 / 滚动后代码隐形三类问题，逐层排查根治：
- **v8**：高亮层 transform 同步滚动（替代 scrollTop 重排）+ 拖拽自动滚动修复 —— 无效；
- **v8.1**：真凶是 3D 渲染**无条件 60fps** 抢 GPU —— 改 **render-on-demand**（`_needsRender` 标志，仅相机/仿真运行时渲染），打字恢复即时；
- **v8.2**：字"慢 1 秒才出现" —— 高亮(0.4ms)与 lint(0.5ms) 均非瓶颈，纯粹是 350ms 防抖阻塞文字 —— **input 立即 renderHighlight，防抖只留给 bug 面板**；行号条加签名缓存；
- **v8.3**：滚动后 main 内代码隐形 —— 高亮层用 `position:absolute;inset:0` 把 box 钉死为容器高，transform 移动整层后内容移出可视区 —— 改 `top/left/right`、高度由内容撑开，`#codeWrap` 负责裁剪。

### v9 ｜ 空场地 + 可推球（08-20）
产品方向调整：场地改为空场地 + 中央球，机器可推球、球无惯性（接触才推、贴墙 clamp）。删光全部比赛道具，机器人简化为推球小车（前铲），新增球体与 `pushBall`。

### 部署与网络攻坚（08-21 ~ 08-25）
- **体积超限**：143 MB（142 MB 视频）超 CloudStudio 413 → imageio-ffmpeg 压缩 → 首版 17 MB；
- **模糊/不播**：云端误传低码率版 + Safari 拦截有声自动播放 → 重压 1080p / 后定 **720p CRF27 + 首帧海报 + LOADING 提示**（云端下载仅 ~126 KB/s）；
- **切视频无声**：`switchIntroVideo` 强制 muted，引入 `userInteracted` 标志按需开声；
- **Safari 黑屏（关键）**：CloudStudio 网关**不支持 HTTP Range**，Safari 拒播 `<video>` —— 用 `fetch → blob → URL.createObjectURL` 包装 src（Blob URL 免 Range）。此经验沉淀为长期约定。

### 09-02 ｜ 超声波传感器 + xRC 建模尝试
- 超声波功能：车头传感器模型 + 射线测距（只认围栏）+ 左上 HUD 实时读数（近距红条警示 + 粉色激光可视化）；linter 把 `while(DistanceSensor.distance(mm)>N){drive(...)}` 折叠为 `__driveUntil` 命令；sim 阈值先查再动。
- **xRC 真实模型导入**：用 UnityPy 从 xRC Simulator 导出 PushBot + Push Back 场地（OBJ/材质/颜色），记录 6 大坑：跨文件 Mesh 引用、静态合批 Combined Mesh 恒等变换、OBJ 组索引、**Unity TRS = T·R·S 必须乘列**、prefab 假原点反向补偿、skip 记 GO 而非 Transform。

### 09-03 ｜ PBR 画质 → 回退 → 吸附球 → 控制流
- 上午为 xRC 模型补充 PBR + 贴图 + UV（PMREM IBL、ACES、拉丝铝金属）—— 评估后决定**回退到 Clawbot + 空场地**版本。结论：高保真渲染调优投入产出比低，教学可用性优先。
- 下午球改为"**碰到即吸附**"（`ballHeld`，随爪移动/转向/臂升降，爪张开放下）；
- 傍晚支持 **if/else/while 控制流**：`walk` 线性扫描 → `parseBlock` 递归下降 AST；sim 从命令队列改为 `execStack`（顺序帧 + 循环帧，`MAX_LOOP=100` 防死循环）。

### 09-04 ｜ 训练模式（Practice）+ merit 积分
- **训练模式**：顶栏「训练」按钮 + 关卡下拉；点击浮现 "Practice!"（后定 2 s，位于代码栏上方）；任务模板无示例代码；终点**随机旗帜**（完成才刷新），机器碰到（<0.8 ft）即到达；
- 到达庆祝：代码栏位置浮现**彩虹渐变**「🎉Congrats！！」+ 70 片 CSS 彩带 + 下方 `+0.0X merits🥇`；merit 徽章入顶栏（localStorage `vexsim_merit_v1` 持久化，第一关每次 +0.05~0.10 随机）。

### 09-05 ~ 09-06 ｜ 教学化精简收官
- 复位按钮：运行结束浮现「复位」→ 机器回起点（后演进为"完成自动复位 / 未完成手动复位"）；
- 开场影片扩容：新增 9 支 Worlds Reveal（共 14 支），**随机不重复轮播**（Fisher-Yates 洗牌队列，一轮播完重新洗牌）；
- Enter 挡板美学多轮打磨：矩形卡片 → 梯形（clip-path 斜边贯穿屏幕、E 左上角压线）→ 模糊调轻（14 px → 4 px）；
- **大清理**：删除「示例」「编译」按钮与逻辑；关卡下拉改"只显示关卡数、点击展开"；删除场景提示/中间状态栏/logo 副标题；`#console` 移右下角，运行状态改**彩色字**滚入控制台；
- 09-06：Congrats 全程清晰停留 3 s（去掉模糊淡出）；**到达终点先 `SimAPI.stop(false)` 再复位**（修复"平移一段距离未复位"）；顶栏三区化（`hb-center` 居中收纳 关卡/训练/保存，右上只留 运行/停止/复位）；训练按钮 toggle（进入变「退出训练」）；Enter 字距 .26em → .46em。

---

## 3. 关键技术决策与问题排查精华

**编辑器性能**
1. 3D 无限渲染是打字延迟元凶 → **render-on-demand**（空闲零 GPU）。
2. 高亮/行号每键重建 → 高亮即时化 + lint 防抖 + 行号签名缓存。
3. 滚动同步用 transform 的前提：被移动元素 box 高 = 内容高（`absolute inset:0` 会破坏该前提）。

**代码解析**
4. `#include "vex.h"` 检测必须走**原始 code**（字符串剥离后引号消失）；注释必须先剥离再提取（保留字符串内容，避免 print 文本丢失）。
5. 命令只取 `main()` 体、自定义函数**遍历顺序**展开；控制流用递归下降 parseBlock + 执行栈。
6. AI `wait` 单位换算混乱 → parseSegment 统一转 ms。

**3D / 渲染**
7. 相机相对**世界原点**定位 → 旋转时"自动缩放"假象 → 相机 = 机器人实时位置 + 球坐标偏移。
8. Three.js 几何方向需实测验证 —— 用 Node + three.min.js 打印世界坐标校验（爪朝向曾两度反置）。
9. `new Float32Array([[x,y,z],...])` 不自动扁平 → 顶点全 NaN 不可见 → 手动 `flatV3`。

**网络 / 部署**
10. CloudStudio 无 Range 网关 + Safari = 视频黑屏 → Blob URL 包装。
11. 云端下载慢 → 720p CRF27 + poster 秒出首帧 + LOADING 兜底。
12. 代码修改后**必须重新 deploy** 才生效（曾漏部署导致线上为旧版）。

---

## 4. 测试与质量保障

| 套件 | 文件 | 覆盖 | 规模 |
|---|---|---|---|
| 传感器/回归 | `.workbuddy/tests/test_sensor.js` | linter / ai / sim 引擎 / DOM 冒烟（vm + DOM mock） | 31/31 |
| 控制流 | `.workbuddy/tests/test_controlflow.js` | if/else/while AST、条件表达式、循环执行 | 20/20 |

开发期另使用 Node + three.min.js 几何验证脚本（爪穿模、世界 AABB 检查）。**经验**：mock DOM 需实现 querySelector/closest/stopPropagation/classList.toggle(force)/dataset 预填；测试文件存放于 `.workbuddy/tests/`（`/tmp` 跨会话会被清理）。

---

## 5. 部署与运维手册

- 部署：`workbuddy_cloudstudio_deploy`，sandboxId 固定 `aca91a0ce4c84b87b19228d080b17caa`，分享链接不变。
- `/tmp/vex-sim-deploy` 会被系统清理，**每次部署前需重建**：14 视频（ffmpeg 720p CRF27 + faststart + aac 96k）+ 14 海报 + 代码。
- ffmpeg 取 imageio-ffmpeg 内嵌二进制；无 ffprobe，用 `-map 0:a:0?` 兼容无音轨视频。
- 新队伍视频接入：mp4 压缩为 `intro-<名>.mp4` + 首帧 `intro-<名>.jpg`，并在 `app.js` 的 `INTRO_VIDEOS` 增加一条记录。
- 验证套路：`curl` 云端各文件 grep 关键函数 + 视频 HTTP 200。

---

## 6. UI 风格演进约定

- 极简、克制：细描边按钮 + 大字距（letter-spacing .24em）+ 近黑玻璃底 + 直角 2 px + 淡青点缀 `#8fd0f5`，与开场细体大字风格统一。
- 开场 Enter 系列多轮迭代 —— 最终为全高梯形挡板（`clip-path:polygon(34% 0,100% 0,100% 100%,6% 100%)`）+ 斜边高亮细线 + 仅保留 Enter，字距 .46em。
- 动效克制：浮现/收起 0.2~0.9 s、cubic-bezier(.22,.9,.26,1)，避免廉价塑料感。

---

## 7. 遗留与路线图（候选）

- `models.js`（xRC 导出 2.9 MB）已无引用，可删除减负；
- 训练关卡目前仅 1 关，可扩展多关卡定义（任务/地图/机器初始姿态差异化）；
- merit 规则（完成次数加成、关卡差异化数值、排行榜）可按教学需要细化；
- 开场 14 支视频 302 MB 部署体量较大，可评估按需加载或缩库。

---

*版本与变更记录维护于项目工作区。*
