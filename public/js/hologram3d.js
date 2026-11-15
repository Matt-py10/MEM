/**
 * GEMELO DIGITAL 3D — Circuitos Electroneumáticos y Electrohidráulicos
 * Institución Universitaria de Barranquilla (IUB) · Ingeniería Mecatrónica
 * Desarrollado por: Mattius Holguín Blanco (mholguinb@unibarranquilla.edu.co)
 *
 * Motor WebGL (Three.js r128):
 *  - Escena dirigida por datos (cilindros, válvulas, conexionado) con encuadre automático de cámara.
 *  - Canvas ligado a su contenedor mediante ResizeObserver: nunca se deforma al cambiar de circuito.
 *  - Modelo de ciclo con fases (A+, B+, A-, ...) que se puede reproducir, pausar, arrastrar y saltar por fase.
 *  - Etiquetas HTML nítidas, ficha técnica al hacer clic, vista de despiece, Rayos-X y captura PNG.
 *  - Diagrama espacio-fase con cursor de reproducción dibujado en un canvas 2D.
 */

(function () {
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const ramp = (c, a, b) => ease(clamp01((c - a) / (b - a)));

  const COLORS = {
    cyan: 0x22d3ee,
    air: 0x06b6d4,
    green: 0x10b981,
    amber: 0xf59e0b,
    yellow: 0xfacc15,
    blue: 0x1e3a8a,
    festo: 0x0284c7,
    off: 0x1e293b
  };

  class IUBHologramEngine {
    constructor(containerId, hudCallbacks = {}) {
      this.container = document.getElementById(containerId);
      this.hud = hudCallbacks;

      this.preset = 'single_cylinder';
      this.activePractice = null;
      this.isPlaying = true;
      this.isXray = false;
      this.isExploded = false;
      this.explodeFactor = 0;
      this.autoOrbit = false;
      this.showLabels = true;
      this.speed = 1;
      this.pressureBar = 6.0;
      this.forceHyd = false;

      this.cyclePos = 0;
      this.cycleLen = 4;
      this.model = null;
      this.phaseIndex = -1;

      this.cameraView = 'iso';
      this.userZoomed = false;
      this.fitRadius = 15;
      this.spherical = { theta: 0.42, phi: 1.12, radius: 15 };
      this.targetSpherical = { theta: 0.42, phi: 1.12, radius: 15 };
      this.lookAtTarget = new THREE.Vector3(0, 2.5, 0);
      this.targetLookAt = new THREE.Vector3(0, 2.5, 0);

      this.isDragging = false;
      this.dragDistance = 0;
      this.prevMouse = { x: 0, y: 0 };

      this.units = [];
      this.pipes = [];
      this.labels = [];
      this.actors = {};
      this.selected = null;
      this._xrayStore = new WeakMap();
      this._lastHud = 0;
      this._lastOsc = 0;
      this._lastPressure = null;
      this.clock = new THREE.Clock();

      this.raycaster = new THREE.Raycaster();
      this.pointer = new THREE.Vector2();
      this.tmpV = new THREE.Vector3();

      if (this.container && typeof THREE !== 'undefined') {
        this.initScene();
        this.buildStudioEnvironment();
        this.buildBench();
        this.loadPreset(this.preset);
        this.bindEvents();
        this.resize();
        this.animate();
      }
    }

    // ======================================================================
    // ESCENA, LUCES Y ENTORNO
    // ======================================================================
    initScene() {
      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.FogExp2(0x040b18, 0.011);

      this.camera = new THREE.PerspectiveCamera(36, 1.6, 0.1, 100);

      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.domElement.classList.add('holo-webgl');
      this.container.appendChild(this.renderer.domElement);

      // Capa de etiquetas HTML (texto nítido, clicable)
      this.labelLayer = document.createElement('div');
      this.labelLayer.className = 'holo-label-layer';
      this.container.appendChild(this.labelLayer);

      this.scene.add(new THREE.HemisphereLight(0xdbeafe, 0x0b1a33, 0.75));

      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(7, 14, 11);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 2;
      key.shadow.camera.far = 40;
      const d = 9;
      key.shadow.camera.left = -d;
      key.shadow.camera.right = d;
      key.shadow.camera.top = d;
      key.shadow.camera.bottom = -d;
      key.shadow.bias = -0.0006;
      key.shadow.normalBias = 0.02;
      this.scene.add(key);

      const fill = new THREE.DirectionalLight(0x38bdf8, 0.7);
      fill.position.set(-10, 6, 8);
      this.scene.add(fill);

      const rim = new THREE.DirectionalLight(0x34d399, 0.6);
      rim.position.set(2, 8, -10);
      this.scene.add(rim);

      this.glowLight = new THREE.PointLight(0x22d3ee, 0.9, 16);
      this.glowLight.position.set(0, 3, 3);
      this.scene.add(this.glowLight);

      this.circuitGroup = new THREE.Group();
      this.scene.add(this.circuitGroup);

      this.selBox = new THREE.Box3Helper(new THREE.Box3(), 0xfacc15);
      this.selBox.visible = false;
      this.selBox.material.depthTest = false;
      this.selBox.renderOrder = 10;
      this.scene.add(this.selBox);
    }

    // Mapa de entorno procedural: da reflejos reales al cromo, aluminio y bronce
    buildStudioEnvironment() {
      try {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const env = new THREE.Scene();
        env.background = new THREE.Color(0x0a1a33);
        const panel = (w, h, color, pos, rot) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
          m.position.set(...pos);
          if (rot) m.rotation.set(...rot);
          env.add(m);
        };
        panel(26, 26, 0xffffff, [0, 12, 0], [Math.PI / 2, 0, 0]);
        panel(30, 6, 0x9bdcff, [0, 5, 12]);
        panel(16, 10, 0xffe9a8, [12, 4, 0], [0, Math.PI / 2, 0]);
        panel(16, 10, 0x6ee7b7, [-12, 4, 0], [0, Math.PI / 2, 0]);
        panel(30, 4, 0x0f2a52, [0, 1, -12]);
        this.scene.environment = pmrem.fromScene(env, 0.035).texture;
        pmrem.dispose();
      } catch (e) {
        /* sin soporte PMREM: se usa solo la iluminación directa */
      }
    }

    // ======================================================================
    // MATERIALES Y UTILIDADES DE GEOMETRÍA
    // ======================================================================
    mat(color, o = {}) {
      const opacity = o.opacity !== undefined ? o.opacity : 1;
      return new THREE.MeshPhysicalMaterial({
        color,
        metalness: o.metal !== undefined ? o.metal : 0.6,
        roughness: o.rough !== undefined ? o.rough : 0.3,
        clearcoat: o.clearcoat || 0,
        clearcoatRoughness: 0.15,
        emissive: o.emissive || 0x000000,
        emissiveIntensity: o.ei !== undefined ? o.ei : 0,
        transparent: opacity < 1,
        opacity,
        side: o.double ? THREE.DoubleSide : THREE.FrontSide
      });
    }

    add(parent, geometry, material, o = {}) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = o.shadow !== false;
      mesh.receiveShadow = o.receive !== false;
      if (o.pos) mesh.position.set(o.pos[0], o.pos[1], o.pos[2] || 0);
      if (o.rotZ) mesh.rotation.z = o.rotZ;
      if (o.rotX) mesh.rotation.x = o.rotX;
      if (o.edge) {
        const lines = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry, 28),
          new THREE.LineBasicMaterial({ color: o.edge, transparent: true, opacity: o.edgeOpacity || 0.35 })
        );
        lines.userData.baseOpacity = o.edgeOpacity || 0.35;
        mesh.add(lines);
      }
      parent.add(mesh);
      return mesh;
    }

    cylX(radius, length, seg = 28) {
      const g = new THREE.CylinderGeometry(radius, radius, length, seg);
      g.rotateZ(Math.PI / 2);
      return g;
    }

    setInfo(obj, tag, title, desc, specs = []) {
      obj.userData.holoInfo = { tag, title, desc, specs };
    }

    addLabel(obj, offset, tag, sub, accent = '#38bdf8', place = 'above') {
      const el = document.createElement('div');
      el.className = `holo-label place-${place}`;
      el.style.setProperty('--accent', accent);
      el.innerHTML = `<b>${tag}</b>${sub ? `<span>${sub}</span>` : ''}`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectObject(obj);
      });
      this.labelLayer.appendChild(el);
      const label = { el, obj, offset: new THREE.Vector3(...offset), valueEl: el.querySelector('span') };
      this.labels.push(label);
      return label;
    }

    // ======================================================================
    // BANCO DE TRABAJO (mesa + panel perfilado Festo)
    // ======================================================================
    buildBench() {
      this.benchGroup = new THREE.Group();
      this.scene.add(this.benchGroup);

      const table = this.add(this.benchGroup, new THREE.CylinderGeometry(7.6, 7.9, 0.24, 80), this.mat(0x0a1a33, { metal: 0.7, rough: 0.35, clearcoat: 0.6 }), {
        pos: [0, -0.12, 0.4],
        shadow: false,
        edge: 0x0284c7,
        edgeOpacity: 0.45
      });
      table.userData.noXray = true;

      const grid = new THREE.GridHelper(15, 30, 0x38bdf8, 0x12406b);
      grid.position.set(0, 0.012, 0.4);
      grid.material.transparent = true;
      grid.material.opacity = 0.32;
      this.benchGroup.add(grid);

      const ringGeo = new THREE.RingGeometry(6.9, 7.05, 96);
      ringGeo.rotateX(-Math.PI / 2);
      this.holoRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
      this.holoRing.position.set(0, 0.02, 0.4);
      this.holoRing.userData.noXray = true;
      this.benchGroup.add(this.holoRing);

      const ring2Geo = new THREE.RingGeometry(5.7, 5.76, 96);
      ring2Geo.rotateX(-Math.PI / 2);
      this.holoRing2 = new THREE.Mesh(ring2Geo, new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
      this.holoRing2.position.set(0, 0.02, 0.4);
      this.holoRing2.userData.noXray = true;
      this.benchGroup.add(this.holoRing2);

      // Panel de perfil de aluminio con ranuras en T
      const BW = 12.8;
      const BH = 5.7;
      const board = new THREE.Group();
      board.position.set(0, BH / 2, -1.7);
      const panel = this.add(board, new THREE.BoxGeometry(BW, BH, 0.22), this.mat(0x0d2243, { metal: 0.75, rough: 0.4, opacity: 0.96 }), {
        pos: [0, 0, -0.08],
        edge: 0x1d4ed8,
        edgeOpacity: 0.4
      });
      panel.userData.noXray = true;
      const railMat = this.mat(0x7c8da6, { metal: 0.9, rough: 0.28 });
      for (let i = -5; i <= 5; i++) {
        this.add(board, new THREE.BoxGeometry(BW - 0.3, 0.07, 0.07), railMat, { pos: [0, i * 0.5, 0.05], shadow: false });
      }
      const postMat = this.mat(0x1d3a7a, { metal: 0.85, rough: 0.25, clearcoat: 0.4 });
      [-1, 1].forEach((s) => {
        this.add(board, new THREE.BoxGeometry(0.36, BH + 0.2, 0.46), postMat, { pos: [s * (BW / 2 + 0.05), 0, 0], edge: 0x60a5fa });
      });
      this.add(board, new THREE.BoxGeometry(BW + 0.6, 0.3, 0.52), this.mat(0x002855, { metal: 0.6, rough: 0.3 }), {
        pos: [0, BH / 2 + 0.1, 0.02],
        edge: 0xffcc00,
        edgeOpacity: 0.85
      });
      this.add(board, new THREE.BoxGeometry(BW + 0.6, 0.22, 0.6), this.mat(0x16315f, { metal: 0.7, rough: 0.3 }), {
        pos: [0, -BH / 2 - 0.02, 0.05]
      });
      this.benchGroup.add(board);
      this.boardBox = new THREE.Box3(new THREE.Vector3(-BW / 2 - 0.4, 0, -1.9), new THREE.Vector3(BW / 2 + 0.4, BH + 0.4, 1.4));
    }

    // ======================================================================
    // COMPONENTES
    // ======================================================================
    createControlBox(x, y, z, hasTimer, hasCounter) {
      const g = new THREE.Group();
      g.position.set(x, y, z);

      const body = this.add(g, new THREE.BoxGeometry(1.75, 2.55, 0.62), this.mat(0x101a30, { metal: 0.55, rough: 0.3, clearcoat: 0.4 }), { edge: 0x38bdf8, edgeOpacity: 0.5 });
      body.userData.noXray = false;

      const red = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const blue = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
      this.add(g, new THREE.BoxGeometry(1.5, 0.09, 0.05), red, { pos: [0, 1.05, 0.32], shadow: false });
      this.add(g, new THREE.BoxGeometry(1.5, 0.09, 0.05), blue, { pos: [0, -1.05, 0.32], shadow: false });

      const chrome = this.mat(0xf1f5f9, { metal: 0.95, rough: 0.12 });
      const bezelGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.08, 28);
      bezelGeo.rotateX(Math.PI / 2);
      const btnGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.16, 28);
      btnGeo.rotateX(Math.PI / 2);
      [-0.42, 0.42].forEach((bx, i) => {
        this.add(g, bezelGeo, chrome, { pos: [bx, 0.58, 0.32] });
        const m = this.mat(i === 0 ? 0x10b981 : 0xef4444, { metal: 0.1, rough: 0.2, emissive: i === 0 ? 0x10b981 : 0x991b1b, ei: i === 0 ? 1.0 : 0.4 });
        this.add(g, btnGeo, m, { pos: [bx, 0.58, 0.37] });
      });

      const k1 = new THREE.MeshBasicMaterial({ color: COLORS.off });
      const k2 = new THREE.MeshBasicMaterial({ color: COLORS.off });
      this.add(g, new THREE.BoxGeometry(0.46, 0.38, 0.16), k1, { pos: [-0.42, -0.05, 0.32], shadow: false });
      this.add(g, new THREE.BoxGeometry(0.46, 0.38, 0.16), k2, { pos: [0.42, -0.05, 0.32], shadow: false });

      let hand = null;
      if (hasTimer || hasCounter) {
        const dialGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.12, 32);
        dialGeo.rotateX(Math.PI / 2);
        this.add(g, dialGeo, this.mat(0x1e293b, { metal: 0.5, rough: 0.3 }), { pos: [0, -0.62, 0.33] });
        hand = new THREE.Group();
        hand.position.set(0, -0.62, 0.41);
        this.add(hand, new THREE.BoxGeometry(0.04, 0.2, 0.02), new THREE.MeshBasicMaterial({ color: COLORS.yellow }), { pos: [0, 0.08, 0], shadow: false });
        g.add(hand);
      }

      const kind = hasTimer ? 'KT1 temporizador' : hasCounter ? 'CX contador' : 'S1/S2 · K1/K2';
      this.setInfo(
        g,
        'MANDO',
        'Módulo de mando eléctrico 24 V DC',
        'Reúne los pulsadores de arranque/paro, los relés auxiliares y los bornes de alimentación del circuito de control. Cada LED indica la bobina que está energizada en la fase actual.',
        [
          ['Tensión', '24 V DC'],
          ['Pulsadores', 'S1 START (verde) · S2 STOP (rojo)'],
          ['Relés', hasTimer ? 'K1, K2 + KT1 (temporizador)' : hasCounter ? 'K1, K2 + CX (contador)' : 'K1, K2'],
          ['Bornes', '+24 V (rojo) · 0 V (azul)']
        ]
      );
      this.addLabel(g, [0, 1.55, 0], 'MANDO 24V', kind, '#facc15');
      this.circuitGroup.add(g);
      g.updateMatrixWorld(true);
      return { group: g, k1, k2, hand, wirePort: g.localToWorld(new THREE.Vector3(0.88, -0.7, 0.2)) };
    }

    createFRL(x, y, z) {
      const g = new THREE.Group();
      g.position.set(x, y, z);

      this.add(g, new THREE.BoxGeometry(1.25, 0.92, 0.78), this.mat(COLORS.blue, { metal: 0.72, rough: 0.25, clearcoat: 0.5 }), { edge: 0x38bdf8, edgeOpacity: 0.45 });

      const bowl = new THREE.Group();
      bowl.position.set(-0.28, -0.74, 0);
      this.add(bowl, new THREE.CylinderGeometry(0.32, 0.26, 0.62, 32), this.mat(0x7dd3fc, { metal: 0.05, rough: 0.05, opacity: 0.3, double: true }), { shadow: false, edge: 0x7dd3fc, edgeOpacity: 0.3 });
      this.add(bowl, new THREE.CylinderGeometry(0.15, 0.13, 0.4, 20), this.mat(0xd97706, { metal: 0.78, rough: 0.35 }), { pos: [0, 0.05, 0] });
      g.add(bowl);

      const knob = new THREE.Group();
      knob.position.set(-0.28, 0.68, 0);
      this.add(knob, new THREE.CylinderGeometry(0.3, 0.26, 0.44, 28), this.mat(COLORS.amber, { metal: 0.35, rough: 0.28, clearcoat: 0.5 }), { edge: 0xfde68a });
      g.add(knob);

      const gauge = new THREE.Group();
      gauge.position.set(0.26, 0.08, 0.46);
      const bezelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.18, 36);
      bezelGeo.rotateX(Math.PI / 2);
      this.add(gauge, bezelGeo, this.mat(0xe2e8f0, { metal: 0.9, rough: 0.15 }));
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.31, 36), new THREE.MeshBasicMaterial({ color: 0xf8fafc }));
      face.position.z = 0.1;
      gauge.add(face);
      const arc = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 28, 1, 0.4, Math.PI * 1.4), new THREE.MeshBasicMaterial({ color: 0x0284c7, side: THREE.DoubleSide }));
      arc.position.z = 0.105;
      gauge.add(arc);
      const needle = new THREE.Group();
      needle.position.z = 0.115;
      const nm = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.24, 0.015), new THREE.MeshBasicMaterial({ color: 0xdc2626 }));
      nm.position.y = 0.09;
      needle.add(nm);
      gauge.add(needle);
      g.add(gauge);

      this.setInfo(
        g,
        '0Z1',
        'Unidad de mantenimiento FRL',
        'Filtra el aire comprimido, regula la presión de trabajo y la mantiene estable. El manómetro de aguja marca la presión que alimenta todo el circuito.',
        [
          ['Presión regulada', `${this.pressureBar.toFixed(1)} bar`],
          ['Referencia', 'LFR-1/4-D-MINI (Festo)'],
          ['Símbolo', 'ISO 1219-1 · 0Z1']
        ]
      );
      const label = this.addLabel(g, [0, 1.3, 0], '0Z1 · FRL', `${this.pressureBar.toFixed(1)} bar`, '#38bdf8');
      this.circuitGroup.add(g);
      g.updateMatrixWorld(true);
      return { group: g, needle, bowl, knob, label, outPort: g.localToWorld(new THREE.Vector3(0.63, 0, 0)) };
    }

    createValve(cfg, index) {
      const { x, y, z, ports = 5, scale = 0.9 } = cfg;
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.scale.setScalar(scale);

      const width = ports === 3 ? 1.75 : 2.45;
      this.add(g, new THREE.BoxGeometry(width, 0.88, 0.82), this.mat(0x12305a, { metal: 0.65, rough: 0.2, opacity: 0.55, clearcoat: 0.6, double: true }), { edge: 0x38bdf8, edgeOpacity: 0.55 });

      const spool = new THREE.Group();
      this.add(spool, this.cylX(0.1, width * 0.86, 20), this.mat(0xf8fafc, { metal: 0.95, rough: 0.08 }), { shadow: false });
      (ports === 3 ? [-0.34, 0.34] : [-0.58, 0, 0.58]).forEach((lx) => {
        this.add(spool, this.cylX(0.26, 0.2, 28), this.mat(COLORS.air, { metal: 0.5, rough: 0.2, emissive: 0x0891b2, ei: 0.45 }), { pos: [lx, 0, 0], shadow: false });
      });
      g.add(spool);

      const fit = this.mat(COLORS.festo, { metal: 0.4, rough: 0.25 });
      const portOffsets = ports === 3 ? [0] : [-0.52, 0.52];
      portOffsets.forEach((px) => this.add(g, new THREE.CylinderGeometry(0.13, 0.13, 0.28, 20), fit, { pos: [px, 0.56, 0] }));
      this.add(g, new THREE.CylinderGeometry(0.14, 0.14, 0.28, 20), fit, { pos: [0, -0.56, 0] });
      const muff = this.mat(0xd97706, { metal: 0.82, rough: 0.35 });
      (ports === 3 ? [0.4] : [-0.62, 0.62]).forEach((mx) => this.add(g, new THREE.CylinderGeometry(0.11, 0.07, 0.28, 16), muff, { pos: [mx, -0.56, 0.2] }));

      const makeCoil = (side, color) => {
        const cg = new THREE.Group();
        cg.position.set(side * (width / 2 + 0.3), 0, 0);
        this.add(cg, new THREE.BoxGeometry(0.56, 0.68, 0.66), this.mat(0x101a30, { metal: 0.5, rough: 0.25, clearcoat: 0.4 }), { edge: 0x38bdf8, edgeOpacity: 0.3 });
        const led = new THREE.MeshBasicMaterial({ color: COLORS.off });
        this.add(cg, new THREE.BoxGeometry(0.26, 0.16, 0.26), led, { pos: [0, 0.42, 0.12], shadow: false });
        g.add(cg);
        return { group: cg, led, baseX: cg.position.x, color };
      };
      const left = makeCoil(-1, COLORS.green);
      const right = ports >= 4 ? makeCoil(1, COLORS.yellow) : null;

      const typeStr = ports === 3 ? 'Válvula 3/2 NC' : ports === 4 ? 'Válvula 4/3 electrohidráulica' : 'Electroválvula 5/2';
      this.setInfo(
        g,
        cfg.name,
        typeStr,
        ports === 3
          ? 'Alimenta la cámara trasera del cilindro cuando la bobina Y1 recibe 24 V. Al desenergizarla, el muelle devuelve la corredera y el aire escapa por la vía 3.'
          : 'Dirige el aire (o el aceite) hacia una cámara del cilindro y deja escapar la otra. La corredera interna se desplaza cuando se energiza la bobina Y1 (avance) o Y2 (retorno).',
        [
          ['Vías / posiciones', ports === 3 ? '3/2' : ports === 4 ? '4/3 centro cerrado' : '5/2'],
          ['Mando', ports === 3 ? 'Solenoide 24 V DC + muelle' : 'Solenoides 24 V DC (Y1/Y2)'],
          ['Norma', 'ISO 1219-1']
        ]
      );
      this.addLabel(g, [0, -1.28, 0.3], cfg.name, ports === 3 ? '3/2 · Y1 + muelle' : ports === 4 ? '4/3 · Y1/Y2' : '5/2 · Y1/Y2', '#22d3ee', 'below');

      this.circuitGroup.add(g);
      g.updateMatrixWorld(true);
      const L = (v) => g.localToWorld(new THREE.Vector3(v[0], v[1], v[2]));
      return {
        group: g,
        spool,
        left,
        right,
        ports,
        scale,
        portA: L([ports === 3 ? 0 : -0.52, 0.72, 0]),
        portB: ports === 3 ? null : L([0.52, 0.72, 0]),
        supply: L([0, -0.72, 0]),
        coilTopL: L([-(width / 2 + 0.3), 0.36, 0.1]),
        coilTopR: ports >= 4 ? L([width / 2 + 0.3, 0.36, 0.1]) : null
      };
    }

    createCylinder(cfg, index) {
      const { cx, cy, cz = 0, len: length, orient = 0, side = -1, spring = false, tag, hyd = false, stroke = 100 } = cfg;
      const g = new THREE.Group();
      g.position.set(cx, cy, cz);
      g.rotation.z = orient;

      const fy = side * 0.72;
      const barrel = this.add(g, new THREE.CylinderGeometry(0.54, 0.54, length, 40, 1, true).rotateZ(Math.PI / 2), this.mat(0xbae6fd, { metal: 0.1, rough: 0.05, opacity: 0.2, clearcoat: 1, double: true }), {
        shadow: false,
        edge: 0x38bdf8,
        edgeOpacity: 0.25
      });

      const tieRods = new THREE.Group();
      const rodMat = this.mat(0xe5e7eb, { metal: 0.95, rough: 0.12 });
      [[0.48, 0.48], [0.48, -0.48], [-0.48, 0.48], [-0.48, -0.48]].forEach(([ty, tz]) => {
        this.add(tieRods, this.cylX(0.04, length + 0.48, 14), rodMat, { pos: [0, ty, tz], shadow: false });
      });
      g.add(tieRods);

      const oilColor = hyd ? 0xf59e0b : 0x06b6d4;
      const chRearMat = new THREE.MeshBasicMaterial({ color: oilColor, transparent: true, opacity: 0.45, depthWrite: false });
      const chRear = new THREE.Mesh(this.cylX(0.47, 1, 32), chRearMat);
      chRear.userData.noXray = true;
      g.add(chRear);
      const chFrontMat = new THREE.MeshBasicMaterial({ color: hyd ? 0xfbbf24 : 0x34d399, transparent: true, opacity: 0.18, depthWrite: false });
      const chFront = new THREE.Mesh(this.cylX(0.47, 1, 32), chFrontMat);
      chFront.userData.noXray = true;
      g.add(chFront);

      const capMat = this.mat(COLORS.blue, { metal: 0.8, rough: 0.22, clearcoat: 0.5 });
      const capGeo = new THREE.BoxGeometry(0.42, 1.24, 1.24);
      const rearCap = this.add(g, capGeo, capMat, { pos: [-length / 2 - 0.2, 0, 0], edge: 0x60a5fa, edgeOpacity: 0.4 });
      const frontCap = this.add(g, capGeo, capMat, { pos: [length / 2 + 0.2, 0, 0], edge: 0x60a5fa, edgeOpacity: 0.4 });
      const nose = this.add(g, this.cylX(0.3, 0.3, 28), this.mat(0xd97706, { metal: 0.88, rough: 0.2 }), { pos: [length / 2 + 0.5, 0, 0] });

      const grlaMat = this.mat(0x94a3b8, { metal: 0.9, rough: 0.18 });
      const knobMat = this.mat(COLORS.festo, { metal: 0.3, rough: 0.3 });
      [-length / 2 - 0.2, length / 2 + 0.2].forEach((rx) => {
        this.add(g, new THREE.CylinderGeometry(0.14, 0.14, 0.34, 20), grlaMat, { pos: [rx, fy, 0] });
        this.add(g, new THREE.CylinderGeometry(0.17, 0.17, 0.1, 20), knobMat, { pos: [rx, fy + side * 0.2, 0] });
      });

      // Conjunto móvil
      const piston = new THREE.Group();
      this.add(piston, this.cylX(0.5, 0.42, 36), this.mat(0xf1f5f9, { metal: 0.88, rough: 0.14 }));
      this.add(piston, this.cylX(0.28, 0.64, 24), this.mat(0x38bdf8, { metal: 0.7, rough: 0.2 }));
      [-0.16, 0.16].forEach((ox) => this.add(piston, this.cylX(0.515, 0.055, 36), new THREE.MeshBasicMaterial({ color: 0x090d16 }), { pos: [ox, 0, 0], shadow: false }));
      this.add(piston, this.cylX(0.51, 0.13, 36), this.mat(COLORS.green, { metal: 0.2, rough: 0.2, emissive: COLORS.green, ei: 0.7 }), { shadow: false });
      const rodLen = length * 0.84 + 0.15;
      this.add(piston, this.cylX(0.18, rodLen, 28), this.mat(0xffffff, { metal: 0.98, rough: 0.05, clearcoat: 1 }), { pos: [rodLen / 2 + 0.18, 0, 0] });
      this.add(piston, new THREE.BoxGeometry(0.38, 0.56, 0.48), this.mat(COLORS.amber, { metal: 0.55, rough: 0.22, clearcoat: 0.4 }), { pos: [rodLen + 0.32, 0, 0], edge: 0xfde68a });
      piston.position.x = -length * 0.34;
      g.add(piston);

      let springMesh = null;
      if (spring) {
        const pts = [];
        const turns = 11;
        for (let i = 0; i <= 110; i++) {
          const t = i / 110;
          const a = t * Math.PI * 2 * turns;
          pts.push(new THREE.Vector3(t * length, Math.cos(a) * 0.34, Math.sin(a) * 0.34));
        }
        springMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 110, 0.042, 10, false), this.mat(COLORS.yellow, { metal: 0.85, rough: 0.2 }));
        springMesh.castShadow = true;
        g.add(springMesh);
      }

      // Sensores Reed
      this.add(g, new THREE.BoxGeometry(length * 0.88, 0.06, 0.12), this.mat(0x475569, { metal: 0.8, rough: 0.25 }), { pos: [0, -fy * 0.86, 0], shadow: false });
      const s1 = new THREE.MeshBasicMaterial({ color: COLORS.off });
      const s2 = new THREE.MeshBasicMaterial({ color: COLORS.off });
      const sensor1 = this.add(g, new THREE.BoxGeometry(0.38, 0.22, 0.26), s1, { pos: [-length * 0.34, -fy, 0], shadow: false });
      const sensor2 = this.add(g, new THREE.BoxGeometry(0.38, 0.22, 0.26), s2, { pos: [length * 0.34, -fy, 0], shadow: false });
      const sn = tag.split(' ')[0];
      this.setInfo(sensor1, `${sn}·B1`, 'Sensor magnético Reed (retraído)', 'Se activa cuando el imán del émbolo pasa frente a él: confirma que el vástago está completamente retraído.', [['Señal', '24 V DC · 3 hilos PNP']]);
      this.setInfo(sensor2, `${sn}·B2`, 'Sensor magnético Reed (extendido)', 'Se activa cuando el vástago llega al final de carrera delantero. Habilita la siguiente fase de la secuencia.', [['Señal', '24 V DC · 3 hilos PNP']]);

      this.setInfo(
        g,
        tag,
        spring ? 'Cilindro de simple efecto' : hyd ? 'Cilindro hidráulico de doble efecto' : 'Cilindro de doble efecto ISO 15552',
        spring
          ? 'El aire empuja el émbolo en un solo sentido; el resorte interno lo devuelve cuando se deja de presurizar. El anillo magnético verde activa los sensores B1 y B2.'
          : 'Cada cámara se presuriza por turnos: la trasera produce el avance (+) y la delantera el retorno (−). Las cámaras coloreadas muestran el fluido a presión en cada instante.',
        [
          ['Carrera', `${stroke} mm (escala didáctica)`],
          ['Presión de trabajo', hyd ? '50 bar (hidráulica)' : `${this.pressureBar.toFixed(1)} bar`],
          ['Norma', 'ISO 15552'],
          ['Sensores', 'Reed B1 (retraído) · B2 (extendido)']
        ]
      );
      const lo = cfg.labelOffset || [0, 1.25, 0];
      this.addLabel(g, lo, tag, spring ? 'Simple efecto' : hyd ? 'Hidráulico · 50 bar' : 'Doble efecto', '#10b981', cfg.labelPlace || 'above');

      this.circuitGroup.add(g);
      g.updateMatrixWorld(true);
      const P = (rx) => g.localToWorld(new THREE.Vector3(rx, side * 1.02, 0));
      const normal = new THREE.Vector3(0, side, 0).transformDirection(g.matrixWorld);
      return {
        group: g,
        barrel,
        tieRods,
        rearCap,
        frontCap,
        nose,
        piston,
        chRear,
        chRearMat,
        chFront,
        chFrontMat,
        spring: springMesh,
        sensor1,
        sensor2,
        s1,
        s2,
        length,
        hyd,
        side,
        stroke,
        rodLen,
        minX: -length * 0.34,
        maxX: length * 0.34,
        portRear: P(-length / 2 - 0.2),
        portFront: P(length / 2 + 0.2),
        normal,
        baseY: { sensor: -fy }
      };
    }

    // ======================================================================
    // TUBERÍAS Y CABLES CON FLUJO ANIMADO
    // ======================================================================
    createPipe(points, color, o = {}) {
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
      const radius = o.radius || (o.electric ? 0.034 : 0.066);
      const tubeMat = new THREE.MeshPhysicalMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.6,
        roughness: 0.2,
        clearcoat: 0.6
      });
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, radius, 12, false), tubeMat);
      tube.userData.noXray = true;
      this.circuitGroup.add(tube);

      const count = o.count || (o.electric ? 3 : 5);
      const pGeo = new THREE.SphereGeometry(o.electric ? 0.075 : 0.1, 12, 12);
      const pMat = new THREE.MeshBasicMaterial({ color: o.electric ? 0xfef08a : 0xcffafe });
      const particles = [];
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(pGeo, pMat);
        m.userData.noXray = true;
        this.circuitGroup.add(m);
        particles.push({ mesh: m, offset: i / count });
      }
      const pipe = { curve, tubeMat, particles, active: true, speed: o.electric ? 1.1 : 0.7, color };
      this.pipes.push(pipe);
      return pipe;
    }

    connect(a, na, b, nb, color, o = {}) {
      const pts = [a.clone(), a.clone().addScaledVector(na, o.d1 || 0.32)];
      if (o.zMid) {
        const m = a.clone().lerp(b, 0.5);
        m.z += o.zMid;
        pts.push(m);
      }
      pts.push(b.clone().addScaledVector(nb, o.d2 || 0.42), b.clone());
      return this.createPipe(pts, color, o);
    }

    setPipeActive(pipe, on) {
      if (!pipe) return;
      pipe.active = on;
      pipe.tubeMat.opacity += ((on ? 0.7 : 0.2) - pipe.tubeMat.opacity) * 0.25;
      pipe.tubeMat.emissiveIntensity += ((on ? 0.55 : 0.08) - pipe.tubeMat.emissiveIntensity) * 0.25;
      pipe.particles.forEach((p) => (p.mesh.visible = on));
    }

    // ======================================================================
    // MODELOS DE CICLO (fases + movimiento de cada cilindro)
    // ======================================================================
    getModel(kind) {
      const ph = (name, start, end, text) => ({ name, start, end, text });
      if (kind === 'three_cylinders') {
        return {
          cycleLen: 6,
          ratios: (c) => [ramp(c, 0, 1) - ramp(c, 4, 5), ramp(c, 1, 2) - ramp(c, 5, 6), ramp(c, 2, 3) - ramp(c, 3, 4)],
          phases: [
            ph('A+', 0, 1, 'Y1 ON → el cilindro A avanza (sujeta la pieza)'),
            ph('B+', 1, 2, 'Y3 ON → el cilindro B desciende (opera la pieza)'),
            ph('C+', 2, 3, 'Y5 ON → el cilindro C avanza (empuja)'),
            ph('C−', 3, 4, 'Y6 ON → el cilindro C retorna'),
            ph('A−', 4, 5, 'Y2 ON → el cilindro A libera la pieza'),
            ph('B−', 5, 6, 'Y4 ON → el cilindro B regresa · fin de ciclo')
          ]
        };
      }
      if (kind === 'sequence_ab') {
        return {
          cycleLen: 4,
          ratios: (c) => [ramp(c, 0, 1) - ramp(c, 2, 3), ramp(c, 1, 2) - ramp(c, 3, 4)],
          phases: [
            ph('A+', 0, 1, 'K1 → Y1 ON: avanza el cilindro A · sensor 1B2'),
            ph('B+', 1, 2, 'K2 → Y3 ON: avanza el cilindro B · sensor 2B2'),
            ph('A−', 2, 3, 'K3 → Y2 ON: retorna el cilindro A · sensor 1B1'),
            ph('B−', 3, 4, 'K4 → Y4 ON: retorna el cilindro B · fin de ciclo')
          ]
        };
      }
      const single = kind === 'single_cylinder';
      const hyd = kind === 'hydraulic_press';
      return {
        cycleLen: 4,
        ratios: (c) => [ramp(c, 0, 1.25) - ramp(c, 2.15, 3.5)],
        phases: [
          ph(
            hyd ? 'Prensado' : 'A+ Avance',
            0,
            1.35,
            single ? 'S1 pulsado → Y1 ON: la cámara trasera se presuriza' : hyd ? 'Y1 ON (24 V): el aceite a 50 bar empuja el émbolo hacia abajo' : 'K1 → Y1 ON (24 V): P→4, escape 2→3'
          ),
          ph(hyd ? 'Retención' : 'Sostener', 1.35, 2.15, hyd ? 'Centro cerrado 4/3: el cilindro mantiene la carga' : 'Sensor 1B2 activo: el vástago está en final de carrera'),
          ph('A− Retorno', 2.15, 3.5, single ? 'Y1 OFF → el muelle devuelve el vástago, escape por la vía 3' : 'K2 → Y2 ON (24 V): P→2, escape 4→5'),
          ph('Reposo', 3.5, 4, 'Sensor 1B1 activo: listo para un nuevo ciclo')
        ]
      };
    }

    // ======================================================================
    // CONSTRUCCIÓN DE ESCENAS (dirigida por datos)
    // ======================================================================
    clearCircuit() {
      this.deselect();
      while (this.circuitGroup.children.length) this.circuitGroup.remove(this.circuitGroup.children[0]);
      this.labels.forEach((l) => l.el.remove());
      this.labels = [];
      this.units = [];
      this.pipes = [];
      this.actors = {};
    }

    getLayout(kind) {
      const V = (x, ports = 5, scale = 0.9) => ({ x, ports, scale });
      switch (kind) {
        case 'single_cylinder':
          return {
            frlX: -3.35,
            valves: [V(-0.6, 3, 0.9)],
            cyls: [{ cx: 0.6, cy: 3.5, len: 3.0, spring: true, tag: '1A1' }]
          };
        case 'double_cylinder':
          return {
            frlX: -3.35,
            valves: [V(-0.4, 5, 0.9)],
            cyls: [{ cx: 0.9, cy: 3.5, len: 3.2, tag: '1A1' }]
          };
        case 'sequence_ab':
          return {
            frlX: -3.35,
            valves: [V(-1.0, 5, 0.7), V(1.9, 5, 0.7)],
            cyls: [
              { cx: -0.9, cy: 3.5, len: 2.4, tag: '1A1 · A' },
              { cx: 4.6, cy: 4.1, len: 1.6, orient: -Math.PI / 2, tag: '2A1 · B', labelOffset: [1.25, 0.4, 0], labelPlace: 'right' }
            ]
          };
        case 'three_cylinders':
          return {
            hyd: !!this.forceHyd,
            frlX: -3.35,
            valves: [V(-1.2, 5, 0.62), V(1.2, 5, 0.62), V(3.6, 5, 0.62)],
            cyls: [
              { cx: -2.2, cy: 3.5, len: 1.6, tag: '1A1 · A', hyd: !!this.forceHyd },
              { cx: 2.5, cy: 4.3, len: 1.2, orient: -Math.PI / 2, tag: '2A1 · B', hyd: !!this.forceHyd, labelOffset: [1.2, 0.4, 0], labelPlace: 'right' },
              { cx: 5.5, cy: 2.2, len: 1.4, orient: Math.PI / 2, side: 1, tag: '3A1 · C', hyd: !!this.forceHyd, labelOffset: [0, 2.7, 0] }
            ]
          };
        case 'hydraulic_press':
          return {
            pump: true,
            frlX: -3.6,
            valves: [V(-0.5, 4, 0.9)],
            cyls: [{ cx: 3.5, cy: 3.35, len: 1.8, orient: -Math.PI / 2, hyd: true, stroke: 200, tag: '1A1 · PRENSA', zMid: 0.9, labelOffset: [1.3, 0.2, 0], labelPlace: 'right' }]
          };
        default:
          return this.getLayout('double_cylinder');
      }
    }

    loadCircuit(practice) {
      this.activePractice = practice || null;
      if (!practice) return this.loadPreset('single_cylinder');
      this.pressureBar = Number(practice.pressureBar) || 6.0;
      const text = `${practice.id} ${practice.title} ${practice.motionEquation || ''}`.toUpperCase();
      let kind = practice.hologramPreset || 'double_cylinder';
      const isHyd = kind === 'hydraulic_press' || /HIDR/.test(String(practice.category || '').toUpperCase());
      this.forceHyd = false;
      if (kind === 'plc_station' || text.includes('3 CILINDRO') || practice.id === 'CASO-00') {
        this.forceHyd = isHyd;
        kind = 'three_cylinders';
      }
      this.loadPreset(kind, practice);
    }

    loadPreset(name, practice = null) {
      let kind = name || 'single_cylinder';
      if (kind === 'plc_station') kind = 'three_cylinders';
      this.preset = kind;
      if (practice) this.activePractice = practice;
      this.clearCircuit();

      const pText = this.activePractice ? `${this.activePractice.title} ${this.activePractice.motionEquation || ''}`.toUpperCase() : '';
      const hasTimer = /TEMPORIZ|DELAY|\bKT\d|\bTEMP\b/.test(pText);
      const hasCounter = /CONTADOR|CICLOS|\bCX\b/.test(pText);

      const layout = this.getLayout(kind);
      this.model = this.getModel(kind);
      this.cycleLen = this.model.cycleLen;
      this.cyclePos = 0;
      this.phaseIndex = -1;

      const rowY = 1.45;
      const rowZ = 0.2;

      this.actors.ctrl = this.createControlBox(-5.0, 2.7, -0.2, hasTimer, hasCounter);

      let supplyOut;
      if (layout.pump) {
        const tank = this.add(this.circuitGroup, new THREE.BoxGeometry(1.95, 1.3, 1.4), this.mat(COLORS.blue, { metal: 0.75, rough: 0.25, clearcoat: 0.5 }), { pos: [layout.frlX, 0.65, rowZ], edge: 0x38bdf8 });
        const motor = this.add(this.circuitGroup, this.cylX(0.44, 1.0, 32).rotateZ(Math.PI / 2), this.mat(COLORS.amber, { metal: 0.7, rough: 0.2, clearcoat: 0.5 }), { pos: [layout.frlX, 1.8, rowZ], edge: 0xfde68a });
        this.setInfo(tank, '0P1', 'Grupo hidráulico', 'Motor eléctrico, bomba y depósito de aceite. Entrega el caudal a 50 bar que mueve la prensa a través de la válvula 4/3.', [['Presión', '50 bar'], ['Fluido', 'Aceite hidráulico ISO VG 46']]);
        this.setInfo(motor, '0M1', 'Motor eléctrico de la bomba', 'Acciona la bomba hidráulica del grupo.', [['Alimentación', 'Trifásica / 24 V de mando']]);
        this.addLabel(tank, [0, 2.15, 0], '0P1 · GRUPO', 'Bomba + tanque · 50 bar', '#f59e0b');
        supplyOut = new THREE.Vector3(layout.frlX + 1.0, 0.9, rowZ);
        this.actors.frl = null;
      } else {
        this.actors.frl = this.createFRL(layout.frlX, rowY, rowZ);
        supplyOut = this.actors.frl.outPort;
      }

      const hydTheme = !!(layout.pump || layout.hyd);
      const supplyColor = hydTheme ? COLORS.amber : 0x38bdf8;
      const workColor = hydTheme ? COLORS.amber : COLORS.air;
      const workColor2 = hydTheme ? 0xfbbf24 : COLORS.green;
      const lastX = layout.valves[layout.valves.length - 1].x;
      const manY = 0.35;

      // Colector de alimentación y derivaciones a cada válvula
      const manifold = this.createPipe(
        [supplyOut.clone(), supplyOut.clone().add(new THREE.Vector3(0.45, 0, 0)), new THREE.Vector3(supplyOut.x + 0.45, manY, rowZ), new THREE.Vector3(lastX, manY, rowZ)],
        supplyColor,
        { radius: 0.1, count: 8 }
      );
      this.actors.manifold = manifold;

      layout.valves.forEach((vc, k) => {
        const valve = this.createValve({ ...vc, y: rowY, z: rowZ, name: `${k + 1}V1` }, k);
        const cyl = this.createCylinder({ ...layout.cyls[k], tag: layout.cyls[k].tag }, k);
        this.createPipe([new THREE.Vector3(vc.x, manY, rowZ), new THREE.Vector3(vc.x, (manY + valve.supply.y) / 2, rowZ), valve.supply.clone()], supplyColor, { count: 3 });

        const up = new THREE.Vector3(0, 1, 0);
        const zMid = layout.cyls[k].zMid || 0;
        const pipeRear = this.connect(valve.portA, up, cyl.portRear, cyl.normal, workColor, { zMid });
        const pipeFront = valve.portB ? this.connect(valve.portB, up, cyl.portFront, cyl.normal, workColor2, { zMid }) : null;

        // Cableado 24 V desde el módulo de mando hasta las bobinas
        const cbp = this.actors.ctrl.wirePort;
        const wire = (target, dy) => {
          const m1 = new THREE.Vector3(cbp.x + 0.5, cbp.y - 0.2 - dy, -0.55);
          const m2 = new THREE.Vector3(target.x - 0.45, target.y + 0.35, -0.55);
          return this.createPipe([cbp.clone().add(new THREE.Vector3(0, -dy * 0.3, 0)), m1, m2, target.clone()], 0xfacc15, { electric: true });
        };
        const wireY1 = wire(valve.coilTopL, k * 0.18);
        const wireY2 = valve.coilTopR ? wire(valve.coilTopR, k * 0.18 + 0.09) : null;

        this.units.push({ valve, cyl, pipeRear, pipeFront, wireY1, wireY2, index: k, dir: 0, ratio: 0 });
        this.actors[`cyl${k + 1}`] = cyl;
        this.actors[`valve${k + 1}`] = valve;
      });

      // Elementos propios de la prensa hidráulica
      if (kind === 'hydraulic_press') this.buildPressExtras(layout);

      // Texto de ayuda del botón de pulso y fases hacia la interfaz
      if (this.hud.onPhases) this.hud.onPhases(this.model.phases.map((p) => ({ name: p.name, start: p.start / this.cycleLen, end: p.end / this.cycleLen })));
      this.buildOscCache();
      this.applyXray(this.isXray);
      this.fitCamera(true);
      this.setCameraPreset(this.cameraView, true);
      this._lastPressure = null;
    }

    buildPressExtras(layout) {
      const c = layout.cyls[0];
      const steel = this.mat(0x334155, { metal: 0.85, rough: 0.3, clearcoat: 0.3 });
      [1.3, 5.7].forEach((px) => this.add(this.circuitGroup, new THREE.BoxGeometry(0.34, 5.1, 0.6), steel, { pos: [px, 2.55, 0], edge: 0x94a3b8 }));
      this.add(this.circuitGroup, new THREE.BoxGeometry(4.7, 0.5, 0.8), this.mat(COLORS.blue, { metal: 0.8, rough: 0.25, clearcoat: 0.4 }), { pos: [3.5, 5.0, 0], edge: 0x60a5fa });
      this.add(this.circuitGroup, new THREE.BoxGeometry(2.2, 0.35, 1.2), steel, { pos: [3.5, 0.175, 0], edge: 0x94a3b8 });
      const wp = this.add(this.circuitGroup, new THREE.CylinderGeometry(0.55, 0.55, 0.3, 36), this.mat(COLORS.amber, { metal: 0.5, rough: 0.3, clearcoat: 0.4 }), { pos: [3.5, 0.5, 0], edge: 0xfde68a });
      this.actors.workpiece = wp;
      this.setInfo(wp, 'PIEZA', 'Pieza a prensar', 'Se deforma cuando el vástago llega al final de la carrera de prensado.', []);
      this.pressTop = c.cy;
    }

    // ======================================================================
    // INTERACCIÓN: VISTAS, RAYOS-X, DESPIECE, ETIQUETAS, CAPTURA
    // ======================================================================
    applyXray(on) {
      this.isXray = on;
      const roots = [this.circuitGroup, this.benchGroup];
      roots.forEach((root) =>
        root.traverse((o) => {
          if (o.isMesh && o.material && !o.userData.noXray) {
            const m = o.material;
            if (!this._xrayStore.has(m)) this._xrayStore.set(m, { t: m.transparent, o: m.opacity, dw: m.depthWrite });
            const s = this._xrayStore.get(m);
            if (on) {
              m.transparent = true;
              m.opacity = Math.min(s.o, 0.2);
              m.depthWrite = false;
            } else {
              m.transparent = s.t;
              m.opacity = s.o;
              m.depthWrite = s.dw;
            }
            m.needsUpdate = true;
          } else if (o.isLineSegments && o.userData.baseOpacity !== undefined) {
            o.material.opacity = on ? 0.9 : o.userData.baseOpacity;
          }
        })
      );
    }

    setWireframe(on) {
      this.applyXray(!!on);
    }

    toggleExplodedView() {
      this.isExploded = !this.isExploded;
      return this.isExploded;
    }

    toggleAutoOrbit() {
      this.autoOrbit = !this.autoOrbit;
      return this.autoOrbit;
    }

    toggleLabels() {
      this.showLabels = !this.showLabels;
      this.labelLayer.style.display = this.showLabels ? '' : 'none';
      return this.showLabels;
    }

    setSpeed(s) {
      this.speed = s;
    }

    setCameraPreset(view, keepZoom = false) {
      this.cameraView = view || 'iso';
      if (!keepZoom) this.userZoomed = false;
      const r = this.fitRadius;
      if (view === 'front') this.targetSpherical = { theta: 0, phi: 1.4, radius: r * 0.96 };
      else if (view === 'top') this.targetSpherical = { theta: 0, phi: 0.3, radius: r * 1.02 };
      else this.targetSpherical = { theta: 0.42, phi: 1.12, radius: r };
    }

    // Encuadre automático: el panel completo siempre cabe en el visor, sea cual sea su proporción
    fitCamera(immediate = false) {
      if (!this.boardBox) return;
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      this.boardBox.getSize(size);
      this.boardBox.getCenter(center);
      const tv = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const aspect = this.camera.aspect || 1.6;
      const distW = size.x / 2 / (tv * aspect);
      const distH = size.y / 2 / tv;
      this.fitRadius = Math.max(distW, distH) * 1.06 + 2.4;
      this.targetLookAt.set(center.x, center.y - 0.35, 0);
      if (immediate) {
        this.lookAtTarget.copy(this.targetLookAt);
        this.spherical.radius = this.fitRadius;
      }
      if (!this.userZoomed) this.targetSpherical.radius = this.fitRadius * (this.cameraView === 'front' ? 0.96 : this.cameraView === 'top' ? 1.02 : 1);
    }

    updateCameraPosition(immediate = false) {
      const k = immediate ? 1 : 0.12;
      this.spherical.theta += (this.targetSpherical.theta - this.spherical.theta) * k;
      this.spherical.phi += (this.targetSpherical.phi - this.spherical.phi) * k;
      this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * k;
      this.lookAtTarget.lerp(this.targetLookAt, k);

      const r = this.spherical.radius;
      const sp = Math.sin(this.spherical.phi);
      this.camera.position.set(
        this.lookAtTarget.x + r * sp * Math.sin(this.spherical.theta),
        this.lookAtTarget.y + r * Math.cos(this.spherical.phi),
        this.lookAtTarget.z + r * sp * Math.cos(this.spherical.theta)
      );
      this.camera.lookAt(this.lookAtTarget);
    }

    captureImage() {
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL('image/png');
    }

    selectObject(obj) {
      let o = obj;
      while (o && !(o.userData && o.userData.holoInfo)) o = o.parent;
      if (!o) return this.deselect();
      this.selected = o;
      this.selBox.visible = true;
      if (this.hud.onSelect) this.hud.onSelect(o.userData.holoInfo);
    }

    deselect() {
      this.selected = null;
      if (this.selBox) this.selBox.visible = false;
      if (this.hud && this.hud.onSelect) this.hud.onSelect(null);
    }

    pick(clientX, clientY) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.circuitGroup.children, true);
      for (const h of hits) {
        let o = h.object;
        while (o && !(o.userData && o.userData.holoInfo)) o = o.parent;
        if (o && h.object.visible) return o;
      }
      return null;
    }

    // ======================================================================
    // CONTROL DE REPRODUCCIÓN
    // ======================================================================
    triggerManualPulse() {
      this.cyclePos = 0;
      this.isPlaying = true;
    }

    seekProgress(p) {
      this.cyclePos = clamp01(p) * this.cycleLen * 0.9999;
    }

    seekPhase(i) {
      const ph = this.model && this.model.phases[i];
      if (!ph) return;
      this.cyclePos = (ph.start + ph.end) / 2;
    }

    nextPhase() {
      const i = this.phaseIndex < 0 ? 0 : (this.phaseIndex + 1) % this.model.phases.length;
      this.seekPhase(i);
    }

    // ======================================================================
    // EVENTOS, REDIMENSIONADO
    // ======================================================================
    bindEvents() {
      const dom = this.renderer.domElement;

      dom.addEventListener('pointerdown', (e) => {
        this.isDragging = true;
        this.dragDistance = 0;
        this.prevMouse = { x: e.clientX, y: e.clientY };
        try {
          dom.setPointerCapture(e.pointerId);
        } catch (err) {
          /* ignorar */
        }
      });

      dom.addEventListener('pointermove', (e) => {
        if (this.isDragging) {
          const dx = e.clientX - this.prevMouse.x;
          const dy = e.clientY - this.prevMouse.y;
          this.prevMouse = { x: e.clientX, y: e.clientY };
          this.dragDistance += Math.abs(dx) + Math.abs(dy);
          this.targetSpherical.theta -= dx * 0.007;
          this.targetSpherical.phi = Math.max(0.2, Math.min(1.5, this.targetSpherical.phi - dy * 0.006));
        } else {
          const hit = this.pick(e.clientX, e.clientY);
          dom.style.cursor = hit ? 'pointer' : 'grab';
        }
      });

      dom.addEventListener('pointerup', (e) => {
        const wasClick = this.isDragging && this.dragDistance < 5;
        this.isDragging = false;
        if (wasClick) {
          const hit = this.pick(e.clientX, e.clientY);
          if (hit) this.selectObject(hit);
          else this.deselect();
        }
      });

      dom.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          this.userZoomed = true;
          const min = this.fitRadius * 0.45;
          const max = this.fitRadius * 1.5;
          this.targetSpherical.radius = Math.max(min, Math.min(max, this.targetSpherical.radius + e.deltaY * 0.01));
        },
        { passive: false }
      );

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.container);
      } else {
        window.addEventListener('resize', () => this.resize());
      }
    }

    resize() {
      if (!this.container || !this.renderer) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (!w || !h) return;
      this.viewW = w;
      this.viewH = h;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.fitCamera(false);
      this.sizeOscCanvas();
    }

    // ======================================================================
    // DIAGRAMA ESPACIO-FASE
    // ======================================================================
    sizeOscCanvas() {
      const cv = document.getElementById('holoOscilloscopeCanvas');
      if (!cv) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(160, Math.round(cv.clientWidth || 300));
      const h = Math.max(60, Math.round(cv.clientHeight || 90));
      if (cv.width !== w * dpr || cv.height !== h * dpr) {
        cv.width = w * dpr;
        cv.height = h * dpr;
      }
      this._oscDpr = dpr;
    }

    buildOscCache() {
      const N = 180;
      const curves = [];
      const colors = ['#22d3ee', '#34d399', '#fbbf24'];
      const names = this.units.map((u) => u.cyl.group.userData.holoInfo.tag.split(' ')[0]);
      for (let k = 0; k < this.units.length; k++) {
        const pts = [];
        for (let i = 0; i <= N; i++) pts.push(this.model.ratios((i / N) * this.cycleLen * 0.9999)[k]);
        curves.push({ pts, color: colors[k % colors.length], name: names[k] });
      }
      // Señal digital Y1 (avance del primer cilindro)
      const sig = [];
      for (let i = 0; i <= N; i++) {
        const c = (i / N) * this.cycleLen * 0.9999;
        const r = this.model.ratios(c)[0];
        const r2 = this.model.ratios((c + 0.03) % this.cycleLen)[0];
        sig.push(r2 - r > 0.0002 || (r > 0.5 && Math.abs(r2 - r) < 0.0002) ? 1 : 0);
      }
      this.oscCache = { curves, sig, N };
      const legend = document.getElementById('oscLegend');
      if (legend) {
        legend.innerHTML =
          curves.map((c) => `<i style="background:${c.color}"></i>${c.name}`).join('') + '<i style="background:#facc15"></i>Y1 (24V)';
      }
    }

    drawOscilloscope() {
      const cv = document.getElementById('holoOscilloscopeCanvas');
      if (!cv || !this.oscCache) return;
      this.sizeOscCanvas();
      const dpr = this._oscDpr || 1;
      const ctx = cv.getContext('2d');
      const W = cv.width / dpr;
      const H = cv.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const padL = 6;
      const padR = 6;
      const top = 6;
      const sigH = 14;
      const plotH = H - top - sigH - 10;
      const x = (u) => padL + u * (W - padL - padR);

      // Zonas de fase alternadas
      this.model.phases.forEach((p, i) => {
        const a = x(p.start / this.cycleLen);
        const b = x(p.end / this.cycleLen);
        ctx.fillStyle = i === this.phaseIndex ? 'rgba(34,211,238,0.16)' : i % 2 ? 'rgba(148,163,184,0.06)' : 'rgba(148,163,184,0.02)';
        ctx.fillRect(a, top, b - a, H - top - 2);
        ctx.fillStyle = i === this.phaseIndex ? '#67e8f9' : '#64748b';
        ctx.font = '600 8.5px "JetBrains Mono", monospace';
        ctx.fillText(p.name.split(' ')[0], a + 3, H - 3);
      });

      ctx.strokeStyle = 'rgba(148,163,184,0.2)';
      ctx.lineWidth = 1;
      [0, 0.5, 1].forEach((g) => {
        const y = top + plotH - g * plotH;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(W - padR, y);
        ctx.stroke();
      });

      const { curves, sig, N } = this.oscCache;
      curves.forEach((c) => {
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        c.pts.forEach((v, i) => {
          const px = x(i / N);
          const py = top + plotH - v * plotH;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      });

      // Señal digital
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const sy0 = H - sigH - 8;
      sig.forEach((v, i) => {
        const px = x(i / N);
        const py = sy0 + (v ? 0 : sigH - 4);
        if (i === 0) ctx.moveTo(px, py);
        else {
          const prev = sy0 + (sig[i - 1] ? 0 : sigH - 4);
          ctx.lineTo(px, prev);
          ctx.lineTo(px, py);
        }
      });
      ctx.stroke();

      // Cursor de reproducción
      const cx = x(this.cyclePos / this.cycleLen);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx, top - 2);
      ctx.lineTo(cx, H - 2);
      ctx.stroke();
      curves.forEach((c, k) => {
        const v = this.units[k] ? this.units[k].ratio : 0;
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(cx, top + plotH - v * plotH, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // ======================================================================
    // SIMULACIÓN
    // ======================================================================
    updateCylinderVisuals(cyl, ratio) {
      const xPos = cyl.minX + (cyl.maxX - cyl.minX) * ratio;
      cyl.piston.position.x = xPos;

      const e = this.explodeFactor;
      cyl.rearCap.position.x = -cyl.length / 2 - 0.2 - e * 0.7;
      cyl.frontCap.position.x = cyl.length / 2 + 0.2 + e * 0.7;
      cyl.nose.position.x = cyl.length / 2 + 0.5 + e * 1.0;
      cyl.tieRods.position.y = e * 0.5;
      cyl.sensor1.position.y = cyl.baseY.sensor - cyl.side * e * 0.6;
      cyl.sensor2.position.y = cyl.baseY.sensor - cyl.side * e * 0.6;

      const left = -cyl.length / 2 + 0.01;
      const right = cyl.length / 2 - 0.01;
      const rearLen = Math.max(0.06, xPos - 0.21 - left);
      cyl.chRear.scale.x = rearLen;
      cyl.chRear.position.x = left + rearLen / 2;
      cyl.chRearMat.opacity = 0.2 + ratio * 0.45;
      const frontLen = Math.max(0.06, right - (xPos + 0.21));
      cyl.chFront.scale.x = frontLen;
      cyl.chFront.position.x = right - frontLen / 2;
      cyl.chFrontMat.opacity = 0.12 + (1 - ratio) * 0.36;

      cyl.s1.color.setHex(ratio < 0.12 ? COLORS.green : COLORS.off);
      cyl.s2.color.setHex(ratio > 0.88 ? COLORS.yellow : COLORS.off);

      if (cyl.spring) {
        const startX = xPos + 0.28;
        const lenS = Math.max(0.3, right - 0.1 - startX);
        cyl.spring.position.x = startX;
        cyl.spring.scale.x = lenS / cyl.length;
      }
    }

    updateSimulation(dt) {
      this.explodeFactor += ((this.isExploded ? 1 : 0) - this.explodeFactor) * 0.12;
      if (this.autoOrbit && !this.isDragging) this.targetSpherical.theta += dt * 0.3;

      const pressureFactor = Math.max(0.5, Math.min(2.2, this.pressureBar / 6));
      if (this.isPlaying) this.cyclePos = (this.cyclePos + dt * 0.5 * pressureFactor * this.speed) % this.cycleLen;

      if (this.holoRing) this.holoRing.rotation.y += dt * 0.2;
      if (this.holoRing2) this.holoRing2.rotation.y -= dt * 0.35;

      if (this._lastPressure !== this.pressureBar) {
        this._lastPressure = this.pressureBar;
        const f = this.actors.frl;
        if (f) {
          if (f.label && f.label.valueEl) f.label.valueEl.textContent = `${this.pressureBar.toFixed(1)} bar`;
          const info = f.group.userData.holoInfo;
          if (info) info.specs[0][1] = `${this.pressureBar.toFixed(1)} bar`;
        }
      }
      const frl = this.actors.frl;
      if (frl) {
        frl.needle.rotation.z = 1.1 - Math.min(1, this.pressureBar / 12) * 2.2;
        frl.bowl.position.y = -0.74 - this.explodeFactor * 0.5;
        frl.knob.position.y = 0.68 + this.explodeFactor * 0.4;
      }

      const c = this.cyclePos;
      const ratios = this.model.ratios(c);
      const next = this.model.ratios((c + 0.04) % this.cycleLen);
      let anyAdv = false;
      let anyRet = false;

      this.units.forEach((u) => {
        const r = ratios[u.index];
        const slope = next[u.index] - r;
        const dir = slope > 0.0004 ? 1 : slope < -0.0004 ? -1 : 0;
        u.ratio = r;
        u.dir = dir;
        this.updateCylinderVisuals(u.cyl, r);

        const y1 = dir > 0 || (dir === 0 && r > 0.5);
        const y2 = dir < 0;
        anyAdv = anyAdv || y1;
        anyRet = anyRet || y2;

        u.valve.left.led.color.setHex(y1 ? COLORS.green : COLORS.off);
        if (u.valve.right) u.valve.right.led.color.setHex(y2 ? COLORS.yellow : COLORS.off);
        u.valve.left.group.position.x = u.valve.left.baseX - this.explodeFactor * 0.5;
        if (u.valve.right) u.valve.right.group.position.x = u.valve.right.baseX + this.explodeFactor * 0.5;

        const target = y1 ? 0.24 : -0.24;
        u.valve.spool.position.x += (target - u.valve.spool.position.x) * 0.22;

        this.setPipeActive(u.pipeRear, y1);
        if (u.pipeFront) this.setPipeActive(u.pipeFront, !y1);
        this.setPipeActive(u.wireY1, y1);
        if (u.wireY2) this.setPipeActive(u.wireY2, y2);
      });

      const ctrl = this.actors.ctrl;
      if (ctrl) {
        ctrl.k1.color.setHex(anyAdv ? COLORS.green : COLORS.off);
        ctrl.k2.color.setHex(anyRet ? 0x38bdf8 : COLORS.off);
        if (ctrl.hand) ctrl.hand.rotation.z = -(c / this.cycleLen) * Math.PI * 2;
      }

      // Prensa: la pieza se deforma al final de la carrera
      if (this.actors.workpiece && this.units[0]) {
        const cyl = this.units[0].cyl;
        const tipBottom = this.pressTop - (cyl.piston.position.x + cyl.rodLen + 0.51);
        const s = Math.max(0.55, Math.min(1, (tipBottom - 0.35) / 0.3));
        this.actors.workpiece.scale.set(1 + (1 - s) * 0.35, s, 1 + (1 - s) * 0.35);
        this.actors.workpiece.position.y = 0.35 + 0.15 * s;
      }

      // Partículas de flujo
      const flow = dt * pressureFactor * this.speed * (this.isPlaying ? 1 : 0.12);
      this.pipes.forEach((p) => {
        if (!p.curve || !p.particles.length) return;
        p.particles.forEach((q) => {
          q.offset = (q.offset + flow * p.speed) % 1;
          p.curve.getPointAt(q.offset, this.tmpV);
          q.mesh.position.copy(this.tmpV);
        });
      });
      this.setPipeActive(this.actors.manifold, true);

      // Fase activa
      let pi = this.model.phases.findIndex((p) => c >= p.start && c < p.end);
      if (pi < 0) pi = this.model.phases.length - 1;
      this.phaseIndex = pi;
      this.activePhase = this.model.phases[pi];

      // Etiquetas y selección
      this.updateLabels();
      if (this.selected) this.selBox.box.setFromObject(this.selected);

      const t = performance.now();
      if (t - this._lastHud > 66) {
        this._lastHud = t;
        const pct = this.units.map((u, i) => `${u.cyl.group.userData.holoInfo.tag.split(' ')[0]}: ${Math.round(u.ratio * 100)}%`).join('  ·  ');
        if (this.hud.onTelemetry) {
          this.hud.onTelemetry({
            phase: `Fase ${pi + 1}/${this.model.phases.length} · ${this.activePhase.name}`,
            actuator: pct,
            valve: this.activePhase.text
          });
        }
        if (this.hud.onProgress) this.hud.onProgress({ progress: c / this.cycleLen, phaseIndex: pi });
        this.drawOscilloscope();
      }
    }

    updateLabels() {
      if (!this.showLabels || !this.viewW) return;
      const v = this.tmpV;
      this.labels.forEach((l) => {
        l.obj.getWorldPosition(v);
        v.add(l.offset);
        v.project(this.camera);
        const px = (v.x * 0.5 + 0.5) * this.viewW;
        const py = (-v.y * 0.5 + 0.5) * this.viewH;
        l.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
        l.el.style.opacity = v.z < 1 ? '1' : '0';
        l.el.classList.toggle('selected', this.selected === l.obj);
      });
    }

    animate() {
      requestAnimationFrame(() => this.animate());
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.updateCameraPosition(false);
      this.updateSimulation(dt);
      this.renderer.render(this.scene, this.camera);
    }
  }

  window.IUBHologramEngine = IUBHologramEngine;
})();
