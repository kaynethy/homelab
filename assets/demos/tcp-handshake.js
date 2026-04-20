/* === TCP HANDSHAKE SIMULATOR === */
(function () {
  'use strict';

  var GOLD = '#eab308';

  // =============================================
  // FLAG COLORS
  // =============================================
  var FLAG_COLORS = {
    SYN: '#4fffb0',
    ACK: '#4db8ff',
    'SYN-ACK': 'linear-gradient(90deg,#4fffb0,#4db8ff)',
    PSH: '#22d3ee',
    'PSH-ACK': '#22d3ee',
    FIN: '#fb923c',
    'FIN-ACK': '#fb923c',
    RST: '#ef4444'
  };

  var STATE_COLORS = {
    CLOSED: '#5a6278',
    LISTEN: '#a78bfa',
    SYN_SENT: '#eab308',
    SYN_RCVD: '#eab308',
    ESTABLISHED: '#4fffb0',
    FIN_WAIT_1: '#fb923c',
    CLOSE_WAIT: '#fb923c',
    TIME_WAIT: '#fb923c'
  };

  // =============================================
  // STEP DATA FACTORY
  // =============================================
  function buildSteps(clientSeq, serverSeq, payload) {
    var cSeq = clientSeq;
    var sSeq = serverSeq;
    var pl = payload;
    return [
      {
        id: 0, dir: null, flags: [], seq: null, ack: null,
        clientState: 'CLOSED', serverState: 'LISTEN',
        label: 'Initialzustand',
        desc: 'Server lauscht auf Port 8006 (Proxmox Web-UI). Der Client hat noch keine Verbindung initiiert.',
        detail: null,
        wsFlags: '',
        clientSeqVal: '-', clientAckVal: '-', serverSeqVal: '-', serverAckVal: '-'
      },
      {
        id: 1, dir: 'right', flags: ['SYN'], seq: cSeq, ack: null,
        clientState: 'SYN_SENT', serverState: 'LISTEN',
        label: 'SYN',
        desc: 'Client sendet SYN mit seiner Initial Sequence Number (ISN). Das Flag signalisiert: "Ich möchte eine Verbindung aufbauen."',
        detail: {
          srcPort: 54321, dstPort: 8006, seq: cSeq, ack: '-',
          flags: ['SYN'], win: 64240, opts: 'MSS=1460, SACK Permitted, WScale=7'
        },
        transition: { side: 'Client', from: 'CLOSED', to: 'SYN_SENT' },
        wsFlags: '[SYN]',
        clientSeqVal: cSeq, clientAckVal: '-', serverSeqVal: '-', serverAckVal: '-',
        seqNote: 'ISN zufällig gewählt'
      },
      {
        id: 2, dir: 'left', flags: ['SYN', 'ACK'], seq: sSeq, ack: cSeq + 1,
        clientState: 'SYN_SENT', serverState: 'SYN_RCVD',
        label: 'SYN-ACK',
        desc: 'Server antwortet mit SYN-ACK:\n• SYN: Server will SEINERSEITS eine Verbindung (TCP ist bidirektional)\n• ACK: bestätigt Empfang des Client-SYN\n• Seq=' + sSeq + ': Server\'s eigene ISN\n• Ack=' + (cSeq + 1) + ': Client-Seq (' + cSeq + ') + 1 → "Sende als nächstes ab ' + (cSeq + 1) + '"',
        detail: {
          srcPort: 8006, dstPort: 54321, seq: sSeq, ack: cSeq + 1,
          flags: ['SYN', 'ACK'], win: 65535, opts: 'MSS=1460, SACK Permitted, WScale=7'
        },
        transition: { side: 'Server', from: 'LISTEN', to: 'SYN_RCVD' },
        wsFlags: '[SYN, ACK]',
        clientSeqVal: cSeq, clientAckVal: '-', serverSeqVal: sSeq, serverAckVal: cSeq + 1,
        seqNote: 'Ack = Client-Seq + 1'
      },
      {
        id: 3, dir: 'right', flags: ['ACK'], seq: cSeq + 1, ack: sSeq + 1,
        clientState: 'ESTABLISHED', serverState: 'ESTABLISHED',
        label: 'ACK',
        desc: '3-Way Handshake abgeschlossen! Client bestätigt Server-SYN:\n• Seq=' + (cSeq + 1) + ': nächste erwartete Byte-Nummer\n• Ack=' + (sSeq + 1) + ': Server-Seq (' + sSeq + ') + 1\n\nBeide Seiten sind jetzt ESTABLISHED — Daten können fließen.',
        detail: {
          srcPort: 54321, dstPort: 8006, seq: cSeq + 1, ack: sSeq + 1,
          flags: ['ACK'], win: 64240, opts: ''
        },
        transition: { side: 'Beide', from: 'SYN_SENT / SYN_RCVD', to: 'ESTABLISHED' },
        wsFlags: '[ACK]',
        clientSeqVal: cSeq + 1, clientAckVal: sSeq + 1, serverSeqVal: sSeq, serverAckVal: cSeq + 1,
        seqNote: 'Ack = Server-Seq + 1'
      },
      {
        id: 4, dir: 'right', flags: ['PSH', 'ACK'], seq: cSeq + 1, ack: sSeq + 1,
        clientState: 'ESTABLISHED', serverState: 'ESTABLISHED',
        label: 'PSH-ACK "GET /"',
        desc: 'Client sendet HTTP-Request als Payload (' + pl + ' Bytes):\n• PSH Flag: Daten sofort an Anwendung übergeben (nicht buffern)\n• Seq bleibt ' + (cSeq + 1) + ', wird nach Senden um ' + pl + ' erhöht → ' + (cSeq + 1 + pl) + '\n• Payload: GET / HTTP/1.1\\r\\nHost: 192.168.0.200:8006',
        detail: {
          srcPort: 54321, dstPort: 8006, seq: cSeq + 1, ack: sSeq + 1,
          flags: ['PSH', 'ACK'], win: 64240, opts: '', len: pl
        },
        transition: null,
        wsFlags: '[PSH, ACK]',
        clientSeqVal: (cSeq + 1) + '→' + (cSeq + 1 + pl), clientAckVal: sSeq + 1, serverSeqVal: sSeq + 1, serverAckVal: cSeq + 1,
        seqNote: 'Seq erhöht sich um Payload (' + pl + ')'
      },
      {
        id: 5, dir: 'left', flags: ['ACK'], seq: sSeq + 1, ack: cSeq + 1 + pl,
        clientState: 'ESTABLISHED', serverState: 'ESTABLISHED',
        label: 'ACK',
        desc: 'Server bestätigt Empfang der Daten:\n• Ack=' + (cSeq + 1 + pl) + ': Client-Seq (' + (cSeq + 1) + ') + Payload (' + pl + ')\n→ "Ich habe alle Bytes bis ' + (cSeq + pl) + ' erhalten"',
        detail: {
          srcPort: 8006, dstPort: 54321, seq: sSeq + 1, ack: cSeq + 1 + pl,
          flags: ['ACK'], win: 65535, opts: ''
        },
        transition: null,
        wsFlags: '[ACK]',
        clientSeqVal: cSeq + 1 + pl, clientAckVal: sSeq + 1, serverSeqVal: sSeq + 1, serverAckVal: cSeq + 1 + pl,
        seqNote: 'Ack = Seq + Payload-Länge'
      },
      {
        id: 6, dir: 'right', flags: ['FIN'], seq: cSeq + 1 + pl, ack: null,
        clientState: 'FIN_WAIT_1', serverState: 'CLOSE_WAIT',
        label: 'FIN',
        desc: 'Client will Verbindung beenden:\n• FIN Flag: "Ich habe keine Daten mehr zu senden"\n• Seq=' + (cSeq + 1 + pl) + ': letzte Seq nach Payload\n• FIN verbraucht 1 Sequence Number (wie SYN)',
        detail: {
          srcPort: 54321, dstPort: 8006, seq: cSeq + 1 + pl, ack: sSeq + 1,
          flags: ['FIN'], win: 64240, opts: ''
        },
        transition: { side: 'Client', from: 'ESTABLISHED', to: 'FIN_WAIT_1' },
        wsFlags: '[FIN]',
        clientSeqVal: cSeq + 1 + pl, clientAckVal: '-', serverSeqVal: sSeq + 1, serverAckVal: cSeq + 1 + pl,
        seqNote: 'FIN verbraucht 1 Seq'
      },
      {
        id: 7, dir: 'left', flags: ['FIN', 'ACK'], seq: sSeq + 1, ack: cSeq + 1 + pl + 1,
        clientState: 'TIME_WAIT', serverState: 'CLOSED',
        label: 'FIN-ACK',
        desc: 'Server bestätigt und schließt:\n• FIN: Server hat ebenfalls keine Daten mehr\n• ACK: bestätigt Client-FIN\n• Ack=' + (cSeq + 1 + pl + 1) + ': Client-Seq (' + (cSeq + 1 + pl) + ') + 1 (FIN verbraucht 1)\n\nClient geht in TIME_WAIT (wartet 2×MSL), Server schließt sofort.',
        detail: {
          srcPort: 8006, dstPort: 54321, seq: sSeq + 1, ack: cSeq + 1 + pl + 1,
          flags: ['FIN', 'ACK'], win: 65535, opts: ''
        },
        transition: { side: 'Server', from: 'CLOSE_WAIT', to: 'CLOSED' },
        wsFlags: '[FIN, ACK]',
        clientSeqVal: cSeq + 1 + pl, clientAckVal: '-', serverSeqVal: sSeq + 1, serverAckVal: cSeq + 1 + pl + 1,
        seqNote: 'Ack = FIN-Seq + 1'
      }
    ];
  }

  // =============================================
  // STATE
  // =============================================
  var state = {
    currentStep: 0,
    clientSeq: 100,
    serverSeq: 300,
    payload: 14,
    speed: 1,
    autoPlaying: false,
    autoTimer: null,
    steps: [],
    interactiveOpen: false,
    securityOpen: false,
    securityTab: 'flood',
    udpOpen: false,
    wiresharkOpen: false,
    floodRunning: false,
    floodTimer: null,
    floodCount: 0
  };

  function rebuildSteps() {
    state.steps = buildSteps(state.clientSeq, state.serverSeq, state.payload);
  }

  // =============================================
  // DOM HELPERS
  // =============================================
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function $(id) { return document.getElementById(id); }
  function formatNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  function flagBadge(flag) {
    var c = FLAG_COLORS[flag] || '#5a6278';
    if (c.indexOf('gradient') > -1) {
      return '<span class="tcp-flag-badge" style="background:' + c + ';color:#0d0f14">' + esc(flag) + '</span>';
    }
    return '<span class="tcp-flag-badge" style="background:' + c + '22;color:' + c + ';border-color:' + c + '44">' + esc(flag) + '</span>';
  }

  function stateBadge(st) {
    var c = STATE_COLORS[st] || '#5a6278';
    return '<span class="tcp-state-badge" style="background:' + c + '18;color:' + c + ';border-color:' + c + '44">' + esc(st) + '</span>';
  }

  // =============================================
  // SEQUENCE DIAGRAM
  // =============================================
  function renderSequenceDiagram() {
    var s = state.steps;
    var cur = state.currentStep;
    var html = '';

    html += '<div class="seq-diagram">';
    // Hosts
    html += '<div class="seq-hosts">';
    html += '<div class="seq-host seq-client" id="seq-client-box">';
    html += '<div class="seq-host-label">CLIENT</div>';
    html += '<div class="seq-host-ip">192.168.0.155</div>';
    html += '<div class="seq-host-state" id="seq-client-state">' + stateBadge(s[cur].clientState) + '</div>';
    html += '</div>';
    html += '<div class="seq-host seq-server" id="seq-server-box">';
    html += '<div class="seq-host-label">SERVER</div>';
    html += '<div class="seq-host-ip">192.168.0.200:8006</div>';
    html += '<div class="seq-host-state" id="seq-server-state">' + stateBadge(s[cur].serverState) + '</div>';
    html += '</div>';
    html += '</div>';

    // Timeline
    html += '<div class="seq-timeline">';
    html += '<div class="seq-line seq-line-left"></div>';
    html += '<div class="seq-line seq-line-right"></div>';

    for (var i = 1; i < s.length; i++) {
      var step = s[i];
      var active = i === cur;
      var visible = i <= cur;
      var past = i < cur;
      var dirClass = step.dir === 'right' ? 'seq-arrow-right' : 'seq-arrow-left';
      var visClass = visible ? (active ? ' seq-arrow-active' : ' seq-arrow-past') : ' seq-arrow-hidden';

      html += '<div class="seq-arrow-row ' + dirClass + visClass + '" data-step="' + i + '">';
      html += '<div class="seq-arrow-line">';
      html += '<div class="seq-arrow-label">';
      step.flags.forEach(function (f) { html += flagBadge(f); });
      var seqTxt = step.seq !== null ? ' Seq=' + step.seq : '';
      var ackTxt = step.ack !== null ? ' Ack=' + step.ack : '';
      html += '<span class="seq-arrow-nums">' + seqTxt + ackTxt + '</span>';
      html += '</div>';
      html += '<div class="seq-arrow-shaft"><div class="seq-arrow-tip"></div></div>';
      html += '</div>';
      html += '<div class="seq-step-num">Step ' + i + '</div>';
      html += '</div>';
    }

    // ESTABLISHED marker after step 3
    if (cur >= 3) {
      html += '<div class="seq-established-marker" style="grid-row:4">═══ VERBINDUNG STEHT ═══</div>';
    }

    html += '</div></div>';
    return html;
  }

  // =============================================
  // STEP TABLE
  // =============================================
  function renderStepTable() {
    var s = state.steps;
    var cur = state.currentStep;
    var html = '<div class="tcp-section">';
    html += '<div class="tcp-section-title"><span class="tcp-bar"></span>SCHRITT-TABELLE</div>';
    html += '<div class="step-table-wrap"><table class="step-table">';
    html += '<thead><tr><th>Step</th><th>→</th><th>Flags</th><th>Seq</th><th>Ack</th><th>Client</th><th>Server</th><th>Beschreibung</th></tr></thead><tbody>';
    for (var i = 0; i < s.length; i++) {
      var st = s[i];
      var cls = i === cur ? ' class="step-active"' : (i < cur ? ' class="step-past"' : '');
      var dir = st.dir === 'right' ? '→' : (st.dir === 'left' ? '←' : '—');
      var flags = st.flags.length ? st.flags.map(flagBadge).join(' ') : '—';
      var seq = st.seq !== null ? st.seq : '—';
      var ack = st.ack !== null ? st.ack : '—';
      html += '<tr' + cls + '><td>' + i + '</td><td>' + dir + '</td><td>' + flags + '</td><td>' + seq + '</td><td>' + ack + '</td>';
      html += '<td>' + stateBadge(st.clientState) + '</td><td>' + stateBadge(st.serverState) + '</td>';
      html += '<td class="step-desc-cell">' + esc(st.label) + '</td></tr>';
    }
    html += '</tbody></table></div></div>';
    return html;
  }

  // =============================================
  // DETAIL PANEL
  // =============================================
  function renderDetailPanel() {
    var s = state.steps[state.currentStep];
    var html = '<div class="tcp-section">';
    html += '<div class="tcp-section-title"><span class="tcp-bar"></span>SCHRITT ' + s.id + ': ' + esc(s.label) + '</div>';

    // Description
    html += '<div class="detail-desc">' + esc(s.desc).replace(/\n/g, '<br>') + '</div>';

    // TCP Header
    if (s.detail) {
      var d = s.detail;
      html += '<div class="tcp-header-box">';
      html += '<div class="tcp-header-title">┌─ TCP HEADER ─────────────────────────────────┐</div>';
      html += '<div class="tcp-header-row">│ Src Port:    ' + pad(d.srcPort, 11) + 'Dst Port: ' + pad(d.dstPort, 6) + '│</div>';
      html += '<div class="tcp-header-row">│ Seq Number:  ' + pad(d.seq, 34) + '│</div>';
      html += '<div class="tcp-header-row">│ Ack Number:  ' + pad(d.ack, 34) + '│</div>';
      html += '<div class="tcp-header-row">│ Flags:       ' + d.flags.map(flagBadge).join(' ') + padHtml(d.flags, 34) + '│</div>';
      html += '<div class="tcp-header-row">│ Window Size: ' + pad(d.win, 34) + '│</div>';
      if (d.len !== undefined) html += '<div class="tcp-header-row">│ Payload:     ' + pad(d.len + ' Bytes', 34) + '│</div>';
      if (d.opts) html += '<div class="tcp-header-row">│ Options:     ' + pad(d.opts, 34) + '│</div>';
      html += '<div class="tcp-header-title">└──────────────────────────────────────────────┘</div>';
      html += '</div>';
    }

    // Transition
    if (s.transition) {
      html += '<div class="detail-transition">';
      html += 'State-Übergang: <strong>' + esc(s.transition.side) + '</strong>: ';
      html += stateBadge(s.transition.from) + ' ──→ ' + stateBadge(s.transition.to);
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function pad(val, w) {
    var s = String(val);
    var need = Math.max(0, w - s.length);
    return esc(s) + new Array(need + 1).join(' ');
  }

  function padHtml(flags, w) {
    var textLen = flags.join(' ').length + (flags.length > 1 ? flags.length + 2 : 2);
    var need = Math.max(0, w - textLen - 6);
    return '<span style="opacity:0">' + new Array(need + 1).join('.') + '</span>';
  }

  // =============================================
  // SEQ/ACK TRACKER
  // =============================================
  function renderSeqTracker() {
    var s = state.steps;
    var cur = state.currentStep;
    var html = '<div class="tcp-section">';
    html += '<div class="tcp-section-title"><span class="tcp-bar"></span>SEQ/ACK TRACKER</div>';
    html += '<div class="tracker-wrap"><table class="tracker-table">';
    html += '<thead><tr><th>Step</th><th colspan="2">Client</th><th colspan="2">Server</th></tr>';
    html += '<tr class="tracker-sub"><th></th><th>Seq</th><th>Ack</th><th>Seq</th><th>Ack</th></tr></thead>';
    html += '<tbody>';
    for (var i = 1; i < s.length; i++) {
      var st = s[i];
      var cls = i === cur ? ' class="tracker-active"' : (i > cur ? ' class="tracker-future"' : '');
      html += '<tr' + cls + ' title="' + esc(st.seqNote || '') + '">';
      html += '<td>' + i + ' ' + st.flags.join(',') + '</td>';
      html += '<td>' + st.clientSeqVal + '</td><td>' + st.clientAckVal + '</td>';
      html += '<td>' + st.serverSeqVal + '</td><td>' + st.serverAckVal + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';
    return html;
  }

  // =============================================
  // WIRESHARK VIEW
  // =============================================
  function renderWireshark() {
    var s = state.steps;
    var cur = state.currentStep;
    var html = '<div class="tcp-section">';
    html += '<div class="tcp-toggle" id="ws-toggle">🦈 So sieht\'s in Wireshark aus ' + (state.wiresharkOpen ? '▴' : '▾') + '</div>';
    if (state.wiresharkOpen) {
      html += '<div class="ws-body">';
      html += '<div class="ws-table-wrap"><table class="ws-table">';
      html += '<thead><tr><th>No.</th><th>Time</th><th>Source</th><th>Destination</th><th>Protocol</th><th>Len</th><th>Info</th></tr></thead><tbody>';
      for (var i = 1; i < s.length; i++) {
        var st = s[i];
        var d = st.detail;
        if (!d) continue;
        var cls = i === cur ? ' class="ws-active"' : (i > cur ? ' class="ws-future"' : '');
        var src = st.dir === 'right' ? '192.168.0.155' : '192.168.0.200';
        var dst = st.dir === 'right' ? '192.168.0.200' : '192.168.0.155';
        var time = (0.001 * (i - 1)).toFixed(3);
        var len = d.len ? 54 + d.len : (st.flags.indexOf('SYN') > -1 ? 66 : 54);
        var info = d.srcPort + ' → ' + d.dstPort + ' ' + st.wsFlags;
        if (d.seq !== '-') info += ' Seq=' + d.seq;
        if (d.ack !== '-') info += ' Ack=' + d.ack;
        info += ' Win=' + d.win;
        if (d.len) info += ' Len=' + d.len;
        else info += ' Len=0';
        if (d.opts) info += ' ' + d.opts.split(',')[0];
        html += '<tr' + cls + '><td>' + i + '</td><td>' + time + '</td><td>' + esc(src) + '</td><td>' + esc(dst) + '</td><td>TCP</td><td>' + len + '</td><td>' + esc(info) + '</td></tr>';
      }
      html += '</tbody></table></div>';
      html += '<div class="ws-hint">💡 Selbst ausprobieren: <code>sudo tcpdump -i eth0 port 8006 -nn</code> auf dem Jumphost<br>oder Wireshark auf Windows mit Filter: <code>tcp.port == 8006</code></div>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  // =============================================
  // HOMELAB PANEL
  // =============================================
  function renderHomelabPanel() {
    var html = '<div class="tcp-section homelab-panel">';
    html += '<div class="tcp-section-title"><span class="tcp-bar" style="background:#4fffb0"></span>DEIN HOMELAB</div>';
    html += '<div class="homelab-content">';
    html += '<p>Jede Verbindung zu deiner Proxmox Web-UI (<code>192.168.0.200:8006</code>) startet mit genau diesem Handshake:</p>';
    html += '<ol>';
    html += '<li>PuTTY/Browser sendet <strong>SYN</strong> an Port 8006</li>';
    html += '<li>Proxmox antwortet <strong>SYN-ACK</strong></li>';
    html += '<li>Browser sendet <strong>ACK</strong> → Verbindung steht</li>';
    html += '<li>TLS Handshake beginnt (darüber)</li>';
    html += '<li>HTTP GET /api2/json → Proxmox Web-UI lädt</li>';
    html += '</ol>';
    html += '<div class="homelab-firewall">';
    html += '<strong>Deine OPNsense Firewall (geplant) trackt den State:</strong>';
    html += '<ul>';
    html += '<li>SYN ohne vorherige Verbindung? → prüfen ob Regel erlaubt</li>';
    html += '<li>ACK ohne vorheriges SYN? → <span style="color:#ef4444">INVALID → droppen</span> (Stateful!)</li>';
    html += '<li>FIN ohne ESTABLISHED? → <span style="color:#fb923c">verdächtig → loggen</span></li>';
    html += '</ul>';
    html += '</div></div></div>';
    return html;
  }

  // =============================================
  // UDP COMPARISON
  // =============================================
  function renderUdpComparison() {
    var html = '<div class="tcp-section">';
    html += '<div class="tcp-toggle" id="udp-toggle">Vergleich: Wie sähe das mit UDP aus? ' + (state.udpOpen ? '▴' : '▾') + '</div>';
    if (state.udpOpen) {
      html += '<div class="udp-body">';
      html += '<div class="udp-cols">';

      // TCP
      html += '<div class="udp-col">';
      html += '<div class="udp-col-title" style="color:#22d3ee">TCP</div>';
      html += '<div class="udp-steps">';
      html += '<div class="udp-step">Client → <span style="color:#4fffb0">SYN</span> → Server</div>';
      html += '<div class="udp-step">Client ← <span style="color:#4db8ff">SYN-ACK</span> ← Server</div>';
      html += '<div class="udp-step">Client → <span style="color:#4db8ff">ACK</span> → Server</div>';
      html += '<div class="udp-step">Client → <span style="color:#22d3ee">Daten</span> → Server</div>';
      html += '<div class="udp-step">Client ← <span style="color:#4db8ff">ACK</span> ← Server</div>';
      html += '<div class="udp-step">Client → <span style="color:#fb923c">FIN</span> → Server</div>';
      html += '<div class="udp-step">Client ← <span style="color:#fb923c">FIN-ACK</span> ← Server</div>';
      html += '</div>';
      html += '<div class="udp-stats">';
      html += '<div>7 Pakete, zuverlässig</div>';
      html += '<div>Connection-oriented</div>';
      html += '<div>~150ms für Verbindungsaufbau</div>';
      html += '</div></div>';

      // UDP
      html += '<div class="udp-col">';
      html += '<div class="udp-col-title" style="color:#eab308">UDP</div>';
      html += '<div class="udp-steps">';
      html += '<div class="udp-step udp-single">Client → <span style="color:#eab308">Daten</span> → Server</div>';
      html += '<div class="udp-step udp-done" style="color:var(--muted)">(fertig. Kein Handshake.)</div>';
      html += '</div>';
      html += '<div class="udp-stats">';
      html += '<div>1 Paket, best effort</div>';
      html += '<div>Connectionless</div>';
      html += '<div>0ms Overhead</div>';
      html += '</div></div>';

      html += '</div>';
      html += '<div class="udp-hint">→ Deshalb nutzt DNS standardmäßig UDP (kurze Anfrage, schnelle Antwort) und HTTP nutzt TCP (zuverlässige Datenübertragung nötig).</div>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  // =============================================
  // SECURITY SCENARIOS
  // =============================================
  function renderSecurity() {
    var html = '<div class="tcp-section">';
    html += '<div class="tcp-toggle" id="sec-toggle">🔒 Angriffs-Szenarien ' + (state.securityOpen ? '▴' : '▾') + '</div>';
    if (state.securityOpen) {
      html += '<div class="sec-body">';

      // Tabs
      html += '<div class="sec-tabs">';
      ['flood', 'reset', 'hijack'].forEach(function (t) {
        var labels = { flood: 'SYN Flood', reset: 'TCP Reset', hijack: 'Session Hijacking' };
        var cls = state.securityTab === t ? ' sec-tab-active' : '';
        html += '<button class="sec-tab' + cls + '" data-sec="' + t + '">' + labels[t] + '</button>';
      });
      html += '</div>';

      if (state.securityTab === 'flood') {
        html += renderSynFlood();
      } else if (state.securityTab === 'reset') {
        html += renderTcpReset();
      } else {
        html += renderSessionHijack();
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderSynFlood() {
    var html = '<div class="sec-content">';
    html += '<div class="sec-desc"><strong>SYN Flood Attack</strong><br>';
    html += 'Angreifer sendet tausende SYN-Pakete mit gefälschten Source-IPs. Der Server erstellt für jedes SYN einen halb-offenen Eintrag in der State-Table und wartet vergeblich auf den abschließenden ACK.</div>';

    // Flood visualization
    html += '<div class="flood-viz" id="flood-viz">';
    html += '<div class="flood-server" id="flood-server">';
    html += '<div class="flood-server-label">SERVER</div>';
    html += '<div class="flood-counter" id="flood-counter">SYN_RECEIVED: ' + state.floodCount + ' / 1024</div>';
    html += '<div class="flood-bar"><div class="flood-bar-fill" id="flood-bar-fill" style="width:' + ((state.floodCount / 1024) * 100) + '%"></div></div>';
    html += '</div>';
    html += '<div class="flood-arrows" id="flood-arrows"></div>';
    html += '</div>';

    html += '<div class="sec-btns">';
    if (state.floodRunning) {
      html += '<button class="sec-btn sec-btn-stop" id="flood-stop">⏹ Stopp</button>';
    } else {
      html += '<button class="sec-btn sec-btn-start" id="flood-start">▶ SYN Flood simulieren</button>';
    }
    html += '</div>';

    html += '<div class="sec-fix"><strong>Gegenmaßnahmen:</strong><ul>';
    html += '<li><span style="color:#4fffb0">SYN Cookies</span> — Server speichert keinen State, codiert Info im ISN</li>';
    html += '<li><span style="color:#4db8ff">Rate Limiting</span> — max. SYN/s pro Source-IP begrenzen</li>';
    html += '<li><span style="color:#a78bfa">Connection Limits</span> — max. halb-offene Verbindungen pro IP</li>';
    html += '</ul></div>';
    html += '</div>';
    return html;
  }

  function renderTcpReset() {
    var html = '<div class="sec-content">';
    html += '<div class="sec-desc"><strong>TCP Reset Attack</strong><br>';
    html += 'Angreifer sendet ein RST-Paket mit korrekter Sequence Number an einen der Hosts. Die Verbindung wird sofort abgebrochen. Beide Seiten gehen auf CLOSED.</div>';
    html += '<div class="sec-diagram">';
    html += '<div class="sec-diag-row"><span class="sec-diag-label">Client</span><span class="sec-diag-arrow" style="color:#4fffb0">───── ESTABLISHED ─────</span><span class="sec-diag-label">Server</span></div>';
    html += '<div class="sec-diag-row"><span class="sec-diag-label"></span><span class="sec-diag-arrow" style="color:#ef4444">← RST (Seq=forged) ← ANGREIFER</span></div>';
    html += '<div class="sec-diag-row"><span class="sec-diag-label">' + stateBadge('CLOSED') + '</span><span class="sec-diag-arrow" style="color:#ef4444">── Verbindung abgebrochen ──</span><span class="sec-diag-label">' + stateBadge('CLOSED') + '</span></div>';
    html += '</div>';
    html += '<div class="sec-fix"><strong>Gegenmaßnahme:</strong><ul>';
    html += '<li><span style="color:#4fffb0">TLS</span> — Angreifer kennt zwar die Seq, kann aber den verschlüsselten Stream nicht manipulieren</li>';
    html += '<li><span style="color:#4db8ff">TCP-MD5</span> — Signiert TCP-Segmente (v.a. bei BGP)</li>';
    html += '</ul></div>';
    html += '</div>';
    return html;
  }

  function renderSessionHijack() {
    var html = '<div class="sec-content">';
    html += '<div class="sec-desc"><strong>Session Hijacking</strong><br>';
    html += 'Angreifer snifft die Seq/Ack-Nummern einer aktiven Verbindung und injiziert eigene Pakete mit den gestohlenen Nummern. Der Server akzeptiert sie als legitim.</div>';
    html += '<div class="sec-diagram">';
    html += '<div class="sec-diag-row"><span class="sec-diag-label">Client</span><span class="sec-diag-arrow" style="color:#4fffb0">───── ESTABLISHED ─────</span><span class="sec-diag-label">Server</span></div>';
    html += '<div class="sec-diag-row sec-diag-sniff"><span class="sec-diag-label"></span><span class="sec-diag-arrow" style="color:#a78bfa">👁 Angreifer snifft Seq/Ack</span></div>';
    html += '<div class="sec-diag-row"><span class="sec-diag-label"></span><span class="sec-diag-arrow" style="color:#ef4444">→ PSH-ACK (Seq=gestohlen) → Server</span></div>';
    html += '<div class="sec-diag-row"><span class="sec-diag-label"></span><span class="sec-diag-arrow" style="color:#ef4444">ANGREIFER injiziert Befehle!</span></div>';
    html += '</div>';
    html += '<div class="sec-fix"><strong>Gegenmaßnahmen:</strong><ul>';
    html += '<li><span style="color:#4fffb0">TLS</span> — Payload verschlüsselt, Angreifer kann nichts Sinnvolles injizieren</li>';
    html += '<li><span style="color:#4db8ff">Randomisierte ISN</span> — Seq schwer vorhersagbar (modern: RFC 6528)</li>';
    html += '<li><span style="color:#a78bfa">Encrypted Protocols</span> — SSH, HTTPS statt Telnet, HTTP</li>';
    html += '</ul></div>';
    html += '</div>';
    return html;
  }

  // =============================================
  // CONTROLS
  // =============================================
  function renderControls() {
    var s = state.steps;
    var cur = state.currentStep;
    var max = s.length - 1;

    var html = '<div class="tcp-controls">';
    html += '<button class="ctrl-btn" id="ctrl-prev" ' + (cur <= 0 ? 'disabled' : '') + '>◀ Zurück</button>';
    html += '<span class="ctrl-step">Schritt ' + cur + ' / ' + max + '</span>';
    html += '<button class="ctrl-btn" id="ctrl-next" ' + (cur >= max ? 'disabled' : '') + '>▶ Weiter</button>';
    html += '<button class="ctrl-btn ctrl-auto" id="ctrl-auto">' + (state.autoPlaying ? '⏸ Pause' : '▶▶ Auto-Play 🔄') + '</button>';
    html += '<button class="ctrl-btn ctrl-reset" id="ctrl-reset">↺ Reset</button>';
    html += '</div>';

    html += '<div class="tcp-speed">';
    html += '<span class="speed-label">Geschwindigkeit:</span>';
    [0.5, 1, 2].forEach(function (sp) {
      var cls = state.speed === sp ? ' speed-active' : '';
      var icon = sp === 0.5 ? '🐢 ' : (sp === 2 ? '🐇 ' : '');
      html += '<button class="speed-btn' + cls + '" data-speed="' + sp + '">' + icon + sp + 'x</button>';
    });
    html += '</div>';
    return html;
  }

  // =============================================
  // INTERACTIVE MODE
  // =============================================
  function renderInteractive() {
    var html = '<div class="tcp-interactive">';
    html += '<div class="tcp-toggle" id="interactive-toggle">🎮 Interaktiv: eigene Seq/Ack ' + (state.interactiveOpen ? '▴' : '▾') + '</div>';
    if (state.interactiveOpen) {
      html += '<div class="interactive-body">';
      html += '<div class="interactive-row">';
      html += '<label class="interactive-label">CLIENT Initial Seq:<input type="number" class="interactive-input" id="int-cseq" value="' + state.clientSeq + '" min="0" max="4294967295"></label>';
      html += '<label class="interactive-label">SERVER Initial Seq:<input type="number" class="interactive-input" id="int-sseq" value="' + state.serverSeq + '" min="0" max="4294967295"></label>';
      html += '<label class="interactive-label">Payload:<input type="number" class="interactive-input interactive-input-sm" id="int-payload" value="' + state.payload + '" min="1" max="65535"> Bytes</label>';
      html += '</div></div>';
    }
    html += '</div>';
    return html;
  }

  // =============================================
  // FULL RENDER
  // =============================================
  function renderAll() {
    var main = $('tcp-main');
    if (!main) return;

    var html = '';
    html += renderInteractive();
    html += renderSequenceDiagram();
    html += renderControls();
    html += renderStepTable();
    html += renderDetailPanel();
    html += renderSeqTracker();
    html += renderWireshark();
    html += renderSecurity();
    html += renderUdpComparison();
    html += renderHomelabPanel();
    main.innerHTML = html;
  }

  // =============================================
  // EVENTS
  // =============================================
  function bindEvents() {
    var main = $('tcp-main');
    if (!main) return;

    main.addEventListener('click', function (e) {
      var t = e.target;

      // Nav
      if (t.id === 'ctrl-prev') { goStep(state.currentStep - 1); return; }
      if (t.id === 'ctrl-next') { goStep(state.currentStep + 1); return; }
      if (t.id === 'ctrl-reset') { resetAll(); return; }
      if (t.id === 'ctrl-auto') { toggleAutoPlay(); return; }

      // Speed
      if (t.dataset && t.dataset.speed) {
        state.speed = parseFloat(t.dataset.speed);
        renderAll();
        return;
      }

      // Toggles
      if (t.id === 'interactive-toggle') { state.interactiveOpen = !state.interactiveOpen; renderAll(); return; }
      if (t.id === 'ws-toggle') { state.wiresharkOpen = !state.wiresharkOpen; renderAll(); return; }
      if (t.id === 'sec-toggle') { state.securityOpen = !state.securityOpen; renderAll(); return; }
      if (t.id === 'udp-toggle') { state.udpOpen = !state.udpOpen; renderAll(); return; }

      // Security tabs
      if (t.dataset && t.dataset.sec) { state.securityTab = t.dataset.sec; stopFlood(); renderAll(); return; }

      // Flood
      if (t.id === 'flood-start') { startFlood(); return; }
      if (t.id === 'flood-stop') { stopFlood(); renderAll(); return; }
    });

    main.addEventListener('change', function (e) {
      if (e.target.id === 'int-cseq') {
        state.clientSeq = Math.max(0, parseInt(e.target.value, 10) || 0);
        rebuildAndRender();
      }
      if (e.target.id === 'int-sseq') {
        state.serverSeq = Math.max(0, parseInt(e.target.value, 10) || 0);
        rebuildAndRender();
      }
      if (e.target.id === 'int-payload') {
        state.payload = Math.max(1, parseInt(e.target.value, 10) || 1);
        rebuildAndRender();
      }
    });
  }

  function goStep(n) {
    var max = state.steps.length - 1;
    n = Math.max(0, Math.min(max, n));
    state.currentStep = n;
    renderAll();
    animateCurrentArrow();
  }

  function resetAll() {
    stopAutoPlay();
    stopFlood();
    state.currentStep = 0;
    renderAll();
  }

  function rebuildAndRender() {
    rebuildSteps();
    if (state.currentStep >= state.steps.length) state.currentStep = state.steps.length - 1;
    renderAll();
  }

  // =============================================
  // ANIMATION
  // =============================================
  function animateCurrentArrow() {
    var cur = state.currentStep;
    if (cur <= 0) return;
    var row = document.querySelector('.seq-arrow-row[data-step="' + cur + '"]');
    if (!row) return;
    row.classList.remove('seq-arrow-animate');
    void row.offsetWidth;
    row.classList.add('seq-arrow-animate');

    // Glow on receiver
    var step = state.steps[cur];
    var target = step.dir === 'right' ? 'seq-server-box' : 'seq-client-box';
    var box = document.getElementById(target);
    if (box) {
      box.classList.remove('seq-host-glow');
      void box.offsetWidth;
      box.classList.add('seq-host-glow');
    }
  }

  // =============================================
  // AUTO-PLAY
  // =============================================
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
    var max = state.steps.length - 1;
    if (state.currentStep >= max) {
      stopAutoPlay();
      renderAll();
      return;
    }
    var delay = 2000 / state.speed;
    state.autoTimer = setTimeout(function () {
      goStep(state.currentStep + 1);
      autoStep();
    }, delay);
  }

  function stopAutoPlay() {
    state.autoPlaying = false;
    if (state.autoTimer) { clearTimeout(state.autoTimer); state.autoTimer = null; }
  }

  // =============================================
  // SYN FLOOD SIMULATION
  // =============================================
  function startFlood() {
    state.floodRunning = true;
    state.floodCount = 0;
    renderAll();
    floodTick();
  }

  function floodTick() {
    if (!state.floodRunning) return;
    state.floodCount = Math.min(1024, state.floodCount + Math.floor(Math.random() * 15) + 5);

    var counter = $('flood-counter');
    var fill = $('flood-bar-fill');
    var arrows = $('flood-arrows');
    var server = $('flood-server');

    if (counter) counter.textContent = 'SYN_RECEIVED: ' + state.floodCount + ' / 1024 (State Table ' + Math.round((state.floodCount / 1024) * 100) + '% voll)';
    if (fill) fill.style.width = ((state.floodCount / 1024) * 100) + '%';

    if (arrows) {
      var ip3 = Math.floor(Math.random() * 254) + 1;
      var ip4 = Math.floor(Math.random() * 254) + 1;
      var arrow = document.createElement('div');
      arrow.className = 'flood-arrow';
      arrow.textContent = '10.0.3.' + ip3 + '.' + ip4 + ' → SYN';
      arrows.appendChild(arrow);
      setTimeout(function () { if (arrow.parentNode) arrow.parentNode.removeChild(arrow); }, 1500);
    }

    if (server && state.floodCount > 800) {
      server.classList.add('flood-server-red');
    }

    if (state.floodCount >= 1024) {
      state.floodRunning = false;
      renderAll();
      return;
    }
    state.floodTimer = setTimeout(floodTick, 120 / state.speed);
  }

  function stopFlood() {
    state.floodRunning = false;
    state.floodCount = 0;
    if (state.floodTimer) { clearTimeout(state.floodTimer); state.floodTimer = null; }
  }

  // =============================================
  // INIT
  // =============================================
  function init() {
    rebuildSteps();
    renderAll();
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
