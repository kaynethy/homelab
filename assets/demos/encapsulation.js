/* === ENCAPSULATION DEMO === */
(function () {
  'use strict';

  // =============================================
  // LAYER CONFIG
  // =============================================
  var LAYERS = [
    { num: 7, name: 'Anwendung',    color: '#4fffb0', short: 'L7' },
    { num: 6, name: 'Darstellung',  color: '#7b61ff', short: 'L6' },
    { num: 5, name: 'Sitzung',      color: '#a78bfa', short: 'L5' },
    { num: 4, name: 'Transport',    color: '#4db8ff', short: 'L4' },
    { num: 3, name: 'Vermittlung',  color: '#00d4aa', short: 'L3' },
    { num: 2, name: 'Sicherung',    color: '#fb923c', short: 'L2' },
    { num: 1, name: 'Bitübertrag.', color: '#ef4444', short: 'L1' }
  ];

  function layerByNum(n) { for (var i = 0; i < LAYERS.length; i++) if (LAYERS[i].num === n) return LAYERS[i]; return null; }

  // =============================================
  // SCENARIOS
  // =============================================
  var SCENARIOS = {
    http: {
      label: 'HTTP → Proxmox Web-UI',
      payload: 'GET /index.html HTTP/1.1\nHost: proxmox.homelab.local\nAccept: text/html',
      protocol: 'TCP', protoNum: 6,
      srcIP: '192.168.0.155', dstIP: '192.168.0.200',
      srcPort: 54321, dstPort: 8006,
      srcMAC: 'AA:BB:CC:DD:EE:01', dstMAC: '00:15:5D:00:9B:01',
      payloadSize: 58
    },
    ssh: {
      label: 'SSH → Jumphost',
      payload: 'SSH-2.0-OpenSSH_9.6\nKey Exchange Init...',
      protocol: 'TCP', protoNum: 6,
      srcIP: '192.168.0.155', dstIP: '192.168.0.204',
      srcPort: 62841, dstPort: 22,
      srcMAC: 'AA:BB:CC:DD:EE:01', dstMAC: '00:15:5D:00:9B:04',
      payloadSize: 39
    },
    dns: {
      label: 'DNS Query → AdGuard',
      payload: 'DNS Standard Query\nA proxmox.homelab.local\nTransaction ID: 0xAB12',
      protocol: 'UDP', protoNum: 17,
      srcIP: '192.168.0.155', dstIP: '192.168.0.201',
      srcPort: 51234, dstPort: 53,
      srcMAC: 'AA:BB:CC:DD:EE:01', dstMAC: '00:15:5D:00:9B:01',
      payloadSize: 48
    },
    icmp: {
      label: 'Ping (ICMP)',
      payload: 'ICMP Echo Request\nIdentifier: 0x0001\nSequence: 1\nData: abcdef...',
      protocol: 'ICMP', protoNum: 1,
      srcIP: '192.168.0.155', dstIP: '192.168.0.200',
      srcPort: null, dstPort: null,
      srcMAC: 'AA:BB:CC:DD:EE:01', dstMAC: '00:15:5D:00:9B:01',
      payloadSize: 56
    },
    ntp: {
      label: 'UDP/NTP',
      payload: 'NTP v4 Client Request\nFlags: 0x23\nOrigin Timestamp: 0',
      protocol: 'UDP', protoNum: 17,
      srcIP: '192.168.0.155', dstIP: '162.159.200.1',
      srcPort: 49152, dstPort: 123,
      srcMAC: 'AA:BB:CC:DD:EE:01', dstMAC: '00:15:5D:00:01:00',
      payloadSize: 48
    }
  };

  // =============================================
  // STATE
  // =============================================
  var state = {
    step: 0,        // 0–4 encap steps
    direction: 'encap', // 'encap' or 'decap'
    scenario: 'http',
    autoPlaying: false,
    autoTimer: null,
    hopOpen: false,
    interactiveOpen: false,
    custom: null  // overrides from interactive mode
  };

  function getScenario() {
    if (state.custom) return state.custom;
    return SCENARIOS[state.scenario];
  }

  // =============================================
  // STEP BUILDERS
  // =============================================
  function getTransportHeaderSize(sc) {
    if (sc.protocol === 'TCP') return 20;
    if (sc.protocol === 'UDP') return 8;
    return 8; // ICMP
  }

  function buildSteps(sc) {
    var payloadSize = sc.payloadSize || 58;
    var transportSize = getTransportHeaderSize(sc);
    var ipSize = 20;
    var ethSize = 14;
    var fcsSize = 4;

    var transportLabel, transportFields;
    if (sc.protocol === 'TCP') {
      transportLabel = 'TCP Header';
      transportFields = [
        { k: 'Source Port', v: String(sc.srcPort) },
        { k: 'Dest Port', v: String(sc.dstPort) },
        { k: 'Sequence', v: '1' },
        { k: 'Ack Number', v: '0' },
        { k: 'Flags', v: '[SYN]' },
        { k: 'Window Size', v: '65535' },
        { k: 'Header Length', v: '20 Bytes' }
      ];
    } else if (sc.protocol === 'UDP') {
      transportLabel = 'UDP Header';
      transportFields = [
        { k: 'Source Port', v: String(sc.srcPort) },
        { k: 'Dest Port', v: String(sc.dstPort) },
        { k: 'Length', v: String(transportSize + payloadSize) + ' Bytes' },
        { k: 'Checksum', v: '0x' + Math.floor(Math.random() * 65535).toString(16) }
      ];
    } else {
      transportLabel = 'ICMP Header';
      transportFields = [
        { k: 'Type', v: '8 (Echo Request)' },
        { k: 'Code', v: '0' },
        { k: 'Checksum', v: '0x' + Math.floor(Math.random() * 65535).toString(16) },
        { k: 'Identifier', v: '0x0001' },
        { k: 'Sequence', v: '1' }
      ];
    }

    return [
      {
        layerNums: [7, 6, 5],
        activeLayer: 7,
        title: 'Anwendungsdaten (Layer 7-5)',
        shortTitle: 'Daten',
        color: '#4fffb0',
        explanation: 'Deine Anwendung (Browser) erstellt die Nachricht die du senden willst — z.B. einen HTTP GET Request. Das ist der eigentliche Inhalt, der Grund warum du überhaupt kommunizierst.',
        headerLabel: 'Application Data',
        headerFields: [
          { k: 'Protokoll', v: sc.protocol === 'ICMP' ? 'ICMP' : (sc.dstPort === 53 ? 'DNS' : (sc.dstPort === 123 ? 'NTP' : (sc.dstPort === 22 ? 'SSH' : 'HTTP'))) },
          { k: 'Payload', v: sc.payload.split('\n')[0] }
        ],
        payload: sc.payload,
        sizes: [{ label: 'Daten', size: payloadSize, color: '#4fffb0' }],
        totalSize: payloadSize
      },
      {
        layerNums: [4],
        activeLayer: 4,
        title: transportLabel + ' (Layer 4 – Transport)',
        shortTitle: '+ ' + transportLabel,
        color: '#4db8ff',
        explanation: sc.protocol === 'TCP'
          ? 'Der Transport-Layer verpackt deine Daten in ein Segment. Er fügt Ports hinzu (damit der Empfänger weiß welche Anwendung die Daten bekommen soll) und Sequence Numbers (damit die Reihenfolge stimmt und nichts verloren geht).'
          : sc.protocol === 'UDP'
            ? 'Der Transport-Layer verpackt deine Daten in ein Datagram. UDP ist leichtgewichtig — nur 8 Bytes Header statt 20 bei TCP. Kein Handshake, keine Reihenfolge-Garantie, aber schneller.'
            : 'ICMP hat keinen eigenen Transport-Layer-Port. Stattdessen nutzt es Type und Code Felder um verschiedene Nachrichtentypen zu unterscheiden (Echo Request, Destination Unreachable, etc.).',
        headerLabel: transportLabel,
        headerFields: transportFields,
        payload: null,
        sizes: [
          { label: transportLabel.split(' ')[0], size: transportSize, color: '#4db8ff' },
          { label: 'Daten', size: payloadSize, color: '#4fffb0' }
        ],
        totalSize: transportSize + payloadSize
      },
      {
        layerNums: [3],
        activeLayer: 3,
        title: 'IP Header (Layer 3 – Vermittlung)',
        shortTitle: '+ IP Header',
        color: '#00d4aa',
        explanation: 'Der Network-Layer fügt IP-Adressen hinzu — die logische Adresse von Absender und Empfänger. Der Router nutzt diese Adressen um zu entscheiden über welchen Weg das Paket geschickt wird.',
        headerLabel: 'IP Header',
        headerFields: [
          { k: 'Version', v: '4 (IPv4)' },
          { k: 'Header Length', v: '20 Bytes' },
          { k: 'Total Length', v: String(ipSize + transportSize + payloadSize) + ' Bytes' },
          { k: 'TTL', v: '64 (max. 64 Router-Hops)' },
          { k: 'Protocol', v: String(sc.protoNum) + ' (' + sc.protocol + ')' },
          { k: 'Source IP', v: sc.srcIP + ' (dein PC)' },
          { k: 'Destination IP', v: sc.dstIP },
          { k: 'Header Checksum', v: '0x' + Math.floor(Math.random() * 65535).toString(16).padStart(4, '0') }
        ],
        payload: null,
        sizes: [
          { label: 'IP', size: ipSize, color: '#00d4aa' },
          { label: transportLabel.split(' ')[0], size: transportSize, color: '#4db8ff' },
          { label: 'Daten', size: payloadSize, color: '#4fffb0' }
        ],
        totalSize: ipSize + transportSize + payloadSize
      },
      {
        layerNums: [2],
        activeLayer: 2,
        title: 'Ethernet Frame (Layer 2 – Sicherung)',
        shortTitle: '+ Ethernet',
        color: '#fb923c',
        explanation: 'Der Data-Link-Layer fügt MAC-Adressen hinzu — die physische Adresse der Netzwerkkarte. Diese Adresse gilt nur bis zum nächsten Router/Switch, dann wird sie ausgetauscht (Hop-by-Hop). Am Ende kommt eine CRC-Checksumme (FCS) die Übertragungsfehler erkennt.',
        headerLabel: 'Ethernet Header',
        headerFields: [
          { k: 'Dst MAC', v: sc.dstMAC },
          { k: 'Src MAC', v: sc.srcMAC },
          { k: 'EtherType', v: '0x0800 (IPv4)' },
          { k: 'FCS (Trailer)', v: 'CRC-32 Checksumme (4 Bytes)' }
        ],
        payload: null,
        sizes: [
          { label: 'ETH', size: ethSize, color: '#fb923c' },
          { label: 'IP', size: ipSize, color: '#00d4aa' },
          { label: transportLabel.split(' ')[0], size: transportSize, color: '#4db8ff' },
          { label: 'Daten', size: payloadSize, color: '#4fffb0' },
          { label: 'FCS', size: fcsSize, color: '#fb923c' }
        ],
        totalSize: ethSize + ipSize + transportSize + payloadSize + fcsSize
      },
      {
        layerNums: [1],
        activeLayer: 1,
        title: 'Bits auf dem Kabel (Layer 1 – Bitübertragung)',
        shortTitle: '→ Bits',
        color: '#ef4444',
        explanation: 'Die physische Schicht wandelt alles in Bits um und sendet sie als elektrische Signale (Kupferkabel), Lichtimpulse (Glasfaser) oder Funkwellen (WiFi) über das Medium.',
        headerLabel: 'Bitstream',
        headerFields: [
          { k: 'Encoding', v: 'PAM-5 (Gigabit Ethernet)' },
          { k: 'Medium', v: 'CAT6 Kupferkabel' },
          { k: 'Gesamtgröße', v: String(ethSize + ipSize + transportSize + payloadSize + fcsSize) + ' Bytes = ' + String((ethSize + ipSize + transportSize + payloadSize + fcsSize) * 8) + ' Bits' }
        ],
        payload: null,
        sizes: [{ label: 'Bits', size: (ethSize + ipSize + transportSize + payloadSize + fcsSize), color: '#ef4444' }],
        totalSize: ethSize + ipSize + transportSize + payloadSize + fcsSize
      }
    ];
  }

  // =============================================
  // DOM HELPERS
  // =============================================
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function $(id) { return document.getElementById(id); }

  var MTU = 1500;

  // =============================================
  // RENDER: OSI TOWER (left)
  // =============================================
  function renderTower() {
    var steps = buildSteps(getScenario());
    var cur = state.direction === 'decap' ? (4 - state.step) : state.step;
    var activeL = steps[cur] ? steps[cur].activeLayer : 7;

    var html = '<div class="enc-tower">';
    html += '<div class="enc-tower-title">OSI-MODELL</div>';
    LAYERS.forEach(function (l) {
      var active = l.num === activeL;
      var passed = (state.direction === 'encap' && l.num > activeL) || (state.direction === 'decap' && l.num < activeL);
      var cls = 'enc-tower-layer' + (active ? ' enc-tower-active' : '') + (passed ? ' enc-tower-passed' : '');
      html += '<div class="' + cls + '" style="--lc:' + l.color + '">';
      html += '<span class="enc-tower-num">' + l.num + '</span>';
      html += '<span class="enc-tower-name">' + esc(l.name) + '</span>';
      html += '</div>';
    });

    // Direction indicator
    var arrow = state.direction === 'encap' ? '↓ Encapsulation (7→1)' : '↑ De-Encapsulation (1→7)';
    html += '<div class="enc-tower-dir">' + arrow + '</div>';
    html += '</div>';
    return html;
  }

  // =============================================
  // RENDER: PACKET VISUALIZATION (center)
  // =============================================
  function renderPacket() {
    var steps = buildSteps(getScenario());
    var idx = state.direction === 'decap' ? (4 - state.step) : state.step;
    var step = steps[idx];
    if (!step) return '';
    var sc = getScenario();

    var html = '<div class="enc-packet-section">';
    html += '<div class="enc-section-label"><span class="enc-bar" style="background:' + step.color + '"></span>PAKET-AUFBAU — ' + esc(step.title) + '</div>';

    // Packet blocks visualization
    if (idx === 4) {
      // Layer 1: Bit visualization
      html += '<div class="enc-bits-row">';
      var total = step.totalSize * 8;
      var bits = '';
      for (var b = 0; b < Math.min(total, 64); b++) {
        bits += '<span class="enc-bit">' + (Math.random() > 0.5 ? '1' : '0') + '</span>';
      }
      if (total > 64) bits += '<span class="enc-bit-more">... (' + total + ' Bits total)</span>';
      html += bits + '</div>';
    } else {
      html += '<div class="enc-packet-blocks">';
      // Build blocks from step sizes
      for (var s = 0; s < step.sizes.length; s++) {
        var seg = step.sizes[s];
        var isNew = (s === 0 && idx > 0) || (s === step.sizes.length - 1 && seg.label === 'FCS');
        html += '<div class="enc-block' + (isNew ? ' enc-block-new' : ' enc-block-prev') + '" style="--bc:' + seg.color + '">';
        html += '<div class="enc-block-label">' + esc(seg.label) + '</div>';
        html += '<div class="enc-block-size">' + seg.size + 'B</div>';
        html += '</div>';
      }
      html += '</div>';
    }

    // Size tracker
    html += renderSizeTracker(step, steps);

    html += '</div>';
    return html;
  }

  // =============================================
  // RENDER: SIZE TRACKER
  // =============================================
  function renderSizeTracker(step, steps) {
    var total = step.totalSize;
    var pct = Math.min(100, (total / MTU) * 100);

    var html = '<div class="enc-size-tracker">';
    html += '<div class="enc-size-title">PAKET-GRÖßE</div>';
    html += '<div class="enc-size-bar">';
    for (var s = 0; s < step.sizes.length; s++) {
      var seg = step.sizes[s];
      var w = Math.max(2, (seg.size / MTU) * 100);
      html += '<div class="enc-size-seg" style="width:' + w + '%;background:' + seg.color + '" title="' + esc(seg.label) + ': ' + seg.size + 'B"></div>';
    }
    html += '</div>';
    html += '<div class="enc-size-info">';
    step.sizes.forEach(function (seg, i) {
      if (i > 0) html += ' <span class="enc-size-sep">│</span> ';
      html += '<span style="color:' + seg.color + '">' + esc(seg.label) + ': ' + seg.size + 'B</span>';
    });
    html += ' <span class="enc-size-sep">│</span> <strong>Gesamt: ' + total + 'B</strong>';
    html += ' <span class="enc-size-sep">│</span> MTU: ' + MTU + 'B';
    html += ' <span class="enc-size-pct">(' + pct.toFixed(1) + '%)</span>';
    if (total > MTU) html += ' <span class="enc-size-warn">⚠ Fragmentierung nötig!</span>';
    html += '</div></div>';
    return html;
  }

  // =============================================
  // RENDER: DETAIL PANEL (right)
  // =============================================
  function renderDetail() {
    var steps = buildSteps(getScenario());
    var idx = state.direction === 'decap' ? (4 - state.step) : state.step;
    var step = steps[idx];
    if (!step) return '';

    var html = '<div class="enc-detail">';
    html += '<div class="enc-section-label"><span class="enc-bar" style="background:' + step.color + '"></span>SCHRITT ' + (state.step + 1) + ' DETAILS</div>';

    // Explanation
    html += '<div class="enc-explain">';
    html += '<div class="enc-explain-q">Was passiert hier?</div>';
    html += '<div class="enc-explain-a">' + esc(step.explanation) + '</div>';
    html += '</div>';

    // Header fields
    html += '<div class="enc-fields-box" style="border-color:' + step.color + '44">';
    html += '<div class="enc-fields-title" style="color:' + step.color + '">' + esc(step.headerLabel) + '</div>';
    step.headerFields.forEach(function (f) {
      html += '<div class="enc-field-row">';
      html += '<span class="enc-field-key">' + esc(f.k) + ':</span>';
      html += '<span class="enc-field-val">' + esc(f.v) + '</span>';
      html += '</div>';
    });
    html += '</div>';

    // Payload preview for step 0
    if (step.payload) {
      html += '<div class="enc-payload-preview">';
      html += '<div class="enc-payload-title">Payload</div>';
      html += '<pre class="enc-payload-code">' + esc(step.payload) + '</pre>';
      html += '</div>';
    }

    // Size summary
    html += '<div class="enc-size-summary">';
    html += '<div class="enc-size-summary-title">Größe bisher:</div>';
    var parts = [];
    step.sizes.forEach(function (seg) {
      parts.push('<span style="color:' + seg.color + '">' + esc(seg.label) + ': ' + seg.size + 'B</span>');
    });
    html += parts.join(' + ') + ' = <strong>' + step.totalSize + ' Bytes</strong>';
    if (step.totalSize < MTU) {
      html += '<br><span class="enc-size-note">(Maximum: ' + MTU + ' Bytes MTU, danach Fragmentierung)</span>';
    }
    html += '</div>';

    html += '</div>';
    return html;
  }

  // =============================================
  // RENDER: CONTROLS
  // =============================================
  function renderControls() {
    var steps = buildSteps(getScenario());
    var max = 5;
    var cur = state.step + 1;
    var dirLabel = state.direction === 'encap' ? 'ENCAPSULATION' : 'DE-ENCAPSULATION';

    var html = '<div class="enc-controls-section">';
    html += '<div class="enc-dir-label">' + dirLabel + '</div>';
    html += '<div class="enc-controls">';
    html += '<button class="enc-ctrl-btn" id="enc-prev"' + (state.step <= 0 ? ' disabled' : '') + '>◀ Zurück</button>';
    html += '<span class="enc-ctrl-step">Schritt ' + cur + ' / ' + max + '</span>';
    html += '<button class="enc-ctrl-btn" id="enc-next"' + (state.step >= 4 ? ' disabled' : '') + '>▶ Weiter</button>';
    html += '<button class="enc-ctrl-btn enc-ctrl-auto" id="enc-auto">' + (state.autoPlaying ? '⏸ Pause' : '▶▶ Auto-Play') + '</button>';
    html += '<button class="enc-ctrl-btn enc-ctrl-reset" id="enc-reset">↺ Reset</button>';
    html += '</div>';

    // Direction toggle
    html += '<div class="enc-dir-toggle">';
    html += '<span class="enc-dir-label2">Richtung:</span>';
    html += '<select class="enc-dir-select" id="enc-direction">';
    html += '<option value="encap"' + (state.direction === 'encap' ? ' selected' : '') + '>📦 Encapsulation (7→1)</option>';
    html += '<option value="decap"' + (state.direction === 'decap' ? ' selected' : '') + '>📨 De-Encapsulation (1→7)</option>';
    html += '</select>';
    html += '</div>';

    // Scenarios
    html += '<div class="enc-scenarios">';
    html += '<span class="enc-scenarios-label">Szenarien:</span>';
    Object.keys(SCENARIOS).forEach(function (k) {
      var cls = state.scenario === k && !state.custom ? ' enc-scenario-active' : '';
      html += '<button class="enc-scenario-btn' + cls + '" data-scenario="' + k + '">' + esc(SCENARIOS[k].label) + '</button>';
    });
    html += '</div>';

    html += '</div>';
    return html;
  }

  // =============================================
  // RENDER: INTERACTIVE MODE
  // =============================================
  function renderInteractive() {
    var sc = getScenario();
    var html = '<div class="enc-section-box">';
    html += '<div class="enc-toggle" id="enc-interactive-toggle">🎮 Eigene Daten senden ' + (state.interactiveOpen ? '▴' : '▾') + '</div>';
    if (state.interactiveOpen) {
      html += '<div class="enc-interactive-body">';
      html += '<div class="enc-int-row"><span class="enc-int-label">Payload:</span><textarea class="enc-int-input enc-int-textarea" id="enc-int-payload" rows="2">' + esc(sc.payload) + '</textarea></div>';
      html += '<div class="enc-int-grid">';
      html += '<div class="enc-int-row"><span class="enc-int-label">Src IP:</span><input class="enc-int-input" id="enc-int-srcip" value="' + esc(sc.srcIP) + '"></div>';
      html += '<div class="enc-int-row"><span class="enc-int-label">Dst IP:</span><input class="enc-int-input" id="enc-int-dstip" value="' + esc(sc.dstIP) + '"></div>';
      html += '<div class="enc-int-row"><span class="enc-int-label">Src Port:</span><input class="enc-int-input" id="enc-int-srcport" value="' + (sc.srcPort || '') + '"></div>';
      html += '<div class="enc-int-row"><span class="enc-int-label">Dst Port:</span><input class="enc-int-input" id="enc-int-dstport" value="' + (sc.dstPort || '') + '"></div>';
      html += '<div class="enc-int-row"><span class="enc-int-label">Src MAC:</span><input class="enc-int-input" id="enc-int-srcmac" value="' + esc(sc.srcMAC) + '"></div>';
      html += '<div class="enc-int-row"><span class="enc-int-label">Dst MAC:</span><input class="enc-int-input" id="enc-int-dstmac" value="' + esc(sc.dstMAC) + '"></div>';
      html += '</div>';
      html += '<button class="enc-int-apply" id="enc-int-apply">Übernehmen</button>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  // =============================================
  // RENDER: HOP VISUALIZATION
  // =============================================
  function renderHop() {
    var sc = getScenario();
    var html = '<div class="enc-section-box">';
    html += '<div class="enc-toggle" id="enc-hop-toggle">🔄 Was passiert an jedem Hop? ' + (state.hopOpen ? '▴' : '▾') + '</div>';
    if (state.hopOpen) {
      html += '<div class="enc-hop-body">';
      html += '<div class="enc-hop-chain">';
      html += '<div class="enc-hop-node"><div class="enc-hop-icon">💻</div><div class="enc-hop-name">PC</div><div class="enc-hop-ip">' + esc(sc.srcIP) + '</div></div>';
      html += '<div class="enc-hop-arrow">──▶</div>';
      html += '<div class="enc-hop-node"><div class="enc-hop-icon">📡</div><div class="enc-hop-name">Router</div><div class="enc-hop-ip">192.168.0.1</div></div>';
      html += '<div class="enc-hop-arrow">──▶</div>';
      html += '<div class="enc-hop-node"><div class="enc-hop-icon">🖥</div><div class="enc-hop-name">Ziel</div><div class="enc-hop-ip">' + esc(sc.dstIP) + '</div></div>';
      html += '</div>';
      html += '<div class="enc-hop-steps">';
      html += '<div class="enc-hop-step-title">Am Router:</div>';
      html += '<div class="enc-hop-step"><span style="color:#fb923c">1.</span> Frame empfangen → Layer 2: MAC prüfen, FCS prüfen, Frame-Header <strong>ENTFERNEN</strong></div>';
      html += '<div class="enc-hop-step"><span style="color:#00d4aa">2.</span> IP-Paket extrahieren → Layer 3: Destination IP lesen, Routing-Tabelle prüfen</div>';
      html += '<div class="enc-hop-step"><span style="color:#fb923c">3.</span> Neuen Frame bauen → Layer 2: <strong>NEUE</strong> Src/Dst MAC für den nächsten Hop</div>';
      html += '<div class="enc-hop-step"><span style="color:#ef4444">4.</span> Auf dem richtigen Interface senden → Layer 1</div>';
      html += '</div>';
      html += '<div class="enc-hop-note">';
      html += 'Die <strong>IP-Adressen BLEIBEN gleich</strong> (Ende-zu-Ende).<br>';
      html += 'Die <strong>MAC-Adressen ÄNDERN sich</strong> bei jedem Hop.';
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  // =============================================
  // RENDER: HOMELAB PANEL
  // =============================================
  function renderHomelab() {
    var html = '<div class="enc-section-box enc-homelab">';
    html += '<div class="enc-section-label"><span class="enc-bar" style="background:#4fffb0"></span>DEIN HOMELAB</div>';
    html += '<div class="enc-homelab-text">';
    html += 'Wenn du im Browser <strong>https://192.168.0.200:8006</strong> eingibst, passiert <strong>GENAU</strong> das was du hier siehst:';
    html += '<ol class="enc-homelab-list">';
    html += '<li><span style="color:#4fffb0">Browser</span> baut HTTP Request (Layer 7)</li>';
    html += '<li><span style="color:#7b61ff">TLS</span> verschlüsselt ihn (Layer 6)</li>';
    html += '<li><span style="color:#4db8ff">TCP</span> verpackt ihn mit Port 8006 (Layer 4)</li>';
    html += '<li><span style="color:#00d4aa">IP</span> adressiert an 192.168.0.200 (Layer 3)</li>';
    html += '<li><span style="color:#fb923c">Ethernet</span> Frame mit der MAC von Proxmox (Layer 2)</li>';
    html += '<li><span style="color:#ef4444">Bits</span> über dein CAT6-Kabel zum Router (Layer 1)</li>';
    html += '</ol>';
    html += '<div class="enc-homelab-note">Da du im gleichen Subnetz bist (192.168.0.0/24), geht das Paket direkt über den Switch — kein Router-Hop nötig. Die Dst-MAC ist direkt die von Proxmox (via ARP aufgelöst).</div>';
    html += '</div></div>';
    return html;
  }

  // =============================================
  // FULL RENDER
  // =============================================
  function renderAll() {
    var main = $('enc-main');
    if (!main) return;

    var html = '<div class="enc-layout">';
    html += renderTower();
    html += '<div class="enc-content">';
    html += renderControls();
    html += renderPacket();
    html += renderDetail();
    html += renderInteractive();
    html += renderHop();
    html += renderHomelab();
    html += '</div>';
    html += '</div>';
    main.innerHTML = html;
  }

  // =============================================
  // EVENTS
  // =============================================
  function bindEvents() {
    var main = $('enc-main');
    if (!main) return;

    main.addEventListener('click', function (e) {
      var t = e.target;

      if (t.id === 'enc-prev') { goStep(state.step - 1); return; }
      if (t.id === 'enc-next') { goStep(state.step + 1); return; }
      if (t.id === 'enc-reset') { resetAll(); return; }
      if (t.id === 'enc-auto') { toggleAutoPlay(); return; }

      if (t.classList.contains('enc-scenario-btn')) {
        state.scenario = t.dataset.scenario;
        state.custom = null;
        state.step = 0;
        stopAutoPlay();
        renderAll();
        return;
      }

      if (t.id === 'enc-interactive-toggle') {
        state.interactiveOpen = !state.interactiveOpen;
        renderAll();
        return;
      }

      if (t.id === 'enc-hop-toggle') {
        state.hopOpen = !state.hopOpen;
        renderAll();
        return;
      }

      if (t.id === 'enc-int-apply') {
        applyCustom();
        return;
      }
    });

    main.addEventListener('change', function (e) {
      if (e.target.id === 'enc-direction') {
        state.direction = e.target.value;
        state.step = 0;
        stopAutoPlay();
        renderAll();
      }
    });
  }

  function applyCustom() {
    var base = SCENARIOS[state.scenario];
    var payload = ($('enc-int-payload') || {}).value || base.payload;
    var srcIP = ($('enc-int-srcip') || {}).value || base.srcIP;
    var dstIP = ($('enc-int-dstip') || {}).value || base.dstIP;
    var srcPort = parseInt(($('enc-int-srcport') || {}).value) || base.srcPort;
    var dstPort = parseInt(($('enc-int-dstport') || {}).value) || base.dstPort;
    var srcMAC = ($('enc-int-srcmac') || {}).value || base.srcMAC;
    var dstMAC = ($('enc-int-dstmac') || {}).value || base.dstMAC;
    var payloadSize = new Blob([payload]).size;

    state.custom = {
      label: 'Custom',
      payload: payload,
      protocol: base.protocol,
      protoNum: base.protoNum,
      srcIP: srcIP, dstIP: dstIP,
      srcPort: srcPort, dstPort: dstPort,
      srcMAC: srcMAC, dstMAC: dstMAC,
      payloadSize: payloadSize
    };
    state.step = 0;
    renderAll();
  }

  function goStep(n) {
    n = Math.max(0, Math.min(4, n));
    state.step = n;
    renderAll();
  }

  function resetAll() {
    stopAutoPlay();
    state.step = 0;
    renderAll();
  }

  function toggleAutoPlay() {
    if (state.autoPlaying) {
      stopAutoPlay();
      renderAll();
    } else {
      state.autoPlaying = true;
      renderAll();
      autoStep();
    }
  }

  function autoStep() {
    if (!state.autoPlaying) return;
    if (state.step >= 4) { stopAutoPlay(); renderAll(); return; }
    state.autoTimer = setTimeout(function () {
      goStep(state.step + 1);
      autoStep();
    }, 2000);
  }

  function stopAutoPlay() {
    state.autoPlaying = false;
    if (state.autoTimer) { clearTimeout(state.autoTimer); state.autoTimer = null; }
  }

  // =============================================
  // INIT
  // =============================================
  function init() {
    renderAll();
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
