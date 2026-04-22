/* === PORT SCANNER VISUALIZER — Logic === */
(function () {
  'use strict';

  // ============================================================
  // DATA
  // ============================================================
  var SCAN_TYPES = {
    syn: {
      id: 'syn', label: 'SYN Scan', flag: '-sS', nick: 'Stealth Scan',
      desc: 'Sendet SYN-Pakete. Offene Ports antworten mit SYN-ACK, geschlossene mit RST. Baut die Verbindung NICHT fertig auf — weniger Logs auf dem Ziel.',
      sent: 'SYN',
      responses: { open: 'SYN-ACK', closed: 'RST', filtered: '(timeout)' }
    },
    connect: {
      id: 'connect', label: 'Connect Scan', flag: '-sT', nick: 'Full Connect',
      desc: 'Vollständiger TCP-Handshake. Hinterlässt Einträge in auth.log und access.log. Einfacher zu erkennen, aber kein Root-Zugriff nötig.',
      sent: 'SYN',
      responses: { open: 'SYN-ACK + ACK + RST', closed: 'RST', filtered: '(timeout)' }
    },
    xmas: {
      id: 'xmas', label: 'XMAS Scan', flag: '-sX', nick: 'FIN+PSH+URG',
      desc: 'Setzt FIN, PSH und URG-Flags gleichzeitig. Offene Ports senden keine Antwort, geschlossene antworten mit RST. Ambiguität zwischen offen und gefiltert.',
      sent: 'FIN+PSH+URG',
      responses: { open: '(keine Antwort)', closed: 'RST', filtered: '(keine Antwort)' }
    },
    udp: {
      id: 'udp', label: 'UDP Scan', flag: '-sU', nick: 'UDP Probe',
      desc: 'Sendet leere UDP-Pakete. Offene Ports antworten oft nicht. Geschlossene Ports senden ICMP Port Unreachable. Langsam, aber findet UDP-Dienste.',
      sent: 'UDP',
      responses: { open: '(UDP-Antwort oder keine)', closed: 'ICMP Port Unreachable', filtered: '(timeout / ICMP filtered)' }
    },
    null: {
      id: 'null', label: 'NULL Scan', flag: '-sN', nick: 'No Flags',
      desc: 'Sendet Pakete ohne TCP-Flags. Offene Ports schweigen, geschlossene antworten mit RST. Gleiche Ambiguität wie XMAS bei gefilterten Ports.',
      sent: '(keine Flags)',
      responses: { open: '(keine Antwort)', closed: 'RST', filtered: '(keine Antwort)' }
    }
  };

  var PRESETS = {
    proxmox: {
      label: 'Proxmox Default', ip: '192.168.0.200',
      ports: [
        { port: 22, service: 'SSH', status: 'open' },
        { port: 80, service: 'HTTP', status: 'open' },
        { port: 443, service: 'HTTPS', status: 'closed' },
        { port: 3306, service: 'MySQL', status: 'closed' },
        { port: 8006, service: 'Proxmox UI', status: 'open' },
        { port: 8080, service: 'HTTP-Alt', status: 'filtered' }
      ],
      firewallActive: true,
      firewallDesc: 'Ports 22, 80, 8006 erlaubt. Rest: DROP'
    },
    webserver: {
      label: 'Webserver', ip: '192.168.0.100',
      ports: [
        { port: 22, service: 'SSH', status: 'open' },
        { port: 80, service: 'HTTP', status: 'open' },
        { port: 443, service: 'HTTPS', status: 'open' },
        { port: 8080, service: 'HTTP-Alt', status: 'open' },
        { port: 3306, service: 'MySQL', status: 'filtered' },
        { port: 6379, service: 'Redis', status: 'filtered' }
      ],
      firewallActive: true,
      firewallDesc: 'Ports 22, 80, 443, 8080 erlaubt. DB-Ports: DROP'
    },
    hardened: {
      label: 'Hardened SSH-Only', ip: '192.168.0.150',
      ports: [
        { port: 22, service: 'SSH', status: 'open' },
        { port: 80, service: 'HTTP', status: 'filtered' },
        { port: 443, service: 'HTTPS', status: 'filtered' },
        { port: 8006, service: 'Proxmox UI', status: 'filtered' }
      ],
      firewallActive: true,
      firewallDesc: 'Nur Port 22 erlaubt. Alles andere: DROP'
    },
    open: {
      label: 'Alles offen (unsicher!)', ip: '192.168.0.1',
      ports: [
        { port: 22, service: 'SSH', status: 'open' },
        { port: 23, service: 'Telnet', status: 'open' },
        { port: 80, service: 'HTTP', status: 'open' },
        { port: 443, service: 'HTTPS', status: 'open' },
        { port: 3306, service: 'MySQL', status: 'open' },
        { port: 8006, service: 'Proxmox UI', status: 'open' },
        { port: 27017, service: 'MongoDB', status: 'open' }
      ],
      firewallActive: false,
      firewallDesc: 'Keine Firewall aktiv'
    }
  };

  var PORT_STATUS_LABELS = { open: '🟢 Offen', closed: '⚫ Geschlossen', filtered: '🟡 Gefiltert' };
  var PORT_STATUS_COLORS = { open: '#4fffb0', closed: '#6b7280', filtered: '#fb923c' };

  // ============================================================
  // STATE
  // ============================================================
  var state = {
    ip: '192.168.0.200',
    ports: [],
    firewallActive: true,
    firewallDesc: '',
    scanType: 'syn',
    scanMode: 'sequential', // sequential | parallel
    speedMultiplier: 1,
    scanning: false,
    paused: false,
    scanResults: [],
    compareMode: false,
    openPacketDetail: null,
    currentScanIndex: -1,
    scanTimer: null
  };

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    applyPreset('proxmox');
    bindEvents();
    renderAll();
  }

  function applyPreset(key) {
    var p = PRESETS[key];
    if (!p) return;
    state.ip = p.ip;
    state.ports = p.ports.map(function(x) { return Object.assign({}, x); });
    state.firewallActive = p.firewallActive;
    state.firewallDesc = p.firewallDesc;
    resetScan();
    renderAll();
  }

  // ============================================================
  // EVENTS
  // ============================================================
  function bindEvents() {
    // Preset buttons
    document.querySelectorAll('[data-preset]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        applyPreset(this.dataset.preset);
        document.querySelectorAll('[data-preset]').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
      });
    });

    // Scan type buttons
    document.querySelectorAll('[data-scan-type]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.scanType = this.dataset.scanType;
        document.querySelectorAll('[data-scan-type]').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
        renderScanTypeDesc();
        renderNmapCommand();
        if (!state.scanning) resetScan();
      });
    });

    // Firewall toggle
    var fwToggle = document.getElementById('fw-toggle');
    if (fwToggle) {
      fwToggle.addEventListener('click', function() {
        state.firewallActive = !state.firewallActive;
        renderFirewall();
        renderNmapCommand();
      });
    }

    // Scan controls
    var btnStart = document.getElementById('btn-scan-start');
    var btnPause = document.getElementById('btn-scan-pause');
    var btnReset = document.getElementById('btn-scan-reset');
    if (btnStart) btnStart.addEventListener('click', startScan);
    if (btnPause) btnPause.addEventListener('click', togglePause);
    if (btnReset) btnReset.addEventListener('click', resetScan);

    // Mode
    document.querySelectorAll('[data-mode]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.scanMode = this.dataset.mode;
        document.querySelectorAll('[data-mode]').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
      });
    });

    // Speed
    document.querySelectorAll('[data-speed]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.speedMultiplier = parseFloat(this.dataset.speed);
        document.querySelectorAll('[data-speed]').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
      });
    });

    // Compare button
    var btnCompare = document.getElementById('btn-compare');
    if (btnCompare) btnCompare.addEventListener('click', runCompare);

    // Defender panel toggle
    var btnDefender = document.getElementById('btn-defender');
    if (btnDefender) {
      btnDefender.addEventListener('click', function() {
        var panel = document.getElementById('defender-panel');
        if (!panel) return;
        var hidden = panel.style.display === 'none' || panel.style.display === '';
        panel.style.display = hidden ? 'block' : 'none';
        this.textContent = hidden ? '🔒 Was sieht die Gegenseite? ▴' : '🔒 Was sieht die Gegenseite? ▾';
      });
    }

    // Port status dropdowns (delegated)
    var portTable = document.getElementById('port-config-table');
    if (portTable) {
      portTable.addEventListener('change', function(e) {
        var sel = e.target.closest('select[data-port-idx]');
        if (!sel) return;
        var idx = parseInt(sel.dataset.portIdx);
        state.ports[idx].status = sel.value;
        renderFirewall();
        renderNmapCommand();
      });
    }

    // Add port
    var btnAddPort = document.getElementById('btn-add-port');
    if (btnAddPort) {
      btnAddPort.addEventListener('click', function() {
        var portNum = prompt('Port Nummer:');
        if (!portNum || isNaN(parseInt(portNum))) return;
        var svc = prompt('Service-Name:') || 'unknown';
        state.ports.push({ port: parseInt(portNum), service: svc, status: 'closed' });
        renderPortConfig();
        renderNmapCommand();
      });
    }

    // Packet detail close
    document.addEventListener('click', function(e) {
      if (e.target.id === 'packet-detail-overlay') closePacketDetail();
    });
  }

  // ============================================================
  // RENDER ALL
  // ============================================================
  function renderAll() {
    renderPortConfig();
    renderFirewall();
    renderScanTypeDesc();
    renderVizBoxes();
    renderResults();
    renderNmapCommand();
  }

  // ============================================================
  // PORT CONFIG TABLE
  // ============================================================
  function renderPortConfig() {
    var tbody = document.querySelector('#port-config-table tbody');
    if (!tbody) return;
    tbody.innerHTML = state.ports.map(function(p, i) {
      return '<tr>' +
        '<td style="font-family:\'JetBrains Mono\',monospace;color:var(--accent)">' + p.port + '</td>' +
        '<td style="color:var(--muted)">' + esc(p.service) + '</td>' +
        '<td>' +
          '<select data-port-idx="' + i + '" style="background:var(--bg);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:4px;font-family:\'JetBrains Mono\',monospace;font-size:11px;cursor:pointer">' +
            ['open','closed','filtered'].map(function(s) {
              return '<option value="' + s + '"' + (p.status === s ? ' selected' : '') + '>' + PORT_STATUS_LABELS[s] + '</option>';
            }).join('') +
          '</select>' +
        '</td></tr>';
    }).join('');
  }

  // ============================================================
  // FIREWALL
  // ============================================================
  function renderFirewall() {
    var el = document.getElementById('fw-status');
    if (!el) return;
    if (state.firewallActive) {
      el.innerHTML = '<span style="color:#fb923c">🔥 Aktiv</span> <span style="color:var(--muted);font-size:11px">— ' + esc(state.firewallDesc) + '</span>';
    } else {
      el.innerHTML = '<span style="color:var(--muted)">⬜ Inaktiv</span> <span style="color:var(--muted);font-size:11px">— Kein Filtering</span>';
    }
    var btn = document.getElementById('fw-toggle');
    if (btn) btn.textContent = state.firewallActive ? 'Deaktivieren' : 'Aktivieren';
  }

  // ============================================================
  // SCAN TYPE DESCRIPTION
  // ============================================================
  function renderScanTypeDesc() {
    var st = SCAN_TYPES[state.scanType];
    var el = document.getElementById('scan-type-desc');
    if (!el || !st) return;
    el.innerHTML =
      '<div style="margin-bottom:8px"><span style="color:#ef4444;font-family:\'JetBrains Mono\',monospace;font-weight:700">' + esc(st.label) + '</span> ' +
      '<span style="color:var(--muted);font-size:11px">— ' + esc(st.nick) + '</span></div>' +
      '<p style="color:var(--muted);font-size:13px;line-height:1.7;margin:0 0 12px 0">' + esc(st.desc) + '</p>' +
      '<table style="font-family:\'JetBrains Mono\',monospace;font-size:11px;border-collapse:collapse;width:100%">' +
        '<tr><td style="color:var(--muted);padding:4px 0;width:100px">Gesendet</td><td style="color:#ef4444">' + esc(st.sent) + '</td></tr>' +
        '<tr><td style="color:var(--muted);padding:4px 0">Offen</td><td style="color:#4fffb0">' + esc(st.responses.open) + '</td></tr>' +
        '<tr><td style="color:var(--muted);padding:4px 0">Geschlossen</td><td style="color:#6b7280">' + esc(st.responses.closed) + '</td></tr>' +
        '<tr><td style="color:var(--muted);padding:4px 0">Gefiltert</td><td style="color:#fb923c">' + esc(st.responses.filtered) + '</td></tr>' +
      '</table>';
  }

  // ============================================================
  // VISUALIZATION BOXES (static structure)
  // ============================================================
  function renderVizBoxes() {
    var el = document.getElementById('viz-area');
    if (!el) return;
    el.innerHTML =
      '<div class="viz-row">' +
        '<div class="viz-box viz-scanner" id="viz-scanner">' +
          '<div class="viz-box-label" style="color:#a78bfa">SCANNER</div>' +
          '<div class="viz-box-sub">Kali Linux</div>' +
          '<div class="viz-box-ip">10.0.3.21</div>' +
          '<div class="viz-result-list" id="viz-result-list"></div>' +
        '</div>' +
        '<div class="viz-middle">' +
          '<div class="viz-fw-box" id="viz-fw-box">' +
            '<div class="viz-box-label" style="color:#fb923c">FIREWALL</div>' +
            '<div class="viz-box-sub">OPNsense</div>' +
            '<div id="viz-fw-state" style="font-size:11px;color:var(--muted);margin-top:4px">' + (state.firewallActive ? '🔥 Aktiv' : '⬜ Inaktiv') + '</div>' +
          '</div>' +
          '<div class="viz-packet-lane" id="packet-lane"></div>' +
        '</div>' +
        '<div class="viz-box viz-target" id="viz-target">' +
          '<div class="viz-box-label" style="color:#4db8ff">ZIEL-SERVER</div>' +
          '<div class="viz-box-sub">Proxmox</div>' +
          '<div class="viz-box-ip">' + esc(state.ip) + '</div>' +
          '<div class="viz-port-list" id="viz-port-list">' +
            state.ports.map(function(p) {
              return '<div class="viz-port-item" id="viz-port-' + p.port + '" data-status="' + p.status + '">' +
                '<span style="font-family:\'JetBrains Mono\',monospace;font-size:11px;color:var(--muted)">' + p.port + '</span>' +
                '<span style="font-size:11px;color:var(--muted)">' + esc(p.service) + '</span>' +
                '<span class="viz-port-dot" style="background:var(--border)"></span>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // ============================================================
  // SCAN CONTROL
  // ============================================================
  function startScan() {
    if (state.scanning) return;
    resetScan(true);
    state.scanning = true;
    state.paused = false;
    state.scanResults = [];
    document.getElementById('btn-scan-start').disabled = true;
    document.getElementById('btn-scan-pause').disabled = false;

    if (state.scanMode === 'parallel') {
      runParallelScan();
    } else {
      runSequentialScan(0);
    }
  }

  function togglePause() {
    state.paused = !state.paused;
    var btn = document.getElementById('btn-scan-pause');
    if (btn) btn.textContent = state.paused ? '▶ Weiter' : '⏸ Pause';
  }

  function resetScan(keepPorts) {
    clearTimeout(state.scanTimer);
    state.scanning = false;
    state.paused = false;
    state.scanResults = [];
    state.currentScanIndex = -1;
    var btnStart = document.getElementById('btn-scan-start');
    var btnPause = document.getElementById('btn-scan-pause');
    if (btnStart) { btnStart.disabled = false; btnStart.textContent = '▶ Scan starten'; }
    if (btnPause) { btnPause.disabled = true; btnPause.textContent = '⏸ Pause'; }
    renderResults();
    clearPacketLane();
    // Reset port dots
    state.ports.forEach(function(p) {
      var dot = document.querySelector('#viz-port-' + p.port + ' .viz-port-dot');
      if (dot) dot.style.background = 'var(--border)';
    });
    var resultList = document.getElementById('viz-result-list');
    if (resultList) resultList.innerHTML = '';
  }

  function clearPacketLane() {
    var lane = document.getElementById('packet-lane');
    if (lane) lane.innerHTML = '';
  }

  var STEP_MS = 800;

  function delay(ms) {
    return new Promise(function(resolve) {
      function check() {
        if (!state.paused) { state.scanTimer = setTimeout(resolve, ms / state.speedMultiplier); }
        else { state.scanTimer = setTimeout(check, 100); }
      }
      check();
    });
  }

  function runSequentialScan(idx) {
    if (idx >= state.ports.length) {
      finishScan();
      return;
    }
    state.currentScanIndex = idx;
    var p = state.ports[idx];
    animatePortScan(p).then(function() {
      if (!state.scanning) return;
      state.scanTimer = setTimeout(function() {
        runSequentialScan(idx + 1);
      }, 200 / state.speedMultiplier);
    });
  }

  function runParallelScan() {
    var promises = state.ports.map(function(p) { return animatePortScan(p); });
    Promise.all(promises).then(finishScan);
  }

  function animatePortScan(portObj) {
    var st = SCAN_TYPES[state.scanType];
    return new Promise(function(resolve) {
      var lane = document.getElementById('packet-lane');
      if (!lane) { resolve(); return; }

      // Determine result
      var status = portObj.status;
      // Firewall: if active and port is filtered, treat as filtered regardless
      var effective = status;
      if (state.firewallActive && status === 'filtered') effective = 'filtered';

      // For XMAS/NULL: open and filtered both show no response → ambiguous
      var ambiguous = (state.scanType === 'xmas' || state.scanType === 'null') && effective === 'open';
      var resultStatus = ambiguous ? 'open|filtered' : effective;
      var reason = getReasonLabel(st, effective);

      // Create packet going right
      var pkt = document.createElement('div');
      pkt.className = 'viz-packet viz-packet--out';
      pkt.textContent = st.sent + ':' + portObj.port;
      pkt.style.color = '#ef4444';
      lane.appendChild(pkt);

      delay(STEP_MS).then(function() {
        if (!state.scanning) { resolve(); return; }
        // Firewall decision
        var fwEl = document.getElementById('viz-fw-box');
        if (state.firewallActive) {
          var allowed = effective !== 'filtered';
          flashBox(fwEl, allowed ? '#4fffb0' : '#ef4444', allowed ? 'PASS' : 'DROP');
        }

        // Remove outgoing packet
        if (pkt.parentNode) pkt.parentNode.removeChild(pkt);

        if (effective === 'filtered') {
          // Show timeout
          addResultToViz(portObj, 'filtered', reason, 'timeout');
          setTimeout(function() { resolve(); }, STEP_MS / state.speedMultiplier);
          return;
        }

        // Animate port on target
        var dot = document.querySelector('#viz-port-' + portObj.port + ' .viz-port-dot');
        if (dot) dot.style.background = PORT_STATUS_COLORS[effective] || 'var(--muted)';

        delay(STEP_MS / 2).then(function() {
          if (!state.scanning) { resolve(); return; }
          // Return packet
          var resp = st.responses[effective];
          if (resp && resp !== '(keine Antwort)') {
            var rpkt = document.createElement('div');
            rpkt.className = 'viz-packet viz-packet--in';
            rpkt.textContent = resp;
            rpkt.style.color = effective === 'open' ? '#4fffb0' : '#6b7280';
            rpkt.addEventListener('click', function() {
              showPacketDetail(portObj, st, effective);
            });
            lane.appendChild(rpkt);
            setTimeout(function() {
              if (rpkt.parentNode) rpkt.parentNode.removeChild(rpkt);
            }, (STEP_MS * 1.5) / state.speedMultiplier);
          }
          addResultToViz(portObj, effective, reason, resp);
          resolve();
        });
      });
    });
  }

  function getReasonLabel(st, status) {
    switch (status) {
      case 'open': return st.responses.open;
      case 'closed': return st.responses.closed;
      default: return 'no-response';
    }
  }

  function addResultToViz(portObj, status, reason) {
    // Add to state results
    var existing = state.scanResults.find(function(r) { return r.port === portObj.port; });
    if (!existing) {
      state.scanResults.push({ port: portObj.port, service: portObj.service, status: status, reason: reason });
    }
    // Update viz result list
    var el = document.getElementById('viz-result-list');
    if (!el) return;
    var color = PORT_STATUS_COLORS[status] || '#6b7280';
    var item = document.createElement('div');
    item.style.cssText = 'font-family:\'JetBrains Mono\',monospace;font-size:10px;color:' + color + ';margin:2px 0';
    item.textContent = portObj.port + ' → ' + status;
    el.appendChild(item);
    renderResults();
  }

  function flashBox(el, color, text) {
    if (!el) return;
    var prev = el.style.borderColor;
    el.style.borderColor = color;
    var msg = document.createElement('div');
    msg.style.cssText = 'font-family:\'JetBrains Mono\',monospace;font-size:10px;color:' + color + ';text-align:center;margin-top:4px';
    msg.textContent = text;
    el.appendChild(msg);
    setTimeout(function() {
      el.style.borderColor = prev;
      if (msg.parentNode) msg.parentNode.removeChild(msg);
    }, 500);
  }

  function finishScan() {
    state.scanning = false;
    document.getElementById('btn-scan-start').disabled = false;
    document.getElementById('btn-scan-pause').disabled = true;
    document.getElementById('btn-scan-start').textContent = '▶ Erneut scannen';
    renderResults();
    updateScanSummary();
  }

  function updateScanSummary() {
    var el = document.getElementById('scan-summary');
    if (!el) return;
    var open = state.scanResults.filter(function(r) { return r.status === 'open'; }).length;
    var closed = state.scanResults.filter(function(r) { return r.status === 'closed'; }).length;
    var filtered = state.scanResults.filter(function(r) { return r.status === 'filtered' || r.status === 'open|filtered'; }).length;
    var time = (state.ports.length * STEP_MS / 1000 / state.speedMultiplier).toFixed(1);
    el.innerHTML = 'Nmap done: <span style="color:var(--accent)">' + state.ports.length + '</span> ports scanned — ' +
      '<span style="color:#4fffb0">' + open + ' open</span>, ' +
      '<span style="color:#6b7280">' + closed + ' closed</span>, ' +
      '<span style="color:#fb923c">' + filtered + ' filtered</span>' +
      ' &nbsp;·&nbsp; Scan time: ' + time + 's (simuliert)';
  }

  // ============================================================
  // RESULTS TABLE
  // ============================================================
  function renderResults() {
    var tbody = document.querySelector('#results-table tbody');
    if (!tbody) return;
    if (state.scanResults.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted);font-family:\'JetBrains Mono\',monospace;font-size:12px;text-align:center;padding:20px">Scan noch nicht gestartet.</td></tr>';
      return;
    }
    tbody.innerHTML = state.scanResults.map(function(r) {
      var color = PORT_STATUS_COLORS[r.status] || '#6b7280';
      var st = r.status === 'open|filtered' ? '#fb923c' : color;
      return '<tr>' +
        '<td>' + r.port + '/tcp</td>' +
        '<td style="color:' + st + '">' + r.status + '</td>' +
        '<td style="color:var(--muted)">' + esc(r.service) + '</td>' +
        '<td style="color:var(--muted)">' + esc(r.reason || '') + '</td>' +
      '</tr>';
    }).join('');
  }

  // ============================================================
  // COMPARE MODE
  // ============================================================
  function runCompare() {
    var container = document.getElementById('compare-results');
    if (!container) return;
    var scanKeys = Object.keys(SCAN_TYPES);
    var rows = state.ports.map(function(portObj) {
      var cells = scanKeys.map(function(key) {
        var st = SCAN_TYPES[key];
        var status = portObj.status;
        var ambiguous = (key === 'xmas' || key === 'null') && status === 'open';
        var result = ambiguous ? 'open|filtered' : status;
        var resp = ambiguous ? '(keine Antwort — ambiguös!)' : st.responses[status] || '';
        var color = result === 'open' ? '#4fffb0' : result === 'filtered' ? '#fb923c' : result === 'open|filtered' ? '#f59e0b' : '#6b7280';
        return '<td style="font-family:\'JetBrains Mono\',monospace;font-size:11px;color:' + color + ';padding:6px 12px">' + result + '<br><span style="color:var(--muted);font-size:10px">' + esc(resp) + '</span></td>';
      }).join('');
      return '<tr><td style="font-family:\'JetBrains Mono\',monospace;font-size:11px;color:var(--accent);padding:6px 12px;white-space:nowrap">' + portObj.port + ' (' + esc(portObj.service) + ')</td>' + cells + '</tr>';
    }).join('');
    var headers = '<th style="padding:6px 12px;color:var(--muted);font-size:10px">Port</th>' +
      scanKeys.map(function(k) {
        return '<th style="padding:6px 12px;color:#ef4444;font-size:10px">' + esc(SCAN_TYPES[k].flag) + '</th>';
      }).join('');
    container.innerHTML = '<table style="border-collapse:collapse;width:100%;font-family:\'JetBrains Mono\',monospace"><thead><tr>' + headers + '</tr></thead><tbody>' + rows + '</tbody></table>';
    container.style.display = 'block';

    // Insights
    var insightsEl = document.getElementById('compare-insights');
    if (insightsEl) {
      var ambiguousPorts = state.ports.filter(function(p) { return p.status === 'open'; });
      if (ambiguousPorts.length > 0) {
        insightsEl.innerHTML = '<div style="margin-top:12px;font-size:12px;color:var(--muted);line-height:1.8">' +
          '<span style="color:#f59e0b">⚠ Hinweis:</span> XMAS/NULL Scans können bei offenen Ports keine Antwort erkennen — ' +
          'Ergebnis ist "open|filtered" (ambiguös).<br>' +
          '<span style="color:#4fffb0">→</span> SYN Scan ist am zuverlässigsten für die Unterscheidung offen/gefiltert.<br>' +
          '<span style="color:#4fffb0">→</span> XMAS/NULL Scans: können "open" und "filtered" nicht unterscheiden.' +
          '</div>';
      }
    }
  }

  // ============================================================
  // PACKET DETAIL POPUP
  // ============================================================
  function showPacketDetail(portObj, st, status) {
    var overlay = document.getElementById('packet-detail-overlay');
    var content = document.getElementById('packet-detail-content');
    if (!overlay || !content) return;

    var srcPort = Math.floor(Math.random() * 20000) + 40000;
    var seq = Math.floor(Math.random() * 9000) + 1000;
    var ackSeq = seq + 1;
    var serverSeq = Math.floor(Math.random() * 9000) + 1000;

    var sentFlags = st.sent;
    var respFlags = status === 'open' ? '[SYN] [ACK]' : status === 'closed' ? '[RST]' : '(timeout)';
    var stateExplain = status === 'open'
      ? '→ Port ' + portObj.port + ' ist <span style="color:#4fffb0">OFFEN</span> (Dienst lauscht)'
      : status === 'closed'
      ? '→ Port ' + portObj.port + ' ist <span style="color:#6b7280">GESCHLOSSEN</span> (RST vom Stack)'
      : '→ Port ' + portObj.port + ' ist <span style="color:#fb923c">GEFILTERT</span> (Firewall DROP — kein RST)';

    content.innerHTML =
      '<div class="pkt-box">' +
        '<div class="pkt-box-title">GESENDETES PAKET</div>' +
        '<div class="pkt-row"><span class="pkt-key">Src</span><span class="pkt-val">10.0.3.21:' + srcPort + '</span><span class="pkt-sep">→</span><span class="pkt-val">' + esc(state.ip) + ':' + portObj.port + '</span></div>' +
        '<div class="pkt-row"><span class="pkt-key">Flags</span><span class="pkt-val" style="color:#ef4444">[' + sentFlags + ']</span></div>' +
        '<div class="pkt-row"><span class="pkt-key">Seq</span><span class="pkt-val">' + seq + ' (zufällig)</span></div>' +
        '<div class="pkt-row"><span class="pkt-key">Window</span><span class="pkt-val">1024</span></div>' +
        '<div class="pkt-row"><span class="pkt-key">Options</span><span class="pkt-val">MSS=1460</span></div>' +
      '</div>' +
      '<div class="pkt-box" style="margin-top:12px">' +
        '<div class="pkt-box-title">ANTWORT</div>' +
        (status === 'filtered'
          ? '<div class="pkt-row"><span class="pkt-val" style="color:#fb923c">(keine Antwort — Firewall DROP / Timeout)</span></div>'
          : '<div class="pkt-row"><span class="pkt-key">Src</span><span class="pkt-val">' + esc(state.ip) + ':' + portObj.port + '</span><span class="pkt-sep">→</span><span class="pkt-val">10.0.3.21:' + srcPort + '</span></div>' +
            '<div class="pkt-row"><span class="pkt-key">Flags</span><span class="pkt-val" style="color:' + (status === 'open' ? '#4fffb0' : '#6b7280') + '">' + respFlags + '</span></div>' +
            (status === 'open' ? '<div class="pkt-row"><span class="pkt-key">Seq</span><span class="pkt-val">' + serverSeq + '</span><span class="pkt-sep">Ack</span><span class="pkt-val">' + ackSeq + '</span></div>' : '')
        ) +
        '<div class="pkt-row" style="margin-top:8px;font-size:12px">' + stateExplain + '</div>' +
      '</div>';

    overlay.style.display = 'flex';
  }

  function closePacketDetail() {
    var overlay = document.getElementById('packet-detail-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // ============================================================
  // NMAP COMMAND GENERATOR
  // ============================================================
  function renderNmapCommand() {
    var el = document.getElementById('nmap-command');
    if (!el) return;
    var st = SCAN_TYPES[state.scanType];
    var portList = state.ports.map(function(p) { return p.port; }).join(',');
    var baseCmd = 'nmap ' + st.flag + ' -p ' + portList + ' ' + state.ip;
    el.innerHTML =
      '<div class="nmap-cmd-line"><span class="nmap-prompt">$</span> ' + esc(baseCmd) + '</div>' +
      '<div style="margin-top:12px;font-size:11px;color:var(--muted)">' +
        '<div style="margin-bottom:6px;color:var(--accent)">Varianten:</div>' +
        '<div class="nmap-variant"><span style="color:var(--muted);width:90px;display:inline-block">Schnell</span> nmap -F ' + esc(state.ip) + ' <span style="color:var(--muted)">(Top 100 Ports)</span></div>' +
        '<div class="nmap-variant"><span style="color:var(--muted);width:90px;display:inline-block">Vollständig</span> nmap -p- ' + esc(state.ip) + ' <span style="color:var(--muted)">(alle 65535)</span></div>' +
        '<div class="nmap-variant"><span style="color:var(--muted);width:90px;display:inline-block">Aggressiv</span> nmap -A ' + esc(state.ip) + ' <span style="color:var(--muted)">(OS + Version + Scripts)</span></div>' +
        '<div class="nmap-variant"><span style="color:var(--muted);width:90px;display:inline-block">Stealth</span> nmap -sS -T2 ' + esc(state.ip) + ' <span style="color:var(--muted)">(langsam, weniger auffällig)</span></div>' +
      '</div>';
  }

  // ============================================================
  // UTILS
  // ============================================================
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ============================================================
  // EXPOSE
  // ============================================================
  window.PortScanner = { init: init, closePacketDetail: closePacketDetail };

})();
