/* linter.js - VEX C++ 教学代码静态检测 + 仿真命令提取（纯函数，可在 Node 中测试） */
(function (root) {
  'use strict';

  /* ---------------- 词表 ---------------- */
  var KEYWORDS = new Set([
    'using', 'namespace', 'return', 'if', 'else', 'for', 'while', 'do',
    'switch', 'case', 'break', 'continue', 'int', 'void', 'double', 'float',
    'bool', 'char', 'long', 'short', 'unsigned', 'true', 'false', 'struct',
    'class', 'enum', 'public', 'private', 'protected', 'static', 'const',
    'this', 'new', 'NULL', 'nullptr', 'vex', 'std'
  ]);
  var TYPES = new Set([
    'motor', 'motor_group', 'drivetrain', 'controller', 'brain', 'inertial',
    'rotation', 'distance', 'optical', 'vision', 'bumper', 'limit', 'sonar',
    'gyro', 'triport', 'competition', 'encoder', 'potentiometer', 'line'
  ]);
  var APIWORDS = new Set([
    'Drivetrain', 'Brain', 'Controller1', 'LeftMotor', 'RightMotor',
    'ArmMotor', 'ClawMotor', 'LeftDrive', 'RightDrive',
    'DistanceSensor', 'distanceUnits',
    'vexcodeInit', 'vexcodeCompetition', 'wait',
    'driveFor', 'turnFor', 'spinToPosition', 'rotateFor', 'spin', 'stop', 'drive',
    'print', 'newLine', 'clearScreen', 'setCursor', 'pct',
    'degrees', 'inches', 'mm', 'cm', 'percent', 'rpm', 'seconds', 'msec',
    'minutes', 'forward', 'reverse', 'left', 'right', 'hold', 'brake', 'coast',
    'velocityUnits', 'directionType', 'turnType', 'timeUnits', 'percentUnits',
    'ratio18_1', 'ratio36_1', 'ratio6_1', 'ratio5_1', 'PORT1', 'PORT2',
    'PORT3', 'PORT4', 'PORT5', 'PORT6', 'PORT7', 'PORT8', 'PORT9', 'PORT10',
    'PORT11', 'PORT12', 'PORT13', 'PORT14', 'PORT15', 'PORT16', 'PORT17',
    'PORT18', 'PORT19', 'PORT20', 'PORT21', 'PORT22'
  ]);

  /* ---------------- 示例代码 ---------------- */
  var EXAMPLE = [
    '#include "vex.h"',
    'using namespace vex;',
    '',
    'brain Brain;',
    'controller Controller1;',
    'motor LeftMotor(PORT1, ratio18_1, false);',
    'motor RightMotor(PORT2, ratio18_1, true);',
    'motor ArmMotor(PORT3, ratio36_1, false);',
    'motor ClawMotor(PORT4, ratio18_1, false);',
    'motor_group LeftDrive(LeftMotor);',
    'motor_group RightDrive(RightMotor);',
    'drivetrain Drivetrain(LeftDrive, RightDrive, 319.19, 292.1, 40, mm, 1);',
    'distance DistanceSensor(PORT5); // 车头超声波传感器',
    '',
    'void clawOpen() {',
    '  ClawMotor.spinToPosition(300, degrees, 50, velocityUnits::pct);',
    '}',
    '',
    'void clawClose() {',
    '  ClawMotor.spinToPosition(0, degrees, 50, velocityUnits::pct);',
    '}',
    '',
    'int main() {',
    '  vexcodeInit();',
    '  Brain.Screen.print("超声波避障开始!");',
    '  clawClose();',
    '  // 距离障碍物超过 300mm 就一直向前开（场地左上角有实时距离读数）',
    '  while (DistanceSensor.distance(mm) > 300) {',
    '    Drivetrain.drive(forward, 50, pct);',
    '  }',
    '  Drivetrain.stop();',
    '  Brain.Screen.print("前方障碍: %d", DistanceSensor.distance(mm));',
    '  wait(1, seconds);',
    '  Drivetrain.driveFor(reverse, 24, inches);',
    '  Drivetrain.turnFor(right, 90, degrees);',
    '  Drivetrain.driveFor(forward, 30, inches);',
    '  Brain.Screen.print("任务完成!");',
    '  return 0;',
    '}'
  ].join('\n');

  /* ---------------- 去注释/字符串扫描 ---------------- */
  // 返回 { stripped: 保留换行的纯净代码, lineHasCode: [bool], stateEnd }
  function scan(code) {
    var stripped = '';
    var lineHas = [];
    var lineNo = 0;
    var hasCode = false;
    var i = 0, n = code.length;
    var mode = 'code'; // code | line | block | str
    while (i < n) {
      var c = code[i], d = code[i + 1];
      if (c === '\n') {
        stripped += '\n';
        lineHas.push(hasCode);
        hasCode = false;
        lineNo++;
        if (mode === 'line') mode = 'code';
        i++;
        continue;
      }
      if (mode === 'code') {
        if (c === '/' && d === '/') { mode = 'line'; i += 2; continue; }
        if (c === '/' && d === '*') { mode = 'block'; i += 2; continue; }
        if (c === '"') { mode = 'str'; hasCode = true; stripped += ' '; i++; continue; }
        if (c === '\'') { mode = 'str2'; hasCode = true; stripped += ' '; i++; continue; }
        if (!/\s/.test(c)) hasCode = true;
        stripped += c; i++;
      } else if (mode === 'line') {
        i++;
      } else if (mode === 'block') {
        if (c === '*' && d === '/') { mode = 'code'; i += 2; } else i++;
      } else if (mode === 'str') {
        if (c === '\\') { i += 2; continue; }
        if (c === '"') mode = 'code';
        i++;
      } else { // str2
        if (c === '\\') { i += 2; continue; }
        if (c === '\'') mode = 'code';
        i++;
      }
    }
    lineHas.push(hasCode);
    return { stripped: stripped, lineHas: lineHas, mode: mode };
  }

  /* 只剥离注释（// 行注释、/* * / 块注释），字符串内容原样保留；
     注释替换为空格（保持行结构），换行保留。供 extractCommands 使用，
     避免被注释掉的代码仍然生成仿真指令。 */
  function stripComments(code) {
    var out = '';
    var i = 0, n = code.length, mode = 'code'; // code | line | block | str | str2
    while (i < n) {
      var c = code[i], d = code[i + 1];
      if (mode === 'code') {
        if (c === '/' && d === '/') { out += '  '; i += 2; mode = 'line'; continue; }
        if (c === '/' && d === '*') { out += '  '; i += 2; mode = 'block'; continue; }
        if (c === '"') { out += c; i++; mode = 'str'; continue; }
        if (c === '\'') { out += c; i++; mode = 'str2'; continue; }
        out += c; i++;
      } else if (mode === 'line') {
        if (c === '\n') { out += '\n'; mode = 'code'; } else { out += ' '; }
        i++;
      } else if (mode === 'block') {
        if (c === '*' && d === '/') { out += '  '; i += 2; mode = 'code'; continue; }
        out += (c === '\n' ? '\n' : ' '); i++;
      } else if (mode === 'str') {
        out += c;
        if (c === '\\' && d) { out += d; i += 2; continue; }
        if (c === '"') mode = 'code';
        i++;
      } else { // str2
        out += c;
        if (c === '\\' && d) { out += d; i += 2; continue; }
        if (c === '\'') mode = 'code';
        i++;
      }
    }
    return out;
  }

  /* ---------------- 主检测 ---------------- */
  function lint(code) {
    var errors = [];
    var warnings = [];
    var s = scan(code);
    var text = s.stripped;
    var lines = text.split('\n');
    var nLines = lines.length;

    function addErr(line, col, msg) {
      if (errors.length < 40) errors.push({ line: line, col: col || 0, msg: msg, severity: 'error' });
    }
    function addWarn(line, msg) {
      if (warnings.length < 10) warnings.push({ line: line, col: 0, msg: msg, severity: 'warning' });
    }

    // 1. 未闭合字符串
    if (s.mode === 'str' || s.mode === 'str2') {
      addErr(nLines - 1, 0, '字符串缺少结束引号');
    }

    // 2. 大括号/圆括号/方括号配对
    var stack = []; // {ch, line}
    var pairs = { '}': '{', ')': '(', ']': '[' };
    for (var li = 0; li < nLines; li++) {
      var L = lines[li];
      for (var ci = 0; ci < L.length; ci++) {
        var ch = L[ci];
        if (ch === '{' || ch === '(' || ch === '[') stack.push({ ch: ch, line: li });
        else if (ch === '}' || ch === ')' || ch === ']') {
          if (stack.length === 0) { addErr(li, ci, '多余的 "' + ch + '"，没有与之配对的 "' + pairs[ch] + '"'); }
          else {
            var top = stack.pop();
            if (top.ch !== pairs[ch]) addErr(li, ci, '"' + ch + '" 与前面的 "' + top.ch + '" 不匹配');
          }
        }
      }
    }
    // 未闭合
    var unclosedMsg = { '{': '缺少 "}" 闭合大括号', '(': '缺少 ")" 闭合圆括号', '[': '缺少 "]" 闭合方括号' };
    while (stack.length) {
      var u = stack.pop();
      addErr(Math.min(u.line, nLines - 1), 0, unclosedMsg[u.ch]);
    }

    // 3. 缺少分号（逐行启发式）
    for (var i = 0; i < nLines; i++) {
      if (!s.lineHas[i]) continue;
      var t = lines[i].trim();
      if (!t) continue;
      if (t[0] === '#') continue;
      if (t[0] === '}') t = t.slice(1).trim(); // 允许 "} ;" 混合
      if (t.length === 0) continue;
      if (/[;{}(,:]$/.test(t)) continue; // 注意：")" 结尾不在此列，需分号
      if (/^(if|for|while|switch)\s*\(.*\)\s*$/.test(t)) continue;
      if (/^else(\s+if\s*\(.*\))?\s*$/.test(t)) continue;
      if (/^[A-Za-z_][\w:]*\s+[A-Za-z_]\w*\s*\(/.test(t)) continue; // "类型 名字(" 声明行
      if (/^return\s*$/.test(t)) continue;
      addErr(i, lines[i].length, '语句末尾缺少分号 ";"');
    }

    // 4. 声明收集 + 未定义标识符
    var declared = new Set();
    var declRe = /(?:^|[^A-Za-z0-9_])((?:vex::)?(?:motor|motor_group|drivetrain|controller|brain|inertial|rotation|distance|optical|vision|bumper|limit|sonar|gyro|triport|competition|int|double|float|bool|char|long|short|unsigned))\s+([A-Za-z_]\w*)\b/g;
    var m;
    while ((m = declRe.exec(text))) declared.add(m[2]);
    var fnRe = /\b(void|int|double|float|bool|char)\s+([A-Za-z_]\w*)\s*\(/g;
    while ((m = fnRe.exec(text))) declared.add(m[2]);

    var unknown = new Set();
    var wordRe = /\b([A-Za-z_]\w*)\b/g;
    while ((m = wordRe.exec(text))) {
      var w = m[1];
      if (KEYWORDS.has(w) || TYPES.has(w) || APIWORDS.has(w)) continue;
      if (declared.has(w)) continue;
      if (w === 'main' || w === 'Screen') continue; // main 由入口规则检查
      if (m.index > 0 && text[m.index - 1] === '#') continue; // 预处理指令
      if (!unknown.has(w)) { unknown.add(w); addErr(lineOf(text, m.index), 0, '未定义的标识符 "' + w + '"（是否漏了声明？）'); }
    }

    // 5. 入口函数
    if (!/main\s*\(/.test(text)) {
      addErr(0, 0, '缺少入口函数 int main() { ... }');
    } else if (/void\s+main\s*\(/.test(text)) {
      addErr(0, 0, 'main 函数应声明为 "int main()"，而不是 "void main()"');
    }

    // 6. 必要头文件 / 命名空间（头文件检查用原始代码，避免字符串剥离影响）
    if (!/#include\s*["<]vex\.h[">]/.test(code)) {
      addErr(0, 0, '缺少 #include "vex.h"（VEX 库头文件）');
    }
    if (!/using\s+namespace\s+vex\s*;/.test(text)) {
      addWarn(0, '建议添加 using namespace vex; 以简化 VEX API 调用');
    }

    // 排序：按行
    var all = errors.concat(warnings);
    all.sort(function (a, b) { return a.line - b.line || a.col - b.col; });
    return { errors: all, errorCount: errors.length, warningCount: warnings.length };
  }

  function lineOf(text, index) {
    var c = 0;
    for (var i = 0; i < text.length; i++) {
      if (i >= index) return c;
      if (text[i] === '\n') c++;
    }
    return c;
  }

  /* ---------------- 仿真命令提取（只取 main 体 + 内联自定义函数） ---------------- */
  var CMDS = [
    { re: /Drivetrain\.driveFor\s*\(\s*(forward|reverse)\s*,\s*([\d.]+)\s*,\s*(inches|mm|cm|degrees)\s*\)/g, type: 'drive' },
    { re: /Drivetrain\.turnFor\s*\(\s*(left|right)\s*,\s*([\d.]+)\s*,\s*degrees\s*\)/g, type: 'turn' },
    { re: /ArmMotor\.spinToPosition\s*\(\s*(-?[\d.]+)\s*,\s*degrees[^)]*\)/g, type: 'arm' },
    { re: /ClawMotor\.spinToPosition\s*\(\s*(-?[\d.]+)\s*,\s*degrees[^)]*\)/g, type: 'claw' },
    { re: /wait\s*\(\s*([\d.]+)\s*,\s*(seconds|msec|minutes)\s*\)/g, type: 'wait' },
    { re: /Brain\.Screen\.print\s*\(\s*"([^"]*)"\s*\)/g, type: 'print' },
    /* 超声波：print 带 DistanceSensor.distance(mm) 参数 → 运行时读实时距离 */
    { re: /Brain\.Screen\.print\s*\(\s*"([^"]*)"[^)]*DistanceSensor\.distance\s*\(\s*(?:distanceUnits::)?mm\s*\)[^)]*\)/g, type: 'printDist' },
    { re: /vexcodeInit\s*\(/g, type: 'init' },
    /* 超声波：while (DistanceSensor.distance(mm) > N) { ...drive... } 整块替换为 __driveUntil(N) 占位 */
    { re: /__driveUntil\s*\(\s*([\d.]+)\s*\)/g, type: 'driveUntil' }
  ];
  var unitsMap = { inches: 1 / 12, mm: 1 / 304.8, cm: 1 / 30.48, degrees: 1 };
  var timeMap = { seconds: 1000, msec: 1, minutes: 60000 };

  // while + 超声波 + drive 的"开到近墙为止"模式（教学里最常见的超声波用法）
  var WHILE_SONAR = /while\s*\(\s*DistanceSensor\.distance\s*\(\s*(?:distanceUnits::)?mm\s*\)\s*>\s*([\d.]+)\s*\)\s*\{[^{}]*Drivetrain\.drive\s*\(\s*forward[^)]*\)[^{}]*\}/g;

  function mainBodyRange(lines) {
    var start = -1, i;
    for (i = 0; i < lines.length; i++) { if (/main\s*\(/.test(lines[i])) { start = i; break; } }
    if (start < 0) return null;
    var depth = 0, found = false;
    for (var j = start; j < lines.length; j++) {
      for (var k = 0; k < lines[j].length; k++) {
        var c = lines[j][k];
        if (c === '{') { depth++; found = true; }
        else if (c === '}') { depth--; if (found && depth === 0) return { start: start, end: j }; }
      }
    }
    return { start: start, end: lines.length - 1 };
  }

  function parseFunctionBodies(code) {
    var defs = {};
    var re = /((?:vex::)?[A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*\([^)\n]*\)\s*\{/g;
    var m;
    while ((m = re.exec(code))) {
      var name = m[2];
      var braceIdx = code.indexOf('{', m.index);
      var depth = 0, i = braceIdx;
      for (; i < code.length; i++) {
        var c = code[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) break; }
      }
      defs[name] = code.slice(braceIdx + 1, i);
    }
    return defs;
  }

  /* ---------------- 条件表达式解析 ---------------- */
  function skipWs(code, i) {
    while (i < code.length && /\s/.test(code[i])) i++;
    return i;
  }
  // 找与 openIdx 处 openCh 配对的 closeCh（跳过字符串与嵌套）
  function findMatching(code, openIdx, openCh, closeCh) {
    var depth = 0, i = openIdx, inStr = false, inStr2 = false;
    while (i < code.length) {
      var c = code[i];
      if (inStr) { if (c === '\\') { i += 2; continue; } if (c === '"') inStr = false; i++; continue; }
      if (inStr2) { if (c === '\\') { i += 2; continue; } if (c === '\'') inStr2 = false; i++; continue; }
      if (c === '"') { inStr = true; i++; continue; }
      if (c === '\'') { inStr2 = true; i++; continue; }
      if (c === openCh) depth++;
      else if (c === closeCh) { depth--; if (depth === 0) return i; }
      i++;
    }
    return -1;
  }
  // 顶层逻辑运算符（&&/||）位置（不在括号/字符串内）
  function findTopLevelOp(text, op) {
    var depth = 0, inStr = false, inStr2 = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inStr) { if (c === '\\') { i++; continue; } if (c === '"') inStr = false; continue; }
      if (inStr2) { if (c === '\\') { i++; continue; } if (c === '\'') inStr2 = false; continue; }
      if (c === '"') { inStr = true; continue; }
      if (c === '\'') { inStr2 = true; continue; }
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (depth === 0 && text[i] === op[0] && text[i + 1] === op[1]) return i;
    }
    return -1;
  }
  // 操作数：数字 / 超声波距离 / 布尔
  function parseOperand(text) {
    text = text.trim();
    if (/^-?\d+(\.\d+)?$/.test(text)) return { kind: 'num', val: parseFloat(text) };
    if (/^DistanceSensor\.distance\s*\(\s*(?:distanceUnits::)?mm\s*\)$/.test(text)) return { kind: 'dist' };
    if (/^true$/.test(text)) return { kind: 'bool', val: true };
    if (/^false$/.test(text)) return { kind: 'bool', val: false };
    return null;
  }
  // 条件表达式 → 表达式树（bool/num/dist/cmp/and/or/not）
  function parseCond(text) {
    text = text.trim();
    if (!text) return { kind: 'bool', val: false };
    if (/^true$/.test(text)) return { kind: 'bool', val: true };
    if (/^false$/.test(text)) return { kind: 'bool', val: false };
    var orIdx = findTopLevelOp(text, '||');
    if (orIdx >= 0) return { kind: 'or', left: parseCond(text.slice(0, orIdx)), right: parseCond(text.slice(orIdx + 2)) };
    var andIdx = findTopLevelOp(text, '&&');
    if (andIdx >= 0) return { kind: 'and', left: parseCond(text.slice(0, andIdx)), right: parseCond(text.slice(andIdx + 2)) };
    if (text[0] === '!') return { kind: 'not', e: parseCond(text.slice(1).trim()) };
    if (text[0] === '(' && findMatching(text, 0, '(', ')') === text.length - 1) {
      return parseCond(text.slice(1, -1).trim());
    }
    var cmp = /^(.*?)(>=|<=|==|!=|>|<)(.*)$/.exec(text);
    if (cmp) {
      return { kind: 'cmp', op: cmp[2], left: parseOperand(cmp[1].trim()), right: parseOperand(cmp[3].trim()) };
    }
    var op = parseOperand(text);
    if (op) return op;
    return { kind: 'bool', val: false };
  }

  /* ---------------- 控制流解析（if / else / while） ---------------- */
  // 正则匹配结果 → 命令对象
  function cmdFromMatch(type, m) {
    switch (type) {
      case 'drive': return { type: 'drive', dir: m[1], dist: parseFloat(m[2]) * (unitsMap[m[3]] || 1) };
      case 'turn': return { type: 'turn', dir: m[1], deg: parseFloat(m[2]) };
      case 'arm': return { type: 'arm', deg: parseFloat(m[1]) };
      case 'claw': return { type: 'claw', deg: parseFloat(m[1]) };
      case 'wait': return { type: 'wait', ms: parseFloat(m[1]) * (timeMap[m[2]] || 1000) };
      case 'print': return { type: 'print', text: m[1] };
      case 'printDist': return { type: 'printDist', text: m[1] };
      case 'driveUntil': return { type: 'driveUntil', dist: parseFloat(m[1]) / 304.8 }; // mm → ft
      case 'init': return { type: 'init' };
    }
    return null;
  }
  // 解析单条语句 → 命令 / 函数调用标记（无匹配返回 null）
  function parseStatement(stmt, defs) {
    for (var i = 0; i < CMDS.length; i++) {
      var r = CMDS[i].re;
      r.lastIndex = 0;
      var m = r.exec(stmt);
      if (m) return cmdFromMatch(CMDS[i].type, m);
    }
    var cm = /\b([A-Za-z_]\w*)\s*\(/.exec(stmt);
    if (cm && defs[cm[1]]) return { type: 'call', name: cm[1] };
    return null;
  }
  // 找分号位置（跳过字符串）
  function findSemi(code, i) {
    var j = i, inStr = false, inStr2 = false;
    while (j < code.length) {
      var c = code[j];
      if (inStr) { if (c === '\\') { j += 2; continue; } if (c === '"') inStr = false; j++; continue; }
      if (inStr2) { if (c === '\\') { j += 2; continue; } if (c === '\'') inStr2 = false; j++; continue; }
      if (c === '"') { inStr = true; j++; continue; }
      if (c === '\'') { inStr2 = true; j++; continue; }
      if (c === ';') return j;
      j++;
    }
    return code.length;
  }
  // 解析 if 语句（含 else / else if），返回 { node, end }
  function parseIfStatement(code, i, defs, seen) {
    var parenOpen = skipWs(code, i + 2);
    var parenClose = findMatching(code, parenOpen, '(', ')');
    if (parenClose < 0) return { node: null, end: i + 2 };
    var condText = code.slice(parenOpen + 1, parenClose);
    var braceOpen = skipWs(code, parenClose + 1);
    var braceClose = findMatching(code, braceOpen, '{', '}');
    if (braceClose < 0) return { node: null, end: parenClose + 1 };
    var thenNodes = parseBlock(code.slice(braceOpen + 1, braceClose), defs, seen);
    var elseNodes = null;
    var end = braceClose + 1;
    var after = skipWs(code, braceClose + 1);
    if (/^else\b/.test(code.slice(after))) {
      var afterElse = skipWs(code, after + 4);
      if (/^if\b/.test(code.slice(afterElse))) {
        var sub = parseIfStatement(code, afterElse, defs, seen);
        elseNodes = sub.node ? [sub.node] : null;
        end = sub.end;
      } else {
        var bo2 = skipWs(code, afterElse);
        if (code[bo2] === '{') {
          var bc2 = findMatching(code, bo2, '{', '}');
          elseNodes = parseBlock(code.slice(bo2 + 1, bc2), defs, seen);
          end = bc2 + 1;
        } else {
          end = afterElse;
        }
      }
    }
    return { node: { type: 'if', cond: parseCond(condText), then: thenNodes, else: elseNodes }, end: end };
  }
  // 递归解析语句块 → AST 节点数组（叶子=命令，内部=if/while）
  function parseBlock(code, defs, seen) {
    var nodes = [];
    var i = 0, n = code.length;
    while (i < n) {
      while (i < n && /[\s;}]/.test(code[i])) i++;
      if (i >= n) break;
      var rest = code.slice(i);
      if (/^if\b/.test(rest)) {
        var r = parseIfStatement(code, i, defs, seen);
        if (r.node) nodes.push(r.node);
        i = r.end;
        continue;
      }
      if (/^while\b/.test(rest)) {
        var parenOpen = skipWs(code, i + 5);
        var parenClose = findMatching(code, parenOpen, '(', ')');
        if (parenClose < 0) { i += 5; continue; }
        var condText = code.slice(parenOpen + 1, parenClose);
        var braceOpen = skipWs(code, parenClose + 1);
        var braceClose = findMatching(code, braceOpen, '{', '}');
        if (braceClose < 0) { i = parenClose + 1; continue; }
        var bodyNodes = parseBlock(code.slice(braceOpen + 1, braceClose), defs, seen);
        nodes.push({ type: 'while', cond: parseCond(condText), body: bodyNodes });
        i = braceClose + 1;
        continue;
      }
      // 普通语句
      var semi = findSemi(code, i);
      var stmt = code.slice(i, semi).trim();
      var node = parseStatement(stmt, defs);
      if (node && node.type === 'call') {
        if (!seen[node.name]) {
          seen[node.name] = true;
          var expanded = parseBlock(defs[node.name], defs, seen);
          for (var k = 0; k < expanded.length; k++) nodes.push(expanded[k]);
        }
      } else if (node) {
        nodes.push(node);
      }
      i = semi + 1;
    }
    return nodes;
  }

  function extractCommands(code) {
    code = stripComments(code); // 注释不参与命令提取（字符串内容保留）
    // 超声波 while 模式 → 占位调用（顺序保持，内层 drive 一并消费掉，避免重复提取）
    code = code.replace(WHILE_SONAR, '__driveUntil($1);');
    var lines = code.split('\n');
    var range = mainBodyRange(lines);
    if (!range) return [];
    // 构建 main 函数体文本（兼容单行 "int main(){ ... }"）
    var first = lines[range.start], last = lines[range.end];
    var bs = Math.max(first.indexOf('{') + 1, 0);
    var be = last.lastIndexOf('}');
    var mainBody;
    if (range.end === range.start) {
      mainBody = be > bs ? first.slice(bs, be) : '';
    } else {
      mainBody = first.slice(bs) + '\n' + lines.slice(range.start + 1, range.end).join('\n') + '\n' + (be >= 0 ? last.slice(0, be) : last);
    }
    var defs = parseFunctionBodies(code);
    var seen = {};
    return parseBlock(mainBody, defs, seen);
  }

  root.VexLint = { lint: lint, extractCommands: extractCommands, EXAMPLE: EXAMPLE };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { lint: lint, extractCommands: extractCommands, EXAMPLE: EXAMPLE };
  }
})(typeof window !== 'undefined' ? window : globalThis);
