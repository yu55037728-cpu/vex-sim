/* app.js - 编辑器、高亮、Bug 面板与按钮接线 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var VexLint = window.VexLint, SimAPI = window.SimAPI;
  var LH = 21; // 行高 px，必须与 CSS 一致

  var codeEl = $('code'), hlEl = $('hl'), gutInner = $('gutInner');
  var errListEl = $('errList'), errCountEl = $('errCount');
  var btnRun = $('btnRun'), btnStop = $('btnStop');
  var btnSave = $('btnSave'), btnExit = $('btnExit');
  var consoleEl = $('console');

  var errs = [];
  var errLines = new Set();

  /* ---------------- 转义与分色高亮 ---------------- */
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  var KW = new Set(['using','namespace','return','if','else','for','while','do','switch','case','break','continue','int','void','double','float','bool','char','long','short','unsigned','true','false','struct','class','enum','public','private','protected','static','const','this','new','NULL','nullptr','vex','std']);
  var TY = new Set(['motor','motor_group','drivetrain','controller','brain','inertial','rotation','distance','optical','vision','bumper','limit','sonar','gyro','triport','competition','encoder','potentiometer']);
  var APIW = new Set(['Drivetrain','Brain','Controller1','LeftMotor','RightMotor','ArmMotor','ClawMotor','LeftDrive','RightDrive','DistanceSensor','vexcodeInit','vexcodeCompetition','wait','degrees','inches','mm','cm','percent','rpm','seconds','msec','minutes','forward','reverse','left','right','hold','brake','coast','velocityUnits','directionType','turnType','timeUnits','percentUnits','distanceUnits','pct','ratio18_1','ratio36_1','ratio6_1','ratio5_1']);
  for (var p = 1; p <= 22; p++) APIW.add('PORT' + p);

  var RE = new RegExp([
    '(\\/\\/.*)',
    '|("(?:[^"\\\\]|\\\\.)*")',
    '|(#include[^\\n]*)',
    '|(\\b\\d+(?:\\.\\d+)?\\b)',
    '|(\\b(?:' + Array.from(KW).join('|') + ')\\b)',
    '|(\\b(?:' + Array.from(TY).join('|') + ')\\b)',
    '|(\\b(?:' + Array.from(APIW).join('|') + ')\\b)',
    '|(\\b[A-Za-z_]\\w*\\b\\s*\\()',
    '|(\\b[A-Za-z_]\\w*\\b)'
  ].join(''), 'g');

  function highlightLine(line) {
    var out = '', last = 0, m;
    RE.lastIndex = 0;
    while ((m = RE.exec(line))) {
      out += esc(line.slice(last, m.index));
      if (m[1]) out += '<span class="tk-com">' + esc(m[1]) + '</span>';
      else if (m[2]) out += '<span class="tk-str">' + esc(m[2]) + '</span>';
      else if (m[3]) out += '<span class="tk-pre">' + esc(m[3]) + '</span>';
      else if (m[4]) out += '<span class="tk-num">' + esc(m[4]) + '</span>';
      else if (m[5]) out += '<span class="tk-kw">' + esc(m[5]) + '</span>';
      else if (m[6]) out += '<span class="tk-type">' + esc(m[6]) + '</span>';
      else if (m[7]) out += '<span class="tk-api">' + esc(m[7]) + '</span>';
      else if (m[8]) out += '<span class="tk-fn">' + esc(m[8].replace(/\s*\(\s*$/, '')) + '</span><span class="tk-pun">(</span>';
      else out += esc(m[9]);
      last = m.index + m[0].length;
    }
    out += esc(line.slice(last));
    return out;
  }

  var _gutSig = ''; // 行号条签名：行数 + 错误行集合，没变化就跳过重建（打字时每次按键都会走 renderHighlight）
  function renderGutter(n) {
    var sig = n + ':' + Array.from(errLines).join(',');
    if (sig === _gutSig) return;
    _gutSig = sig;
    var h = '';
    for (var i = 1; i <= n; i++) {
      var isErr = errLines.has(i - 1);
      h += '<div class="gn' + (isErr ? ' ge' : '') + '">' + (isErr ? '<i>✕</i>' : '') + i + '</div>';
    }
    gutInner.innerHTML = h;
    gutInner.style.height = (n * LH) + 'px';
    syncScroll();
  }

  function renderHighlight() {
    var lines = codeEl.value.split('\n');
    var h = '';
    for (var i = 0; i < lines.length; i++) {
      h += '<span class="l' + (errLines.has(i) ? ' el' : '') + '">' + highlightLine(lines[i]) + '</span>\n';
    }
    hlEl.innerHTML = h;
    renderGutter(lines.length);
  }

  /* 滚动同步：用 transform + rAF，避免每次按键触发布局重排 */
  var _scrollRAF = false;
  function syncScroll() {
    if (_scrollRAF) return;
    _scrollRAF = true;
    requestAnimationFrame(function () {
      _scrollRAF = false;
      var st = codeEl.scrollTop, sl = codeEl.scrollLeft;
      hlEl.style.transform = 'translate(' + (-sl) + 'px,' + (-st) + 'px)';
      gutInner.style.transform = 'translateY(' + (-st) + 'px)';
    });
  }
  codeEl.addEventListener('scroll', syncScroll);

  /* 拖拽选中文本时自动滚动：鼠标拖到编辑区顶部/底部边缘时自动上下滚 */
  var _dragSel = false, _dragMY = 0, _dragTimer = null;
  function _dragAutoScroll() {
    if (!_dragSel) { if (_dragTimer) { clearInterval(_dragTimer); _dragTimer = null; } return; }
    var rect = codeEl.getBoundingClientRect();
    var y = _dragMY - rect.top;
    var margin = 60;
    if (y > rect.height - margin) {
      codeEl.scrollTop += Math.max(2, (y - (rect.height - margin)) * 0.35);
    } else if (y < margin) {
      codeEl.scrollTop -= Math.max(2, (margin - Math.max(0, y)) * 0.35);
    }
  }
  codeEl.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    _dragSel = true; _dragMY = e.clientY;
    if (_dragTimer) clearInterval(_dragTimer);
    _dragTimer = setInterval(_dragAutoScroll, 16);
  });
  window.addEventListener('mousemove', function (e) { if (_dragSel) _dragMY = e.clientY; });
  window.addEventListener('mouseup', function () {
    _dragSel = false;
    if (_dragTimer) { clearInterval(_dragTimer); _dragTimer = null; }
  });

  /* ---------------- 检测与面板 ---------------- */
  function lintNow() {
    var res = VexLint.lint(codeEl.value);
    errs = res.errors;
    errLines.clear();
    errs.forEach(function (e) { if (e.severity === 'error') errLines.add(e.line); });
    renderErrPanel();
    renderHighlight();
    return res.errorCount;
  }

  function renderErrPanel() {
    var errN = 0, warnN = 0;
    errs.forEach(function (e) { if (e.severity === 'error') errN++; else warnN++; });
    errCountEl.textContent = errN + ' 错误 · ' + warnN + ' 提示';
    var h = '';
    errs.forEach(function (e, idx) {
      var icon = e.severity === 'error' ? '✕' : '⚠';
      h += '<div class="err-item ' + e.severity + '" data-line="' + e.line + '" data-idx="' + idx + '">' +
        '<span class="e-ic">' + icon + '</span>' +
        '<span class="e-line">L' + (e.line + 1) + '</span>' +
        '<span class="e-msg">' + esc(e.msg) + '</span></div>';
    });
    errListEl.innerHTML = h || '<div class="err-empty">没有检测到问题 ✓</div>';
    btnRun.disabled = errN > 0;
    btnRun.title = errN > 0 ? '存在 ' + errN + ' 个错误，请先修复' : '运行程序';
  }

  function locateLine(line) {
    // 计算该行起始偏移并让光标跳过去（原生滚动定位）
    var lines = codeEl.value.split('\n'), off = 0, i;
    for (i = 0; i < line && i < lines.length; i++) off += lines[i].length + 1;
    // 滚动让该行可见并尽量居中
    var target = line * LH - (codeEl.clientHeight - LH) / 2;
    codeEl.scrollTop = Math.max(0, target);
    codeEl.scrollLeft = 0;
    syncScroll();
    codeEl.focus({ preventScroll: true });
    codeEl.setSelectionRange(off, off + (lines[line] ? lines[line].length : 0));
    // 闪烁高亮该行
    var spans = hlEl.querySelectorAll('.l');
    if (spans[line]) {
      spans[line].classList.add('flash');
      setTimeout(function () { spans[line] && spans[line].classList.remove('flash'); }, 1300);
    }
    var gns = gutInner.querySelectorAll('.gn');
    if (gns[line]) { gns[line].classList.add('flash'); setTimeout(function () { gns[line] && gns[line].classList.remove('flash'); }, 1300); }
  }

  errListEl.addEventListener('click', function (e) {
    var it = e.target.closest('.err-item');
    if (it) locateLine(parseInt(it.dataset.line, 10));
  });

  /* ---------------- 编辑辅助 ---------------- */
  function setCode(txt) {
    codeEl.value = txt;
    codeEl.scrollTop = 0;
    lintNow();
    refreshDirty();
  }

  /* 编辑器内容变化后的防抖检测（统一入口） */
  function scheduleLint() {
    clearTimeout(codeEl._t);
    codeEl._t = setTimeout(lintNow, 350);
  }

  codeEl.addEventListener('input', function () {
    renderHighlight(); // 立即刷新高亮层显示文字（只分色，0.4ms 级），不等防抖
    scheduleLint();    // 350ms 防抖做 Bug 检测，不阻塞打字
    syncScroll();
    refreshDirty();
  });

  codeEl.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      var s = codeEl.selectionStart, v = codeEl.value;
      codeEl.value = v.slice(0, s) + '  ' + v.slice(codeEl.selectionEnd);
      codeEl.setSelectionRange(s + 2, s + 2);
      renderHighlight(); scheduleLint(); syncScroll(); refreshDirty();
    } else if (e.key === 'Enter') {
      // 简单自动缩进：继承光标所在行的行首空白
      var sel = codeEl.selectionStart, val = codeEl.value;
      var lineStart = val.lastIndexOf('\n', sel - 1) + 1;
      var lineEnd = val.indexOf('\n', sel);
      var lineEndIdx = lineEnd === -1 ? val.length : lineEnd;
      var indent = /^[ \t]*/.exec(val.slice(lineStart, lineEndIdx))[0];
      e.preventDefault();
      codeEl.value = val.slice(0, sel) + '\n' + indent + val.slice(codeEl.selectionEnd);
      codeEl.setSelectionRange(sel + 1 + indent.length, sel + 1 + indent.length);
      renderHighlight(); scheduleLint(); syncScroll(); refreshDirty();
    }
  });

  /* ---------------- 控制台与状态 ---------------- */
  function logLine(txt) {
    var d = document.createElement('div');
    d.className = 'cl';
    d.textContent = '> ' + txt;
    consoleEl.appendChild(d);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || 'info');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 350); }, 2200);
  }
  // 运行状态：以彩色字滚入右下角控制台（替代原中间状态栏）
  function statusLog(s) {
    var color = '#9fd8c8';
    if (s.indexOf('运行完成') === 0) color = '#7fe08a';
    else if (s.indexOf('运行中') === 0) color = '#7fc8ff';
    else if (s.indexOf('已停止') === 0) color = '#ffb47f';
    else if (s.indexOf('没有') === 0) color = '#ff9fb0';
    var d = document.createElement('div');
    d.className = 'cl';
    d.style.color = color;
    d.textContent = '▶ ' + s;
    consoleEl.appendChild(d);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  /* ---------------- 按钮 ---------------- */
  btnRun.addEventListener('click', function () {
    var n = lintNow();
    if (n > 0) { toast('请先修复 ' + n + ' 个错误再运行', 'bad'); return; }
    var cmds = VexLint.extractCommands(codeEl.value);
    logLine('========== 开始运行 ==========');
    hideReset();
    SimAPI.runProgram(cmds);
  });

  btnStop.addEventListener('click', function () {
    SimAPI.stop();
    showReset();
  });

  /* ---------------- 复位按钮（每次运行结束出现，点击机器人回起点） ---------------- */
  var btnReset = $('btnReset');
  function showReset() { if (btnReset) btnReset.hidden = false; }
  function hideReset() { if (btnReset) btnReset.hidden = true; }
  if (btnReset) btnReset.addEventListener('click', function () {
    if (window.SceneAPI && SceneAPI.robot) SceneAPI.robot.reset();
    hideReset();
    logLine('—— 已复位：机器人回到起点 ——');
    toast('机器人已回到起点', 'ok');
  });

  /* ---------------- 训练模式（Practice） ---------------- */
  var btnPractice = $('btnPractice'), practiceBanner = $('practiceBanner');
  var levelWrap = $('levelWrap'), levelBtn = $('levelBtn'), levelMenu = $('levelMenu');
  var currentLevel = 1;
  var congratsWrap = $('congratsWrap'), congratsBanner = $('congratsBanner'), meritToast = $('meritToast');
  var meritValEl = $('meritVal'), meritBadge = $('meritBadge');
  var practiceMode = false;

  // merit 积分（localStorage 持久化）
  var MERIT_KEY = 'vexsim_merit_v1';
  var merit = 0;
  try { merit = parseFloat(localStorage.getItem(MERIT_KEY)) || 0; } catch (e) {}

  function renderMerit() {
    if (meritValEl) meritValEl.textContent = merit.toFixed(2);
  }
  function addMerit(v) {
    merit = Math.round((merit + v) * 100) / 100;
    try { localStorage.setItem(MERIT_KEY, String(merit)); } catch (e) {}
    renderMerit();
    if (meritBadge) { // 徽章跳动反馈
      meritBadge.classList.remove('bump');
      void meritBadge.offsetWidth;
      meritBadge.classList.add('bump');
    }
  }

  // 彩带纸片
  function spawnConfetti() {
    var colors = ['#ff5a5a', '#ffa64d', '#ffd94d', '#5aff9a', '#5ac8ff', '#b45aff', '#ff5ad2', '#ff8fd0'];
    for (var i = 0; i < 70; i++) {
      var c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = (Math.random() * 100) + '%';
      c.style.background = colors[i % colors.length];
      c.style.setProperty('--tx', (Math.random() * 240 - 120) + 'px');
      c.style.setProperty('--rot', (Math.random() * 1080 - 540) + 'deg');
      c.style.animationDelay = (Math.random() * 0.4) + 's';
      c.style.animationDuration = (2.4 + Math.random() * 1.6) + 's';
      document.body.appendChild(c);
      (function (el) { setTimeout(function () { el.remove(); }, 4500); })(c);
    }
  }
  // 到达终点：彩色 Congrats + 下方显示加了多少 merit + 彩带
  function showCongrats(gained) {
    if (congratsBanner) congratsBanner.textContent = '🎉Congrats！！';
    if (meritToast) meritToast.textContent = '+' + gained.toFixed(2) + ' merits🥇';
    if (congratsWrap) {
      congratsWrap.classList.remove('show');
      void congratsWrap.offsetWidth;
      congratsWrap.classList.add('show');
    }
    spawnConfetti();
  }

  var DEFAULT_TEMPLATE = [
    '#include "vex.h"',
    'using namespace vex;',
    '',
    'int main() {',
    '  vexcodeInit();',
    '  // 在这里编写你的机器人程序',
    '  ',
    '  return 0;',
    '}'
  ].join('\n');

  var PRACTICE_TEMPLATE = [
    '#include "vex.h"',
    'using namespace vex;',
    '',
    'int main() {',
    '  vexcodeInit();',
    '  // 任务：用前进 / 后退 / 转向，让机器人走到红色旗帜处',
    '  ',
    '  return 0;',
    '}'
  ].join('\n');

  function enterPractice() {
    practiceMode = true;
    var lv = currentLevel;
    setCode(PRACTICE_TEMPLATE);
    if (window.SceneAPI && SceneAPI.practice) SceneAPI.practice.enter(lv);
    btnPractice.classList.add('active');
    btnPractice.textContent = '退出训练';
    toast('训练模式：走到旗帜处即到达终点', 'ok');
    logLine('—— 进入训练模式（关卡 ' + lv + '：前进后退转向）——');
  }
  function exitPractice() {
    if (!practiceMode) return;
    practiceMode = false;
    SimAPI.stop(false);
    if (window.SceneAPI && SceneAPI.practice) SceneAPI.practice.exit();
    if (window.SceneAPI && SceneAPI.robot) SceneAPI.robot.reset();
    btnPractice.classList.remove('active');
    btnPractice.textContent = '训练';
  }

  btnPractice.addEventListener('click', function () {
    if (practiceMode) { // 已进入练习 → 按钮变「退出训练」，再点即退出
      exitPractice();
      setCode(DEFAULT_TEMPLATE);
      toast('已退出训练模式', '');
      return;
    }
    // 丝滑浮现 Practice! 文字，短暂出现后消失
    practiceBanner.textContent = 'Practice!';
    practiceBanner.classList.remove('show');
    void practiceBanner.offsetWidth; // 强制重排以重启动画
    practiceBanner.classList.add('show');
    enterPractice();
  });

  /* 关卡下拉：按钮只显示关卡数，点击展开完整选项；点外部收起 */
  levelBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    levelMenu.hidden = !levelMenu.hidden;
  });
  document.addEventListener('click', function (e) {
    if (levelMenu && !levelMenu.hidden && levelWrap && !levelWrap.contains(e.target)) levelMenu.hidden = true;
  });
  levelMenu.addEventListener('click', function (e) {
    var it = e.target && e.target.closest ? e.target.closest('.level-item') : null;
    if (!it) return;
    var lv = parseInt(it.getAttribute('data-lv'), 10) || 1;
    currentLevel = lv;
    levelBtn.textContent = '关卡 ' + lv;
    levelMenu.hidden = true;
    var items = levelMenu.querySelectorAll('.level-item');
    for (var i = 0; i < items.length; i++) items[i].classList.toggle('active', items[i] === it);
    if (practiceMode && window.SceneAPI && SceneAPI.practice) SceneAPI.practice.enter(lv);
    toast('切换到关卡 ' + lv, 'ok');
  });

  if (window.SceneAPI && SceneAPI.practice) {
    SceneAPI.practice.onReach(function () {
      // 完成一次任务：先静默停掉仍在运行的程序（否则会继续驱动机器人平移），再自动复位回起点
      SimAPI.stop(false);
      if (window.SceneAPI && SceneAPI.robot) SceneAPI.robot.reset();
      hideReset();
      // 第一关（较简单）：每次到达 +0.05 ~ 0.1 随机 merit
      var gained = Math.round((0.05 + Math.random() * 0.05) * 100) / 100;
      addMerit(gained);
      showCongrats(gained);
      logLine('—— 到达终点！+' + gained.toFixed(2) + ' merits ——');
    });
  }

  renderMerit(); // 启动时显示已累积的 merit

  SimAPI.onLog(logLine);
  SimAPI.onStatus(statusLog); // 运行状态以彩色字显示在右下角控制台
  SimAPI.onEnd(function () { showReset(); });

  /* ---------------- AI 代码生成面板 ---------------- */
  var btnAI = $('btnAI'), aiPanel = $('aiPanel'), aiClose = $('aiClose');
  var aiReq = $('aiReq'), aiHl = $('aiHl'), aiInfo = $('aiInfo');
  var btnGen = $('btnGen'), btnAiTest = $('btnAiTest'), btnAiCopyAll = $('btnAiCopyAll'), btnAiCopySel = $('btnAiCopySel');
  var scenePanelEl = $('scenePanel'), sceneVeilEl = $('sceneVeil');
  var aiCode = null;

  function aiMsg(txt, kind) {
    aiInfo.textContent = txt;
    aiInfo.className = kind || '';
  }

  function toggleAI(force) {
    var open = force !== undefined ? force : aiPanel.hidden;
    aiPanel.hidden = !open;
    btnAI.classList.toggle('open', open);
    scenePanelEl.classList.toggle('blurred', open); // 场地模糊/恢复清晰，布局不动
    sceneVeilEl.hidden = !open;
    if (open) aiReq.focus();
  }
  btnAI.addEventListener('click', function () { toggleAI(); });
  aiClose.addEventListener('click', function () { toggleAI(false); });

  function renderAiCode(code) {
    var h = '';
    code.split('\n').forEach(function (ln) { h += highlightLine(ln) + '\n'; });
    aiHl.innerHTML = h;
  }

  btnGen.addEventListener('click', function () {
    var r = window.AIgen.generate(aiReq.value);
    if (!r.code) {
      aiCode = null;
      aiHl.innerHTML = '<span id="aiEmpty">' + (r.reason === 'empty' ? '请先在下方输入需求描述' : '没有识别到可执行的动作，试试「前进12英寸」「右转90度」「抬臂」「开爪」「等2秒」「打印"你好"」「超声波前进到300毫米」「显示距离」') + '</span>';
      aiMsg('识别失败：请用「动作 + 数量」的方式描述', 'bad');
      return;
    }
    aiCode = r.code;
    renderAiCode(r.code);
    aiMsg('已生成 ' + r.matched + ' 个动作，可「一键测试」或复制', 'ok');
    logLine('—— AI 生成了 ' + r.matched + ' 个动作的代码 ——');
  });
  aiReq.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); btnGen.click(); }
  });

  btnAiTest.addEventListener('click', function () {
    if (!aiCode) { aiMsg('请先生成代码', 'bad'); return; }
    var res = VexLint.lint(aiCode);
    if (res.errorCount > 0) {
      aiMsg('生成代码有 ' + res.errorCount + ' 个错误（引擎缺陷，请反馈）', 'bad');
      return;
    }
    var cmds = VexLint.extractCommands(aiCode);
    if (!cmds.length) { aiMsg('生成的代码里没有可执行命令', 'bad'); return; }
    aiMsg('正在测试 AI 代码（共 ' + cmds.length + ' 条命令）…', 'ok');
    logLine('========== 测试 AI 代码 ==========');
    toggleAI(false); // 收起面板恢复场地清晰，观看机器人运行
    SimAPI.runProgram(cmds);
  });

  function copyText(txt, okMsg) {
    if (!txt) { toast('没有可复制的内容', 'bad'); return; }
    function done() { toast(okMsg, 'ok'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动选择复制', 'bad'); }
      ta.remove();
    }
  }
  btnAiCopyAll.addEventListener('click', function () {
    if (!aiCode) { aiMsg('请先生成代码', 'bad'); return; }
    copyText(aiCode, '已复制全部代码');
  });
  btnAiCopySel.addEventListener('click', function () {
    var sel = window.getSelection ? String(window.getSelection()) : '';
    if (!sel) { aiMsg('请先在上方代码里选中一部分（拖动选择）', 'bad'); return; }
    copyText(sel, '已复制选中的 ' + sel.split('\n').length + ' 行');
  });

  /* ---------------- 保存 / 退出 / 开场电影界面 ---------------- */
  var SAVE_KEY = 'vexsim_saved_code_v1';
  var savedBaseline = ''; // 上次保存（或初始载入）的内容，用于判断是否有未保存修改
  var dirty = false;

  function refreshDirty() {
    dirty = codeEl.value !== savedBaseline;
    btnSave.classList.toggle('dirty', dirty);
    btnSave.title = dirty ? '保存代码（有未保存的修改）' : '保存代码';
  }
  function saveCode(silent) {
    try {
      localStorage.setItem(SAVE_KEY, codeEl.value);
      savedBaseline = codeEl.value;
      refreshDirty();
      if (!silent) toast('已保存 ✓', 'ok');
    } catch (e) { toast('保存失败：' + (e.message || e), 'bad'); }
  }
  btnSave.addEventListener('click', function () { saveCode(); });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      saveCode();
    }
  });

  /* ----- 开场电影界面 ----- */
  var intro = $('intro'), introVideo = $('introVideo');
  var INTRO_VOL = 0.12; // 很小的音量
  var userInteracted = false; // 用户是否已点击过界面（之后切换视频不再强制静音）
  /* 队伍视频列表：把新视频文件放进 vex-sim 目录后，在这里加一行
     { team: '队号', src: '文件名.mp4' } 即可出现在菜单里 */
  var INTRO_VIDEOS = [
    { team: '16610 AVG', src: 'intro-16610-avg.mp4', poster: 'intro-16610-avg.jpg' },
    { team: '355Z', src: 'intro-355z.mp4', poster: 'intro-355z.jpg' },
    { team: '1690X', src: 'intro-1690x.mp4', poster: 'intro-1690x.jpg' },
    { team: 'Knightmare', src: 'intro-knightmare.mp4', poster: 'intro-knightmare.jpg' },
    { team: '5868C CATARIA', src: 'intro-5868c-cataria.mp4', poster: 'intro-5868c-cataria.jpg' },
    { team: 'Ex Machina 10C', src: 'intro-ex-machina-10c.mp4', poster: 'intro-ex-machina-10c.jpg' },
    { team: '334U', src: 'intro-334u.mp4', poster: 'intro-334u.jpg' },
    { team: '9364', src: 'intro-9364.mp4', poster: 'intro-9364.jpg' },
    { team: '8931R Arsenic', src: 'intro-8931r-arsenic.mp4', poster: 'intro-8931r-arsenic.jpg' },
    { team: '16610A', src: 'intro-16610a.mp4', poster: 'intro-16610a.jpg' },
    { team: '2982X', src: 'intro.mp4', poster: 'intro.jpg' },
    { team: '77717F', src: 'intro-77717f.mp4', poster: 'intro-77717f.jpg' },
    { team: '1010W', src: 'intro-1010w.mp4', poster: 'intro-1010w.jpg' },
    { team: 'Silver Owl', src: 'intro-silver-owl.mp4', poster: 'intro-silver-owl.jpg' }
  ];
  var curVideo = INTRO_VIDEOS[0];
  var pendingVideo = null;

  /* ----- 随机不重复轮播：放完一个随机切下一个（本轮优先没放过的），一轮放完重新洗牌 ----- */
  var playQueue = [];
  function shufflePlayQueue() {
    playQueue = INTRO_VIDEOS.slice();
    for (var i = playQueue.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = playQueue[i]; playQueue[i] = playQueue[j]; playQueue[j] = t;
    }
  }
  function pickNextVideo() {
    var next = null;
    for (var k = 0; k < playQueue.length; k++) {
      if (playQueue[k] !== curVideo) { next = playQueue.splice(k, 1)[0]; break; }
    }
    if (!next) { shufflePlayQueue(); next = playQueue.shift(); } // 本轮放完 → 重新洗牌开新一轮
    return next;
  }
  var menuBtn = $('introMenuBtn'), menuList = $('introMenuList');
  var icTeam = $('icTeam');

  function renderIntroMenu() {
    // 当前播放的视频永远排最上面
    var arr = [curVideo].concat(INTRO_VIDEOS.filter(function (v) { return v !== curVideo; }));
    var h = '';
    arr.forEach(function (v) {
      if (v.soon) {
        h += '<div class="im-item soon">' + esc(v.team) + '<span class="im-tag dim">TBD</span></div>';
        return;
      }
      h += '<div class="im-item' + (v === curVideo ? ' now' : '') + '" data-team="' + esc(v.team) + '">' +
        esc(v.team) + (v === curVideo ? '<span class="im-tag">NOW</span>' : '') + '</div>';
    });
    menuList.innerHTML = h;
  }

  /* ----- 加载提示：慢网络时显示 LOADING，可播后隐藏（配合 poster 首帧秒出） ----- */
  var introLoading = $('introLoading');
  function hideLoading() { if (introLoading) introLoading.classList.add('off'); }
  function showLoading() { if (introLoading && !intro.classList.contains('gone')) introLoading.classList.remove('off'); }
  if (introLoading) {
    introVideo.addEventListener('waiting', showLoading);   // 缓冲中
    introVideo.addEventListener('stalled', showLoading);   // 网络停滞
    introVideo.addEventListener('loadstart', showLoading); // 开始加载新视频
    introVideo.addEventListener('playing', hideLoading);   // 真正开播
    introVideo.addEventListener('canplay', hideLoading);   // 可播
  }

  /* ----- Blob 加载（解决无 Range 网关下 Safari 拒播） -----
     CloudStudio 网关不支持 byte-range（Safari 视频元素直接黑屏），
     所以在 http(s) 下用 fetch 把整段视频下载下来转成 Blob URL 再赋给 video。
     Blob URL 不需要 Range，Safari 就能正常播放。本地 file:// 跳过此路径直连。 */
  var IS_HTTP = (typeof location !== 'undefined' && /^https?:$/.test(location.protocol));
  var USE_BLOB = IS_HTTP && typeof fetch === 'function' && typeof URL !== 'undefined' && URL.createObjectURL;
  var curBlobUrl = null;
  var pendingFetchAbort = null;
  function revokeBlob() { if (curBlobUrl) { try { URL.revokeObjectURL(curBlobUrl); } catch (e) {} curBlobUrl = null; } }
  function setIntroSource(url, onReady) {
    if (pendingFetchAbort) { try { pendingFetchAbort.abort(); } catch (e) {} pendingFetchAbort = null; }
    if (USE_BLOB) {
      showLoading();
      var ctl = (typeof AbortController === 'function') ? new AbortController() : null;
      pendingFetchAbort = ctl;
      fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { return r.blob(); }).then(function (b) {
        pendingFetchAbort = null;
        revokeBlob();
        curBlobUrl = URL.createObjectURL(b);
        introVideo.src = curBlobUrl;
        try { introVideo.load(); } catch (e) {}
        onReady && onReady();
      }).catch(function (e) {
        pendingFetchAbort = null;
        // 取失败就退回到直连（本地 file:// 或网络异常）
        introVideo.src = url; onReady && onReady();
      });
    } else {
      introVideo.src = url; onReady && onReady();
    }
  }

  function startIntroVideo() {
    introVideo.muted = !userInteracted; // 首次自动播放必须静音（浏览器策略）；用户已交互过则直接有声
    introVideo.volume = INTRO_VOL;
    try { introVideo.currentTime = 0; } catch (e) {}
    setIntroSource(curVideo.src, function () {
      var p = introVideo.play();
      if (p && p.catch) p.catch(function () {});
    });
  }
  function switchIntroVideo(v) {
    curVideo = v;
    introVideo.poster = v.poster || ''; // 海报先行：慢网络下切换不黑屏
    introVideo.muted = !userInteracted; // 切换后同样：已交互过就不强制静音
    introVideo.volume = INTRO_VOL;
    try { introVideo.currentTime = 0; } catch (e) {}
    setIntroSource(v.src, function () {
      introVideo.play().catch(function () {});
    });
    renderIntroMenu(); // 新视频排到最上（NOW）
  }
  function cancelConfirm() {
    pendingVideo = null;
    intro.classList.remove('confirming');
  }
  function goIntro() {
    SimAPI.stop();
    intro.classList.remove('gone', 'blurred', 'menuOpen');
    cancelConfirm();
    startIntroVideo(); // 重头播放
  }
  function enterApp() {
    intro.classList.add('gone');
    intro.classList.remove('blurred', 'menuOpen'); // 移除浮出态，子元素失去 pointer-events:auto，避免隐 form 按钮挡住编程界面点击
    try { introVideo.muted = true; introVideo.pause(); } catch (e) {} // 立即静音+暂停：音乐不再带进编程界面
    if (pendingFetchAbort) { try { pendingFetchAbort.abort(); } catch (e) {} pendingFetchAbort = null; } // 停掉未完成的视频预取
    setTimeout(function () {
      if (intro.classList.contains('gone')) { try { introVideo.pause(); } catch (e) {} }
    }, 950);
  }
  intro.addEventListener('click', function (e) {
    if (intro.classList.contains('gone')) return; // 已进入编程界面：开场层不再响应任何点击（防音乐复活）
    var t = e.target;
    if (t && t.closest) {
      if (t.closest('.ie-word')) { enterApp(); return; } // 点 Enter → 进入编程界面
      if (t.closest('#introMenu') || t.closest('#introMenuBtn') || t.closest('#introConfirm')) return; // 浮层内部点击不冒泡处理
    }
    if (intro.classList.contains('confirming')) { cancelConfirm(); return; }
    userInteracted = true;                              // 用户已交互：之后切视频保持有声
    if (introVideo.muted) introVideo.muted = false;     // 任何背景点击都开声（含收起浮层时）
    if (introVideo.paused) introVideo.play().catch(function () {}); // 兜底：暂停就重播
    if (intro.classList.contains('blurred')) {
      intro.classList.remove('blurred', 'menuOpen'); // 再点背景 → 收起浮层回到纯净视频
    } else {
      intro.classList.add('blurred');    // 首次任意点击 → 浮出 Enter 与三角按钮（视频保持清晰、不暂停）
    }
  });
  /* 三角按钮：开/关菜单；确认状态下先取消确认 */
  menuBtn.addEventListener('click', function () {
    if (intro.classList.contains('confirming')) { cancelConfirm(); return; }
    intro.classList.toggle('menuOpen');
  });
  /* 菜单点选其他队伍 → 菜单模糊，浮出 Cancel / Switch */
  menuList.addEventListener('click', function (e) {
    var it = e.target.closest ? e.target.closest('.im-item') : null;
    if (!it || it.classList.contains('soon') || it.classList.contains('now')) return;
    for (var i = 0; i < INTRO_VIDEOS.length; i++) {
      if (!INTRO_VIDEOS[i].soon && INTRO_VIDEOS[i].team === it.dataset.team) {
        pendingVideo = INTRO_VIDEOS[i];
        break;
      }
    }
    if (!pendingVideo) return;
    icTeam.textContent = pendingVideo.team;
    intro.classList.add('confirming');
  });
  $('icCancel').addEventListener('click', cancelConfirm);
  $('icSwitch').addEventListener('click', function () {
    if (pendingVideo) switchIntroVideo(pendingVideo);
    pendingVideo = null;
    intro.classList.remove('confirming'); // 切换后仍停留在 Enter + 菜单界面
  });
  introVideo.addEventListener('ended', function () { // 放完 → 随机切下一个（一轮内不重复）
    if (intro.classList.contains('gone')) return; // 已进入编程界面：不重播（防音乐复活）
    switchIntroVideo(pickNextVideo());
  });
  function ensureIntroPlay() { // 黑屏兜底：有数据了若还没播就静音重试（浏览器允许 muted 自动播放）
    if (introVideo.paused && !intro.classList.contains('gone')) {
      introVideo.muted = true;
      introVideo.play().catch(function () {});
    }
  }
  introVideo.addEventListener('loadeddata', ensureIntroPlay);
  introVideo.addEventListener('canplay', ensureIntroPlay);



  /* ----- 退出确认 ----- */
  var exitModal = $('exitModal'), btnExitNoSave = $('btnExitNoSave'), btnExitSave = $('btnExitSave');
  function closeExitModal() { exitModal.hidden = true; }
  btnExit.addEventListener('click', function () {
    if (dirty) exitModal.hidden = false;
    else goIntro();
  });
  btnExitNoSave.addEventListener('click', function () { closeExitModal(); goIntro(); });
  btnExitSave.addEventListener('click', function () {
    saveCode(true);
    closeExitModal();
    goIntro();
    toast('已保存并退出', 'ok');
  });
  exitModal.addEventListener('click', function (e) { if (e.target === exitModal) closeExitModal(); });

  /* ---------------- 初始化 ---------------- */
  var savedCode = null;
  try { savedCode = localStorage.getItem(SAVE_KEY); } catch (e) {}
  setCode(savedCode != null ? savedCode : DEFAULT_TEMPLATE); // 启动恢复上次保存的代码
  savedBaseline = codeEl.value;
  refreshDirty();
  shufflePlayQueue(); // 洗牌：随机决定本轮首个播放的视频
  curVideo = playQueue.shift();
  renderIntroMenu(); // 渲染队伍视频菜单（当前视频置顶）
  startIntroVideo(); // 启动即进入开场电影界面
  window.__locateLine = locateLine; // 调试用

})();
