/* scene.js - 3D 场景：Clawbot 机器人 + 12ft 空场地 + 中间一个球（依赖 three.min.js） */
(function () {
  'use strict';
  var THREE = window.THREE;
  if (!THREE) { console.error('THREE 未加载'); return; }

  /* ---------- 基础 ---------- */
  var container = document.getElementById('scenePanel');
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1628);
  var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  var _needsRender = true;
  function requestRender() { _needsRender = true; }

  /* ---------- 灯光 ---------- */
  scene.add(new THREE.AmbientLight(0xcfd9ec, 0.6));
  var dir = new THREE.DirectionalLight(0xffffff, 1.25);
  dir.position.set(8, 16, 10);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.left = -9; dir.shadow.camera.right = 9;
  dir.shadow.camera.top = 9; dir.shadow.camera.bottom = -9;
  dir.shadow.camera.far = 40;
  scene.add(dir);
  var dir2 = new THREE.DirectionalLight(0xaec8ff, 0.35);
  dir2.position.set(-8, 8, -8);
  scene.add(dir2);
  var pt = new THREE.PointLight(0x99bbff, 0.35, 22);
  pt.position.set(0, 5, 0);
  scene.add(pt);

  /* ---------- 材质辅助 ---------- */
  function mat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.85, metalness: 0.05 }, opts || {}));
  }

  // 黑白棋盘格纹理（围栏顶条）
  var checkerTex = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var ctx = c.getContext('2d');
    var n = 8, s = 64 / n;
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? '#e8eaee' : '#14161a';
        ctx.fillRect(i * s, j * s, s, s);
      }
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();

  /* ---------- 场地（12ft x 12ft，1 单位 = 1 英尺） ---------- */
  var F = 12, HALF = F / 2;

  // 深色底层基板
  var base = new THREE.Mesh(new THREE.BoxGeometry(F + 0.6, 0.16, F + 0.6), mat(0x181f2a));
  base.position.y = -0.08; base.receiveShadow = true;
  scene.add(base);

  // 灰色泡沫地垫（2x2 英尺大格，浅灰/中灰交替，泡沫质感）
  var foamA = mat(0xb8b9bb, { roughness: 0.95, metalness: 0 });
  var foamB = mat(0x9fa1a3, { roughness: 0.95, metalness: 0 });
  for (var i = 0; i < 6; i++) {
    for (var j = 0; j < 6; j++) {
      var tile = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.045, 1.98), (i + j) % 2 === 0 ? foamA : foamB);
      tile.position.set(i * 2 - 5, 0.0225, j * 2 - 5);
      tile.receiveShadow = true;
      scene.add(tile);
    }
  }

  // 白色围栏挡板 + 黑白棋盘格顶条
  var postMat = mat(0xffffff, { roughness: 0.55, metalness: 0.1 });
  var railMat = mat(0xf2f4f8, { roughness: 0.5, metalness: 0.08 });
  var checkerMat = new THREE.MeshStandardMaterial({
    map: checkerTex, roughness: 0.55, metalness: 0.05
  });
  function makeWall(w, h, d, x, z, isX) {
    var g = new THREE.Group();
    var rail = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), railMat);
    rail.position.y = h / 2;
    rail.receiveShadow = true; rail.castShadow = true;
    g.add(rail);
    var stripH = 0.18, stripD = d + 0.04;
    var strip = new THREE.Mesh(new THREE.BoxGeometry(w, stripH, stripD), checkerMat);
    strip.position.y = h + stripH / 2;
    strip.castShadow = true;
    g.add(strip);
    g.position.set(x, 0, z);
    scene.add(g);
  }
  var WALL_H = 1.6, THICK = 0.12;
  makeWall(F + 0.6, WALL_H, THICK, 0, HALF + 0.06, true);
  makeWall(F + 0.6, WALL_H, THICK, 0, -HALF - 0.06, true);
  makeWall(THICK, WALL_H, F + 0.6, HALF + 0.06, 0, false);
  makeWall(THICK, WALL_H, F + 0.6, -HALF - 0.06, 0, false);
  // 四个角柱
  var cornerGeo = new THREE.BoxGeometry(0.22, WALL_H + 0.18, 0.22);
  [[HALF, HALF], [HALF, -HALF], [-HALF, HALF], [-HALF, -HALF]].forEach(function (p) {
    var cp = new THREE.Mesh(cornerGeo, postMat);
    cp.position.set(p[0], (WALL_H + 0.18) / 2, p[1]);
    cp.castShadow = true;
    scene.add(cp);
  });

  /* ---------- 场地元素：空场地 + 中间一个球 ---------- */

  // 球：可被机器人推动，不会自己滚动（无惯性、无重力滚动）
  var BALL_R = 0.24;              // 球半径（约 VEX 竞技球大小，稍放大更醒目）
  var BALL_LIMIT = 5.4;           // 球心活动范围（围栏内）
  var ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 28, 20),
    mat(0xff6b35, { roughness: 0.35, metalness: 0.15 })
  );
  ball.position.set(0, BALL_R, 0); // 场地正中央
  ball.castShadow = true;
  scene.add(ball);

  /* ---------- Clawbot：银色 C-channel 底盘 + 绿色轮胎 + V5 Brain + 升降臂 + 红爪 ---------- */
  var TEAM = 0xd92534;

  // C-channel 带孔金属梁纹理
  function makeCChannelTex(color) {
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    for (var y = 10; y < 128; y += 14) {
      for (var x = 6; x < 128; x += 12) {
        ctx.beginPath();
        ctx.arc(x, y, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    var t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  var cMat = new THREE.MeshStandardMaterial({
    map: makeCChannelTex('#c8cdd8'), color: 0xc8cdd8,
    roughness: 0.35, metalness: 0.75
  });
  var blackMat = mat(0x1a1d23, { roughness: 0.6, metalness: 0.3 });
  var darkGreyMat = mat(0x3a3f4a, { roughness: 0.55, metalness: 0.35 });
  var redMat = mat(TEAM, { roughness: 0.45, metalness: 0.25 });
  var tireMat = mat(0x1c5c38, { roughness: 0.9, metalness: 0.05 });
  var hubMat = mat(0x111317, { roughness: 0.5, metalness: 0.4 });
  var screenMat = new THREE.MeshStandardMaterial({
    color: 0x9fd0ff, emissive: 0x1e4a8a, emissiveIntensity: 0.55
  });

  var CHASSIS_L = 0.98; // C-channel 底盘长度
  var CHASSIS_W = 0.78; // C-channel 底盘宽度
  var CHASSIS_H = 0.13;
  var WHEEL_R = 0.22;
  var WHEEL_W = 0.16;
  var GROUND_CLR = 0.22;
  var SONAR_X = CHASSIS_L / 2 + 0.035; // 超声波传感器感测点（车头最前端）
  var SONAR_Y = GROUND_CLR + CHASSIS_H / 2 + 0.02; // 传感器安装高度
  var SONAR_MAX_MM = 3000; // VEX 超声波传感器量程 3000mm

  function clawbot() {
    var g = new THREE.Group();
    var chassisY = GROUND_CLR + CHASSIS_H / 2;

    // --- 底盘框架：四根 C-channel 围成矩形 ---
    var beamH = 0.10, beamD = 0.05;
    var sideBeamGeo = new THREE.BoxGeometry(CHASSIS_L - 0.10, beamH, beamD);
    var leftBeam = new THREE.Mesh(sideBeamGeo, cMat);
    leftBeam.position.set(0, chassisY, CHASSIS_W / 2 - beamD / 2);
    leftBeam.castShadow = true;
    g.add(leftBeam);
    var rightBeam = leftBeam.clone();
    rightBeam.position.z = -CHASSIS_W / 2 + beamD / 2;
    g.add(rightBeam);

    var crossBeamGeo = new THREE.BoxGeometry(beamD, beamH, CHASSIS_W - beamD * 2);
    var frontBeam = new THREE.Mesh(crossBeamGeo, cMat);
    frontBeam.position.set(CHASSIS_L / 2 - 0.06, chassisY, 0);
    frontBeam.castShadow = true;
    g.add(frontBeam);
    var rearBeam = frontBeam.clone();
    rearBeam.position.set(-CHASSIS_L / 2 + 0.06, chassisY, 0);
    g.add(rearBeam);

    // 底盘底板
    var plate = new THREE.Mesh(new THREE.BoxGeometry(CHASSIS_L - 0.14, 0.02, CHASSIS_W - 0.12), darkGreyMat);
    plate.position.y = chassisY - 0.03;
    plate.castShadow = true;
    g.add(plate);

    // --- 4 个绿色轮胎（图片中为深绿色）---
    var wheels = [];
    var wx = CHASSIS_L / 2 - 0.08, wz = CHASSIS_W / 2 + WHEEL_W / 2 - 0.01;
    [[wx, wz], [wx, -wz], [-wx, wz], [-wx, -wz]].forEach(function (p) {
      var tire = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_W, 22), tireMat);
      tire.rotation.x = Math.PI / 2; // 圆柱轴转成横向（z 方向），轮胎可绕其滚动
      tire.position.set(p[0], WHEEL_R, p[1]);
      tire.castShadow = true;
      g.add(tire);
      // 轮毂挂在轮胎下，随轮胎一起滚动
      var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, WHEEL_W + 0.02, 14), hubMat);
      hub.rotation.x = Math.PI / 2;
      tire.add(hub);
      wheels.push(tire);
    });

    // --- V5 Brain（前上方黑色主体 + 蓝色发光屏）---
    var brain = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.12, 0.32), blackMat);
    brain.position.set(0.24, chassisY + 0.12, 0);
    brain.castShadow = true;
    g.add(brain);
    var screen = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.09, 0.24), screenMat);
    screen.position.set(0.34, chassisY + 0.12, 0);
    g.add(screen);

    // --- 电池（后部黑色方块）---
    var battery = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.38), blackMat);
    battery.position.set(-0.26, chassisY + 0.10, 0);
    battery.castShadow = true;
    g.add(battery);

    // --- 超声波传感器（车头黑色小方块 + 两只银色"眼睛"）---
    var sonarBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.17), blackMat);
    sonarBody.position.set(CHASSIS_L / 2 + 0.01, chassisY + 0.02, 0);
    sonarBody.castShadow = true;
    g.add(sonarBody);
    var eyeMat = mat(0xb8bcc4, { roughness: 0.35, metalness: 0.65 });
    [-0.046, 0.046].forEach(function (z) {
      var eye = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 18), eyeMat);
      eye.rotation.z = Math.PI / 2; // 圆柱轴向 x：眼睛朝前
      eye.position.set(CHASSIS_L / 2 + 0.037, chassisY + 0.02, z);
      g.add(eye);
    });

    // --- 后塔（升降臂支撑，两根 C-channel 竖梁 + 顶梁）---
    var towerH = 1.25;
    var towerGeo = new THREE.BoxGeometry(0.05, towerH, 0.08);
    var towerL = new THREE.Mesh(towerGeo, cMat);
    towerL.position.set(-CHASSIS_L / 2 + 0.12, chassisY + towerH / 2, CHASSIS_W / 2 - 0.18);
    towerL.castShadow = true;
    g.add(towerL);
    var towerR = towerL.clone();
    towerR.position.z = -CHASSIS_W / 2 + 0.18;
    g.add(towerR);

    var topBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, CHASSIS_W - 0.30), cMat);
    topBar.position.set(-CHASSIS_L / 2 + 0.12, chassisY + towerH, 0);
    topBar.castShadow = true;
    g.add(topBar);

    // 红色大齿轮装饰
    var gear = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 20), redMat);
    gear.rotation.x = Math.PI / 2;
    gear.position.set(-CHASSIS_L / 2 + 0.16, chassisY + towerH - 0.18, 0.14);
    g.add(gear);
    var gear2 = gear.clone(); gear2.position.z = -0.14; g.add(gear2);

    // --- 升降臂（绕塔顶旋转）---
    var armPivot = new THREE.Group();
    armPivot.position.set(-CHASSIS_L / 2 + 0.12, chassisY + towerH, 0);
    g.add(armPivot);

    var armLen = 1.55; // 臂加长：配合加高的塔，放臂到 -27°~-35° 时爪在前轮前方抱球，不卡轮间
    var armBarLen = 1.52;
    var armBar = new THREE.Mesh(new THREE.BoxGeometry(armBarLen, 0.05, 0.06), cMat);
    armBar.position.set(armBarLen / 2, -0.14, 0);
    armBar.rotation.z = -0.22;
    armBar.castShadow = true;
    armPivot.add(armBar);

    // --- 机械爪（弧形大爪，水平面内绕 Y 轴内外开合）---
    var clawPivot = new THREE.Group();
    var clawX = armLen * Math.cos(-0.22) - 0.02;
    var clawY = armLen * Math.sin(-0.22) - 0.16;
    clawPivot.position.set(clawX, clawY, 0);
    armPivot.add(clawPivot);

    // 单只弧形爪：短直臂 + 半圆弧钩；side=+1 左爪 / -1 右爪
    function makeJaw(side) {
      var j = new THREE.Group();
      var arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), redMat);
      arm.position.set(0.06, -0.01, 0);
      arm.castShadow = true;
      j.add(arm);
      var hook = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 16, Math.PI), redMat);
      hook.rotation.x = side * Math.PI / 2; // 弧开口（钩尖）朝向中心线，闭合时两钩尖向中心抱拢
      hook.position.set(0.24, -0.01, 0);
      hook.castShadow = true;
      j.add(hook);
      j.position.set(0, 0, side * 0.125);
      return j;
    }
    var jawL = makeJaw(1);
    var jawR = makeJaw(-1);
    clawPivot.add(jawL); clawPivot.add(jawR);

    return { group: g, wheels: wheels, armPivot: armPivot, clawPivot: clawPivot, jawL: jawL, jawR: jawR };
  }
  var bot = clawbot();
  scene.add(bot.group);

  // 球的吸附状态：碰到爪子即夹住（随机器人移动/转向/臂升降），爪子张开则释放
  var ballHeld = false;
  var clawOpenVal = 0.15;   // 当前爪子开合度（与 setClaw 同步）

  var robot = {
    group: bot.group,
    setPos: function (x, z) { bot.group.position.set(x, 0, z); },
    setHeading: function (deg) { bot.group.rotation.y = -deg * Math.PI / 180; },
    setArm: function (deg) { bot.armPivot.rotation.z = deg * Math.PI / 180; },
    setClaw: function (open01) {
      // 弧形爪绕 Y 轴内外开合：左爪负方向、右爪正方向，open01 越大张得越开
      clawOpenVal = open01;
      var a = 0.05 + open01 * 0.75;
      bot.jawL.rotation.y = -a; bot.jawR.rotation.y = a;
    },
    spinWheels: function (ang) { for (var i = 0; i < bot.wheels.length; i++) bot.wheels[i].rotation.y += ang; },
    reset: function () {
      ballHeld = false;
      robot.setPos(-3.4, -3.4);
      robot.setHeading(0);
      robot.setArm(0);
      robot.setClaw(0.15);
      ball.position.set(0, BALL_R, 0); // 球回到场地中央
      ball.rotation.set(0, 0, 0);
    }
  };
  robot.reset();

  /* ---------- 球：碰到爪子即吸附（夹在爪子里随机器人走），爪子张开则释放 ---------- */
  var CAPTURE_D = 1.2; // 吸附触发距离（球心距机器人中心，爪前端约 1.1ft）
  function updateBall() {
    var p = robot.group.position;

    if (ballHeld) {
      // 吸附中：球固定在爪子里，跟随机器人移动/转向、随臂升降（完全跟随爪的世界位置）
      bot.group.updateMatrixWorld(true);
      var hp = new THREE.Vector3();
      bot.clawPivot.getWorldPosition(hp);
      ball.position.copy(hp);
      ball.rotation.set(0, 0, 0);
      // 爪子张开（open > 0.5）→ 释放，球落回地面
      if (clawOpenVal > 0.5) {
        ballHeld = false;
        ball.position.y = BALL_R;
      }
      requestRender();
      return;
    }

    // 未吸附：检测爪子是否碰到球 → 吸附
    var dx = ball.position.x - p.x;
    var dz = ball.position.z - p.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d < CAPTURE_D && d > 0.0001) {
      ballHeld = true; // 碰到即吸附
      requestRender();
    }

    // 球的活动范围约束（未吸附时）
    var moved = false;
    if (ball.position.x > BALL_LIMIT) { ball.position.x = BALL_LIMIT; moved = true; }
    else if (ball.position.x < -BALL_LIMIT) { ball.position.x = -BALL_LIMIT; moved = true; }
    if (ball.position.z > BALL_LIMIT) { ball.position.z = BALL_LIMIT; moved = true; }
    else if (ball.position.z < -BALL_LIMIT) { ball.position.z = -BALL_LIMIT; moved = true; }
    if (moved) requestRender();
  }

  /* ---------- 超声波测距：沿车头方向到围栏内壁的距离（小球不算障碍物） ---------- */
  var WALL_IN = HALF;              // 围栏内壁 = 6.0 ft
  var FT2MM = 304.8;
  var sonarGeo = new THREE.BufferGeometry();
  sonarGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  var sonarLine = new THREE.Line(sonarGeo, new THREE.LineBasicMaterial({
    color: 0xff7788, transparent: true, opacity: 0.5
  }));
  sonarLine.frustumCulled = false;
  scene.add(sonarLine);

  var sonarHud = document.getElementById('sonarHud');
  var sonarValEl = sonarHud ? sonarHud.querySelector('.sh-value') : null;
  var sonarBarEl = sonarHud ? sonarHud.querySelector('.sh-bar i') : null;

  var _sonarPrev = { x: 99, z: 99, ry: 9 };
  function getDistanceMM() {
    var p = robot.group.position;
    var h = -robot.group.rotation.y;
    var fx = Math.cos(h), fz = Math.sin(h);
    var sx = p.x + fx * SONAR_X, sz = p.z + fz * SONAR_X;
    var best = Infinity;
    if (fx > 1e-6) best = Math.min(best, (WALL_IN - sx) / fx);
    else if (fx < -1e-6) best = Math.min(best, (-WALL_IN - sx) / fx);
    if (fz > 1e-6) best = Math.min(best, (WALL_IN - sz) / fz);
    else if (fz < -1e-6) best = Math.min(best, (-WALL_IN - sz) / fz);
    if (!isFinite(best) || best < 0) best = 0;
    var mm = Math.min(best * FT2MM, SONAR_MAX_MM);
    if (p.x !== _sonarPrev.x || p.z !== _sonarPrev.z || robot.group.rotation.y !== _sonarPrev.ry) {
      _sonarPrev.x = p.x; _sonarPrev.z = p.z; _sonarPrev.ry = robot.group.rotation.y;
      var d = mm / FT2MM;
      var pos = sonarGeo.attributes.position.array;
      pos[0] = sx; pos[1] = SONAR_Y; pos[2] = sz;
      pos[3] = sx + fx * d; pos[4] = SONAR_Y; pos[5] = sz + fz * d;
      sonarGeo.attributes.position.needsUpdate = true;
      if (sonarValEl) sonarValEl.textContent = Math.round(mm);
      if (sonarBarEl) sonarBarEl.style.width = (100 - Math.min(100, mm / SONAR_MAX_MM * 100)) + '%';
      if (sonarHud) sonarHud.classList.toggle('near', mm < 300);
      requestRender();
    }
    return mm;
  }
  getDistanceMM();

  /* ---------- 训练模式：随机终点旗帜 ---------- */
  var practice = { active: false, level: 1, flagPos: { x: 0, z: 0 }, reached: false, onReachCb: null };

  // 终点旗帜：旗杆 + 红色三角旗 + 底座光圈
  function makeFlag() {
    var g = new THREE.Group();
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.6, 8),
      mat(0xd8dde4, { roughness: 0.4, metalness: 0.6 }));
    pole.position.y = 0.845; // 底部贴海绵垫顶（垫顶 y≈0.045）
    pole.castShadow = true;
    g.add(pole);
    var shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.55, 0.16);
    shape.lineTo(0, 0.34);
    shape.closePath();
    var flagMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({ color: 0xff4646, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide }));
    flagMesh.position.set(0.006, 1.45, 0);
    flagMesh.castShadow = true;
    g.add(flagMesh);
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.27, 24),
      new THREE.MeshBasicMaterial({ color: 0xff4646, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);
    return g;
  }
  var flagGroup = makeFlag();
  flagGroup.visible = false;
  scene.add(flagGroup);

  function randomFlagPos(avoidX, avoidZ) {
    var x, z, tries = 0;
    do {
      x = (Math.random() * 2 - 1) * 4.2; // -4.2 ~ 4.2 ft
      z = (Math.random() * 2 - 1) * 4.2;
      tries++;
    } while (tries < 60 && Math.hypot(x - avoidX, z - avoidZ) < 2.2); // 避开指定点
    return { x: x, z: z };
  }
  var PRACTICE_REACH_R = 0.8; // 到达判定半径（ft）

  function checkPracticeReach() {
    if (!practice.active || practice.reached) return;
    var p = robot.group.position;
    var d = Math.hypot(p.x - practice.flagPos.x, p.z - practice.flagPos.z);
    if (d < PRACTICE_REACH_R) {
      practice.reached = true;
      if (practice.onReachCb) practice.onReachCb();
      var np = randomFlagPos(p.x, p.z); // 完成一次任务 → 终点刷新（避开机器当前位置）
      practice.flagPos = np;
      flagGroup.position.set(np.x, 0, np.z);
      practice.reached = false;
      requestRender();
    }
  }

  /* ---------- 轨道控制（拖拽旋转 + 滚轮缩放），绕机器人当前位置旋转 ---------- */
  var theta = 0.9, phi = 1.18, radius = 13.5;
  var CAM_H = 0.55;
  var camPrev = { x: -99, z: -99 };
  function placeCamera() {
    var p = robot.group.position;
    var ty = p.y + CAM_H;
    camera.position.set(
      p.x + radius * Math.sin(phi) * Math.sin(theta),
      ty + radius * Math.cos(phi),
      p.z + radius * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(p.x, ty, p.z);
    camPrev.x = p.x; camPrev.z = p.z;
    requestRender();
  }
  var dragging = false, px = 0, py = 0;
  container.addEventListener('pointerdown', function (e) {
    if (e.target && e.target.closest && e.target.closest('#aiPanel,#console')) return;
    dragging = true; px = e.clientX; py = e.clientY;
    container.setPointerCapture && container.setPointerCapture(e.pointerId);
  });
  container.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - px, dy = e.clientY - py;
    px = e.clientX; py = e.clientY;
    theta -= dx * 0.007;
    phi = Math.min(1.52, Math.max(0.4, phi - dy * 0.007));
    placeCamera();
  });
  container.addEventListener('pointerup', function () { dragging = false; });
  container.addEventListener('wheel', function (e) {
    e.preventDefault();
    radius = Math.min(26, Math.max(5, radius * (e.deltaY > 0 ? 1.09 : 0.92)));
    placeCamera();
  }, { passive: false });

  /* ---------- 尺寸自适应 + 渲染循环 ---------- */
  var frameCbs = [];
  function resize() {
    var w = container.clientWidth, h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  }
  window.addEventListener('resize', resize);
  resize();
  placeCamera();

  function animate() {
    requestAnimationFrame(animate);
    for (var i = 0; i < frameCbs.length; i++) frameCbs[i]();
    if (_needsRender) {
      renderer.render(scene, camera);
      _needsRender = false;
    }
  }
  animate();

  window.SceneAPI = {
    robot: robot,
    ball: ball,
    getDistanceMM: getDistanceMM,
    addFrameCallback: function (fn) { frameCbs.push(fn); },
    requestRender: requestRender,
    resize: resize,
    domElement: renderer.domElement,
    practice: {
      enter: function (levelId) {
        practice.active = true;
        practice.level = levelId || 1;
        robot.reset();           // 机器回起点、球回中央
        ball.visible = false;    // 练习模式隐藏球，聚焦"走到旗帜"
        var np = randomFlagPos(-3.4, -3.4); // 初始避开机器起点
        practice.flagPos = np;
        flagGroup.position.set(np.x, 0, np.z);
        flagGroup.visible = true;
        requestRender();
      },
      exit: function () {
        practice.active = false;
        flagGroup.visible = false;
        ball.visible = true;
        requestRender();
      },
      onReach: function (cb) { practice.onReachCb = cb; },
      isActive: function () { return practice.active; }
    }
  };
  SceneAPI.addFrameCallback(updateBall);
  SceneAPI.addFrameCallback(getDistanceMM);
  SceneAPI.addFrameCallback(checkPracticeReach);
  SceneAPI.addFrameCallback(function () {
    var p = robot.group.position;
    if (p.x !== camPrev.x || p.z !== camPrev.z) placeCamera();
  });
})();
