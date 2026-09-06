/* sim.js - 仿真引擎：把 VexLint 提取的命令按序驱动 Clawbot 动画 */
(function () {
  'use strict';
  var robot = window.SceneAPI && window.SceneAPI.robot;
  if (!robot) { console.error('SceneAPI 未就绪'); return; }
  var _render = (window.SceneAPI && window.SceneAPI.requestRender) || function () {};

  var FIELD = 5.6;              // 场地半宽（12ft / 2，留点边距）
  var SPEED_DRIVE = 1.6;        // ft/s
  var SPEED_TURN = 130;         // deg/s
  var SPEED_ARM = 95;           // deg/s
  var WHEEL_R = 0.21;

  var execStack = [], running = false, cur = null, startAt = 0, dur = 0;
  var MAX_LOOP = 100; // while 循环最大迭代次数（防 while(true) 死循环）
  var fromPos = null, toPos = null, fromHead = 0, toHead = 0, wheelAcc = 0;
  var armStart = 0, armTarget = 0, clawOpen = 0.15, clawTarget = 0;
  var driveDir = null, duWheel = 0; // 超声波引导前进：方向 + 已滚过的轮角

  function getDistMM() {
    return (window.SceneAPI && window.SceneAPI.getDistanceMM) ? window.SceneAPI.getDistanceMM() : 99999;
  }

  var hooks = { log: function () {}, status: function () {}, end: function () {} };
  function setStatus(s) { hooks.status(s); }
  function log(s) { hooks.log(s); }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function wrap180(d) { while (d > 180) d -= 360; while (d < -180) d += 360; return d; }

  function resetRobot() {
    robot.reset();
    wheelAcc = 0; duWheel = 0; driveDir = null;
    armStart = 0; clawOpen = 0.15; clawTarget = 0.15;
    fromHead = toHead = 0;
    fromPos = toPos = new THREE.Vector3(-3.4, 0, -3.4);
    robot.setPos(fromPos.x, fromPos.z);
  }

  function setup(c) {
    cur = c;
    var p = robot.group.position;
    switch (c.type) {
      case 'drive': {
        var h = -robot.group.rotation.y; // heading（弧度，绕 +y）
        var d = c.dir === 'forward' ? 1 : -1;
        var dx = Math.cos(h) * d * c.dist, dz = Math.sin(h) * d * c.dist;
        fromPos = new THREE.Vector3(p.x, 0, p.z);
        toPos = new THREE.Vector3(
          clamp(p.x + dx, -FIELD, FIELD), 0, clamp(p.z + dz, -FIELD, FIELD)
        );
        wheelAcc = (d * c.dist) / WHEEL_R;
        dur = Math.max(0.4, c.dist / SPEED_DRIVE) * 1000;
        startAt = performance.now();
        log(c.dir === 'forward' ? '前进 ' + c.dist.toFixed(1) + ' ft' : '后退 ' + c.dist.toFixed(1) + ' ft');
        break;
      }
      case 'turn': {
        var delta = c.dir === 'right' ? c.deg : -c.deg;
        fromHead = -robot.group.rotation.y * 180 / Math.PI;
        toHead = fromHead + delta;
        dur = Math.max(0.35, Math.abs(delta) / SPEED_TURN) * 1000;
        startAt = performance.now();
        log((c.dir === 'right' ? '右转 ' : '左转 ') + c.deg + '°');
        break;
      }
      case 'arm': {
        // armStart 已由内部跟踪（初始 0 或上一条 arm 指令结束后的值），不直接读 3D 对象
        armTarget = c.deg;
        dur = Math.max(0.4, Math.abs(armTarget - armStart) / SPEED_ARM) * 1000;
        startAt = performance.now();
        log('机械臂抬升至 ' + c.deg + '°');
        break;
      }
      case 'claw': {
        clawTarget = clamp(c.deg / 300, 0, 1);
        dur = 700;
        startAt = performance.now();
        log(c.deg >= 150 ? '爪子张开' : '爪子闭合');
        break;
      }
      case 'driveUntil': { // 超声波引导：一直前进，距离障碍物 ≤ 阈值（c.dist，ft）就停
        var hu = -robot.group.rotation.y;
        driveDir = { x: Math.cos(hu), z: Math.sin(hu) };
        duWheel = 0;
        fromPos = new THREE.Vector3(p.x, 0, p.z);
        dur = 30000; // 30s 兜底（正常情况下到阈值/撞墙就提前结束）
        startAt = performance.now();
        log('超声波引导前进：距障碍物 ' + Math.round(c.dist * 304.8) + ' mm 以内停车');
        break;
      }
      case 'printDist': {
        dur = 150; startAt = performance.now();
        var mm = Math.round(getDistMM());
        log('Brain.Screen 输出: ' + (c.text.indexOf('%d') >= 0 ? c.text.replace('%d', mm) : c.text + mm) + ' mm');
        break;
      }
      case 'wait':
        dur = c.ms; startAt = performance.now();
        log('等待 ' + (c.ms / 1000).toFixed(1) + ' 秒');
        break;
      case 'print':
        dur = 150; startAt = performance.now();
        log('Brain.Screen 输出: ' + c.text);
        break;
      case 'init':
        dur = 200; startAt = performance.now();
        log('vexcodeInit() — 系统初始化完成');
        break;
      default: cur = null; advance(); return;
    }
  }

  function apply(p) {
    if (!cur) return;
    var k = cur.type;
    if (k === 'drive') {
      robot.setPos(fromPos.x + (toPos.x - fromPos.x) * p, fromPos.z + (toPos.z - fromPos.z) * p);
      robot.spinWheels(wheelAcc * p);
    } else if (k === 'driveUntil') {
      // 恒速前进：位置 = 起点 + 方向 × 速度 × 已过时间（不做端点插值）
      var d = SPEED_DRIVE * (dur * p) / 1000;
      var nx = clamp(fromPos.x + driveDir.x * d, -FIELD, FIELD);
      var nz = clamp(fromPos.z + driveDir.z * d, -FIELD, FIELD);
      robot.setPos(nx, nz);
      var wa = d / WHEEL_R;            // 本次累计轮角
      robot.spinWheels(wa - duWheel);  // 只补增量（apply 每帧都会调）
      duWheel = wa;
    } else if (k === 'turn') {
      robot.setHeading(fromHead + (toHead - fromHead) * p);
    } else if (k === 'arm') {
      robot.setArm(armStart + (armTarget - armStart) * p);
    } else if (k === 'claw') {
      var open0 = clawOpen;
      clawOpen = open0 + (clawTarget - open0) * p;
      robot.setClaw(clawOpen);
    }
  }

  /* ---------------- 条件求值（if / while 用） ---------------- */
  function evalOperand(e) {
    if (!e) return 0;
    if (e.kind === 'dist') return getDistMM();
    if (e.kind === 'num') return e.val;
    if (e.kind === 'bool') return e.val ? 1 : 0;
    return 0;
  }
  function evalCond(c) {
    if (!c) return false;
    switch (c.kind) {
      case 'bool': return !!c.val;
      case 'num': return c.val !== 0;
      case 'dist': return getDistMM() !== 0;
      case 'cmp': {
        var l = evalOperand(c.left), r = evalOperand(c.right);
        switch (c.op) {
          case '>': return l > r;
          case '<': return l < r;
          case '>=': return l >= r;
          case '<=': return l <= r;
          case '==': return l === r;
          case '!=': return l !== r;
        }
        return false;
      }
      case 'and': return evalCond(c.left) && evalCond(c.right);
      case 'or': return evalCond(c.left) || evalCond(c.right);
      case 'not': return !evalCond(c.e);
    }
    return false;
  }

  // 从执行栈取下一个叶子命令（递归展开 if / while 控制流）
  function advance() {
    cur = null;
    while (execStack.length) {
      var top = execStack[execStack.length - 1];
      if (top.whileNode) {
        // 循环帧：body 已执行完，回到这里重新判断条件
        if (evalCond(top.whileNode.cond)) {
          top.count = (top.count || 0) + 1;
          if (top.count > MAX_LOOP) {
            log('⚠ while 循环超过 ' + MAX_LOOP + ' 次，已自动停止（避免死循环）');
            execStack.pop();
            continue;
          }
          execStack.push({ nodes: top.whileNode.body, idx: 0 });
        } else {
          execStack.pop(); // 条件为假，退出循环
        }
        continue;
      }
      if (top.idx >= top.nodes.length) { execStack.pop(); continue; }
      var node = top.nodes[top.idx++];
      if (node.type === 'if') {
        var c = evalCond(node.cond);
        var branch = c ? node.then : (node.else || []);
        if (branch && branch.length) execStack.push({ nodes: branch, idx: 0 });
        continue;
      }
      if (node.type === 'while') {
        execStack.push({ whileNode: node, count: 0 });
        continue;
      }
      // 叶子命令
      cur = node;
      setup(node);
      return;
    }
    finish();
  }

  function finish() {
    running = false;
    setStatus('运行完成 ✓');
    log('—— 程序运行结束 ——');
    hooks.end();
  }

  function tick() {
    if (!running) return;
    if (!cur) { advance(); return; }
    // 超声波阈值检查（先查再动）：当前距离已 ≤ 阈值就立即结束本命令，不再前进
    if (cur.type === 'driveUntil' && getDistMM() <= cur.dist * 304.8 + 0.5) {
      log('超声波：' + Math.round(getDistMM()) + ' mm ≤ 阈值，停车');
      cur = null;
      advance();
      return;
    }
    var p = Math.min(1, (performance.now() - startAt) / dur);
    apply(p);
    if (p >= 1) {
      if (cur.type === 'arm') armStart = armTarget;   // 记住手臂最终位置，供下一条 arm 指令使用
      if (cur.type === 'claw') clawOpen = clawTarget;  // 同步爪子状态
      advance();
    }
    _render(); // 仿真运行中每帧请求渲染
  }

  function runProgram(commands) {
    stop(false);
    resetRobot();
    execStack = [{ nodes: commands, idx: 0 }];
    if (!commands || !commands.length) { setStatus('没有可执行的动作命令'); return; }
    setStatus('运行中…');
    running = true;
  }
  function stop(logIt) {
    running = false; cur = null; execStack = [];
    if (logIt !== false) { setStatus('已停止'); log('—— 运行已停止 ——'); }
  }

  SceneAPI.addFrameCallback(tick);

  window.SimAPI = {
    runProgram: runProgram,
    stop: stop,
    onLog: function (fn) { hooks.log = fn; },
    onStatus: function (fn) { hooks.status = fn; },
    onEnd: function (fn) { hooks.end = fn; }
  };
})();
