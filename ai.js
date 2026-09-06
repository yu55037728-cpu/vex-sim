/* ai.js - 根据自然语言需求生成 VEX C++ 代码（离线规则引擎，纯函数） */
(function (root) {
  'use strict';

  /* 中文数字支持（一~十、两） */
  function zhNum(s) {
    var map = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    if (s in map) return map[s];
    return null;
  }

  /* 从片段中提取第一个数量+单位，返回 {n, unit} 或 null */
  function pickNumber(seg, units) {
    // 数字（阿拉伯或中文）后紧跟可选单位词
    var re = new RegExp('(\\d+(?:\\.\\d+)?|[零一二两三四五六七八九十]+)\\s*(' + units + ')?');
    var m = re.exec(seg);
    if (!m) return null;
    var n = zhNum(m[1]);
    if (n === null) return null;
    return { n: n, unit: m[2] || '' };
  }

  /* 长度统一为英寸 */
  function toInches(n, unit) {
    if (/cm|厘米|公分/.test(unit)) return n / 2.54;
    if (/mm|毫米/.test(unit)) return n / 25.4;
    if (/m(?!m)[eü]?t?e?r?|米(?!米)/.test(unit) && /米|m$/.test(unit)) return n * 39.3701; // 粗略：米
    return n; // 默认英寸
  }

  function round1(x) { return Math.round(x * 10) / 10; }

  /* 把一句需求解析为命令对象；返回 null 表示没识别出动作 */
  function parseSegment(seg) {
    var s = seg.trim();
    if (!s) return null;
    var low = s.toLowerCase();

    // --- 等待 ---
    if (/等|暂停|停[一留]|wait|sleep|delay/.test(s)) {
      var t = pickNumber(s, '毫秒|ms|msec|秒|s|sec|seconds?|分|分钟|minutes?');
      if (t) {
        var ms;
        var u = t.unit;
        if (/毫秒|ms|msec/.test(u)) ms = t.n;
        else if (/分|min/.test(u)) ms = t.n * 60000;
        else ms = t.n * 1000; // 默认秒
        return { type: 'wait', ms: ms, desc: '等待 ' + t.n + ' ' + (/毫秒|ms|msec/.test(u) ? '毫秒' : (/分|min/.test(u) ? '分钟' : '秒')) };
      }
      return { type: 'wait', ms: 1000, desc: '等待 1 秒' };
    }

    // --- 超声波：引导前进到距障碍物 N 毫米 ---
    if (/超声波|避障/.test(s) || (/距离障碍|距障碍/.test(s) && /前进|开|走/.test(s))) {
      var sd = pickNumber(s, '毫米|mm|厘米|cm|公分|英寸|寸|inch|in');
      var mmv = sd ? (/mm|毫米/.test(sd.unit) ? sd.n : /cm|厘米|公分/.test(sd.unit) ? sd.n * 10 : sd.n * 25.4) : 300;
      mmv = Math.round(mmv);
      return { type: 'driveUntil', dist: mmv, desc: '超声波引导前进，距障碍物 ' + mmv + ' mm 以内停车' };
    }

    // --- 超声波：显示实时距离 ---
    if (/距离|超声波|测距/.test(s) && /打印|显示|输出|读/.test(s)) {
      return { type: 'printDist', text: '前方距离: ', desc: '显示超声波实时距离' };
    }

    // --- 前进 / 后退 ---
    if (/前进|向前|往前|直行|drive.*forward|go.*forward|forward/.test(low) || /后退|向后|往后|倒退|reverse|backward/.test(low)) {
      var back = /后退|向后|往后|倒退|reverse|backward/.test(low);
      var d = pickNumber(s, '英寸|寸|in|inch|inches|cm|厘米|公分|mm|毫米|米|m');
      var inch = d ? round1(toInches(d.n, d.unit)) : 12;
      return { type: 'drive', dir: back ? 'reverse' : 'forward', dist: inch, desc: (back ? '后退 ' : '前进 ') + inch + ' 英寸' };
    }

    // --- 转向 ---
    if (/左转|向左转|turn.*left|left turn/.test(low)) {
      var tl = pickNumber(s, '度|°|deg|degrees?');
      return { type: 'turn', dir: 'left', deg: tl ? tl.n : 90, desc: '左转 ' + (tl ? tl.n : 90) + ' 度' };
    }
    if (/右转|向右转|turn.*right|right turn/.test(low)) {
      var tr = pickNumber(s, '度|°|deg|degrees?');
      return { type: 'turn', dir: 'right', deg: tr ? tr.n : 90, desc: '右转 ' + (tr ? tr.n : 90) + ' 度' };
    }

    // --- 机械臂 ---
    if (/抬臂|举臂|升臂|抬[一起]?手|arm.*(up|raise)/.test(low)) {
      var au = pickNumber(s, '度|°|deg|degrees?');
      return { type: 'arm', deg: au ? Math.min(200, au.n) : 120, desc: '抬起机械臂到 ' + (au ? Math.min(200, au.n) : 120) + ' 度' };
    }
    if (/放臂|降臂|落臂|放下臂|arm.*down|lower.*arm/.test(low)) {
      var ad = pickNumber(s, '度|°|deg|degrees?');
      return { type: 'arm', deg: ad ? Math.min(200, ad.n) : 0, desc: '放下机械臂到 ' + (ad ? Math.min(200, ad.n) : 0) + ' 度' };
    }

    // --- 爪子 ---
    if (/开爪|张开|松开|松爪|打开爪|claw.*open|release/.test(low)) {
      return { type: 'claw', deg: 280, desc: '张开爪子' };
    }
    if (/关爪|闭爪|合爪|夹住|夹紧|抓住|抓取|claw.*close|grab|clamp/.test(low)) {
      return { type: 'claw', deg: 40, desc: '闭合爪子（抓取）' };
    }

    // --- 打印 / 显示 ---
    var pm = /(?:打印|显示|输出|print|show|say)[:：]?\s*["“]([^"”]+)["”]/.exec(s);
    if (pm) return { type: 'print', text: pm[1], desc: '打印 "' + pm[1] + '"' };

    return null;
  }

  /* 主入口：需求文本 → { code, steps, matched } */
  function generate(req) {
    if (!req || !req.trim()) return { code: null, steps: [], matched: 0, reason: 'empty' };
    var segs = req.split(/[,，。；;\n·]+|\s然后\s|\s接着\s|\s再\s|then/g);
    var steps = [];
    segs.forEach(function (seg) {
      var c = parseSegment(seg);
      if (c) steps.push(c);
    });
    if (!steps.length) return { code: null, steps: [], matched: 0, reason: 'nomatch' };

    var body = [];
    body.push('  vexcodeInit();');
    steps.forEach(function (c) {
      body.push('  // ' + c.desc);
      switch (c.type) {
        case 'drive':
          body.push('  Drivetrain.driveFor(' + c.dir + ', ' + c.dist + ', inches);');
          break;
        case 'turn':
          body.push('  Drivetrain.turnFor(' + c.dir + ', ' + c.deg + ', degrees);');
          break;
        case 'arm':
          body.push('  ArmMotor.spinToPosition(' + c.deg + ', degrees, true);');
          break;
        case 'claw':
          body.push('  ClawMotor.spinToPosition(' + c.deg + ', degrees, true);');
          break;
        case 'wait':
          body.push('  wait(' + (/^-?\d+$/.test(String(c.ms)) && c.ms % 1000 === 0 ? (c.ms / 1000) + ', seconds' : c.ms + ', msec') + ');');
          break;
        case 'print':
          body.push('  Brain.Screen.print("' + c.text + '");');
          break;
        case 'driveUntil':
          body.push('  while (DistanceSensor.distance(mm) > ' + c.dist + ') {');
          body.push('    Drivetrain.drive(forward, 50, pct);');
          body.push('  }');
          body.push('  Drivetrain.stop();');
          break;
        case 'printDist':
          body.push('  Brain.Screen.print("' + c.text + '%d", DistanceSensor.distance(mm));');
          break;
      }
    });
    var code = [
      '#include "vex.h"',
      'using namespace vex;',
      '',
      'int main() {'
    ].concat(body, [
      '  return 0;',
      '}'
    ]).join('\n');

    return { code: code, steps: steps, matched: steps.length, reason: 'ok' };
  }

  var API = { generate: generate, parseSegment: parseSegment };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.AIgen = API;
})(typeof window !== 'undefined' ? window : globalThis);
