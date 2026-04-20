/* === SUBNETTING CALCULATOR (erweitert) === */
(function () {
  'use strict';

  // =============================================
  // HOMELAB SUBNET MAP
  // =============================================
  var HOMELAB_SUBNETS = {
    '10.0.1.0/24': { name: 'MGMT', color: '#4fffb0', gateway: '10.0.1.1', hosts: ['Proxmox (.2)', 'AdGuard (.3)', 'Jumphost (.4)'] },
    '10.0.2.0/24': { name: 'SVC', color: '#4db8ff', gateway: '10.0.2.1', hosts: ['Reverse Proxy (.10)', 'Vaultwarden (.11)'] },
    '10.0.3.0/24': { name: 'LAB', color: '#a78bfa', gateway: '10.0.3.1', hosts: ['Ansible (.10)', 'TACACS+ (.11)'] },
    '10.0.4.0/24': { name: 'DMZ', color: '#fb923c', gateway: '10.0.4.1', hosts: ['Webserver (.10)', 'DDNS (.11)'] },
    '192.168.0.0/24': { name: 'Home LAN', color: '#5a6278', gateway: '192.168.0.1', hosts: ['Proxmox (.200)', 'AdGuard (.201)', 'Jumphost (.204)'] }
  };

  var HOMELAB_BAUKASTEN = [
    { name: 'MGMT', prefix: 24 },
    { name: 'SVC', prefix: 24 },
    { name: 'LAB', prefix: 24 },
    { name: 'DMZ', prefix: 24 }
  ];

  var PRESETS = [
    { label: 'Dein Homelab', ip: '10.0.0.0', prefix: 21 },
    { label: 'Heimnetz', ip: '192.168.0.0', prefix: 24 },
    { label: 'Class A', ip: '10.0.0.0', prefix: 8 },
    { label: 'Point-to-Point', ip: '10.0.1.0', prefix: 30 },
    { label: 'Großes Netz', ip: '172.16.0.0', prefix: 12 }
  ];

  var SUBNET_COLORS = ['#4fffb0', '#4db8ff', '#a78bfa', '#fb923c', '#f472b6', '#22d3ee', '#ef4444', '#eab308'];
  var CYAN = '#22d3ee';

  // =============================================
  // MATH HELPERS
  // =============================================
  function ipToNum(ip) {
    return ip.split('.').reduce(function (acc, oct) { return (acc << 8) + parseInt(oct, 10); }, 0) >>> 0;
  }
  function numToIp(num) {
    return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join('.');
  }
  function numToBinary(num) {
    var s = '';
    for (var i = 31; i >= 0; i--) {
      s += (num >>> i) & 1;
      if (i > 0 && i % 8 === 0) s += '.';
    }
    return s;
  }
  function numToBinaryRaw(num) {
    var s = '';
    for (var i = 31; i >= 0; i--) s += (num >>> i) & 1;
    return s;
  }
  function isValidIp(ip) {
    if (!ip || typeof ip !== 'string') return false;
    var parts = ip.split('.');
    if (parts.length !== 4) return false;
    for (var i = 0; i < 4; i++) {
      var n = parseInt(parts[i], 10);
      if (isNaN(n) || n < 0 || n > 255 || parts[i] !== String(n)) return false;
    }
    return true;
  }
  function calcSubnet(ipStr, prefix) {
    var ipNum = ipToNum(ipStr);
    var mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
    var network = (ipNum & mask) >>> 0;
    var broadcast = (network | (~mask >>> 0)) >>> 0;
    var total = Math.pow(2, 32 - prefix);
    var hostCount = prefix <= 30 ? total - 2 : (prefix === 31 ? 2 : 1);
    return {
      network: numToIp(network), networkNum: network,
      broadcast: numToIp(broadcast), broadcastNum: broadcast,
      firstHost: prefix <= 30 ? numToIp(network + 1) : numToIp(network),
      lastHost: prefix <= 30 ? numToIp(broadcast - 1) : numToIp(broadcast),
      hostCount: Math.max(hostCount, 0), totalIps: total,
      mask: numToIp(mask), maskNum: mask,
      wildcard: numToIp((~mask) >>> 0), wildcardNum: (~mask) >>> 0,
      binaryMask: numToBinary(mask),
      cidr: numToIp(network) + '/' + prefix,
      prefix: prefix
    };
  }
  function getIpClass(ipNum) {
    var first = (ipNum >>> 24) & 255;
    if (first < 128) return 'A';
    if (first < 192) return 'B';
    if (first < 224) return 'C';
    if (first < 240) return 'D (Multicast)';
    return 'E (Reserved)';
  }
  function isPrivate(ipNum) {
    var first = (ipNum >>> 24) & 255;
    var second = (ipNum >>> 16) & 255;
    if (first === 10) return '10.0.0.0/8';
    if (first === 172 && second >= 16 && second <= 31) return '172.16.0.0/12';
    if (first === 192 && second === 168) return '192.168.0.0/16';
    return null;
  }
  function findHomelabMatch(cidr) { return HOMELAB_SUBNETS[cidr] || null; }
  function findHomelabOverlap(networkNum, broadcastNum) {
    var matches = [];
    Object.keys(HOMELAB_SUBNETS).forEach(function (key) {
      var parts = key.split('/');
      var sNet = ipToNum(parts[0]);
      var sPrefix = parseInt(parts[1], 10);
      var sMask = (0xFFFFFFFF << (32 - sPrefix)) >>> 0;
      var sBroadcast = (sNet | (~sMask >>> 0)) >>> 0;
      if (sNet >= networkNum && sBroadcast <= broadcastNum) {
        matches.push({ cidr: key, info: HOMELAB_SUBNETS[key] });
      }
    });
    return matches;
  }
  function formatNum(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // =============================================
  // HTML HELPERS
  // =============================================
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function $(id) { return document.getElementById(id); }

  // =============================================
  // MAIN RENDER
  // =============================================
  function render() {
    var ipInput = $('subnet-ip');
    var prefixInput = $('subnet-prefix');
    var ip = (ipInput.value || '').trim();
    var prefix = parseInt(prefixInput.value, 10);
    var resultsEl = $('subnet-results');
    var errorEl = $('subnet-error');

    errorEl.style.display = 'none';
    errorEl.textContent = '';
    ipInput.style.borderColor = '';

    if (!ip) { resultsEl.innerHTML = ''; return; }
    if (!isValidIp(ip)) {
      ipInput.style.borderColor = '#ef4444';
      errorEl.textContent = '\u26A0 Ung\u00FCltige IP-Adresse';
      errorEl.style.display = '';
      resultsEl.innerHTML = '';
      return;
    }
    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
      errorEl.textContent = '\u26A0 Ung\u00FCltiger Prefix (/0 \u2013 /32)';
      errorEl.style.display = '';
      resultsEl.innerHTML = '';
      return;
    }

    var result = calcSubnet(ip, prefix);
    var ipNum = ipToNum(ip);
    var ipClass = getIpClass(ipNum);
    var rfc1918 = isPrivate(ipNum);
    var homelabMatch = findHomelabMatch(result.cidr);
    var homelabOverlap = findHomelabOverlap(result.networkNum, result.broadcastNum);

    var html = '';

    // Warnings
    if (prefix === 32) {
      html += '<div class="subnet-warning">\uD83D\uDCCC Host-Route \u2014 einzelne IP-Adresse, kein Netz</div>';
    } else if (prefix === 31) {
      html += '<div class="subnet-warning">\uD83D\uDCCC Point-to-Point Link (RFC 3021) \u2014 2 Adressen, kein Broadcast</div>';
    } else if (prefix < 8) {
      html += '<div class="subnet-warning">\u26A0 Extrem gro\u00DFes Netz \u2014 \u00FCber ' + formatNum(Math.pow(2, 32 - prefix)) + ' Adressen</div>';
    }

    // Homelab overlay
    if (homelabMatch) {
      html += '<div class="subnet-homelab-overlay">' +
        '<div class="subnet-homelab-title">\uD83D\uDCA1 Dieses Netz ist in deinem Homelab-Plan als "<strong>' + esc(homelabMatch.name) + '</strong>" definiert.</div>' +
        '<div class="subnet-homelab-line">Gateway: ' + esc(homelabMatch.gateway) + ' (OPNsense) \u00B7 Aktive Hosts: ' + homelabMatch.hosts.map(esc).join(', ') + '</div>' +
        '</div>';
    } else if (homelabOverlap.length > 0) {
      html += '<div class="subnet-homelab-overlay">';
      html += '<div class="subnet-homelab-title">\uD83D\uDCA1 Enth\u00E4lt Homelab-Subnetze:</div>';
      homelabOverlap.forEach(function (m) {
        html += '<div class="subnet-homelab-line">' + esc(m.cidr) + ' \u2014 <strong>' + esc(m.info.name) + '</strong> \u00B7 GW: ' + esc(m.info.gateway) + '</div>';
      });
      html += '</div>';
    }

    // Details table
    html += renderDetailsTable(result, ipClass, rfc1918);
    // Binary view
    html += renderBinaryView(ipNum, result.maskNum, prefix);
    // Subnet splitter
    html += renderSubnetSplitter(result);
    // Math section
    html += renderMathSection(ip, ipNum, result);

    resultsEl.innerHTML = html;
    bindSplitter(result);
    bindMathToggle();
  }

  // =============================================
  // DETAILS TABLE
  // =============================================
  function renderDetailsTable(r, ipClass, rfc1918) {
    var rows = [
      ['Netzwerk-Adresse', r.network],
      ['Broadcast-Adresse', r.broadcast],
      ['Erster Host', r.firstHost],
      ['Letzter Host', r.lastHost],
      ['Nutzbare Hosts', formatNum(r.hostCount)],
      ['Subnetzmaske', r.mask],
      ['Wildcard-Maske', r.wildcard],
      ['CIDR-Notation', r.cidr],
      ['Bin\u00E4r-Maske', r.binaryMask],
      ['IP-Klasse', ipClass + (rfc1918 ? ' (privat)' : '')],
      ['RFC 1918', rfc1918 ? '\u2713 Ja (' + rfc1918 + ')' : '\u2717 Nein (\u00F6ffentlich)']
    ];
    var html = '<div class="subnet-section">';
    html += '<div class="subnet-section-title"><span class="subnet-bar"></span>NETZWERK-DETAILS</div>';
    html += '<div class="subnet-table-wrap"><table class="subnet-table">';
    rows.forEach(function (row) {
      html += '<tr><td class="subnet-label">' + esc(row[0]) + '</td><td class="subnet-value">' + esc(row[1]) + '</td></tr>';
    });
    html += '</table></div></div>';
    return html;
  }

  // =============================================
  // BINARY VIEW
  // =============================================
  function renderBinaryView(ipNum, maskNum, prefix) {
    var html = '<div class="subnet-section">';
    html += '<div class="subnet-section-title"><span class="subnet-bar"></span>BIN\u00C4R-ANSICHT</div>';
    html += '<div class="binary-view">';
    html += '<div class="binary-row"><span class="binary-label">IP:</span><div class="binary-bits">' + renderBitRow(ipNum, prefix) + '</div></div>';
    html += '<div class="binary-row"><span class="binary-label">Maske:</span><div class="binary-bits">' + renderBitRow(maskNum, prefix) + '</div></div>';
    // Legend bar
    var netW = prefix > 0 ? (prefix * 19 + Math.floor(Math.max(0, prefix - 1) / 8) * 8) : 0;
    html += '<div class="binary-legend">';
    if (prefix > 0) html += '<span class="binary-legend-item net">\u251C\u2500\u2500 Netzwerk (' + prefix + ' Bit) \u2500\u2500\u2524</span>';
    if (prefix < 32) html += '<span class="binary-legend-item host">\u251C Host (' + (32 - prefix) + ') \u2524</span>';
    html += '</div>';
    html += '</div></div>';
    return html;
  }

  function renderBitRow(num, prefix) {
    var weights = [128, 64, 32, 16, 8, 4, 2, 1];
    var html = '';
    for (var i = 31; i >= 0; i--) {
      var bit = (num >>> i) & 1;
      var bitPos = 31 - i;
      var cls = bitPos < prefix ? 'bit-net' : 'bit-host';
      var w = weights[bitPos % 8];
      html += '<span class="binary-bit ' + cls + '" title="Bit ' + bitPos + ' \u00B7 Wert: ' + w + '">' + bit + '</span>';
      if (i > 0 && i % 8 === 0) html += '<span class="binary-dot">.</span>';
    }
    return html;
  }

  // =============================================
  // SUBNET SPLITTER
  // =============================================
  function renderSubnetSplitter(result) {
    if (result.prefix >= 30) return '';
    var html = '<div class="subnet-section">';
    html += '<div class="subnet-section-title"><span class="subnet-bar"></span>SUBNETZ-AUFTEILER</div>';
    html += '<div class="splitter-controls">';
    html += '<span class="splitter-label">Teile /' + result.prefix + ' in:</span>';
    html += '<select id="split-prefix" class="splitter-select">';
    for (var p = result.prefix + 1; p <= 30; p++) {
      var count = Math.pow(2, p - result.prefix);
      var hosts = Math.pow(2, 32 - p) - 2;
      var sel = p === result.prefix + 1 ? ' selected' : '';
      html += '<option value="' + p + '"' + sel + '>/' + p + ' \u2192 ' + count + ' Subnetze \u00E0 ' + formatNum(hosts) + ' Hosts</option>';
    }
    html += '</select></div>';
    html += '<div id="split-results"></div></div>';
    return html;
  }

  function renderSplitResults(result, splitPrefix) {
    var count = Math.pow(2, splitPrefix - result.prefix);
    var subnetSize = Math.pow(2, 32 - splitPrefix);
    var html = '';
    for (var i = 0; i < count && i < 64; i++) {
      var netNum = (result.networkNum + i * subnetSize) >>> 0;
      var sub = calcSubnet(numToIp(netNum), splitPrefix);
      var color = SUBNET_COLORS[i % SUBNET_COLORS.length];
      var homelabInfo = findHomelabMatch(sub.cidr);
      html += '<div class="split-card" style="border-left-color:' + color + '">';
      html += '<div class="split-card-header"><span class="split-card-num" style="color:' + color + '">Subnetz ' + (i + 1) + '</span>';
      if (homelabInfo) html += '<span class="split-homelab-badge" style="background:' + color + '22;color:' + color + ';border-color:' + color + '44">' + esc(homelabInfo.name) + '</span>';
      html += '</div>';
      html += '<div class="split-card-cidr">' + esc(sub.cidr) + '</div>';
      html += '<div class="split-card-detail">Hosts: ' + esc(sub.firstHost) + ' \u2013 ' + esc(sub.lastHost) + '</div>';
      html += '<div class="split-card-detail">Broadcast: ' + esc(sub.broadcast) + ' \u00B7 ' + formatNum(sub.hostCount) + ' nutzbare Hosts</div>';
      html += '</div>';
    }
    if (count > 64) html += '<div class="split-more">... und ' + (count - 64) + ' weitere Subnetze</div>';
    return html;
  }

  function bindSplitter(result) {
    var sel = $('split-prefix');
    if (!sel) return;
    var out = $('split-results');
    function update() { out.innerHTML = renderSplitResults(result, parseInt(sel.value, 10)); }
    sel.addEventListener('change', update);
    update();
  }

  // =============================================
  // MATH SECTION
  // =============================================
  function renderMathSection(ipStr, ipNum, result) {
    var prefix = result.prefix;
    var maskNum = result.maskNum;
    var networkNum = result.networkNum;
    var wildcardNum = result.wildcardNum;

    var html = '<div class="subnet-section">';
    html += '<div class="math-toggle" id="math-toggle">\uD83D\uDCD0 Mathematik dahinter \u25BE</div>';
    html += '<div class="math-body" id="math-body" style="display:none">';

    // Step 1: IP to binary
    html += '<div class="math-step">';
    html += '<div class="math-step-title">Schritt 1: IP in Bin\u00E4r</div>';
    html += '<div class="math-mono">';
    var octets = ipStr.split('.');
    var wt = [128, 64, 32, 16, 8, 4, 2, 1];
    html += '<span class="math-dim">Stellenwerte:  </span><span class="math-muted">' + wt.join(' | ') + '</span>\n';
    octets.forEach(function (oct, idx) {
      var n = parseInt(oct, 10);
      var bits = '';
      for (var b = 7; b >= 0; b--) bits += (n >> b) & 1;
      html += esc(oct);
      html += new Array(Math.max(1, 16 - oct.length)).join(' ');
      html += '\u2192  ';
      var bitPos = idx * 8;
      for (var j = 0; j < 8; j++) {
        var isNet = (bitPos + j) < prefix;
        html += '<span class="' + (isNet ? 'math-green' : 'math-orange') + '">' + bits[j] + '</span>';
      }
      html += '\n';
    });
    html += '</div></div>';

    // Step 2: Mask from prefix
    html += '<div class="math-step">';
    html += '<div class="math-step-title">Schritt 2: Maske aus /' + prefix + '</div>';
    html += '<div class="math-mono">';
    html += '<span class="math-dim">Regel: </span>Erste ' + prefix + ' Bits = 1, Rest = 0\n\n';
    var maskBin = numToBinaryRaw(maskNum);
    html += 'Bin\u00E4r:   ';
    for (var m = 0; m < 32; m++) {
      html += '<span class="' + (m < prefix ? 'math-green' : 'math-orange') + '">' + maskBin[m] + '</span>';
      if (m < 31 && (m + 1) % 8 === 0) html += ' . ';
    }
    html += '\nDezimal: ' + esc(result.mask);
    html += '</div></div>';

    // Step 3: Network = IP AND Mask
    var ipBin = numToBinaryRaw(ipNum);
    var netBin = numToBinaryRaw(networkNum);
    html += '<div class="math-step">';
    html += '<div class="math-step-title">Schritt 3: Netzwerk-Adresse (IP AND Maske)</div>';
    html += '<div class="math-mono">';
    html += 'IP:      '; html += colorBits(ipBin, prefix); html += '\n';
    html += 'AND      '; html += colorBits(maskBin, prefix); html += '\n';
    html += '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n';
    html += 'Netz:    '; html += colorBits(netBin, prefix); html += '\n';
    html += '         = ' + esc(result.network);
    html += '</div></div>';

    // Step 4: Broadcast = Net OR Wildcard
    var wcBin = numToBinaryRaw(wildcardNum);
    var bcBin = numToBinaryRaw(result.broadcastNum);
    html += '<div class="math-step">';
    html += '<div class="math-step-title">Schritt 4: Broadcast (Netzwerk OR Wildcard)</div>';
    html += '<div class="math-mono">';
    html += 'Netz:    '; html += colorBits(netBin, prefix); html += '\n';
    html += 'OR       '; html += colorBits(wcBin, prefix); html += '\n';
    html += '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n';
    html += 'Bcast:   '; html += colorBits(bcBin, prefix); html += '\n';
    html += '         = ' + esc(result.broadcast);
    html += '</div></div>';

    // Step 5: Host range
    html += '<div class="math-step">';
    html += '<div class="math-step-title">Schritt 5: Host-Range</div>';
    html += '<div class="math-mono">';
    html += 'Erster Host:  Netzwerk + 1  = ' + esc(result.firstHost) + '\n';
    html += 'Letzter Host: Broadcast - 1 = ' + esc(result.lastHost) + '\n\n';
    html += 'Formel: 2^(32 - ' + prefix + ') - 2 = 2^' + (32 - prefix) + ' - 2 = <span class="math-cyan">' + formatNum(result.hostCount) + ' Hosts</span>';
    html += '</div></div>';

    // Prefix reference table
    html += renderPrefixTable(prefix);

    html += '</div></div>';
    return html;
  }

  function colorBits(binStr, prefix) {
    var html = '';
    for (var i = 0; i < 32; i++) {
      html += '<span class="' + (i < prefix ? 'math-green' : 'math-orange') + '">' + binStr[i] + '</span>';
      if (i < 31 && (i + 1) % 8 === 0) html += ' . ';
    }
    return html;
  }

  function renderPrefixTable(currentPrefix) {
    var html = '<div class="math-step">';
    html += '<div class="math-step-title">Prefix-Referenztabelle</div>';
    html += '<div class="prefix-table-wrap"><table class="prefix-table">';
    html += '<thead><tr><th>Prefix</th><th>Maske</th><th>IPs</th><th>Hosts</th><th>Klasse</th></tr></thead>';
    html += '<tbody>';
    for (var p = 2; p <= 32; p++) {
      var mask = (0xFFFFFFFF << (32 - p)) >>> 0;
      var total = Math.pow(2, 32 - p);
      var hosts = p <= 30 ? total - 2 : (p === 31 ? 2 : 1);
      var cls = p === currentPrefix ? ' class="prefix-active"' : '';
      var klassLabel = '';
      if (p === 8) klassLabel = 'A';
      else if (p === 16) klassLabel = 'B';
      else if (p === 24) klassLabel = 'C';
      else if (p === 30) klassLabel = 'P2P';
      else if (p === 31) klassLabel = 'RFC3021';
      else if (p === 32) klassLabel = 'Host';
      html += '<tr' + cls + '><td>/' + p + '</td><td>' + numToIp(mask) + '</td><td>' + formatNum(total) + '</td><td>' + formatNum(hosts) + '</td><td>' + klassLabel + '</td></tr>';
    }
    html += '</tbody></table></div></div>';
    return html;
  }

  function bindMathToggle() {
    var toggle = $('math-toggle');
    var body = $('math-body');
    if (!toggle || !body) return;
    toggle.addEventListener('click', function () {
      var open = body.style.display !== 'none';
      body.style.display = open ? 'none' : '';
      toggle.textContent = open ? '\uD83D\uDCD0 Mathematik dahinter \u25BE' : '\uD83D\uDCD0 Mathematik dahinter \u25B4';
    });
  }

  // =============================================
  // SUBNET BAUKASTEN
  // =============================================
  var baukastenState = {
    ip: '10.0.0.0',
    prefix: 21,
    subnets: [] // { name, prefix }
  };

  function initBaukasten() {
    renderBaukasten();
    bindBaukastenEvents();
  }

  function getBaukastenTotal() {
    return Math.pow(2, 32 - baukastenState.prefix);
  }

  function getBaukastenUsed() {
    var used = 0;
    baukastenState.subnets.forEach(function (s) { used += Math.pow(2, 32 - s.prefix); });
    return used;
  }

  function renderBaukasten() {
    var el = $('baukasten');
    if (!el) return;

    var total = getBaukastenTotal();
    var used = getBaukastenUsed();
    var free = total - used;
    var pct = total > 0 ? ((used / total) * 100).toFixed(1) : '0';

    var html = '';

    // Header inputs
    html += '<div class="bk-header">';
    html += '<span class="bk-label">Startblock:</span>';
    html += '<input type="text" class="bk-input" id="bk-ip" value="' + esc(baukastenState.ip) + '" spellcheck="false" autocomplete="off">';
    html += '<span class="bk-slash">/</span>';
    html += '<select class="bk-select" id="bk-prefix">';
    for (var p = 8; p <= 28; p++) {
      var sel = p === baukastenState.prefix ? ' selected' : '';
      html += '<option value="' + p + '"' + sel + '>/' + p + ' (' + formatNum(Math.pow(2, 32 - p)) + ' IPs)</option>';
    }
    html += '</select>';
    html += '<button class="bk-homelab-btn" id="bk-load-homelab">Mein Homelab laden</button>';
    html += '</div>';

    // Address bar visualization
    html += '<div class="bk-bar">';
    var baseNum = ipToNum(baukastenState.ip);
    var baseMask = (0xFFFFFFFF << (32 - baukastenState.prefix)) >>> 0;
    baseNum = (baseNum & baseMask) >>> 0;
    var offset = 0;
    baukastenState.subnets.forEach(function (s, idx) {
      var size = Math.pow(2, 32 - s.prefix);
      var widthPct = (size / total) * 100;
      var color = SUBNET_COLORS[idx % SUBNET_COLORS.length];
      var netIp = numToIp((baseNum + offset) >>> 0);
      html += '<div class="bk-bar-seg" style="width:' + widthPct + '%;background:' + color + '33;border-color:' + color + '" title="' + esc(s.name) + ': ' + netIp + '/' + s.prefix + '">';
      if (widthPct > 8) html += '<span class="bk-bar-label">' + esc(s.name) + '</span>';
      html += '</div>';
      offset += size;
    });
    if (free > 0) {
      var freeW = (free / total) * 100;
      html += '<div class="bk-bar-seg bk-bar-free" style="width:' + freeW + '%">';
      if (freeW > 10) html += '<span class="bk-bar-label">frei</span>';
      html += '</div>';
    }
    html += '</div>';

    // Subnet cards
    html += '<div class="bk-cards">';
    offset = 0;
    baukastenState.subnets.forEach(function (s, idx) {
      var size = Math.pow(2, 32 - s.prefix);
      var netNum = (baseNum + offset) >>> 0;
      var sub = calcSubnet(numToIp(netNum), s.prefix);
      var color = SUBNET_COLORS[idx % SUBNET_COLORS.length];
      var homelabInfo = findHomelabMatch(sub.cidr);
      var barW = (size / total) * 100;

      html += '<div class="bk-card" style="border-left-color:' + color + '">';
      html += '<div class="bk-card-top">';
      html += '<span class="bk-card-name" style="color:' + color + '" data-idx="' + idx + '">' + esc(s.name) + '</span>';
      if (homelabInfo) html += '<span class="bk-homelab-tag" style="color:' + homelabInfo.color + ';border-color:' + homelabInfo.color + '44;background:' + homelabInfo.color + '11">' + esc(homelabInfo.name) + '</span>';
      html += '<button class="bk-remove" data-idx="' + idx + '" title="Entfernen">\u2715</button>';
      html += '</div>';
      html += '<div class="bk-card-cidr">' + esc(sub.cidr) + '</div>';
      html += '<div class="bk-card-info">' + formatNum(sub.hostCount) + ' Hosts \u00B7 ' + esc(sub.firstHost) + ' \u2013 ' + esc(sub.lastHost) + '</div>';
      html += '<div class="bk-card-bar"><div class="bk-card-bar-fill" style="width:' + barW + '%;background:' + color + '"></div></div>';
      html += '</div>';
      offset += size;
    });
    html += '</div>';

    // Add subnet form
    html += '<div class="bk-add-row">';
    html += '<button class="bk-add-btn" id="bk-add-toggle">+ Subnetz hinzuf\u00FCgen</button>';
    html += '<div class="bk-add-form" id="bk-add-form" style="display:none">';
    html += '<input type="text" class="bk-add-name" id="bk-add-name" value="Subnetz-' + (baukastenState.subnets.length + 1) + '" spellcheck="false">';
    html += '<select class="bk-select" id="bk-add-prefix">';
    for (var ap = Math.max(baukastenState.prefix + 1, 8); ap <= 30; ap++) {
      var asize = Math.pow(2, 32 - ap);
      var ahosts = asize - 2;
      var apct = ((asize / total) * 100).toFixed(1);
      html += '<option value="' + ap + '">/' + ap + ' \u2192 ' + formatNum(asize) + ' IPs (' + formatNum(ahosts) + ' Hosts) \u2014 ' + apct + '%</option>';
    }
    html += '</select>';
    html += '<button class="bk-confirm-btn" id="bk-add-confirm">Hinzuf\u00FCgen</button>';
    html += '</div>';
    html += '</div>';

    // Warnings
    if (free <= 0 && baukastenState.subnets.length > 0) {
      html += '<div class="bk-warning">\u26A0 Block vollst\u00E4ndig belegt \u2014 keine freien IPs mehr.</div>';
    }

    // Stats
    html += '<div class="bk-stats">';
    html += 'Belegt: <span class="bk-stats-val">' + formatNum(used) + '/' + formatNum(total) + ' IPs (' + pct + '%)</span>';
    html += ' \u00B7 Frei: <span class="bk-stats-val">' + formatNum(free) + ' IPs</span>';
    html += ' \u00B7 Subnetze: <span class="bk-stats-val">' + baukastenState.subnets.length + ' definiert</span>';
    html += '</div>';

    el.innerHTML = html;
  }

  function bindBaukastenEvents() {
    var el = $('baukasten');
    if (!el) return;

    el.addEventListener('click', function (e) {
      // Remove subnet
      var removeBtn = e.target.closest('.bk-remove');
      if (removeBtn) {
        var idx = parseInt(removeBtn.dataset.idx, 10);
        baukastenState.subnets.splice(idx, 1);
        renderBaukasten();
        bindBaukastenEvents();
        return;
      }

      // Toggle add form
      if (e.target.id === 'bk-add-toggle') {
        var form = $('bk-add-form');
        if (form) form.style.display = form.style.display === 'none' ? 'flex' : 'none';
        return;
      }

      // Confirm add
      if (e.target.id === 'bk-add-confirm') {
        var name = ($('bk-add-name') || {}).value || 'Subnetz';
        var pfx = parseInt(($('bk-add-prefix') || {}).value, 10);
        var needed = Math.pow(2, 32 - pfx);
        var free = getBaukastenTotal() - getBaukastenUsed();
        if (needed > free) {
          alert('Nicht genug Platz \u2014 nur noch ' + formatNum(free) + ' IPs frei. Ben\u00F6tigt: ' + formatNum(needed));
          return;
        }
        baukastenState.subnets.push({ name: name, prefix: pfx });
        renderBaukasten();
        bindBaukastenEvents();
        return;
      }

      // Load homelab
      if (e.target.id === 'bk-load-homelab') {
        baukastenState.ip = '10.0.0.0';
        baukastenState.prefix = 21;
        baukastenState.subnets = HOMELAB_BAUKASTEN.map(function (s) { return { name: s.name, prefix: s.prefix }; });
        renderBaukasten();
        bindBaukastenEvents();
        return;
      }
    });

    // Header input changes
    el.addEventListener('change', function (e) {
      if (e.target.id === 'bk-ip') {
        var v = (e.target.value || '').trim();
        if (isValidIp(v)) {
          baukastenState.ip = v;
          // trim subnets that no longer fit
          trimBaukastenSubnets();
          renderBaukasten();
          bindBaukastenEvents();
        }
      }
      if (e.target.id === 'bk-prefix') {
        baukastenState.prefix = parseInt(e.target.value, 10);
        trimBaukastenSubnets();
        renderBaukasten();
        bindBaukastenEvents();
      }
    });
  }

  function trimBaukastenSubnets() {
    var total = getBaukastenTotal();
    var used = 0;
    var keep = [];
    baukastenState.subnets.forEach(function (s) {
      var size = Math.pow(2, 32 - s.prefix);
      if (used + size <= total && s.prefix > baukastenState.prefix) {
        keep.push(s);
        used += size;
      }
    });
    baukastenState.subnets = keep;
  }

  // =============================================
  // PRESETS
  // =============================================
  function renderPresets() {
    var el = $('subnet-presets');
    if (!el) return;
    el.innerHTML = PRESETS.map(function (p) {
      return '<button class="preset-btn" data-ip="' + esc(p.ip) + '" data-prefix="' + p.prefix + '">' + esc(p.label) + ': ' + esc(p.ip) + '/' + p.prefix + '</button>';
    }).join('');
    el.addEventListener('click', function (e) {
      var btn = e.target.closest('.preset-btn');
      if (!btn) return;
      $('subnet-ip').value = btn.dataset.ip;
      $('subnet-prefix').value = btn.dataset.prefix;
      render();
    });
  }

  // =============================================
  // INIT
  // =============================================
  function init() {
    renderPresets();
    var ipEl = $('subnet-ip');
    var pfxEl = $('subnet-prefix');
    var calcBtn = $('subnet-calc-btn');
    ipEl.addEventListener('input', render);
    pfxEl.addEventListener('input', render);
    pfxEl.addEventListener('change', render);
    if (calcBtn) calcBtn.addEventListener('click', render);
    render();
    initBaukasten();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
