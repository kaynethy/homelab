/* ================================================================
   FIREWALL SIMULATOR — Logik & Daten
   assets/demos/firewall.js
   ================================================================ */

'use strict';

/* ---------------------------------------------------------------
   1. NETZWERK-TOPOLOGIE
   --------------------------------------------------------------- */
var FW = (function() {

  var ZONES = {
    wan:  { id: 'wan',  label: 'WAN',  color: '#ef4444', subnet: '0.0.0.0/0',     gw: null,        trusted: false },
    mgmt: { id: 'mgmt', label: 'MGMT', color: '#4fffb0', subnet: '10.0.1.0/24',   gw: '10.0.1.1',  trusted: true  },
    svc:  { id: 'svc',  label: 'SVC',  color: '#4db8ff', subnet: '10.0.2.0/24',   gw: '10.0.2.1',  trusted: false },
    lab:  { id: 'lab',  label: 'LAB',  color: '#a78bfa', subnet: '10.0.3.0/24',   gw: '10.0.3.1',  trusted: false },
    dmz:  { id: 'dmz',  label: 'DMZ',  color: '#fb923c', subnet: '10.0.4.0/24',   gw: '10.0.4.1',  trusted: false }
  };

  var HOSTS = [
    { id: 'internet',    zone: 'wan',  label: 'Internet',         ip: '8.8.8.8',      icon: '☁',  ports: [],              desc: 'Das öffentliche Internet' },
    { id: 'attacker',    zone: 'wan',  label: 'Angreifer',        ip: '1.2.3.4',      icon: '💀', ports: [],              desc: 'Externer Angreifer / Portscan' },
    { id: 'opnsense',    zone: null,   label: 'OPNsense',         ip: '10.0.1.1',     icon: '🔥', ports: [443, 22],       desc: 'Firewall/Gateway — zentrales Nervensystem', wan: true },
    { id: 'proxmox',     zone: 'mgmt', label: 'Proxmox',          ip: '10.0.1.2',     icon: '🖥', ports: [8006, 22],      desc: 'Hypervisor — Web-UI auf Port 8006' },
    { id: 'adguard',     zone: 'mgmt', label: 'AdGuard',          ip: '10.0.1.3',     icon: '🛡', ports: [53, 3000],      desc: 'DNS-Server + Werbeblocker' },
    { id: 'jumphost',    zone: 'mgmt', label: 'Jumphost',         ip: '10.0.1.4',     icon: '💻', ports: [22],            desc: 'Management-Workstation' },
    { id: 'revproxy',    zone: 'svc',  label: 'Rev. Proxy',       ip: '10.0.2.10',    icon: '🔀', ports: [80, 443],       desc: 'Nginx/Caddy Reverse Proxy' },
    { id: 'gitea',       zone: 'svc',  label: 'Gitea',            ip: '10.0.2.11',    icon: '🐙', ports: [3000, 22],      desc: 'Git-Server' },
    { id: 'n8n',         zone: 'svc',  label: 'n8n',              ip: '10.0.2.12',    icon: '⚙', ports: [5678],          desc: 'Workflow-Automatisierung' },
    { id: 'kali',        zone: 'lab',  label: 'Kali Linux',       ip: '10.0.3.21',    icon: '🐉', ports: [22],            desc: 'Pentest-Maschine' },
    { id: 'metasploit',  zone: 'lab',  label: 'Metasploit',       ip: '10.0.3.22',    icon: '💥', ports: [4444],          desc: 'Exploit Framework' },
    { id: 'dvwa',        zone: 'lab',  label: 'DVWA',             ip: '10.0.3.30',    icon: '🎯', ports: [80],            desc: 'Damn Vulnerable Web App' },
    { id: 'webserver',   zone: 'dmz',  label: 'Webserver',        ip: '10.0.4.10',    icon: '🌍', ports: [80, 443],       desc: 'Öffentlicher Webserver' },
    { id: 'ddns',        zone: 'dmz',  label: 'DDNS',             ip: '10.0.4.11',    icon: '📡', ports: [80],            desc: 'Dynamic DNS Updater' }
  ];

  var PORTS = [
    { value: 22,    label: 'SSH (22)', proto: 'TCP' },
    { value: 53,    label: 'DNS (53)', proto: 'UDP' },
    { value: 80,    label: 'HTTP (80)', proto: 'TCP' },
    { value: 443,   label: 'HTTPS (443)', proto: 'TCP' },
    { value: 3000,  label: 'Gitea/AdGuard (3000)', proto: 'TCP' },
    { value: 4444,  label: 'Metasploit (4444)', proto: 'TCP' },
    { value: 5678,  label: 'n8n (5678)', proto: 'TCP' },
    { value: 8006,  label: 'Proxmox (8006)', proto: 'TCP' },
    { value: 51820, label: 'WireGuard (51820)', proto: 'UDP' },
    { value: 0,     label: 'custom', proto: 'TCP' }
  ];

  /* ---------------------------------------------------------------
     2. SZENARIEN & REGELWERKE
     --------------------------------------------------------------- */
  var SCENARIOS = {
    homelab: {
      id: 'homelab',
      label: 'Dein Homelab (Standard)',
      desc: 'Realistisches Homelab-Setup: MGMT hat breiten Zugang, LAB ist isoliert, DMZ ist von außen erreichbar, Default Deny.',
      rules: [
        /* MGMT */
        { iface: 'mgmt', action: 'pass',  src: 'mgmt',    dst: 'mgmt',    port: 'any', proto: 'any', desc: 'MGMT intern (gleiche Zone)' },
        { iface: 'mgmt', action: 'pass',  src: 'mgmt',    dst: 'svc',     port: 'any', proto: 'any', desc: 'MGMT darf auf alle SVC-Dienste' },
        { iface: 'mgmt', action: 'block', src: 'mgmt',    dst: 'lab',     port: 'any', proto: 'any', desc: 'MGMT braucht kein LAB' },
        { iface: 'mgmt', action: 'pass',  src: 'mgmt',    dst: 'dmz',     port: 'any', proto: 'any', desc: 'MGMT darf DMZ verwalten' },
        { iface: 'mgmt', action: 'pass',  src: 'mgmt',    dst: 'wan',     port: 443,   proto: 'TCP', desc: 'HTTPS nach außen erlaubt' },
        { iface: 'mgmt', action: 'pass',  src: 'mgmt',    dst: 'wan',     port: 80,    proto: 'TCP', desc: 'HTTP nach außen erlaubt' },
        { iface: 'mgmt', action: 'pass',  src: 'mgmt',    dst: 'wan',     port: 53,    proto: 'UDP', desc: 'DNS nach AdGuard (erzwungen)' },
        /* SVC */
        { iface: 'svc',  action: 'pass',  src: 'svc',     dst: 'svc',     port: 'any', proto: 'any', desc: 'SVC intern' },
        { iface: 'svc',  action: 'block', src: 'svc',     dst: 'mgmt',    port: 'any', proto: 'any', desc: 'SVC darf nicht nach MGMT' },
        { iface: 'svc',  action: 'pass',  src: 'svc',     dst: 'wan',     port: 443,   proto: 'TCP', desc: 'SVC → Internet HTTPS' },
        { iface: 'svc',  action: 'pass',  src: 'svc',     dst: 'wan',     port: 80,    proto: 'TCP', desc: 'SVC → Internet HTTP' },
        /* LAB */
        { iface: 'lab',  action: 'pass',  src: 'lab',     dst: 'lab',     port: 'any', proto: 'any', desc: 'LAB intern (pentest lab traffic)' },
        { iface: 'lab',  action: 'block', src: 'lab',     dst: 'mgmt',    port: 'any', proto: 'any', desc: 'LAB → MGMT verboten (Isolation!)' },
        { iface: 'lab',  action: 'block', src: 'lab',     dst: 'svc',     port: 'any', proto: 'any', desc: 'LAB → SVC verboten' },
        { iface: 'lab',  action: 'pass',  src: 'lab',     dst: 'wan',     port: 443,   proto: 'TCP', desc: 'LAB → Internet HTTPS (Updates)' },
        { iface: 'lab',  action: 'pass',  src: 'lab',     dst: 'wan',     port: 80,    proto: 'TCP', desc: 'LAB → Internet HTTP' },
        /* DMZ */
        { iface: 'dmz',  action: 'pass',  src: 'dmz',     dst: 'wan',     port: 443,   proto: 'TCP', desc: 'DMZ → Internet HTTPS' },
        { iface: 'dmz',  action: 'pass',  src: 'dmz',     dst: 'wan',     port: 80,    proto: 'TCP', desc: 'DMZ → Internet HTTP' },
        { iface: 'dmz',  action: 'block', src: 'dmz',     dst: 'mgmt',    port: 'any', proto: 'any', desc: 'DMZ darf nicht nach MGMT' },
        { iface: 'dmz',  action: 'block', src: 'dmz',     dst: 'svc',     port: 'any', proto: 'any', desc: 'DMZ darf nicht nach SVC' },
        /* WAN → Port Forwarding */
        { iface: 'wan',  action: 'pass',  src: 'wan',     dst: 'webserver', port: 443, proto: 'TCP', desc: 'Port Forwarding: HTTPS → DMZ Webserver' },
        { iface: 'wan',  action: 'pass',  src: 'wan',     dst: 'opnsense',  port: 51820, proto: 'UDP', desc: 'WireGuard VPN eingehend' },
        /* Default Deny */
        { iface: 'any',  action: 'block', src: 'any',     dst: 'any',     port: 'any', proto: 'any', desc: 'DEFAULT DENY — alles andere geblockt' }
      ]
    },
    open: {
      id: 'open',
      label: 'Alles offen (unsicher)',
      desc: '⚠ Keine Firewall-Regeln — alles erlaubt. Entspricht deinem aktuellen Setup (TP-Link Router ohne Segmentierung).',
      rules: [
        { iface: 'any', action: 'pass', src: 'any', dst: 'any', port: 'any', proto: 'any', desc: 'ALLOW ALL — keine Sicherheit!' }
      ]
    },
    closed: {
      id: 'closed',
      label: 'Alles zu (nichts geht)',
      desc: 'Extremes Default-Deny — buchstäblich kein Traffic erlaubt. Didaktisch: zeigt was passiert wenn man nur blockt.',
      rules: [
        { iface: 'any', action: 'block', src: 'any', dst: 'any', port: 'any', proto: 'any', desc: 'DEFAULT DENY ALL — nichts kommt durch' }
      ]
    },
    dmz_web: {
      id: 'dmz_web',
      label: 'DMZ → Internet (Webserver)',
      desc: 'Webserver in DMZ ist von außen erreichbar (443/80). Kompromittierter Webserver kann nicht nach MGMT/SVC.',
      rules: [
        { iface: 'wan',  action: 'pass',  src: 'wan',  dst: 'webserver', port: 443,   proto: 'TCP', desc: 'DNAT: Internet → DMZ Webserver:443' },
        { iface: 'wan',  action: 'pass',  src: 'wan',  dst: 'webserver', port: 80,    proto: 'TCP', desc: 'DNAT: Internet → DMZ Webserver:80' },
        { iface: 'dmz',  action: 'pass',  src: 'dmz',  dst: 'wan',       port: 443,   proto: 'TCP', desc: 'DMZ → Internet (Updates, APIs)' },
        { iface: 'dmz',  action: 'block', src: 'dmz',  dst: 'mgmt',      port: 'any', proto: 'any', desc: 'DMZ → MGMT VERBOTEN' },
        { iface: 'dmz',  action: 'block', src: 'dmz',  dst: 'svc',       port: 'any', proto: 'any', desc: 'DMZ → SVC VERBOTEN' },
        { iface: 'mgmt', action: 'pass',  src: 'mgmt', dst: 'dmz',       port: 22,    proto: 'TCP', desc: 'Admin kann DMZ per SSH verwalten' },
        { iface: 'any',  action: 'block', src: 'any',  dst: 'any',       port: 'any', proto: 'any', desc: 'DEFAULT DENY' }
      ]
    },
    vpn: {
      id: 'vpn',
      label: 'VPN Einwahl (WireGuard)',
      desc: 'WireGuard VPN auf OPNsense. VPN-User (10.0.5.x) darf nach MGMT und SVC, nicht nach LAB.',
      rules: [
        { iface: 'wan',  action: 'pass',  src: 'wan',  dst: 'opnsense',  port: 51820, proto: 'UDP', desc: 'WireGuard UDP eingehend' },
        { iface: 'vpn',  action: 'pass',  src: 'vpn',  dst: 'mgmt',      port: 'any', proto: 'any', desc: 'VPN → MGMT erlaubt' },
        { iface: 'vpn',  action: 'pass',  src: 'vpn',  dst: 'svc',       port: 'any', proto: 'any', desc: 'VPN → SVC erlaubt' },
        { iface: 'vpn',  action: 'block', src: 'vpn',  dst: 'lab',       port: 'any', proto: 'any', desc: 'VPN → LAB verboten' },
        { iface: 'any',  action: 'block', src: 'any',  dst: 'any',       port: 'any', proto: 'any', desc: 'DEFAULT DENY' }
      ]
    },
    lab_isolated: {
      id: 'lab_isolated',
      label: 'Lab isoliert',
      desc: 'Maximale LAB-Isolation: kein Traffic rein oder raus außer intern. Ideal für gefährliche Malware-Analyse.',
      rules: [
        { iface: 'lab',  action: 'pass',  src: 'lab',  dst: 'lab',  port: 'any', proto: 'any', desc: 'LAB intern erlaubt' },
        { iface: 'lab',  action: 'block', src: 'lab',  dst: 'any',  port: 'any', proto: 'any', desc: 'LAB → alles andere VERBOTEN' },
        { iface: 'any',  action: 'block', src: 'any',  dst: 'lab',  port: 'any', proto: 'any', desc: 'Alles → LAB VERBOTEN' },
        { iface: 'any',  action: 'block', src: 'any',  dst: 'any',  port: 'any', proto: 'any', desc: 'DEFAULT DENY' }
      ]
    }
  };

  /* ---------------------------------------------------------------
     3. PAKET-SIMULATION ENGINE
     --------------------------------------------------------------- */
  var stateTable = [];
  var stateCounter = 1;

  function getHost(id) {
    return HOSTS.find(function(h) { return h.id === id; });
  }

  function getZone(id) {
    return ZONES[id] || null;
  }

  function isSameSubnet(srcHost, dstHost) {
    if (!srcHost || !dstHost) return false;
    if (!srcHost.zone || !dstHost.zone) return false;
    return srcHost.zone === dstHost.zone;
  }

  function ruleMatches(rule, srcHost, dstHost, port, proto) {
    var srcZone  = srcHost ? srcHost.zone : 'wan';
    var dstZone  = dstHost ? dstHost.zone : 'wan';

    // iface match
    if (rule.iface !== 'any' && rule.iface !== srcZone) return false;

    // src match
    if (rule.src !== 'any') {
      if (rule.src !== srcZone && rule.src !== srcHost.id) return false;
    }

    // dst match
    if (rule.dst !== 'any') {
      var dstId = dstHost ? dstHost.id : 'internet';
      if (rule.dst !== dstZone && rule.dst !== dstId) return false;
    }

    // port match
    if (rule.port !== 'any') {
      if (rule.port !== port) return false;
    }

    // proto match
    if (rule.proto !== 'any') {
      if (rule.proto !== proto) return false;
    }

    return true;
  }

  function evaluateRules(rules, srcHost, dstHost, port, proto) {
    for (var i = 0; i < rules.length; i++) {
      if (ruleMatches(rules[i], srcHost, dstHost, port, proto)) {
        return { ruleIndex: i, rule: rules[i] };
      }
    }
    return { ruleIndex: rules.length - 1, rule: rules[rules.length - 1] };
  }

  function needsNat(srcHost, dstHost) {
    if (!srcHost || !dstHost) return false;
    if (!srcHost.zone) return false;
    // internal → external (WAN)
    var dstZone = dstHost.zone || 'wan';
    return srcHost.zone !== 'wan' && dstZone === 'wan';
  }

  function simulate(srcId, dstId, port, proto, rules) {
    var src = getHost(srcId);
    var dst = getHost(dstId);
    if (!src || !dst) return null;

    var portNum = parseInt(port) || port;
    var steps   = [];
    var allowed = false;
    var matchedRule = null;
    var matchedIdx  = -1;
    var sameSubnet  = isSameSubnet(src, dst);
    var nat         = false;
    var stateEntry  = null;

    // Step 1: Routing decision
    if (sameSubnet) {
      steps.push({
        type: 'routing',
        title: 'Schritt 1: Routing-Entscheidung',
        content: [
          'Src: ' + src.ip + ' (' + (src.zone ? src.zone.toUpperCase() : 'FW') + ')',
          'Dst: ' + dst.ip + ' (' + (dst.zone ? dst.zone.toUpperCase() : 'FW') + ')',
          '→ Gleiches Subnetz (' + (src.zone ? ZONES[src.zone].subnet : '—') + ')',
          '→ Switch leitet direkt → Firewall NICHT involviert ✓'
        ],
        result: 'bypass',
        badge: 'GLEICHE ZONE'
      });
      allowed = true;
    } else {
      // Routing via gateway
      var srcGw = src.zone ? ZONES[src.zone].gw : null;
      steps.push({
        type: 'routing',
        title: 'Schritt 1: Routing-Entscheidung',
        content: [
          'Src: ' + src.ip + ' (' + (src.zone ? src.zone.toUpperCase() : 'WAN') + ')',
          'Dst: ' + dst.ip + ' (' + (dst.zone ? dst.zone.toUpperCase() : 'WAN') + ')',
          '→ Verschiedene Subnetze → an Default Gateway (' + (srcGw || 'OPNsense') + ' = OPNsense)',
          '→ Firewall-Regelwerk wird geprüft'
        ],
        result: 'via-fw',
        badge: 'VIA FIREWALL'
      });

      // Step 2: Rule evaluation
      var match = evaluateRules(rules, src, dst, portNum, proto);
      matchedRule = match.rule;
      matchedIdx  = match.ruleIndex;

      var ruleRows = rules.map(function(r, i) {
        return {
          num: i + 1,
          action: r.action,
          src: r.src,
          dst: r.dst,
          port: r.port === 'any' ? 'any' : r.port,
          proto: r.proto,
          desc: r.desc,
          matched: i === matchedIdx
        };
      });

      steps.push({
        type: 'rules',
        title: 'Schritt 2: Firewall Regelauswertung (Interface: ' + (src.zone ? src.zone.toUpperCase() : 'WAN') + ' IN)',
        ruleRows: ruleRows,
        matchedIdx: matchedIdx,
        matchedRule: matchedRule,
        content: matchedRule.action === 'pass'
          ? ['→ Regel #' + (matchedIdx + 1) + ': ' + matchedRule.desc + ' → PASS ✅']
          : ['→ Regel #' + (matchedIdx + 1) + ': ' + matchedRule.desc + ' → BLOCK 🔴']
      });

      if (matchedRule.action === 'pass') {
        allowed = true;

        // Step 3: NAT?
        nat = needsNat(src, dst);
        if (nat) {
          var ephPort = Math.floor(Math.random() * 10000) + 49152;
          stateEntry = {
            id: stateCounter++,
            proto: proto,
            src: src.ip + ':' + ephPort,
            dst: dst.ip + ':' + portNum,
            nat: 'WAN-IP:' + ephPort,
            state: 'ESTABLISHED'
          };
          stateTable.push(stateEntry);

          steps.push({
            type: 'nat',
            title: 'Schritt 3: NAT (SNAT/Masquerading)',
            content: [
              'Src intern: ' + src.ip + ':' + ephPort + ' → WAN-IP:' + ephPort + ' (Source NAT)',
              'Dst: ' + dst.ip + ':' + portNum + ' (bleibt)',
              '',
              'State Table Eintrag erstellt:',
              src.ip + ':' + ephPort + ' → ' + dst.ip + ':' + portNum + ' | ' + proto + ' | ESTABLISHED',
              'Timeout: 3600s (TCP) / 120s (UDP)'
            ],
            stateEntry: stateEntry
          });
        } else {
          // Stateful tracking without NAT
          stateEntry = {
            id: stateCounter++,
            proto: proto,
            src: src.ip + ':???',
            dst: dst.ip + ':' + portNum,
            nat: null,
            state: 'ESTABLISHED'
          };
          stateTable.push(stateEntry);

          steps.push({
            type: 'stateful',
            title: 'Schritt 3: Stateful Tracking (kein NAT nötig)',
            content: [
              'Interne Verbindung — kein NAT erforderlich',
              'State Table Eintrag erstellt:',
              src.ip + ' → ' + dst.ip + ':' + portNum + ' | ' + proto + ' | ESTABLISHED',
              'Antwortpakete kommen automatisch durch (Stateful)'
            ],
            stateEntry: stateEntry
          });
        }

        steps.push({
          type: 'delivery',
          title: 'Schritt 4: Paket zugestellt',
          content: [
            src.label + ' → ' + (nat ? 'OPNsense (NAT) → ' : 'OPNsense → ') + dst.label,
            'Antwort: ' + dst.label + ' → ' + (nat ? 'OPNsense (State Match) → ' : 'OPNsense → ') + src.label,
            '✅ Verbindung hergestellt'
          ],
          result: 'pass'
        });

      } else {
        // Blocked
        var blockedEntry = {
          id: stateCounter++,
          proto: proto,
          src: src.ip + ':???',
          dst: dst.ip + ':' + portNum,
          nat: null,
          state: 'BLOCKED'
        };
        stateTable.push(blockedEntry);

        steps.push({
          type: 'blocked',
          title: 'Schritt 3: Paket geblockt',
          content: [
            src.label + ' → OPNsense — ✗ — ' + dst.label,
            'Kein Paket kommt durch → ' + src.label + ' bekommt Timeout (keine ICMP-Antwort)',
            '🔴 Netzwerk-Segmentierung funktioniert!'
          ],
          result: 'block',
          stateEntry: blockedEntry
        });
      }
    }

    return {
      src: src,
      dst: dst,
      port: portNum,
      proto: proto,
      allowed: allowed,
      sameSubnet: sameSubnet,
      nat: nat,
      steps: steps,
      stateEntry: stateEntry
    };
  }

  /* ---------------------------------------------------------------
     4. DHCP / DNS FLOWS
     --------------------------------------------------------------- */
  var DHCP_FLOW = [
    { step: 1, from: 'Neues Gerät',           to: 'Broadcast',          msg: 'DHCPDISCOVER',  detail: '"Gibt es hier einen DHCP-Server?" (255.255.255.255)' },
    { step: 2, from: 'OPNsense (10.0.1.1)',   to: 'Gerät',              msg: 'DHCPOFFER',     detail: 'IP: 10.0.1.150 | Subnet: /24 | GW: 10.0.1.1 | DNS: 10.0.1.3 | Lease: 86400s' },
    { step: 3, from: 'Gerät',                  to: 'OPNsense',           msg: 'DHCPREQUEST',   detail: '"Ich nehme 10.0.1.150" (Broadcast damit andere DHCP-Server wissen: nicht ihr)' },
    { step: 4, from: 'OPNsense (10.0.1.1)',   to: 'Gerät (10.0.1.150)', msg: 'DHCPACK',       detail: 'Bestätigt — 10.0.1.150 ist für 24h reserviert.' }
  ];

  var DNS_FLOW = [
    { step: 1, from: 'Gerät (10.0.1.150)',    to: 'AdGuard (10.0.1.3)', msg: 'DNS Query',       detail: '"Was ist google.com?" (gleiches Subnetz → direkt)' },
    { step: 2, from: 'AdGuard',               to: 'intern',             msg: 'Blocklist-Check', detail: 'google.com auf Blockliste? → Nein' },
    { step: 3, from: 'AdGuard',               to: 'intern',             msg: 'Cache-Check',     detail: 'google.com im Cache? → Nein (erstes Mal)' },
    { step: 4, from: 'AdGuard (10.0.1.3)',    to: 'Cloudflare (1.1.1.1)', msg: 'DoH Query',   detail: 'DNS-over-HTTPS → Firewall erlaubt (Rule: MGMT→WAN:443)' },
    { step: 5, from: 'Cloudflare',            to: 'AdGuard',            msg: 'DNS Answer',      detail: 'google.com = 142.250.80.46 (TTL 300s)' },
    { step: 6, from: 'AdGuard',               to: 'intern',             msg: 'Cache Update',    detail: 'Antwort gecacht für 300s' },
    { step: 7, from: 'AdGuard (10.0.1.3)',    to: 'Gerät (10.0.1.150)', msg: 'DNS Answer',     detail: 'google.com = 142.250.80.46' }
  ];

  /* ---------------------------------------------------------------
     5. GLOSSAR-KONTEXT-BEGRIFFE
     --------------------------------------------------------------- */
  var TERMS = {
    nat: {
      title: 'NAT (Network Address Translation)',
      body: 'Deine internen IPs (10.0.x.x) sind PRIVAT — sie funktionieren nicht im Internet.\n\nSNAT (ausgehend): Dein PC (10.0.1.4) → Firewall ersetzt Source-IP mit ihrer öffentlichen WAN-IP → Google sieht nur die WAN-IP, nicht deine interne.\n\nDNAT (eingehend, Port Forwarding): Internet-User ruft deine-domain.de:443 → Firewall leitet an 10.0.4.10:443 (DMZ Webserver).\n\nDie State Table merkt sich welche interne IP welche externe Verbindung hat → Antworten werden korrekt zurückgeleitet.'
    },
    stateful: {
      title: 'Stateful Inspection',
      body: 'Die Firewall merkt sich jede Verbindung in einer "State Table".\n\nWenn die Antwort zurückkommt, prüft die Firewall: "Gehört dieses Paket zu einer bekannten Verbindung?" → Ja → automatisch durchlassen.\n\nEin Paket von außen OHNE vorherige Verbindung? → Kein State → DROP.\n\nDeshalb brauchst du nur Regeln für AUSGEHENDEN Traffic. Antworten kommen automatisch durch.'
    },
    rules: {
      title: 'Firewall-Regeln (Top-Down)',
      body: 'Regeln werden TOP-DOWN abgearbeitet — die ERSTE passende Regel gewinnt.\n\nSpezifische Regeln oben, allgemeine unten. Letzte Regel: DEFAULT DENY.\n\nWenn du eine BLOCK-Regel VOR eine PASS-Regel ziehst, wird der Traffic geblockt — auch wenn die PASS-Regel eigentlich passen würde. Deshalb ist die REIHENFOLGE so wichtig!'
    },
    zones: {
      title: 'Zonen & Vertrauensniveaus',
      body: 'WAN (untrusted): das Internet — hier kommt der Feind her.\nMGMT (trusted): interne Verwaltung — höchstes Vertrauen.\nSVC (semi-trusted): Dienste die von intern erreichbar sein müssen.\nLAB (untrusted intern): Pentest-Labor — darf NICHT nach MGMT.\nDMZ (semi-trusted extern): Dienste die vom Internet erreichbar sind.\n\nRegel: trusted → untrusted = erlaubt. Untrusted → trusted = Default Deny.'
    },
    gateway: {
      title: 'Default Gateway',
      body: 'Die Firewall IST das Default Gateway für alle Subnetze.\n\nWenn ein Gerät in 10.0.1.0/24 ein Paket an ein anderes Subnetz oder das Internet schicken will, sendet es das Paket an sein Gateway (10.0.1.1 = OPNsense).\n\nDie Firewall entscheidet: erlauben? wohin weiterleiten? NAT anwenden?\n\nGeräte im GLEICHEN Subnetz kommunizieren direkt via Switch — kein Gateway nötig.'
    },
    dhcp: {
      title: 'DHCP (Dynamic Host Configuration Protocol)',
      body: 'DHCP verteilt automatisch IP-Konfigurationen an neue Geräte.\n\nDHCPDISCOVER → DHCPOFFER → DHCPREQUEST → DHCPACK\n\nJedes Subnetz kann seinen eigenen DHCP-Server haben. OPNsense kann DHCP für alle VLANs übernehmen.\n\nStatische Leases: bekannte Geräte bekommen immer dieselbe IP (Proxmox immer .2, AdGuard immer .3).'
    },
    dns: {
      title: 'DNS in der Firewall',
      body: 'AdGuard ist der DNS-Server (nicht die Firewall).\n\nDie Firewall erzwingt: alle DNS-Queries müssen durch AdGuard (Port 53 nur zu 10.0.1.3 erlauben).\n\nWas passiert ohne diese Regel: Gerät könnte Port 53 direkt an 8.8.8.8 schicken → AdGuard-Blocking wird umgangen (DNS-Bypass).\n\nMit DoH-Blocking: Port 443 zu bekannten DoH-Servern blockieren → kein heimlicher DNS-Tunnel.'
    },
    samesubnet: {
      title: 'Gleiche Zone — kein Firewall-Check',
      body: 'Wenn Quelle und Ziel im gleichen Subnetz sind (z.B. Jumphost 10.0.1.4 → Proxmox 10.0.1.2), kommunizieren sie direkt über den Switch.\n\nDie Firewall ist NICHT involviert!\n\nARP klärt die MAC-Adresse → Frames gehen direkt Jumphost-MAC → Proxmox-MAC.\n\nDas bedeutet: Firewall-Regeln helfen nicht gegen Angreifer die bereits im gleichen Subnetz sind → deshalb ist Subnetz-Segmentierung wichtig.'
    }
  };

  /* Public API */
  return {
    ZONES: ZONES,
    HOSTS: HOSTS,
    PORTS: PORTS,
    SCENARIOS: SCENARIOS,
    TERMS: TERMS,
    DHCP_FLOW: DHCP_FLOW,
    DNS_FLOW: DNS_FLOW,
    simulate: simulate,
    getStateTable: function() { return stateTable; },
    clearStateTable: function() { stateTable = []; stateCounter = 1; },
    getHost: getHost,
    getZone: getZone
  };
})();
