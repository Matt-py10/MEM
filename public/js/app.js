/**
 * CONTROLADOR PRINCIPAL DEL PORTAL DE ELECTRONEUMÁTICA Y ELECTROHIDRÁULICA (DISEÑO IUB)
 * Vista Pública de Estudiante / Blog Consumidor (Sin Login)
 * Sincronizado con Motor Holográfico 3D (Three.js), Módulo YouTube en Modo Cine, Créditos y Circuitos FluidSIM
 */

(function () {
  let portalData = null;
  let holoEngine = null;
  let activePracticeIndex = 0;
  let activeYoutubeIndex = 0;
  let activeYoutubeFilter = 'ALL';
  let activeDiagramIndex = 0;
  let activeRepoFolder = '';
  let repoSearchQuery = '';
  let selectedCategory = 'ALL';
  let searchQuery = '';

  const DEFAULT_DEVELOPERS = [
    'Mattius Holguín Blanco — Desarrollador de la Plataforma & Estudiante de Ingeniería Mecatrónica (Unibarranquilla - IUB)'
  ];

  const ORIGINAL_DIAGRAMS = [
    {
      src: '/img/schematics/circuito_01_mando_directo.png',
      badge: 'CIRCUITO Nº 1 • MANDO DIRECTO',
      title: 'Circuito Nº 1: Accionamiento Directo por Impulso Permanente',
      desc: 'Comparativa oficial entre circuito electroneumático (válvula 5/2 monoestable con FRL), circuito electrohidráulico (válvula 4/2 con bomba P/T) y su esquema eléctrico 24V DC (pulsador S1 → solenoide Y1).'
    },
    {
      src: '/img/schematics/C1.png',
      badge: 'POTENCIA NEUMÁTICA • 5/2 MONOESTABLE',
      title: 'Etapa de Potencia: Cilindro Doble Efecto + Reguladores 40% + Válvula 5/2',
      desc: 'Diagrama neumático DIN ISO 1219 con unidad FRL en vía 1, silenciadores en escapes 3 y 5, electroválvula 5/2 monoestable accionada por Y1, estranguladores unidireccionales al 40% y cilindro de doble efecto.'
    },
    {
      src: '/img/schematics/C1A.png',
      badge: 'MANDO ELÉCTRICO • AUTORRETENCIÓN',
      title: 'Esquema Eléctrico 24V DC con Enclavamiento (Autorretención K1)',
      desc: 'Circuito de mando con pulsador de paro S2 (31-32 NC), marcha S1 (13-14 NA), contacto de retención K1 (11-14) en paralelo y activación de la bobina solenoide Y1.'
    },
    {
      src: '/img/schematics/1_SENSORES.png',
      badge: 'SENSORES MAGNÉTICOS PNP + TEMPORIZADOR',
      title: 'Circuito con Sensores de Proximidad A0/A1 (KA0, KA1) y Temporizador TEMP1',
      desc: 'Conexionado completo de sensores magnéticos a 3 hilos (+24V rojo, 0V azul, salida negra hacia relés KA0 y KA1), lógica de enclavamiento y temporizador On-Delay de 5 s.'
    },
    {
      src: '/img/schematics/1_PRACTICA_2_CIL.png',
      badge: 'BANCO FESTO • SECUENCIA 2 CILINDROS',
      title: 'Mando Eléctrico Secuencia A+ B+ A- B- en Banco FESTO',
      desc: 'Diagrama eléctrico paso a paso con relés auxiliares K1, K2 y K3, finales de carrera A0, A1, B0, B1 y accionamiento secuencial de electroválvulas Y1, Y3 e Y2.'
    },
    {
      src: '/img/schematics/dobladora_electrohidraulica.png',
      badge: 'CASO APLICADO • 3 CILINDROS',
      title: 'Ejemplo Resuelto: Dispositivo para Doblar Electrohidráulico (A, B, C)',
      desc: 'Croquis de situación con cilindro de sujeción A y cilindros de doblado B y C, acompañado del diagrama espacio-fase y el esquema de potencia con tres electroválvulas 4/3.'
    },
    {
      src: '/img/schematics/electrohidraulico_4_3.png',
      badge: 'ELECTROHIDRÁULICA • VÁLVULA 4/3',
      title: 'Circuito Electrohidráulico Completo (Mando K1–K4 y Válvula 4/3 Centro Cerrado)',
      desc: 'Esquema completo con grupo hidráulico P/T, válvula distribuidora 4/3 centrada por resortes (Y1/Y2), reguladores al 65%, cilindro con carrera 0–200 mm y control por relés K1–K4.'
    }
  ];

  // ==========================================================================
  // 1. GENERADOR DE DIAGRAMAS ESQUEMÁTICOS Y SÍMBOLOS VECTORIALES DIN ISO 1219
  // ==========================================================================
  function getIsoSymbolSvg(symbolType) {
    switch (symbolType) {
      case 'frl':
        return `<svg viewBox="0 0 110 70" width="84" height="62" fill="none" stroke="#102A5B" stroke-width="2">
          <rect x="20" y="12" width="70" height="46" rx="3" fill="#EFF6FF"/>
          <line x1="5" y1="35" x2="20" y2="35"/><line x1="90" y1="35" x2="105" y2="35"/>
          <polygon points="36,16 48,35 36,54 24,35" fill="#FFFFFF"/>
          <line x1="36" y1="16" x2="36" y2="54" stroke-dasharray="3,2"/>
          <circle cx="64" cy="26" r="8" fill="#FFFFFF"/><path d="M60 30 L68 22" stroke="#0045A3"/>
          <line x1="78" y1="16" x2="78" y2="32"/>
        </svg>`;
      case 'valve32':
        return `<svg viewBox="0 0 120 70" width="84" height="62" fill="none" stroke="#102A5B" stroke-width="2">
          <rect x="24" y="16" width="36" height="36" fill="#FFFFFF"/>
          <rect x="60" y="16" width="36" height="36" fill="#EFF6FF"/>
          <line x1="42" y1="52" x2="42" y2="20"/><polygon points="42,17 38,24 46,24" fill="#102A5B"/>
          <line x1="78" y1="16" x2="68" y2="52"/><line x1="78" y1="44" x2="78" y2="52"/><line x1="74" y1="44" x2="82" y2="44"/>
          <polyline points="10,28 18,34 10,40 18,46" stroke="#0045A3"/>
          <text x="75" y="13" font-size="9" fill="#102A5B" stroke="none" font-weight="bold">2</text>
          <text x="75" y="64" font-size="9" fill="#102A5B" stroke="none" font-weight="bold">1</text>
          <text x="62" y="64" font-size="9" fill="#102A5B" stroke="none" font-weight="bold">3</text>
        </svg>`;
      case 'valve52':
        return `<svg viewBox="0 0 130 70" width="86" height="62" fill="none" stroke="#102A5B" stroke-width="2">
          <rect x="25" y="16" width="40" height="36" fill="#EFF6FF"/>
          <rect x="65" y="16" width="40" height="36" fill="#FFFFFF"/>
          <line x1="45" y1="52" x2="35" y2="18"/><line x1="55" y1="16" x2="55" y2="52"/>
          <line x1="85" y1="52" x2="95" y2="18"/><line x1="75" y1="16" x2="75" y2="52"/>
          <polygon points="25,30 15,24 15,36" fill="#0045A3" stroke="none"/>
          <polygon points="105,30 115,24 115,36" fill="#0045A3" stroke="none"/>
          <text x="32" y="12" font-size="8.5" fill="#102A5B" stroke="none" font-weight="bold">4</text>
          <text x="52" y="12" font-size="8.5" fill="#102A5B" stroke="none" font-weight="bold">2</text>
          <text x="42" y="64" font-size="8.5" fill="#102A5B" stroke="none" font-weight="bold">5 1 3</text>
        </svg>`;
      case 'valve43':
        return `<svg viewBox="0 0 140 70" width="88" height="62" fill="none" stroke="#102A5B" stroke-width="1.8">
          <rect x="16" y="16" width="36" height="36" fill="#FFFFFF"/>
          <rect x="52" y="16" width="36" height="36" fill="#FEF3C7"/>
          <rect x="88" y="16" width="36" height="36" fill="#FFFFFF"/>
          <line x1="26" y1="52" x2="26" y2="16"/><line x1="42" y1="16" x2="42" y2="52"/>
          <line x1="62" y1="44" x2="62" y2="52"/><line x1="58" y1="44" x2="66" y2="44"/>
          <line x1="78" y1="44" x2="78" y2="52"/><line x1="74" y1="44" x2="82" y2="44"/>
          <line x1="98" y1="52" x2="114" y2="16"/><line x1="114" y1="52" x2="98" y2="16"/>
        </svg>`;
      case 'throttle':
        return `<svg viewBox="0 0 110 70" width="84" height="62" fill="none" stroke="#102A5B" stroke-width="2">
          <rect x="22" y="10" width="66" height="50" rx="4" stroke-dasharray="4,2" fill="#F8FAFC"/>
          <line x1="8" y1="26" x2="102" y2="26"/>
          <path d="M40 20 Q55 26 70 20 M40 32 Q55 26 70 32"/>
          <line x1="46" y1="36" x2="64" y2="14" stroke="#0045A3"/><polygon points="66,12 59,15 64,19" fill="#0045A3" stroke="none"/>
          <path d="M34 26 L34 46 L76 46 L76 26"/>
          <circle cx="55" cy="46" r="5" fill="#FFFFFF"/><polyline points="48,40 55,46 48,52"/>
        </svg>`;
      default:
        return `<svg viewBox="0 0 130 70" width="86" height="62" fill="none" stroke="#102A5B" stroke-width="2">
          <rect x="18" y="16" width="68" height="38" fill="#EFF6FF"/>
          <line x1="46" y1="16" x2="46" y2="54" stroke-width="3"/>
          <rect x="43" y="20" width="6" height="30" fill="#0045A3" stroke="none"/>
          <line x1="49" y1="35" x2="116" y2="35" stroke-width="4"/>
          <line x1="26" y1="54" x2="26" y2="65"/><line x1="78" y1="54" x2="78" y2="65"/>
        </svg>`;
    }
  }

  function getPracticeSchematicSvg(practice) {
    const text = `${practice.id || ''} ${practice.title || ''} ${practice.motionEquation || ''} ${practice.category || ''}`.toUpperCase();
    const isHyd = text.includes('HIDR') || practice.hologramPreset === 'hydraulic_press' || text.includes('4/3');
    const isThreeCyl = practice.hologramPreset === 'plc_station' || practice.hologramPreset === 'three_cylinders' || text.includes('3 CILINDRO') || practice.id === 'CASO-00' || text.includes('FIFO');
    const isSeq = practice.hologramPreset === 'sequence_ab' || text.includes('DOS CILINDROS') || text.includes('2 CILINDROS') || text.includes('A+B+') || text.includes('B+');
    const isSimple = practice.hologramPreset === 'single_cylinder' || text.includes('SIMPLE EFECTO') || text.includes('3/2');
    const strokeMain = isHyd ? '#B45309' : '#002855';
    const pressureColor = isHyd ? '#F59E0B' : '#0284C7';
    const chamberFill = isHyd ? 'rgba(245, 158, 11, 0.35)' : 'rgba(14, 165, 233, 0.32)';
    const fillSoft = isHyd ? '#FEF3C7' : '#EFF6FF';

    if (isThreeCyl) {
      return `<svg viewBox="0 0 380 108" width="100%" height="96" fill="none" stroke="${strokeMain}" stroke-width="1.6" class="animated-fluidsim-svg">
        <rect x="14" y="14" width="84" height="26" fill="${fillSoft}" rx="3"/>
        <rect x="15" y="15" width="10" height="24" fill="${chamberFill}" stroke="none">
          <animate attributeName="width" values="10;60;60;10;10" keyTimes="0;0.2;0.7;0.85;1" dur="4.8s" repeatCount="indefinite"/>
        </rect>
        <g>
          <animateTransform attributeName="transform" type="translate" values="0,0; 50,0; 50,0; 0,0; 0,0" keyTimes="0;0.2;0.7;0.85;1" dur="4.8s" repeatCount="indefinite"/>
          <rect x="23" y="15" width="6" height="24" fill="#0045A3" stroke="none" rx="1"/>
          <line x1="29" y1="27" x2="104" y2="27" stroke="#334155" stroke-width="3.6"/>
        </g>
        <text x="19" y="30" font-size="8.8" fill="${strokeMain}" stroke="none" font-weight="800">1A1 (A)</text>

        <rect x="142" y="14" width="84" height="26" fill="${fillSoft}" rx="3"/>
        <rect x="143" y="15" width="10" height="24" fill="${chamberFill}" stroke="none">
          <animate attributeName="width" values="10;10;60;60;10" keyTimes="0;0.2;0.4;0.85;1" dur="4.8s" repeatCount="indefinite"/>
        </rect>
        <g>
          <animateTransform attributeName="transform" type="translate" values="0,0; 0,0; 50,0; 50,0; 0,0" keyTimes="0;0.2;0.4;0.85;1" dur="4.8s" repeatCount="indefinite"/>
          <rect x="151" y="15" width="6" height="24" fill="#0D9488" stroke="none" rx="1"/>
          <line x1="157" y1="27" x2="232" y2="27" stroke="#334155" stroke-width="3.6"/>
        </g>
        <text x="147" y="30" font-size="8.8" fill="${strokeMain}" stroke="none" font-weight="800">2A1 (B)</text>

        <rect x="270" y="14" width="84" height="26" fill="${fillSoft}" rx="3"/>
        <rect x="271" y="15" width="10" height="24" fill="${chamberFill}" stroke="none">
          <animate attributeName="width" values="10;10;60;10;10" keyTimes="0;0.4;0.6;0.8;1" dur="4.8s" repeatCount="indefinite"/>
        </rect>
        <g>
          <animateTransform attributeName="transform" type="translate" values="0,0; 0,0; 50,0; 0,0; 0,0" keyTimes="0;0.4;0.6;0.8;1" dur="4.8s" repeatCount="indefinite"/>
          <rect x="279" y="15" width="6" height="24" fill="#D97706" stroke="none" rx="1"/>
          <line x1="285" y1="27" x2="360" y2="27" stroke="#334155" stroke-width="3.6"/>
        </g>
        <text x="275" y="30" font-size="8.8" fill="${strokeMain}" stroke="none" font-weight="800">3A1 (C)</text>

        <line x1="36" y1="40" x2="36" y2="64" stroke="${pressureColor}" stroke-width="2" stroke-dasharray="4,3" class="svg-flow-line"/>
        <line x1="164" y1="40" x2="164" y2="64" stroke="#10B981" stroke-width="2" stroke-dasharray="4,3" class="svg-flow-line"/>
        <line x1="292" y1="40" x2="292" y2="64" stroke="#F59E0B" stroke-width="2" stroke-dasharray="4,3" class="svg-flow-line"/>

        <rect x="18" y="64" width="76" height="26" fill="#FFFFFF" rx="3"/><line x1="56" y1="64" x2="56" y2="90"/>
        <text x="24" y="80" font-size="8.2" fill="#0045A3" stroke="none" font-weight="800">Y1 | ${isHyd ? '4/3' : '5/2'} | Y2</text>

        <rect x="146" y="64" width="76" height="26" fill="#FFFFFF" rx="3"/><line x1="184" y1="64" x2="184" y2="90"/>
        <text x="152" y="80" font-size="8.2" fill="#0D9488" stroke="none" font-weight="800">Y3 | ${isHyd ? '4/3' : '5/2'} | Y4</text>

        <rect x="274" y="64" width="76" height="26" fill="#FFFFFF" rx="3"/><line x1="312" y1="64" x2="312" y2="90"/>
        <text x="280" y="80" font-size="8.2" fill="#B45309" stroke="none" font-weight="800">Y5 | ${isHyd ? '4/3' : '5/2'} | Y6</text>
      </svg>`;
    }

    if (isSeq) {
      return `<svg viewBox="0 0 380 108" width="100%" height="96" fill="none" stroke="${strokeMain}" stroke-width="1.7" class="animated-fluidsim-svg">
        <!-- Sensores Cilindro A -->
        <circle cx="32" cy="10" r="3.5" fill="#10B981" stroke="none">
          <animate attributeName="opacity" values="1;0.25;0.25;1" dur="4s" repeatCount="indefinite"/>
        </circle>
        <text x="24" y="7" font-size="7.5" fill="#0F172A" stroke="none" font-weight="bold">1B1</text>
        <circle cx="104" cy="10" r="3.5" fill="#F59E0B" stroke="none">
          <animate attributeName="opacity" values="0.2;1;0.2;0.2" dur="4s" repeatCount="indefinite"/>
        </circle>
        <text x="96" y="7" font-size="7.5" fill="#0F172A" stroke="none" font-weight="bold">1B2</text>

        <!-- Cilindro 1A1 (A) con cámara presurizada y vástago animado -->
        <rect x="20" y="14" width="92" height="28" fill="${fillSoft}" rx="3"/>
        <rect x="21" y="15" width="12" height="26" fill="${chamberFill}" stroke="none">
          <animate attributeName="width" values="12;68;68;12;12" keyTimes="0;0.25;0.5;0.75;1" dur="4s" repeatCount="indefinite"/>
        </rect>
        <g>
          <animateTransform attributeName="transform" type="translate" values="0,0; 56,0; 56,0; 0,0; 0,0" keyTimes="0;0.25;0.5;0.75;1" dur="4s" repeatCount="indefinite"/>
          <rect x="30" y="15" width="7" height="26" fill="#0045A3" stroke="none" rx="1"/>
          <line x1="37" y1="28" x2="118" y2="28" stroke="#334155" stroke-width="4"/>
          <rect x="116" y="22" width="6" height="12" fill="#F59E0B" stroke="none" rx="1"/>
        </g>
        <text x="25" y="31" font-size="9.5" fill="${strokeMain}" stroke="none" font-weight="800">1A1 (A+)</text>

        <!-- Sensores Cilindro B -->
        <circle cx="212" cy="10" r="3.5" fill="#10B981" stroke="none">
          <animate attributeName="opacity" values="1;1;0.25;1" dur="4s" repeatCount="indefinite"/>
        </circle>
        <text x="204" y="7" font-size="7.5" fill="#0F172A" stroke="none" font-weight="bold">2B1</text>
        <circle cx="284" cy="10" r="3.5" fill="#F59E0B" stroke="none">
          <animate attributeName="opacity" values="0.2;0.2;1;0.2" dur="4s" repeatCount="indefinite"/>
        </circle>
        <text x="276" y="7" font-size="7.5" fill="#0F172A" stroke="none" font-weight="bold">2B2</text>

        <!-- Cilindro 2A1 (B) con cámara presurizada y vástago animado -->
        <rect x="200" y="14" width="92" height="28" fill="${fillSoft}" rx="3"/>
        <rect x="201" y="15" width="12" height="26" fill="${chamberFill}" stroke="none">
          <animate attributeName="width" values="12;12;68;68;12" keyTimes="0;0.25;0.5;0.75;1" dur="4s" repeatCount="indefinite"/>
        </rect>
        <g>
          <animateTransform attributeName="transform" type="translate" values="0,0; 0,0; 56,0; 56,0; 0,0" keyTimes="0;0.25;0.5;0.75;1" dur="4s" repeatCount="indefinite"/>
          <rect x="210" y="15" width="7" height="26" fill="#0D9488" stroke="none" rx="1"/>
          <line x1="217" y1="28" x2="298" y2="28" stroke="#334155" stroke-width="4"/>
          <rect x="296" y="22" width="6" height="12" fill="#10B981" stroke="none" rx="1"/>
        </g>
        <text x="205" y="31" font-size="9.5" fill="${strokeMain}" stroke="none" font-weight="800">2A1 (B+)</text>

        <!-- Tuberías animadas con flujo de aire/aceite -->
        <line x1="38" y1="42" x2="38" y2="64" stroke="${pressureColor}" stroke-width="2.2" stroke-dasharray="4,3" class="svg-flow-line"/>
        <line x1="92" y1="42" x2="92" y2="64" stroke="#64748B" stroke-dasharray="3,3"/>
        <line x1="218" y1="42" x2="218" y2="64" stroke="#10B981" stroke-width="2.2" stroke-dasharray="4,3" class="svg-flow-line"/>
        <line x1="272" y1="42" x2="272" y2="64" stroke="#64748B" stroke-dasharray="3,3"/>

        <!-- Electroválvulas 5/2 Biestables -->
        <rect x="24" y="64" width="82" height="28" fill="#FFFFFF" rx="3"/>
        <line x1="65" y1="64" x2="65" y2="92"/>
        <rect x="14" y="70" width="10" height="16" fill="#10B981" stroke="none" rx="1.5">
          <animate attributeName="fill" values="#10B981;#0284C7;#EF4444;#10B981" dur="4s" repeatCount="indefinite"/>
        </rect>
        <text x="31" y="82" font-size="9" fill="#0045A3" stroke="none" font-weight="800">Y1 | 5/2 | Y2</text>

        <rect x="204" y="64" width="82" height="28" fill="#FFFFFF" rx="3"/>
        <line x1="245" y1="64" x2="245" y2="92"/>
        <rect x="194" y="70" width="10" height="16" fill="#F59E0B" stroke="none" rx="1.5">
          <animate attributeName="fill" values="#64748B;#10B981;#F59E0B;#64748B" dur="4s" repeatCount="indefinite"/>
        </rect>
        <text x="211" y="82" font-size="9" fill="#0D9488" stroke="none" font-weight="800">Y3 | 5/2 | Y4</text>
      </svg>`;
    }

    return `<svg viewBox="0 0 380 108" width="100%" height="96" fill="none" stroke="${strokeMain}" stroke-width="1.7" class="animated-fluidsim-svg">
      <!-- ETAPA DE POTENCIA FLUIDSIM (IZQUIERDA) -->
      <rect x="10" y="60" width="52" height="32" fill="${fillSoft}" rx="3"/>
      <text x="14" y="79" font-size="8.4" fill="${strokeMain}" stroke="none" font-weight="800">${isHyd ? '0P1' : '0Z1'} (${practice.pressureBar}b)</text>
      <line x1="62" y1="76" x2="98" y2="76" stroke="${pressureColor}" stroke-width="2.4" stroke-dasharray="5,3" class="svg-flow-line"/>

      <!-- Electroválvula 1V1 con bobina Y1 animada -->
      <rect x="98" y="60" width="74" height="32" fill="#FFFFFF" rx="3"/>
      <line x1="135" y1="60" x2="135" y2="92"/>
      <rect x="87" y="66" width="11" height="20" fill="#10B981" stroke="none" rx="2">
        <animate attributeName="fill" values="#10B981;#10B981;#334155;#10B981" keyTimes="0;0.5;0.8;1" dur="3.2s" repeatCount="indefinite"/>
      </rect>
      <text x="104" y="79" font-size="8.6" fill="#0045A3" stroke="none" font-weight="800">1V1 (${isHyd ? '4/3 EH' : isSimple ? '3/2 NC' : '5/2 Y1'})</text>

      <!-- Tuberías hacia el cilindro con partículas de presión animadas -->
      <path d="M116 60 L116 28 L156 28" stroke="${pressureColor}" stroke-width="2.3" stroke-dasharray="5,3" class="svg-flow-line"/>
      ${isSimple ? '' : '<path d="M152 60 L152 44 L244 44 L244 38" stroke="#0D9488" stroke-width="1.6" stroke-dasharray="3,3"/>'}

      <!-- Sensores magnéticos B1 y B2 con destello sincronizado -->
      <circle cx="168" cy="8" r="3.5" fill="#10B981" stroke="none">
        <animate attributeName="opacity" values="1;0.2;0.2;1" keyTimes="0;0.3;0.75;1" dur="3.2s" repeatCount="indefinite"/>
      </circle>
      <text x="160" y="6" font-size="7" fill="#0F172A" stroke="none" font-weight="bold">B1</text>
      <circle cx="236" cy="8" r="3.5" fill="#F59E0B" stroke="none">
        <animate attributeName="opacity" values="0.2;1;0.2;0.2" keyTimes="0;0.45;0.8;1" dur="3.2s" repeatCount="indefinite"/>
      </circle>
      <text x="228" y="6" font-size="7" fill="#0F172A" stroke="none" font-weight="bold">B2</text>

      <!-- Cilindro 1A1 con cámara presurizada dinámica y vástago móvil -->
      <rect x="156" y="12" width="92" height="28" fill="${fillSoft}" rx="3"/>
      ${isSimple ? '<polyline points="196,17 204,35 212,17 220,35 228,17 236,35 244,17" stroke="#94A3B8" stroke-width="1.4" fill="none"/>' : ''}
      <rect x="157" y="13" width="12" height="26" fill="${chamberFill}" stroke="none">
        <animate attributeName="width" values="12;70;12" keyTimes="0;0.5;1" dur="3.2s" repeatCount="indefinite"/>
      </rect>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0,0; 58,0; 0,0" keyTimes="0;0.5;1" dur="3.2s" repeatCount="indefinite"/>
        <rect x="165" y="13" width="7" height="26" fill="${strokeMain}" stroke="none" rx="1"/>
        <line x1="172" y1="26" x2="254" y2="26" stroke="#334155" stroke-width="4.2"/>
        <rect x="252" y="20" width="7" height="12" fill="#F59E0B" stroke="none" rx="1.5"/>
      </g>
      <text x="162" y="29" font-size="9.5" fill="${strokeMain}" stroke="none" font-weight="800">1A1</text>

      <!-- ETAPA DE MANDO ELÉCTRICO 24V DC (DERECHA) -->
      <line x1="318" y1="12" x2="372" y2="12" stroke="#EF4444" stroke-width="2"/>
      <text x="320" y="9" font-size="7.5" fill="#EF4444" stroke="none" font-weight="800">+24V</text>
      <line x1="345" y1="12" x2="345" y2="94" stroke="#EAB308" stroke-width="1.8" stroke-dasharray="4,2" class="svg-flow-line"/>
      <rect x="333" y="34" width="24" height="16" fill="#FEF9C3" stroke="#CA8A04" rx="2"/>
      <text x="338" y="45" font-size="8" fill="#854D0E" stroke="none" font-weight="800">K1</text>
      <rect x="333" y="64" width="24" height="18" fill="#DCFCE7" stroke="#16A34A" rx="2">
        <animate attributeName="fill" values="#DCFCE7;#86EFAC;#F1F5F9;#DCFCE7" dur="3.2s" repeatCount="indefinite"/>
      </rect>
      <text x="339" y="76" font-size="8" fill="#166534" stroke="none" font-weight="800">Y1</text>
      <line x1="318" y1="94" x2="372" y2="94" stroke="#2563EB" stroke-width="2"/>
      <text x="324" y="103" font-size="7.5" fill="#2563EB" stroke="none" font-weight="800">0V</text>
    </svg>`;
  }

  // ==========================================================================
  // 2. CARGA DE DATOS DESDE EL PROYECTO (/api/data) Y PERSISTENCIA
  // ==========================================================================
  async function loadPortalData() {
    try {
      const res = await fetch('/api/data', { cache: 'no-store' });
      if (!res.ok) throw new Error('Error HTTP ' + res.status);
      portalData = await res.json();
      localStorage.setItem('iub_portal_backup_cache', JSON.stringify(portalData));
    } catch (err) {
      console.warn('Cargando desde caché local:', err.message);
      const cached = localStorage.getItem('iub_portal_backup_cache');
      if (cached) {
        portalData = JSON.parse(cached);
      }
    }
    if (portalData) {
      renderAll();
    }
  }

  function showToast(msg) {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 3600);
  }

  // ==========================================================================
  // 3. RENDERIZADO DE TODA LA INTERFAZ (CIRCUITOS + CRÉDITOS + MÓDULO YOUTUBE)
  // ==========================================================================
  function renderAll() {
    if (!portalData) return;
    const inst = portalData.institution || {};
    const practices = portalData.practices || [];
    const videos = portalData.youtubeVideos || [];

    // Textos de cabecera y hero
    setText('headerUniName', inst.name);
    setText('headerFacultyName', `${inst.faculty} • ${inst.department}`);
    setText('institutionAnnouncement', inst.announcement);
    setText('heroBadge', inst.heroBadge);
    setText('heroTitle', inst.heroTitle);
    setText('heroDescription', inst.heroDescription);
    setText('footerUniName', `${inst.name} (${inst.shortName || 'IUB'})`);
    setText('footerFormerName', inst.formerName);
    setText('footerContactInfo', `✉️ Autoría: ${inst.deanEmail} | 📞 ${inst.contactPhone}`);

    // Contadores de estadísticas
    setText('statPracticesCount', practices.length);
    setText('statPdfsCount', practices.length);
    setText('statZipsCount', practices.length);
    setText('statVideosCount', videos.length);

    // Créditos del equipo desarrollador y autor
    renderDevelopersCredits();

    // Selector de circuitos en el Hero
    renderHeroPresetSelector();

    // Estructura temática y descargas base de FluidSIM
    renderPropaedeuticCycles();

    // Catálogo de Circuitos y Casos Prácticos FluidSIM
    renderPracticesCatalog();

    // Módulo Interactivo de Videos de YouTube y Modal Modo Cine
    renderYoutubeModule();

    // Prontuario de Componentes Electroneumáticos e Hidráulicos
    renderIsoCatalog();

    // Inventario Maestro de Datos en Carpetas (PDFs locales, ZIPs FluidSIM y respaldos Cloud)
    renderInventoryTable();
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined) el.textContent = val;
  }

  // ==========================================================================
  // 3.1 CRÉDITOS DE LOS CREADORES DE LA PÁGINA WEB Y DEL AUTOR DEL BLOG
  // ==========================================================================
  function getDevelopersList() {
    const inst = portalData?.institution || {};
    if (Array.isArray(inst.developers) && inst.developers.length > 0) {
      return inst.developers;
    }
    return DEFAULT_DEVELOPERS;
  }

  function renderDevelopersCredits() {
    const devs = getDevelopersList();
    const inst = portalData?.institution || {};
    const devEmail = inst.deanEmail || inst.developerEmail || 'mholguinb@unibarranquilla.edu.co';
    const devPhone = inst.contactPhone || inst.developerPhone || '3043345861';

    const listContainer = document.getElementById('developersCreditsList');
    const footerText = document.getElementById('footerDevelopersText');

    setText('devContactEmail', devEmail);
    setText('devContactPhone', devPhone);
    setText('footerContactInfo', `✉️ Autoría: ${devEmail} | 📞 ${devPhone}`);

    const emailLink = document.getElementById('devContactEmailLink');
    if (emailLink) emailLink.href = `mailto:${devEmail}`;
    const phoneLink = document.getElementById('devContactPhoneLink');
    if (phoneLink) phoneLink.href = `tel:${devPhone}`;

    if (listContainer) {
      listContainer.innerHTML = devs
        .map((entry, idx) => {
          const parts = entry.split('—').map((s) => s.trim());
          const name = parts[0] || `Integrante #${idx + 1}`;
          const role = parts[1] || 'Desarrollador de la Plataforma & Estudiante de Ingeniería Mecatrónica (Unibarranquilla - IUB)';
          const initials = name
            .split(/\s+/)
            .slice(0, 2)
            .map((w) => w[0]?.toUpperCase() || '')
            .join('');
          return `
            <div class="dev-member-pill">
              <div class="dev-avatar-circle">${initials || 'MH'}</div>
              <div class="dev-member-info">
                <strong>${name}</strong>
                <span>${role}</span>
              </div>
            </div>
          `;
        })
        .join('');
    }

    if (footerText) {
      const cleanNames = devs.map((d) => d.split('—')[0].trim()).join(' • ');
      footerText.textContent = `Desarrollado por: ${cleanNames} (${devEmail} • ${devPhone})`;
    }
  }

  function renderHeroPresetSelector() {
    const dropdown = document.getElementById('heroCircuitDropdown');
    const container = document.getElementById('heroPresetButtons');
    const practices = portalData.practices || [];

    if (dropdown) {
      dropdown.innerHTML = practices
        .map(
          (p, idx) =>
            `<option value="${idx}" ${idx === activePracticeIndex ? 'selected' : ''}>[${p.id}] ${p.title} (${p.category})</option>`
        )
        .join('');
    }

    if (!container) return;
    const featuredIds = ['CIR-01', 'CIR-06', 'CIR-09', 'CIR-13', 'CASO-00', 'PRAC-01'];
    let featuredList = featuredIds
      .map((fid) => {
        const idx = practices.findIndex((p) => p.id === fid);
        return idx >= 0 ? { p: practices[idx], idx } : null;
      })
      .filter(Boolean);

    if (featuredList.length === 0) {
      featuredList = practices.slice(0, 6).map((p, idx) => ({ p, idx }));
    }

    container.innerHTML = featuredList
      .map(({ p, idx }) => {
        const isActive = idx === activePracticeIndex ? 'active' : '';
        const shortTitle = p.title.length > 34 ? p.title.slice(0, 34) + '…' : p.title;
        return `
          <button class="preset-select-btn ${isActive}" data-index="${idx}" title="${p.title}">
            <span><span class="preset-code">${p.id}</span> ${shortTitle}</span>
          </button>
        `;
      })
      .join('');

    container.querySelectorAll('.preset-select-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        selectPracticeForHologram(idx);
      });
    });
  }

  function selectPracticeForHologram(index, scrollToHolo = false) {
    const practices = portalData.practices || [];
    if (!practices[index]) return;
    activePracticeIndex = index;
    const p = practices[index];

    setText('holoActiveTitle', `${p.id}: ${p.title}`);
    setText('holoActiveEquation', `Secuencia: ${p.motionEquation}`);
    setText('holoPressureBadge', `${p.pressureBar} bar`);
    setText('holoVoltageBadge', p.voltage);

    const slider = document.getElementById('pressureRangeSlider');
    const sliderVal = document.getElementById('sliderPressureVal');
    if (slider && sliderVal) {
      slider.value = p.pressureBar;
      sliderVal.textContent = Number(p.pressureBar).toFixed(1);
    }

    const pdfLink = document.getElementById('holoQuickPdf');
    const zipLink = document.getElementById('holoQuickZip');
    if (pdfLink) pdfLink.href = p.pdfFile;
    if (zipLink) zipLink.href = p.zipFile;

    if (holoEngine) {
      holoEngine.pressureBar = Number(p.pressureBar) || 6.0;
      if (typeof holoEngine.loadCircuit === 'function') {
        holoEngine.loadCircuit(p);
      } else {
        holoEngine.loadPreset(p.hologramPreset);
      }
    }

    renderHeroPresetSelector();

    if (scrollToHolo) {
      document.getElementById('holograma-3d')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function renderPropaedeuticCycles() {
    const cyclesGrid = document.getElementById('propaedeuticCyclesGrid');
    const campusesStrip = document.getElementById('campusesStrip');
    const inst = portalData.institution || {};

    if (cyclesGrid && Array.isArray(inst.propaedeuticCycles)) {
      cyclesGrid.innerHTML = inst.propaedeuticCycles
        .map(
          (c) => `
          <article class="cycle-card">
            <div>
              <span class="cycle-level-badge">${c.level}</span>
              <h3 class="cycle-title">${c.program}</h3>
              <p class="cycle-meta">${c.snies} • ${c.semesters}</p>
              <p class="cycle-focus">${c.focus}</p>
            </div>
            <ul class="cycle-subjects-list">
              ${(c.subjects || []).map((s) => `<li>${s}</li>`).join('')}
            </ul>
          </article>
        `
        )
        .join('');
    }

    if (campusesStrip && Array.isArray(inst.campuses)) {
      campusesStrip.innerHTML = inst.campuses
        .map(
          (cam) => `
          <div class="campus-pill-card">
            <h4>📌 ${cam.name}</h4>
            <p><strong>Referencia:</strong> ${cam.address}</p>
            <p>${cam.labs}</p>
          </div>
        `
        )
        .join('');
    }
  }

  function renderPracticesCatalog() {
    const grid = document.getElementById('practicesGrid');
    if (!grid) return;

    const filtered = (portalData.practices || []).filter((p) => {
      const matchCat = selectedCategory === 'ALL' || p.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchText =
        !q ||
        p.id.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.motionEquation.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q);
      return matchCat && matchText;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="stat-card" style="grid-column:1/-1;padding:32px;">No se encontraron circuitos para el filtro seleccionado.</div>`;
      return;
    }

    grid.innerHTML = filtered
      .map((p) => {
        const realIndex = portalData.practices.findIndex((item) => item.id === p.id);
        return `
          <article class="practice-card">
            <div class="practice-card-top">
              <div class="practice-meta-row">
                <span class="practice-code-tag">${p.id} • ${p.code}</span>
                <span class="practice-cat-tag">${p.category}</span>
              </div>
              <h3 class="practice-card-title">${p.title}</h3>
              <p class="practice-card-summary">${p.summary}</p>

              <div class="schematic-preview-box">
                ${getPracticeSchematicSvg(p)}
                <code class="schematic-equation">${p.motionEquation}</code>
              </div>

              <div class="practice-specs-strip">
                <span>⚙️ Presión: <strong>${p.pressureBar} bar</strong></span>
                <span>⚡ Control: <strong>${p.voltage}</strong></span>
                <span>⏱️ ${p.duration}</span>
              </div>
            </div>

            <div class="practice-card-footer">
              <div class="card-action-row">
                <button class="btn-card-holo" data-holo-index="${realIndex}">
                  🧊 Proyectar en Holograma 3D
                </button>
                <button class="btn-card-detail" data-detail-index="${realIndex}">
                  🔍 Ficha &amp; Esquema
                </button>
              </div>
              <div class="card-action-row-3">
                <a href="${p.pdfFile}" target="_blank" class="btn-dl-resource pdf" title="Abrir PDF alojado localmente en el proyecto">
                  📄 PDF Local
                </a>
                <a href="${p.zipFile}" download class="btn-dl-resource zip" title="Descargar paquete FluidSIM (.ZIP)">
                  📦 FluidSIM .ZIP
                </a>
                <button type="button" class="btn-dl-resource yt" data-yt-circuit="${p.id}" data-yt-url="${p.videoUrl || p.youtubeUrl || ''}">
                  🎬 Video YouTube
                </button>
              </div>
            </div>
          </article>
        `;
      })
      .join('');

    grid.querySelectorAll('[data-holo-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-holo-index'), 10);
        selectPracticeForHologram(idx, true);
        showToast(`🧊 Circuito ${portalData.practices[idx].id} cargado en el Visor Holográfico 3D`);
      });
    });

    grid.querySelectorAll('[data-detail-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-detail-index'), 10);
        openPracticeDetailModal(idx);
      });
    });

    grid.querySelectorAll('[data-yt-circuit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = btn.getAttribute('data-yt-circuit');
        const yurl = btn.getAttribute('data-yt-url') || '';
        const videos = portalData.youtubeVideos || [];
        let foundIdx = videos.findIndex(
          (v) =>
            (v.relatedCircuit && v.relatedCircuit.includes(cid)) ||
            (yurl && (v.watchUrl === yurl || v.url === yurl))
        );
        if (foundIdx < 0) {
          foundIdx = videos.findIndex((v) => v.id === 'PLAY-01' || v.id === 'YT-PL-01');
        }
        if (foundIdx < 0) foundIdx = 0;
        openYoutubeCinemaModal(foundIdx);
      });
    });
  }

  // ==========================================================================
  // 4. MÓDULO INTERACTIVO DE VIDEOS DE YOUTUBE Y MODAL MODO CINE
  // ==========================================================================
  function extractYoutubeId(video) {
    if (!video) return 'b2s0z0hF6lI';
    if (video.videoId) return video.videoId;
    const raw = video.watchUrl || video.embedUrl || video.url || '';
    try {
      const u = new URL(raw);
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      if (u.hostname.includes('youtu.be')) return u.pathname.replace('/', '');
      if (u.pathname.includes('/embed/')) {
        const seg = u.pathname.split('/embed/')[1];
        if (seg && seg !== 'videoseries') return seg.split('/')[0];
      }
    } catch (e) {
      // fallback
    }
    // Thumbnail representativo del canal del Ing. Jovanny Duque para playlists generales
    return 'b2s0z0hF6lI';
  }

  function getYoutubeThumbnail(video) {
    const vid = extractYoutubeId(video);
    return `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
  }

  function renderYoutubeModule() {
    const listContainer = document.getElementById('youtubeCardsList');
    const filterBar = document.getElementById('ytFilterBar');
    const countBadge = document.getElementById('ytTotalBadge');
    const videos = portalData.youtubeVideos || [];

    if (countBadge) countBadge.textContent = `${videos.length} Videos / Listas`;
    if (!listContainer || videos.length === 0) return;

    if (activeYoutubeIndex >= videos.length) activeYoutubeIndex = 0;

    if (filterBar) {
      const categories = [];
      videos.forEach((v) => {
        const cat = v.category || 'General';
        if (!categories.includes(cat)) categories.push(cat);
      });
      filterBar.innerHTML = [
        `<button type="button" class="yt-filter-pill ${activeYoutubeFilter === 'ALL' ? 'active' : ''}" data-yt-filter="ALL">Todos (${videos.length})</button>`,
        ...categories.map((cat) => {
          const count = videos.filter((v) => (v.category || 'General') === cat).length;
          return `<button type="button" class="yt-filter-pill ${activeYoutubeFilter === cat ? 'active' : ''}" data-yt-filter="${escapeHtml(cat)}">${escapeHtml(cat)} (${count})</button>`;
        })
      ].join('');

      filterBar.querySelectorAll('[data-yt-filter]').forEach((btn) => {
        btn.addEventListener('click', () => {
          activeYoutubeFilter = btn.getAttribute('data-yt-filter') || 'ALL';
          renderYoutubeModule();
        });
      });
    }

    const filteredEntries = videos
      .map((v, idx) => ({ v, idx }))
      .filter(({ v }) => activeYoutubeFilter === 'ALL' || (v.category || 'General') === activeYoutubeFilter);

    listContainer.innerHTML = filteredEntries
      .map(({ v, idx }) => {
        const isActive = idx === activeYoutubeIndex ? 'active' : '';
        const vUrl = v.watchUrl || v.url || '';
        const isPlaylist = vUrl.includes('playlist') || Boolean(v.playlistId);
        const thumbUrl = getYoutubeThumbnail(v);
        const typeLabel = isPlaylist ? '📑 Lista / Curso' : '🎬 Video';
        const durationLabel = isPlaylist ? 'Serie Completa' : v.duration || 'HD 1080p';

        return `
          <article class="yt-video-card ${isActive}" data-yt-card="${idx}">
            <div class="yt-thumb-box" data-yt-cinema="${idx}" title="Abrir en Modal Modo Cine">
              <img src="${thumbUrl}" alt="${escapeHtml(v.title)}" loading="lazy" />
              <span class="yt-type-chip ${isPlaylist ? 'playlist' : ''}">${typeLabel}</span>
              <div class="yt-thumb-play-overlay">
                <div class="yt-thumb-play-circle">${isPlaylist ? '📑' : '▶'}</div>
              </div>
              <span class="yt-duration-chip">${escapeHtml(durationLabel)}</span>
            </div>
            <div class="yt-card-body">
              <span class="yt-item-cat">${escapeHtml(v.category)} • ${escapeHtml(v.relatedCircuit || 'General')}</span>
              <h5 class="yt-item-title">${escapeHtml(v.title)}</h5>
              <p class="yt-item-desc">${escapeHtml(v.description || '')}</p>
            </div>
            <div class="yt-card-actions">
              <button type="button" class="btn-yt-card-play" data-yt-inline="${idx}">
                ▶ Reproducir Aquí
              </button>
              <button type="button" class="btn-yt-card-modal" data-yt-cinema="${idx}">
                📺 Modo Cine
              </button>
            </div>
          </article>
        `;
      })
      .join('');

    listContainer.querySelectorAll('[data-yt-inline]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-yt-inline'), 10);
        selectYoutubeVideo(idx, false);
      });
    });

    listContainer.querySelectorAll('[data-yt-cinema]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-yt-cinema'), 10);
        openYoutubeCinemaModal(idx);
      });
    });

    updateActiveYoutubePlayer(videos[activeYoutubeIndex]);
    renderCinemaModalPlaylist();
  }

  function selectYoutubeVideo(index, scrollToSection = false) {
    const videos = portalData.youtubeVideos || [];
    if (!videos[index]) return;
    activeYoutubeIndex = index;
    renderYoutubeModule();
    if (scrollToSection) {
      document.getElementById('modulo-youtube')?.scrollIntoView({ behavior: 'smooth' });
      showToast(`🎬 Reproduciendo: ${videos[index].title}`);
    }
  }

  function updateActiveYoutubePlayer(video) {
    if (!video) return;
    const iframe = document.getElementById('activeYoutubeIframe');
    if (iframe && iframe.getAttribute('src') !== video.embedUrl) {
      iframe.setAttribute('src', video.embedUrl);
    }
    setText('activeVideoCategory', video.category);
    setText('activeVideoRelated', `Circuito: ${video.relatedCircuit || 'Curso General'}`);
    setText('activeVideoTitle', video.title);
    setText('activeVideoDesc', video.description);

    const directLink = document.getElementById('activeVideoDirectLink');
    if (directLink) directLink.href = video.watchUrl || video.url || '#';
  }

  function openYoutubeCinemaModal(index) {
    const videos = portalData?.youtubeVideos || [];
    if (typeof index === 'number' && videos[index]) {
      activeYoutubeIndex = index;
    }
    const video = videos[activeYoutubeIndex];
    if (!video) return;

    // Actualizar reproductor de página y del modal
    renderYoutubeModule();
    updateCinemaModalPlayer(video);

    const modal = document.getElementById('youtubeCinemaModal');
    modal?.classList.remove('hidden');
  }

  function updateCinemaModalPlayer(video) {
    if (!video) return;
    const videos = portalData?.youtubeVideos || [];
    const modalIframe = document.getElementById('modalYoutubeIframe');
    if (modalIframe && modalIframe.getAttribute('src') !== video.embedUrl) {
      modalIframe.setAttribute('src', video.embedUrl);
    }
    setText('modalYtTitle', video.title);
    setText('modalYtDesc', video.description);
    setText('modalYtCategory', video.category);
    setText('modalYtRelated', `Circuito: ${video.relatedCircuit || 'General'}`);
    setText('modalYtCounter', `${activeYoutubeIndex + 1} / ${videos.length}`);

    const directLink = document.getElementById('modalYtDirectLink');
    if (directLink) directLink.href = video.watchUrl || video.url || '#';

    renderCinemaModalPlaylist();
  }

  function renderCinemaModalPlaylist() {
    const listEl = document.getElementById('modalYoutubeList');
    const videos = portalData?.youtubeVideos || [];
    setText('modalYtListCount', `${videos.length} items`);
    if (!listEl || videos.length === 0) return;

    listEl.innerHTML = videos
      .map((v, idx) => {
        const isActive = idx === activeYoutubeIndex ? 'active' : '';
        const thumbUrl = getYoutubeThumbnail(v);
        return `
          <button type="button" class="yt-modal-item-btn ${isActive}" data-cinema-select="${idx}">
            <div class="yt-modal-item-thumb-wrap">
              <img class="yt-modal-item-thumb" src="${thumbUrl}" alt="${escapeHtml(v.title)}" loading="lazy" />
              <span class="yt-modal-item-num">#${idx + 1}</span>
            </div>
            <div class="yt-modal-item-info">
              <div class="yt-modal-item-meta">
                <span class="yt-modal-item-cat">${escapeHtml(v.category)} • ${escapeHtml(v.relatedCircuit || 'General')}</span>
                ${isActive ? '<span class="yt-modal-item-playing">▶ En curso</span>' : ''}
              </div>
              <div class="yt-modal-item-title">${escapeHtml(v.title)}</div>
            </div>
          </button>
        `;
      })
      .join('');

    listEl.querySelectorAll('[data-cinema-select]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-cinema-select'), 10);
        activeYoutubeIndex = idx;
        renderYoutubeModule();
        updateCinemaModalPlayer(videos[idx]);
      });
    });
  }

  function closeYoutubeCinemaModal() {
    const modal = document.getElementById('youtubeCinemaModal');
    modal?.classList.add('hidden');
    const modalIframe = document.getElementById('modalYoutubeIframe');
    if (modalIframe) {
      modalIframe.setAttribute('src', '');
    }
  }

  function convertWatchUrlToEmbed(url) {
    if (!url) return '';
    if (url.includes('/embed/')) return url;
    try {
      const u = new URL(url);
      if (u.searchParams.get('list') && !u.searchParams.get('v')) {
        return `https://www.youtube.com/embed/videoseries?list=${u.searchParams.get('list')}`;
      }
      if (u.hostname.includes('youtu.be')) {
        const id = u.pathname.replace('/', '');
        return `https://www.youtube.com/embed/${id}`;
      }
      if (u.searchParams.get('v')) {
        return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
      }
    } catch (e) {
      // ignore
    }
    return url;
  }

  // ==========================================================================
  // 5. COMPONENTES Y TABLA MAESTRA DE INVENTARIO
  // ==========================================================================
  function renderIsoCatalog() {
    const grid = document.getElementById('isoCatalogGrid');
    if (!grid || !Array.isArray(portalData.isoCatalog)) return;

    grid.innerHTML = portalData.isoCatalog
      .map(
        (item) => `
        <article class="iso-card">
          <div class="iso-symbol-frame">
            ${getIsoSymbolSvg(item.symbolType)}
          </div>
          <div class="iso-card-body">
            <div>
              <span class="iso-code-badge">${item.code}</span>
              <span class="mono" style="font-size:11px;color:#0045A3;font-weight:700">${item.pressureRange}</span>
            </div>
            <h4>${item.name}</h4>
            <p>${item.description}</p>
          </div>
        </article>
      `
      )
      .join('');
  }

  function getFolderIconForCategory(category) {
    const c = (category || '').toLowerCase();
    if (c.includes('bibliograf') || c.includes('libro')) return '📚';
    if (c.includes('software')) return '💿';
    if (c.includes('fundamento')) return '📐';
    if (c.includes('1 cilindro')) return '⚙️';
    if (c.includes('temporiz') || c.includes('sensor')) return '⏱️';
    if (c.includes('secuencia') || c.includes('flanco')) return '🔄';
    if (c.includes('caso')) return '🏭';
    if (c.includes('festo') || c.includes('práctica')) return '🔬';
    return '📁';
  }

  function renderInventoryTable() {
    const tbody = document.getElementById('inventoryTableBody');
    const foldersGrid = document.getElementById('repoFoldersGrid');
    const items = Array.isArray(portalData.resourcesInventory) ? portalData.resourcesInventory : [];
    if (!tbody) return;

    const folderMap = new Map();
    items.forEach((res) => {
      const cat = res.category || 'Otros Recursos';
      if (!folderMap.has(cat)) folderMap.set(cat, []);
      folderMap.get(cat).push(res);
    });

    const folders = Array.from(folderMap.entries()).map(([name, groupItems]) => {
      const formats = [];
      if (groupItems.some((r) => !(r.type || '').toUpperCase().startsWith('ZIP'))) formats.push('PDF');
      if (groupItems.some((r) => Boolean(r.zipFile || r.zipPath) || (r.type || '').toUpperCase().includes('ZIP'))) {
        formats.push('FluidSIM .ZIP');
      }
      return {
        name,
        items: groupItems,
        icon: getFolderIconForCategory(name),
        formatsLabel: formats.join(' + ') || 'Archivo'
      };
    });

    setText('repoSummaryPill', `${folders.length} carpetas • ${items.length} recursos`);

    if (!activeRepoFolder || !folders.some((f) => f.name === activeRepoFolder)) {
      activeRepoFolder = folders[0]?.name || '';
    }

    const q = repoSearchQuery.trim().toLowerCase();
    const isSearching = Boolean(q);

    if (foldersGrid) {
      foldersGrid.innerHTML = folders
        .map((folder) => {
          const isOpen = !isSearching && folder.name === activeRepoFolder;
          return `
            <button
              type="button"
              class="repo-folder-tab ${isOpen ? 'active' : ''}"
              data-repo-folder="${escapeHtml(folder.name)}"
              role="tab"
              aria-selected="${isOpen ? 'true' : 'false'}"
            >
              <span class="repo-folder-icon">${isOpen ? '📂' : folder.icon}</span>
              <span class="repo-folder-info">
                <span class="repo-folder-title">${escapeHtml(folder.name)}</span>
                <span class="repo-folder-meta">${escapeHtml(folder.formatsLabel)}</span>
              </span>
              <span class="repo-folder-count">${folder.items.length}</span>
            </button>
          `;
        })
        .join('');

      foldersGrid.querySelectorAll('[data-repo-folder]').forEach((btn) => {
        btn.addEventListener('click', () => {
          activeRepoFolder = btn.getAttribute('data-repo-folder') || '';
          repoSearchQuery = '';
          const searchEl = document.getElementById('repoSearchInput');
          if (searchEl) searchEl.value = '';
          renderInventoryTable();
        });
      });
    }

    let visibleItems = [];
    if (isSearching) {
      visibleItems = items.filter((res) => {
        const haystack = `${res.id || ''} ${res.title || ''} ${res.category || ''} ${res.type || ''}`.toLowerCase();
        return haystack.includes(q);
      });
      setText('repoActiveFolderTitle', `Resultados de búsqueda: "${repoSearchQuery.trim()}"`);
      setText(
        'repoActiveFolderSub',
        visibleItems.length
          ? `${visibleItems.length} coincidencia(s) encontradas en el repositorio`
          : 'No se encontraron archivos que coincidan con tu búsqueda'
      );
      setText('repoActiveFolderCount', `${visibleItems.length} recurso(s)`);
    } else {
      const currentFolder = folders.find((f) => f.name === activeRepoFolder);
      visibleItems = currentFolder ? currentFolder.items : [];
      setText('repoActiveFolderTitle', currentFolder ? currentFolder.name : 'Carpeta vacía');
      setText(
        'repoActiveFolderSub',
        `Carpeta seleccionada • Descarga directa sin redirecciones externas`
      );
      setText('repoActiveFolderCount', `${visibleItems.length} recurso(s)`);
    }

    if (visibleItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;padding:28px;color:#64748b;">
            No hay recursos para mostrar en esta vista.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = visibleItems
      .map((res) => {
        const typeStr = res.type || 'Archivo';
        const isZipOnly = typeStr.toUpperCase().startsWith('ZIP');
        const zipHref = res.zipFile || res.zipPath || '';
        const pdfHref = res.pdfFile || res.path || '';
        const hasBoth = Boolean(pdfHref && zipHref);
        const singleHref = res.path || zipHref || '#';

        return `
          <tr>
            <td class="mono"><strong>${escapeHtml(res.id)}</strong></td>
            <td>
              <strong>${escapeHtml(res.title)}</strong>
              ${isSearching ? `<div><span class="repo-inline-folder-tag">📁 ${escapeHtml(res.category)}</span></div>` : ''}
            </td>
            <td><span class="format-badge ${isZipOnly ? 'zip' : 'pdf'}">${escapeHtml(typeStr)}</span></td>
            <td>
              <div style="display:flex;gap:5px;flex-wrap:wrap">
                ${
                  hasBoth
                    ? `<a href="${pdfHref}" target="_blank" class="btn-dl-resource pdf">📄 Ver PDF</a>
                       <a href="${zipHref}" download class="btn-dl-resource zip">📦 Descargar .ZIP</a>`
                    : `<a href="${singleHref}" ${isZipOnly ? 'download' : 'target="_blank"'} class="btn-dl-resource ${isZipOnly ? 'zip' : 'pdf'}">
                        ${isZipOnly ? '📦 Descargar .ZIP' : '📄 Abrir Archivo'}
                       </a>`
                }
              </div>
            </td>
            <td>
              <div style="display:flex;gap:5px;flex-wrap:wrap">
                ${
                  res.driveUrl
                    ? `<a href="${res.driveUrl}" target="_blank" rel="noopener" class="btn-dl-resource">☁️ Drive</a>`
                    : ''
                }
                ${
                  res.megaUrl
                    ? `<a href="${res.megaUrl}" target="_blank" rel="noopener" class="btn-dl-resource">☁️ Mega</a>`
                    : ''
                }
                ${!res.driveUrl && !res.megaUrl ? '<span style="color:#94a3b8;font-size:12px;">Descarga directa</span>' : ''}
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function getMatchingDiagramIndex(practice) {
    const id = (practice.id || '').toUpperCase();
    if (id === 'CIR-01') return 0;
    if (id === 'CIR-02' || id === 'CIR-03' || id === 'CIR-06') return 1;
    if (id === 'CIR-08') return 2;
    if (id === 'FUND-04' || id === 'CIR-15' || id === 'CIR-16') return 3;
    if (id === 'PRAC-01' || id === 'PRAC-02' || id === 'PRAC-03' || id === 'PRAC-FESTO-2C') return 4;
    if (id === 'CASO-00') return 5;
    if (id === 'CIR-13' || (practice.hologramPreset === 'hydraulic_press')) return 6;
    return -1;
  }

  function openDiagramModal(index) {
    if (!ORIGINAL_DIAGRAMS.length) return;
    activeDiagramIndex = ((index % ORIGINAL_DIAGRAMS.length) + ORIGINAL_DIAGRAMS.length) % ORIGINAL_DIAGRAMS.length;
    const item = ORIGINAL_DIAGRAMS[activeDiagramIndex];
    setText('diagramModalBadge', item.badge);
    setText('diagramModalTitle', item.title);
    setText('diagramModalDesc', item.desc);
    const img = document.getElementById('diagramModalImg');
    if (img) {
      img.src = item.src;
      img.alt = item.title;
    }
    const dl = document.getElementById('diagramModalDownload');
    if (dl) {
      dl.href = item.src;
      dl.setAttribute('download', item.src.split('/').pop() || 'plano-fluidsim.png');
    }
    document.getElementById('diagramLightboxModal')?.classList.remove('hidden');
  }

  // ==========================================================================
  // 6. MODAL DE FICHA TÉCNICA DETALLADA DE CIRCUITO
  // ==========================================================================
  function openPracticeDetailModal(index) {
    const p = portalData.practices[index];
    if (!p) return;

    setText('detailModalCode', `${p.id} • ${p.code} • ${p.cycle}`);
    setText('detailModalTitle', p.title);

    const matchDiagIdx = getMatchingDiagramIndex(p);
    const matchedDiagramHtml =
      matchDiagIdx >= 0
        ? `<div style="margin-top:10px;background:#fff;border:1px solid #CBD5E1;border-radius:8px;padding:8px;text-align:center;">
             <div style="font-size:11px;font-weight:700;color:#0045A3;margin-bottom:6px;">Plano Original Correspondiente (${escapeHtml(ORIGINAL_DIAGRAMS[matchDiagIdx].badge)})</div>
             <img src="${ORIGINAL_DIAGRAMS[matchDiagIdx].src}" alt="${escapeHtml(ORIGINAL_DIAGRAMS[matchDiagIdx].title)}" style="max-width:100%;max-height:170px;object-fit:contain;border-radius:4px;cursor:pointer;" data-open-matched-diagram="${matchDiagIdx}" />
           </div>`
        : '';

    const body = document.getElementById('detailModalBody');
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-bottom:20px;">
        <div>
          <h4 style="margin-bottom:8px;">Descripción Técnica y Objetivos del Circuito</h4>
          <p style="margin-bottom:12px;color:#334155;">${p.summary}</p>
          <ul style="padding-left:18px;margin-bottom:14px;">
            ${(p.objectives || []).map((o) => `<li style="margin-bottom:5px;">${o}</li>`).join('')}
          </ul>
          <div style="background:#EFF6FF;padding:12px 14px;border-radius:8px;font-size:13px;">
            <strong>Módulo:</strong> ${p.subject}<br/>
            <strong>Ecuación / Secuencia:</strong> <code>${p.motionEquation}</code><br/>
            <strong>Parámetros:</strong> ${p.pressureBar} bar | ${p.voltage}
          </div>
        </div>
        <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;padding:14px;">
          <h4 style="margin-bottom:8px;">Esquema Funcional y Descargas Directas</h4>
          ${getPracticeSchematicSvg(p)}
          ${matchedDiagramHtml}
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
            <a href="${p.pdfFile}" target="_blank" class="btn-primary-institutional" style="flex:1;font-size:12px;">📄 Abrir PDF Local</a>
            <a href="${p.zipFile}" download class="btn-outline-institutional" style="flex:1;font-size:12px;justify-content:center;">📦 FluidSIM .ZIP</a>
          </div>
          ${p.blogUrl ? `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;"><a href="${p.blogUrl}" target="_blank" class="btn-dl-resource" style="flex:1;">🌐 Entrada Blog Original</a></div>` : ''}
        </div>
      </div>

      <h4 style="margin-bottom:10px;">Componentes del Circuito (BOM Festo Didactic)</h4>
      <div class="table-responsive" style="margin-bottom:20px;">
        <table class="inventory-table">
          <thead>
            <tr>
              <th>Símbolo ISO</th>
              <th>Denominación Técnica</th>
              <th>Referencia Festo</th>
              <th>Cant.</th>
              <th>Especificación</th>
            </tr>
          </thead>
          <tbody>
            ${(p.components || [])
              .map(
                (c) => `
              <tr>
                <td class="mono"><strong>${c.item}</strong></td>
                <td>${c.name}</td>
                <td class="mono">${c.refFesto}</td>
                <td>${c.qty}</td>
                <td>${c.spec}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <h4 style="margin-bottom:10px;">Secuencia Operativa Paso a Paso</h4>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${(p.steps || [])
          .map(
            (s) => `
          <div style="background:#F1F5F9;padding:10px 14px;border-left:4px solid #0045A3;border-radius:6px;font-size:13.5px;">
            ${s}
          </div>
        `
          )
          .join('')}
      </div>
    `;

    document.getElementById('practiceDetailModal').classList.remove('hidden');
    body.querySelector('[data-open-matched-diagram]')?.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-open-matched-diagram'), 10);
      openDiagramModal(idx);
    });
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ==========================================================================
  // 7. INICIALIZACIÓN Y EVENTOS INTERACTIVOS DEL PORTAL PÚBLICO
  // ==========================================================================
  function initEvents() {
    let isDraggingTimeline = false;
    const timelineInput = document.getElementById('holoTimeline');
    const phaseChipsEl = document.getElementById('holoPhaseChips');
    const infoPanelEl = document.getElementById('holoInfoPanel');

    // Inicializar motor Three.js Holográfico
    try {
      holoEngine = new window.IUBHologramEngine('hologramCanvasContainer', {
        onTelemetry: (data) => {
          setText('hudPhaseText', data.phase);
          setText('hudActuatorPos', data.actuator);
          setText('hudValveState', data.valve);
        },
        onPhases: (phases) => {
          if (!phaseChipsEl) return;
          phaseChipsEl.innerHTML = (phases || []).map((ph, idx) =>
            `<button type="button" class="phase-chip${idx === 0 ? ' active' : ''}" data-phase-idx="${idx}">${escapeHtml(ph.name)}</button>`
          ).join('');
          phaseChipsEl.querySelectorAll('.phase-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
              if (!holoEngine) return;
              const idx = parseInt(chip.getAttribute('data-phase-idx'), 10);
              holoEngine.seekPhase(idx);
            });
          });
        },
        onProgress: ({ progress, phaseIndex }) => {
          if (timelineInput && !isDraggingTimeline) {
            timelineInput.value = String(Math.round((progress || 0) * 1000));
          }
          if (phaseChipsEl) {
            phaseChipsEl.querySelectorAll('.phase-chip').forEach((chip, idx) => {
              chip.classList.toggle('active', idx === phaseIndex);
            });
          }
        },
        onSelect: (info) => {
          if (!infoPanelEl) return;
          if (!info) {
            infoPanelEl.classList.add('hidden');
            return;
          }
          setText('holoInfoTag', info.tag || 'COMP');
          setText('holoInfoTitle', info.title || 'Componente');
          setText('holoInfoDesc', info.desc || '');
          const specsEl = document.getElementById('holoInfoSpecs');
          if (specsEl) {
            specsEl.innerHTML = (info.specs || []).map(([k, v]) =>
              `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`
            ).join('');
          }
          infoPanelEl.classList.remove('hidden');
        }
      });
    } catch (err) {
      console.error('Error inicializando visor 3D:', err);
      holoEngine = null;
    }

    // Dropdown maestro de circuitos en el Hero
    document.getElementById('heroCircuitDropdown')?.addEventListener('change', (e) => {
      const idx = parseInt(e.target.value, 10);
      selectPracticeForHologram(idx, false);
    });

    // Controles del Visor Holográfico
    document.getElementById('btnHoloPlayPause')?.addEventListener('click', () => {
      if (!holoEngine) return;
      holoEngine.isPlaying = !holoEngine.isPlaying;
      setText('playPauseIcon', holoEngine.isPlaying ? '⏸' : '▶');
      setText('playPauseText', holoEngine.isPlaying ? 'Pausar Ciclo' : 'Reanudar Ciclo');
    });

    document.getElementById('btnHoloTriggerPulse')?.addEventListener('click', () => {
      if (!holoEngine) return;
      holoEngine.triggerManualPulse();
      showToast('⚡ Pulso de mando enviado a electroválvula / cilindro 3D');
    });

    document.getElementById('btnToggleWireframe')?.addEventListener('click', (e) => {
      if (!holoEngine) return;
      holoEngine.setWireframe(!holoEngine.isXray);
      e.currentTarget.classList.toggle('active', holoEngine.isXray);
    });

    document.getElementById('btnToggleExploded')?.addEventListener('click', (e) => {
      if (!holoEngine || typeof holoEngine.toggleExplodedView !== 'function') return;
      const isExp = holoEngine.toggleExplodedView();
      e.currentTarget.classList.toggle('active', isExp);
      showToast(isExp ? '🔧 Vista en Despiece CAD activada' : '🔩 Componentes ensamblados');
    });

    document.getElementById('btnToggleAutoOrbit')?.addEventListener('click', (e) => {
      if (!holoEngine || typeof holoEngine.toggleAutoOrbit !== 'function') return;
      const isOrbit = holoEngine.toggleAutoOrbit();
      e.currentTarget.classList.toggle('active', isOrbit);
    });

    document.getElementById('btnToggleLabels')?.addEventListener('click', (e) => {
      if (!holoEngine || typeof holoEngine.toggleLabels !== 'function') return;
      const labelsOn = holoEngine.toggleLabels();
      e.currentTarget.classList.toggle('active', labelsOn);
    });

    document.getElementById('btnCloseHoloInfo')?.addEventListener('click', () => {
      if (holoEngine && typeof holoEngine.deselect === 'function') {
        holoEngine.deselect();
      }
      if (infoPanelEl) infoPanelEl.classList.add('hidden');
    });

    if (timelineInput) {
      const startDrag = () => { isDraggingTimeline = true; };
      const endDrag = () => { isDraggingTimeline = false; };
      timelineInput.addEventListener('pointerdown', startDrag);
      timelineInput.addEventListener('mousedown', startDrag);
      timelineInput.addEventListener('touchstart', startDrag, { passive: true });
      timelineInput.addEventListener('pointerup', endDrag);
      timelineInput.addEventListener('mouseup', endDrag);
      timelineInput.addEventListener('touchend', endDrag);
      timelineInput.addEventListener('change', endDrag);
      timelineInput.addEventListener('input', (e) => {
        if (!holoEngine || typeof holoEngine.seekProgress !== 'function') return;
        const p = parseInt(e.target.value, 10) / 1000;
        holoEngine.seekProgress(p);
      });
    }

    document.querySelectorAll('.speed-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!holoEngine || typeof holoEngine.setSpeed !== 'function') return;
        document.querySelectorAll('.speed-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const speed = parseFloat(btn.getAttribute('data-speed') || '1');
        holoEngine.setSpeed(speed);
      });
    });

    document.getElementById('btnHoloStep')?.addEventListener('click', () => {
      if (!holoEngine || typeof holoEngine.nextPhase !== 'function') return;
      holoEngine.nextPhase();
      setText('playPauseIcon', holoEngine.isPlaying ? '⏸' : '▶');
      setText('playPauseText', holoEngine.isPlaying ? 'Pausar Ciclo' : 'Reanudar Ciclo');
    });

    document.getElementById('btnHoloSnapshot')?.addEventListener('click', () => {
      if (!holoEngine || typeof holoEngine.captureImage !== 'function') return;
      const dataUrl = holoEngine.captureImage();
      if (!dataUrl) {
        showToast('⚠️ No se pudo capturar la imagen del visor 3D', true);
        return;
      }
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'iub-circuito-3d.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('📸 Captura PNG descargada');
    });

    const holoCard = document.getElementById('hologramCard');
    const btnFullscreen = document.getElementById('btnHoloFullscreen');
    btnFullscreen?.addEventListener('click', async () => {
      if (!holoCard) return;
      try {
        if (!document.fullscreenElement) {
          await holoCard.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch (_) {
        showToast('⚠️ Pantalla completa no disponible en este navegador', true);
      }
    });
    document.addEventListener('fullscreenchange', () => {
      if (btnFullscreen) {
        btnFullscreen.classList.toggle('active', document.fullscreenElement === holoCard);
      }
      if (holoEngine && typeof holoEngine.resize === 'function') {
        setTimeout(() => holoEngine.resize(), 60);
      }
    });

    document.querySelectorAll('[data-cam]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!holoEngine) return;
        document.querySelectorAll('[data-cam]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        holoEngine.setCameraPreset(btn.getAttribute('data-cam'));
      });
    });

    document.getElementById('pressureRangeSlider')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      setText('sliderPressureVal', val.toFixed(1));
      setText('holoPressureBadge', `${val.toFixed(1)} bar`);
      if (holoEngine) holoEngine.pressureBar = val;
    });

    // Botones del Modal de YouTube Modo Cine
    document.getElementById('btnExpandActiveVideoModal')?.addEventListener('click', () => {
      openYoutubeCinemaModal(activeYoutubeIndex);
    });
    document.getElementById('btnOpenCinemaModalFromHeader')?.addEventListener('click', () => {
      openYoutubeCinemaModal(activeYoutubeIndex);
    });
    document.getElementById('btnCloseYoutubeModal')?.addEventListener('click', () => {
      closeYoutubeCinemaModal();
    });
    document.getElementById('youtubeCinemaModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'youtubeCinemaModal') {
        closeYoutubeCinemaModal();
      }
    });
    document.getElementById('btnModalPrevVideo')?.addEventListener('click', () => {
      const videos = portalData?.youtubeVideos || [];
      if (videos.length === 0) return;
      activeYoutubeIndex = (activeYoutubeIndex - 1 + videos.length) % videos.length;
      renderYoutubeModule();
      updateCinemaModalPlayer(videos[activeYoutubeIndex]);
    });
    document.getElementById('btnModalNextVideo')?.addEventListener('click', () => {
      const videos = portalData?.youtubeVideos || [];
      if (videos.length === 0) return;
      activeYoutubeIndex = (activeYoutubeIndex + 1) % videos.length;
      renderYoutubeModule();
      updateCinemaModalPlayer(videos[activeYoutubeIndex]);
    });

    // Buscador y filtros del catálogo de Circuitos y Casos
    document.getElementById('practiceSearchInput')?.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderPracticesCatalog();
    });

    // Buscador del Repositorio por Carpetas
    document.getElementById('repoSearchInput')?.addEventListener('input', (e) => {
      repoSearchQuery = e.target.value;
      renderInventoryTable();
    });

    document.querySelectorAll('#categoryFilterBar .filter-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#categoryFilterBar .filter-pill').forEach((b) => b.classList.remove('active'));
        pill.classList.add('active');
        selectedCategory = pill.getAttribute('data-category');
        renderPracticesCatalog();
      });
    });

    // Galería y Modal de Planos y Diagramas Originales
    document.querySelectorAll('[data-diagram-idx]').forEach((card) => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.getAttribute('data-diagram-idx'), 10);
        openDiagramModal(idx);
      });
    });
    document.getElementById('btnCloseDiagramModal')?.addEventListener('click', () => {
      document.getElementById('diagramLightboxModal')?.classList.add('hidden');
    });
    document.getElementById('diagramLightboxModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'diagramLightboxModal') {
        document.getElementById('diagramLightboxModal')?.classList.add('hidden');
      }
    });
    document.getElementById('btnDiagramPrev')?.addEventListener('click', () => {
      openDiagramModal(activeDiagramIndex - 1);
    });
    document.getElementById('btnDiagramNext')?.addEventListener('click', () => {
      openDiagramModal(activeDiagramIndex + 1);
    });

    // Cerrar modal de ficha técnica
    document.getElementById('btnCloseDetailModal')?.addEventListener('click', () => {
      document.getElementById('practiceDetailModal').classList.add('hidden');
    });

    // Exportar JSON maestro desde vista pública
    document.getElementById('btnExportAllDataJson')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(portalData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'iub_portal_data.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast('📥 Archivo iub_portal_data.json descargado');
    });

    // Atajo discreto de teclado para Administrador (Ctrl + Shift + A → /admin)
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        window.location.href = '/admin';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    loadPortalData();
  });
})();
