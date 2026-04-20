/* === DNS LOOKUP VISUALIZER === */
(function () {
  'use strict';

  var PURPLE = '#a78bfa';

  // =============================================
  // SIMULATED RESPONSES
  // =============================================
  var SIMULATED_RESPONSES = {
    'proxmox.homelab.local': { type: 'A', answer: '192.168.0.200', ttl: 3600, source: 'rewrite', hops: 1 },
    'adguard.homelab.local': { type: 'A', answer: '192.168.0.201', ttl: 3600, source: 'rewrite', hops: 1 },
    'jumphost.homelab.local': { type: 'A', answer: '192.168.0.204', ttl: 3600, source: 'rewrite', hops: 1 },
    'git.homelab.local': { type: 'A', answer: '192.168.0.210', ttl: 3600, source: 'rewrite', hops: 1 },
    'mail.homelab.local': { type: 'A', answer: '192.168.0.215', ttl: 3600, source: 'rewrite', hops: 1 },
    'google.com': { type: 'A', answer: '142.250.80.46', ttl: 300, source: 'recursive', hops: 4 },
    'cloudflare.com': { type: 'A', answer: '104.16.132.229', ttl: 300, source: 'recursive', hops: 4 },
    'mail.google.com': { type: 'CNAME', answer: 'googlemail.l.google.com \u2192 142.250.80.17', ttl: 3600, source: 'recursive', hops: 5 },
    'google.com_MX': { type: 'MX', answer: '10 smtp.google.com, 20 smtp2.google.com', ttl: 3600, source: 'recursive', hops: 4 },
    'ads.doubleclick.net': { type: 'BLOCKED', answer: '0.0.0.0', blocklist: 'OISD Blocklist', hops: 1 },
    'telemetry.microsoft.com': { type: 'BLOCKED', answer: '0.0.0.0', blocklist: 'AdGuard DNS Filter', hops: 1 },
    'facebook.tracker.example': { type: 'BLOCKED', answer: '0.0.0.0', blocklist: 'HaGeZi Multi PRO', hops: 1 },
    'gibts.nicht.example.com': { type: 'NXDOMAIN', answer: null, hops: 4 },
    '192.168.0.200': { type: 'PTR', answer: 'proxmox.homelab.local', ttl: 86400, source: 'rewrite', hops: 1 },
    '8.8.8.8': { type: 'PTR', answer: 'dns.google', ttl: 86400, source: 'recursive', hops: 4 }
  };

  // =============================================
  // SERVER NODES
  // =============================================
  var SERVERS = {
    pc:    { id: 'pc',    icon: '\uD83D\uDCBB', name: 'Dein PC',         ip: '192.168.0.155',    desc: 'Stub Resolver im Betriebssystem. Sendet DNS-Queries an den konfigurierten DNS-Server. Hat einen winzigen lokalen Cache (nscd/systemd-resolved).' },
    adguard: { id: 'adguard', icon: '\uD83D\uDEE1\uFE0F', name: 'AdGuard DNS', ip: '192.168.0.201', desc: 'AdGuard Home empf\u00E4ngt alle DNS-Anfragen, pr\u00FCft gegen Blocklists (OISD, HaGeZi, AdGuard Default), cached Antworten und leitet den Rest verschl\u00FCsselt an Cloudflare weiter.\n\nCache: ~847 Eintr\u00E4ge\nBlocklists: OISD, HaGeZi Multi PRO, AdGuard DNS Filter\nBlocked heute: ~1.247 Queries' },
    cloudflare: { id: 'cloudflare', icon: '\u2601\uFE0F', name: 'Cloudflare DoH', ip: '1.1.1.1', desc: 'Cloudflare\u2019s rekursiver DNS-Resolver. Empf\u00E4ngt Queries via DNS-over-HTTPS (verschl\u00FCsselt). Cached aggressiv und startet bei Root falls n\u00F6tig.' },
    root:  { id: 'root',  icon: '\uD83C\uDF10', name: 'Root DNS',       ip: '(13 Root Server)', desc: 'Die 13 Root-Nameserver (a.root-servers.net bis m.root-servers.net) sind der Startpunkt f\u00FCr jede DNS-Aufl\u00F6sung. Sie kennen nicht die Antwort, verweisen aber auf den zust\u00E4ndigen TLD-Server.' },
    tld:   { id: 'tld',   icon: '\uD83D\uDCC1', name: 'TLD Server',     ip: '(z.B. .com, .local)', desc: 'TLD-Server verwalten eine Top-Level-Domain (.com, .de, .local). Sie kennen nicht die finale Antwort, verweisen aber auf den Authoritative Nameserver der gesuchten Domain.' },
    auth:  { id: 'auth',  icon: '\uD83D\uDCCB', name: 'Authoritative NS', ip: '(Ziel-Domain)',   desc: 'Der Authoritative Nameserver HAT die tats\u00E4chliche DNS-Antwort. Hier endet die Kette. Er antwortet mit dem gesuchten A, MX, CNAME etc. Record.' },
    google: { id: 'google', icon: '\uD83C\uDF10', name: 'Google DNS',   ip: '8.8.8.8',          desc: 'Google\u2019s \u00F6ffentlicher DNS-Resolver. Wird oft von Browsern automatisch \u00FCber DoH genutzt, was den lokalen DNS-Filter umgeht.' }
  };

  // =============================================
  // RECORD TYPE INFO
  // =============================================
  var RECORD_TYPES = {
    A:     { label: 'A (Address)',          desc: 'Bildet einen Domainnamen auf eine IPv4-Adresse ab. Der h\u00E4ufigste DNS-Record-Typ.' },
    AAAA:  { label: 'AAAA (IPv6 Address)',  desc: 'Wie A, aber f\u00FCr IPv6-Adressen (128 Bit statt 32 Bit).' },
    CNAME: { label: 'CNAME (Canonical Name)', desc: 'Alias f\u00FCr einen anderen Domainnamen. mail.example.com \u2192 example.com. Folgt einer Kette bis ein A-Record gefunden wird.' },
    MX:    { label: 'MX (Mail Exchange)',   desc: 'Bestimmt welcher Server E-Mails f\u00FCr diese Domain empf\u00E4ngt. Priority-Wert: niedrigere Zahl = h\u00F6here Priorit\u00E4t.' },
    TXT:   { label: 'TXT (Text)',           desc: 'Speichert beliebigen Text. Wird f\u00FCr SPF (E-Mail-Auth), DKIM, Domain-Verifizierung und andere Metadaten genutzt.' },
    NS:    { label: 'NS (Nameserver)',      desc: 'Gibt an welcher DNS-Server f\u00FCr eine Zone zust\u00E4ndig (authoritative) ist. Wird bei Delegation genutzt.' },
    SOA:   { label: 'SOA (Start of Authority)', desc: 'Enth\u00E4lt Zonen-Metadaten: Prim\u00E4r-NS, Admin-Mail, Seriennummer, Refresh/Retry/Expire Timer.' },
    PTR:   { label: 'PTR (Pointer)',        desc: 'Reverse DNS \u2014 bildet eine IP-Adresse auf einen Domainnamen ab. Das Gegenteil von A-Records.' }
  };

  // =============================================
  // SCENARIO DEFINITIONS
  // =============================================
  function buildNormalSteps(domain, answer, recordType) {
    var tldPart = domain.split('.').slice(-1)[0];
    var domainPart = domain.split('.').slice(-2).join('.');
    return [
      { from: 'pc', to: 'adguard', type: 'query', label: 'Query: "' + domain + ' ' + recordType + '?"', desc: 'Dein PC (Stub Resolver) fragt den konfigurierten DNS-Server (AdGuard) nach der Domain.', serverStates: { pc: 'queried', adguard: 'idle' } },
      { from: null, to: 'adguard', type: 'check', label: 'Cache-Check + Blocklist', desc: 'AdGuard pr\u00FCft: Ist die Domain gecacht? Steht sie auf einer Blocklist? Gibt es einen DNS Rewrite?\n\u2192 Nicht im Cache, nicht geblockt, kein Rewrite.', serverStates: { adguard: 'queried' } },
      { from: 'adguard', to: 'cloudflare', type: 'query', label: 'Forward Query (HTTPS)', desc: 'AdGuard kennt die Antwort nicht und forwarded die Anfrage via DNS-over-HTTPS an Cloudflare (1.1.1.1). Die Verbindung ist TLS-verschl\u00FCsselt.', serverStates: { adguard: 'queried', cloudflare: 'idle' } },
      { from: 'cloudflare', to: 'root', type: 'query', label: 'Query: "Wer ist f\u00FCr .' + tldPart + ' zust\u00E4ndig?"', desc: 'Cloudflare startet den rekursiven Lookup bei den Root-Servern. "Wer kennt die TLD .' + tldPart + '?"', serverStates: { cloudflare: 'queried', root: 'idle' } },
      { from: 'root', to: 'cloudflare', type: 'referral', label: 'Referral: "Frag den .' + tldPart + ' TLD Server"', desc: 'Der Root-Server kennt die Antwort nicht, verweist aber auf den zust\u00E4ndigen TLD-Server f\u00FCr .' + tldPart + '.', serverStates: { root: 'referral', cloudflare: 'queried' } },
      { from: 'cloudflare', to: 'tld', type: 'query', label: 'Query: "Wer ist f\u00FCr ' + domainPart + ' zust\u00E4ndig?"', desc: 'Cloudflare folgt dem Referral und fragt den TLD-Server nach dem Authoritative Nameserver f\u00FCr ' + domainPart + '.', serverStates: { cloudflare: 'queried', tld: 'idle' } },
      { from: 'tld', to: 'cloudflare', type: 'referral', label: 'Referral: "Frag den Authoritative NS"', desc: 'Der TLD-Server verweist auf den Authoritative Nameserver, der die Zone ' + domainPart + ' verwaltet.', serverStates: { tld: 'referral', cloudflare: 'queried' } },
      { from: 'cloudflare', to: 'auth', type: 'query', label: 'Query: "' + domain + ' ' + recordType + '?"', desc: 'Cloudflare fragt den Authoritative Nameserver direkt nach dem Record.', serverStates: { cloudflare: 'queried', auth: 'idle' } },
      { from: 'auth', to: 'cloudflare', type: 'answer', label: 'Antwort: ' + recordType + ' ' + answer, desc: 'Der Authoritative Server HAT die Antwort und liefert den Record zur\u00FCck. Diese Antwort ist die autoritative (verbindliche) Quelle.', serverStates: { auth: 'answering', cloudflare: 'queried' } },
      { from: 'cloudflare', to: 'adguard', type: 'answer', label: 'Antwort weiterleiten + cachen', desc: 'Cloudflare cached die Antwort (TTL-basiert) und leitet sie an AdGuard zur\u00FCck.', serverStates: { cloudflare: 'answering', adguard: 'idle' } },
      { from: 'adguard', to: 'pc', type: 'answer', label: 'Antwort: ' + answer, desc: 'AdGuard cached die Antwort ebenfalls und liefert sie an deinen PC. Der PC cached sie auch lokal.\n\nGesamte Kette: 4 Server befragt, ~45ms.', serverStates: { adguard: 'answering', pc: 'idle' } }
    ];
  }

  function buildCacheSteps(domain, answer) {
    return [
      { from: 'pc', to: 'adguard', type: 'query', label: 'Query: "' + domain + '?"', desc: 'Dein PC fragt AdGuard nach der Domain.', serverStates: { pc: 'queried', adguard: 'idle' } },
      { from: null, to: 'adguard', type: 'cache', label: '\u26A1 Cache Hit! TTL noch 2847s', desc: 'AdGuard findet die Antwort im lokalen Cache! Die Antwort wurde beim letzten Lookup gespeichert. TTL (Time To Live) bestimmt wie lange der Cache g\u00FCltig ist.\n\nWarum schneller? Kein Netzwerk-Traffic n\u00F6tig \u2014 die Antwort kommt direkt aus dem Speicher.', serverStates: { adguard: 'cache' } },
      { from: 'adguard', to: 'pc', type: 'answer', label: 'Antwort (aus Cache): ' + answer, desc: 'AdGuard antwortet sofort aus dem Cache. Keine weiteren Server befragt.\n\nGesamt-Zeit: ~1ms (nur lokales Netzwerk).', serverStates: { adguard: 'answering', pc: 'idle' } }
    ];
  }

  function buildBlockedSteps(domain, blocklist) {
    return [
      { from: 'pc', to: 'adguard', type: 'query', label: 'Query: "' + domain + '?"', desc: 'Dein PC fragt AdGuard nach der Domain.', serverStates: { pc: 'queried', adguard: 'idle' } },
      { from: null, to: 'adguard', type: 'blocked', label: '\u274C BLOCKED by ' + blocklist, desc: 'AdGuard pr\u00FCft die Blocklists und findet einen Treffer!\n\nBlocklist: ' + blocklist + '\nDomain: ' + domain + '\nAktion: Anfrage wird mit 0.0.0.0 beantwortet (Null-Route)\n\nDas bedeutet: Der Browser bekommt keine g\u00FCltige IP und kann den Tracking-/Werbe-Server nicht erreichen.', serverStates: { adguard: 'blocked' } },
      { from: 'adguard', to: 'pc', type: 'blocked_answer', label: 'Antwort: 0.0.0.0 (geblockt)', desc: 'AdGuard antwortet mit 0.0.0.0 \u2014 der Werbung/Tracking wird nicht geladen. Kein Traffic verlässt dein Netzwerk f\u00FCr diese Domain.', serverStates: { adguard: 'blocked', pc: 'idle' } }
    ];
  }

  function buildRewriteSteps(domain, answer) {
    return [
      { from: 'pc', to: 'adguard', type: 'query', label: 'Query: "' + domain + '?"', desc: 'Dein PC fragt AdGuard nach der internen Domain.', serverStates: { pc: 'queried', adguard: 'idle' } },
      { from: null, to: 'adguard', type: 'rewrite', label: '\uD83C\uDFE0 LOCAL REWRITE \u2192 ' + answer, desc: 'AdGuard hat einen DNS Rewrite konfiguriert:\n' + domain + ' \u2192 ' + answer + '\n\nDie Antwort wird direkt generiert, OHNE an Cloudflare zu forwarden. Perfekt f\u00FCr interne Hostnamen statt /etc/hosts auf jedem Ger\u00E4t.', serverStates: { adguard: 'rewrite' } },
      { from: 'adguard', to: 'pc', type: 'answer', label: 'Antwort: ' + answer + ' (Rewrite)', desc: 'AdGuard antwortet sofort mit der lokal definierten IP.\n\nGesamt-Zeit: ~1ms. Kein externer DNS-Traffic.', serverStates: { adguard: 'answering', pc: 'idle' } }
    ];
  }

  function buildDohBypassSteps() {
    return [
      { from: 'pc', to: 'google', type: 'bypass', label: '\u26A0 Browser DoH direkt an Google', desc: 'Chrome/Firefox nutzt automatisch DNS-over-HTTPS direkt an Google (8.8.8.8) oder Cloudflare (1.1.1.1).\n\nDer DNS-Query geht DIREKT vom Browser an Google \u2014 AdGuard sieht die Anfrage NIE!', serverStates: { pc: 'queried', google: 'idle' } },
      { from: null, to: 'adguard', type: 'bypassed', label: '\u2014 AdGuard wird umgangen!', desc: 'AdGuard erh\u00E4lt die Anfrage nicht. Kein Blocking, kein Logging, keine Kontrolle.\n\n\u26A0 Browser-DoH umgeht deinen lokalen DNS-Filter!', serverStates: { adguard: 'bypassed' } },
      { from: 'google', to: 'pc', type: 'answer', label: 'Antwort direkt an Browser', desc: 'Google DNS antwortet direkt. Alle Werbung und Tracking wird geladen.\n\nFix:\n\u2022 Chrome: chrome://settings/security \u2192 DoH deaktivieren\n\u2022 Firewall: UDP/443 (QUIC) + DoH-IPs blocken (OPNsense, Phase 2)\n\u2022 Alternativ: DNS-Redirect auf OPNsense (alle DNS-Queries an AdGuard zwingen)', serverStates: { google: 'answering', pc: 'idle' } }
    ];
  }

  function buildNxdomainSteps(domain) {
    var tldPart = domain.split('.').slice(-1)[0];
    var domainPart = domain.split('.').slice(-2).join('.');
    return [
      { from: 'pc', to: 'adguard', type: 'query', label: 'Query: "' + domain + '?"', desc: 'Dein PC fragt nach einer Domain die nicht existiert.', serverStates: { pc: 'queried', adguard: 'idle' } },
      { from: 'adguard', to: 'cloudflare', type: 'query', label: 'Forward Query', desc: 'AdGuard forwarded an Cloudflare.', serverStates: { adguard: 'queried', cloudflare: 'idle' } },
      { from: 'cloudflare', to: 'root', type: 'query', label: 'Root Query', desc: 'Cloudflare fragt die Root-Server.', serverStates: { cloudflare: 'queried', root: 'idle' } },
      { from: 'root', to: 'cloudflare', type: 'referral', label: 'Referral \u2192 TLD', desc: 'Root verweist auf den TLD-Server.', serverStates: { root: 'referral' } },
      { from: 'cloudflare', to: 'tld', type: 'query', label: 'TLD Query', desc: 'Cloudflare fragt den TLD-Server.', serverStates: { cloudflare: 'queried', tld: 'idle' } },
      { from: 'tld', to: 'cloudflare', type: 'referral', label: 'Referral \u2192 Auth NS', desc: 'TLD verweist auf den Authoritative NS.', serverStates: { tld: 'referral' } },
      { from: 'cloudflare', to: 'auth', type: 'query', label: 'Query an Auth NS', desc: 'Cloudflare fragt den Authoritative Nameserver.', serverStates: { cloudflare: 'queried', auth: 'idle' } },
      { from: 'auth', to: 'cloudflare', type: 'nxdomain', label: 'NXDOMAIN \u2014 existiert nicht!', desc: 'Der Authoritative Server antwortet: NXDOMAIN \u2014 diese Domain existiert nicht.\n\nH\u00E4ufige Ursachen:\n\u2022 Tippfehler in der Domain\n\u2022 Domain abgelaufen (nicht verl\u00E4ngert)\n\u2022 DNS-Propagation noch nicht abgeschlossen\n\u2022 Domain wurde nie registriert', serverStates: { auth: 'nxdomain' } },
      { from: 'cloudflare', to: 'adguard', type: 'nxdomain', label: 'NXDOMAIN weiterleiten', desc: 'Cloudflare leitet das NXDOMAIN-Ergebnis weiter.', serverStates: { cloudflare: 'nxdomain' } },
      { from: 'adguard', to: 'pc', type: 'nxdomain', label: 'NXDOMAIN an Client', desc: 'AdGuard leitet NXDOMAIN an deinen PC. Der Browser zeigt "Server nicht gefunden" / "DNS_PROBE_FINISHED_NXDOMAIN".', serverStates: { adguard: 'nxdomain', pc: 'idle' } }
    ];
  }

  // =============================================
  // STATE
  // =============================================
  var state = {
    domain: 'proxmox.homelab.local',
    recordType: 'A',
    scenario: 'normal',
    currentStep: 0,
    steps: [],
    response: null,
    speed: 1,
    autoPlaying: false,
    autoTimer: null,
    hierarchyOpen: false,
    selectedServer: null,
    resolved: false
  };

  // =============================================
  // DOM HELPERS
  // =============================================
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function $(id) { return document.getElementById(id); }

  function getResponse(domain, recType) {
    var key = domain;
    if (recType !== 'A' && recType !== 'PTR') key = domain + '_' + recType;
    if (SIMULATED_RESPONSES[key]) return SIMULATED_RESPONSES[key];
    if (SIMULATED_RESPONSES[domain]) return SIMULATED_RESPONSES[domain];
    // Generic fallback
    return { type: recType, answer: (Math.floor(Math.random() * 200) + 20) + '.' + (Math.floor(Math.random() * 200) + 20) + '.' + (Math.floor(Math.random() * 200) + 10) + '.' + (Math.floor(Math.random() * 254) + 1), ttl: 300, source: 'recursive', hops: 4 };
  }

  function resolveScenario() {
    var d = state.domain;
    var r = state.recordType;
    var resp = getResponse(d, r);
    state.response = resp;

    if (state.scenario === 'cache') {
      state.steps = buildCacheSteps(d, resp.answer || '142.250.80.46');
    } else if (state.scenario === 'blocked') {
      var bl = resp.type === 'BLOCKED' ? resp.blocklist : 'OISD Blocklist';
      state.steps = buildBlockedSteps(d, bl);
    } else if (state.scenario === 'doh') {
      state.steps = buildDohBypassSteps();
    } else if (state.scenario === 'nxdomain') {
      state.steps = buildNxdomainSteps(d);
    } else if (state.scenario === 'rewrite') {
      var ans = resp.source === 'rewrite' ? resp.answer : '192.168.0.200';
      state.steps = buildRewriteSteps(d, ans);
    } else {
      // normal
      if (resp.type === 'BLOCKED') {
        state.steps = buildBlockedSteps(d, resp.blocklist);
      } else if (resp.source === 'rewrite') {
        state.steps = buildRewriteSteps(d, resp.answer);
      } else if (resp.type === 'NXDOMAIN') {
        state.steps = buildNxdomainSteps(d);
      } else {
        state.steps = buildNormalSteps(d, resp.answer, r);
      }
    }
    state.currentStep = 0;
    state.resolved = true;
  }

  // =============================================
  // SERVER STATE COLORS
  // =============================================
  var SERVER_STATE_STYLES = {
    idle: { border: 'var(--border)', bg: 'transparent' },
    queried: { border: '#a78bfa', bg: 'rgba(167,139,250,0.06)' },
    answering: { border: '#4fffb0', bg: 'rgba(79,255,176,0.06)' },
    referral: { border: '#fb923c', bg: 'rgba(251,146,60,0.06)' },
    cache: { border: '#4fffb0', bg: 'rgba(79,255,176,0.1)' },
    rewrite: { border: '#4fffb0', bg: 'rgba(79,255,176,0.1)' },
    blocked: { border: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
    nxdomain: { border: '#ef4444', bg: 'rgba(239,68,68,0.06)' },
    bypassed: { border: '#ef4444', bg: 'rgba(239,68,68,0.06)' }
  };

  function getServerState(serverId) {
    if (state.currentStep <= 0 || !state.steps.length) return 'idle';
    var step = state.steps[state.currentStep - 1];
    if (step && step.serverStates && step.serverStates[serverId]) return step.serverStates[serverId];
    return 'idle';
  }

  // =============================================
  // RENDER: INPUT
  // =============================================
  function renderInput() {
    var html = '<div class="dns-input-section">';
    html += '<div class="dns-input-row">';
    html += '<span class="dns-input-label">Domain:</span>';
    html += '<input type="text" class="dns-input" id="dns-domain" value="' + esc(state.domain) + '" placeholder="proxmox.homelab.local" spellcheck="false" autocomplete="off">';
    html += '<span class="dns-input-label">Record-Typ:</span>';
    html += '<select class="dns-select" id="dns-rectype">';
    Object.keys(RECORD_TYPES).forEach(function (t) {
      var sel = t === state.recordType ? ' selected' : '';
      html += '<option value="' + t + '"' + sel + '>' + t + '</option>';
    });
    html += '</select>';
    html += '<button class="dns-resolve-btn" id="dns-resolve">\uD83D\uDD0D Aufl\u00F6sen</button>';
    html += '</div>';

    // Record type info
    var rt = RECORD_TYPES[state.recordType];
    if (rt) {
      html += '<div class="dns-rectype-info">\u2139\uFE0F ' + esc(rt.label) + ': ' + esc(rt.desc) + '</div>';
    }

    // Quick lookups
    html += '<div class="dns-presets">';
    html += '<span class="dns-presets-label">Quick-Lookups:</span>';
    var presets = [
      { label: 'google.com', d: 'google.com', t: 'A' },
      { label: 'proxmox.homelab.local', d: 'proxmox.homelab.local', t: 'A' },
      { label: 'mail.homelab.local', d: 'mail.homelab.local', t: 'A' },
      { label: '8.8.8.8 (Reverse)', d: '8.8.8.8', t: 'PTR' },
      { label: 'cloudflare.com', d: 'cloudflare.com', t: 'A' }
    ];
    presets.forEach(function (p) {
      html += '<button class="dns-preset-btn" data-domain="' + esc(p.d) + '" data-type="' + p.t + '">' + esc(p.label) + '</button>';
    });
    html += '</div>';

    // Scenarios
    html += '<div class="dns-scenarios">';
    html += '<span class="dns-presets-label">Szenarien:</span>';
    var scenarios = [
      { id: 'normal', label: 'Normal Lookup' },
      { id: 'cache', label: 'Cache Hit' },
      { id: 'blocked', label: 'Geblockt (Werbung)' },
      { id: 'doh', label: 'DoH Bypass' },
      { id: 'nxdomain', label: 'NXDOMAIN' },
      { id: 'rewrite', label: 'Interner Rewrite' }
    ];
    scenarios.forEach(function (s) {
      var cls = state.scenario === s.id ? ' dns-scenario-active' : '';
      html += '<button class="dns-scenario-btn' + cls + '" data-scenario="' + s.id + '">' + esc(s.label) + '</button>';
    });
    html += '</div>';

    html += '</div>';
    return html;
  }

  // =============================================
  // RENDER: SERVER CHAIN
  // =============================================
  function renderChain() {
    if (!state.resolved) return '';
    var chainServers = getChainServers();

    var html = '<div class="dns-section">';
    html += '<div class="dns-section-title"><span class="dns-bar"></span>DNS RESOLUTION CHAIN</div>';
    html += '<div class="dns-chain">';

    chainServers.forEach(function (sId, idx) {
      var srv = SERVERS[sId];
      var st = getServerState(sId);
      var stStyle = SERVER_STATE_STYLES[st] || SERVER_STATE_STYLES.idle;
      var selected = state.selectedServer === sId ? ' dns-node-selected' : '';

      html += '<div class="dns-node' + selected + '" data-server="' + sId + '" style="border-color:' + stStyle.border + ';background:' + stStyle.bg + '">';
      html += '<div class="dns-node-icon">' + srv.icon + '</div>';
      html += '<div class="dns-node-name">' + esc(srv.name) + '</div>';
      html += '<div class="dns-node-ip">' + esc(srv.ip) + '</div>';
      if (st === 'cache') html += '<div class="dns-node-badge dns-badge-cache">\u26A1 Cache Hit</div>';
      if (st === 'blocked') html += '<div class="dns-node-badge dns-badge-blocked">\u274C Blocked</div>';
      if (st === 'rewrite') html += '<div class="dns-node-badge dns-badge-rewrite">\uD83C\uDFE0 Rewrite</div>';
      if (st === 'bypassed') html += '<div class="dns-node-badge dns-badge-bypassed">\u26A0 Umgangen</div>';
      if (st === 'nxdomain') html += '<div class="dns-node-badge dns-badge-nxdomain">NXDOMAIN</div>';
      html += '</div>';

      if (idx < chainServers.length - 1) {
        html += '<div class="dns-chain-arrow">\u2192</div>';
      }
    });

    html += '</div>';

    // Server detail panel
    if (state.selectedServer && SERVERS[state.selectedServer]) {
      var srv = SERVERS[state.selectedServer];
      html += '<div class="dns-server-detail">';
      html += '<div class="dns-server-detail-title">' + srv.icon + ' ' + esc(srv.name) + ' (' + esc(srv.ip) + ')</div>';
      html += '<div class="dns-server-detail-desc">' + esc(srv.desc).replace(/\n/g, '<br>') + '</div>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function getChainServers() {
    if (state.scenario === 'doh') return ['pc', 'google', 'adguard'];
    if (state.scenario === 'blocked' || state.scenario === 'cache' || state.scenario === 'rewrite') return ['pc', 'adguard'];
    var resp = state.response;
    if (resp && resp.source === 'rewrite') return ['pc', 'adguard'];
    if (resp && resp.type === 'BLOCKED') return ['pc', 'adguard'];
    return ['pc', 'adguard', 'cloudflare', 'root', 'tld', 'auth'];
  }

  // =============================================
  // RENDER: CONTROLS
  // =============================================
  function renderControls() {
    if (!state.resolved) return '';
    var max = state.steps.length;
    var cur = state.currentStep;

    var html = '<div class="dns-controls">';
    html += '<button class="dns-ctrl-btn" id="dns-prev" ' + (cur <= 0 ? 'disabled' : '') + '>\u25C0 Zur\u00FCck</button>';
    html += '<span class="dns-ctrl-step">Schritt ' + cur + ' / ' + max + '</span>';
    html += '<button class="dns-ctrl-btn" id="dns-next" ' + (cur >= max ? 'disabled' : '') + '>\u25B6 Weiter</button>';
    html += '<button class="dns-ctrl-btn dns-ctrl-auto" id="dns-auto">' + (state.autoPlaying ? '\u23F8 Pause' : '\u25B6\u25B6 Auto-Play') + '</button>';
    html += '<button class="dns-ctrl-btn dns-ctrl-reset" id="dns-reset">\u21BA Reset</button>';
    html += '</div>';

    html += '<div class="dns-speed">';
    html += '<span class="dns-speed-label">Geschwindigkeit:</span>';
    [0.5, 1, 2].forEach(function (sp) {
      var cls = state.speed === sp ? ' dns-speed-active' : '';
      html += '<button class="dns-speed-btn' + cls + '" data-speed="' + sp + '">' + sp + 'x</button>';
    });
    html += '</div>';
    return html;
  }

  // =============================================
  // RENDER: STEP DETAIL
  // =============================================
  function renderStepDetail() {
    if (!state.resolved || state.currentStep <= 0) return '';
    var step = state.steps[state.currentStep - 1];
    if (!step) return '';

    var arrowColor = '#a78bfa';
    var arrowLabel = 'QUERY';
    if (step.type === 'answer') { arrowColor = '#4fffb0'; arrowLabel = 'ANSWER'; }
    if (step.type === 'referral') { arrowColor = '#fb923c'; arrowLabel = 'REFERRAL'; }
    if (step.type === 'blocked' || step.type === 'blocked_answer') { arrowColor = '#ef4444'; arrowLabel = 'BLOCKED'; }
    if (step.type === 'nxdomain') { arrowColor = '#ef4444'; arrowLabel = 'NXDOMAIN'; }
    if (step.type === 'cache') { arrowColor = '#4fffb0'; arrowLabel = 'CACHE HIT'; }
    if (step.type === 'rewrite') { arrowColor = '#4fffb0'; arrowLabel = 'REWRITE'; }
    if (step.type === 'bypass') { arrowColor = '#ef4444'; arrowLabel = 'BYPASS'; }
    if (step.type === 'bypassed') { arrowColor = '#ef4444'; arrowLabel = 'BYPASSED'; }

    var html = '<div class="dns-section">';
    html += '<div class="dns-section-title"><span class="dns-bar"></span>SCHRITT ' + state.currentStep + ': ' + esc(step.label) + '</div>';
    html += '<div class="dns-step-badge" style="background:' + arrowColor + '22;color:' + arrowColor + ';border-color:' + arrowColor + '44">' + arrowLabel + '</div>';
    html += '<div class="dns-step-desc">' + esc(step.desc).replace(/\n/g, '<br>') + '</div>';

    // Arrow visualization
    if (step.from && step.to) {
      var fromSrv = SERVERS[step.from];
      var toSrv = SERVERS[step.to];
      html += '<div class="dns-step-arrow" style="border-color:' + arrowColor + '">';
      html += '<span class="dns-step-arrow-from">' + fromSrv.icon + ' ' + esc(fromSrv.name) + '</span>';
      html += '<span class="dns-step-arrow-line" style="color:' + arrowColor + '">\u2500\u2500\u2500\u2500 ' + esc(step.label) + ' \u2500\u2500\u2500\u2500\u25B6</span>';
      html += '<span class="dns-step-arrow-to">' + toSrv.icon + ' ' + esc(toSrv.name) + '</span>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  // =============================================
  // RENDER: STEP TABLE
  // =============================================
  function renderStepTable() {
    if (!state.resolved) return '';
    var html = '<div class="dns-section">';
    html += '<div class="dns-section-title"><span class="dns-bar"></span>ALLE SCHRITTE</div>';
    html += '<div class="dns-step-table-wrap"><table class="dns-step-table">';
    html += '<thead><tr><th>#</th><th>Von</th><th>\u2192</th><th>Nach</th><th>Typ</th><th>Beschreibung</th></tr></thead><tbody>';
    state.steps.forEach(function (step, idx) {
      var stepNum = idx + 1;
      var cls = stepNum === state.currentStep ? ' class="dns-step-active"' : (stepNum > state.currentStep ? ' class="dns-step-future"' : '');
      var from = step.from ? SERVERS[step.from].icon + ' ' + SERVERS[step.from].name : '\u2014';
      var to = step.to ? SERVERS[step.to].icon + ' ' + SERVERS[step.to].name : '\u2014';
      var typeColor = '#a78bfa';
      if (step.type === 'answer') typeColor = '#4fffb0';
      if (step.type === 'referral') typeColor = '#fb923c';
      if (step.type === 'blocked' || step.type === 'blocked_answer' || step.type === 'nxdomain' || step.type === 'bypass' || step.type === 'bypassed') typeColor = '#ef4444';
      if (step.type === 'cache' || step.type === 'rewrite') typeColor = '#4fffb0';
      html += '<tr' + cls + '><td>' + stepNum + '</td><td>' + from + '</td><td>\u2192</td><td>' + to + '</td>';
      html += '<td><span style="color:' + typeColor + '">' + esc(step.type) + '</span></td>';
      html += '<td class="dns-table-desc">' + esc(step.label) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
  }

  // =============================================
  // RENDER: DNS RESPONSE
  // =============================================
  function renderResponse() {
    if (!state.resolved || state.currentStep < state.steps.length) return '';
    var resp = state.response;
    if (!resp) return '';

    var html = '<div class="dns-section">';
    html += '<div class="dns-section-title"><span class="dns-bar"></span>DNS RESPONSE</div>';
    html += '<div class="dns-response-box">';

    var statusColor = '#4fffb0';
    var statusText = 'NOERROR \u2713';
    if (resp.type === 'NXDOMAIN') { statusColor = '#ef4444'; statusText = 'NXDOMAIN \u2717'; }
    if (resp.type === 'BLOCKED') { statusColor = '#ef4444'; statusText = 'BLOCKED (0.0.0.0)'; }

    html += '<div class="dns-resp-row"><span class="dns-resp-label">Query:</span><span class="dns-resp-val">' + esc(state.domain) + '   IN   ' + esc(state.recordType) + '</span></div>';
    html += '<div class="dns-resp-row"><span class="dns-resp-label">Status:</span><span class="dns-resp-val" style="color:' + statusColor + '">' + statusText + '</span></div>';

    if (resp.answer) {
      html += '<div class="dns-resp-row"><span class="dns-resp-label">Answer:</span><span class="dns-resp-val">' + esc(state.domain) + '.   ' + (resp.ttl || 300) + '   IN   ' + esc(resp.type === 'BLOCKED' ? 'A' : resp.type) + '   <strong style="color:#a78bfa">' + esc(resp.answer) + '</strong></span></div>';
    }

    if (resp.ttl) {
      html += '<div class="dns-resp-row"><span class="dns-resp-label">Cache:</span><span class="dns-resp-val">Antwort wird ' + resp.ttl + 's (' + Math.round(resp.ttl / 60) + ' Min) gecacht</span></div>';
    }

    html += '<div class="dns-resp-row"><span class="dns-resp-label">Hops:</span><span class="dns-resp-val">' + resp.hops + ' Server befragt</span></div>';

    if (resp.source === 'recursive') {
      html += '<div class="dns-resp-row"><span class="dns-resp-label">Encryption:</span><span class="dns-resp-val" style="color:#4fffb0">\u2713 DoH (DNS-over-HTTPS) zu Cloudflare</span></div>';
    }
    if (resp.blocklist) {
      html += '<div class="dns-resp-row"><span class="dns-resp-label">Blocklist:</span><span class="dns-resp-val" style="color:#ef4444">' + esc(resp.blocklist) + '</span></div>';
    }

    html += '</div>';

    // dig command
    html += '<div class="dns-dig">';
    html += '<div class="dns-dig-title">\uD83D\uDCBB Selbst ausprobieren:</div>';
    var digCmd = 'dig ' + state.domain + ' ' + state.recordType + ' @192.168.0.201';
    var nslCmd = 'nslookup ' + state.domain + ' 192.168.0.201';
    html += '<div class="dns-dig-cmd" data-cmd="' + esc(digCmd) + '"><code>' + esc(digCmd) + '</code> <span class="dns-dig-copy" title="Kopieren">\uD83D\uDCCB</span></div>';
    html += '<div class="dns-dig-cmd" data-cmd="' + esc(nslCmd) + '"><code>' + esc(nslCmd) + '</code> <span class="dns-dig-copy" title="Kopieren">\uD83D\uDCCB</span></div>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  // =============================================
  // RENDER: HIERARCHY
  // =============================================
  function renderHierarchy() {
    if (!state.resolved) return '';
    var html = '<div class="dns-section">';
    html += '<div class="dns-toggle" id="dns-hierarchy-toggle">\uD83D\uDCD0 DNS Hierarchie ' + (state.hierarchyOpen ? '\u25B4' : '\u25BE') + '</div>';
    if (state.hierarchyOpen) {
      html += '<div class="dns-hierarchy-body">';
      html += '<div class="dns-tree">';

      var parts = state.domain.split('.');
      var highlighted = state.domain;

      html += '<div class="dns-tree-row dns-tree-root"><span class="dns-tree-node">. (Root)</span></div>';
      html += '<div class="dns-tree-line">\u2502</div>';
      html += '<div class="dns-tree-branches">';
      html += '<span class="dns-tree-branch">.com</span>';
      html += '<span class="dns-tree-branch">.de</span>';
      var tld = parts.length > 1 ? '.' + parts[parts.length - 1] : '.local';
      html += '<span class="dns-tree-branch dns-tree-active">' + esc(tld) + '</span>';
      html += '</div>';
      html += '<div class="dns-tree-line">\u2502</div>';

      if (parts.length >= 2) {
        var sld = parts.slice(-2).join('.');
        html += '<div class="dns-tree-row"><span class="dns-tree-node dns-tree-active">' + esc(sld) + '</span></div>';
        html += '<div class="dns-tree-line">\u2502</div>';
      }

      html += '<div class="dns-tree-row"><span class="dns-tree-node dns-tree-highlight">' + esc(state.domain) + '</span></div>';

      // Show sibling homelab domains
      if (state.domain.indexOf('homelab.local') > -1) {
        html += '<div class="dns-tree-siblings">';
        ['proxmox', 'adguard', 'jumphost', 'git', 'mail'].forEach(function (sub) {
          var full = sub + '.homelab.local';
          var cls = full === state.domain ? ' dns-tree-highlight' : '';
          html += '<span class="dns-tree-sibling' + cls + '">' + esc(full) + '</span>';
        });
        html += '</div>';
      }

      html += '</div></div>';
    }
    html += '</div>';
    return html;
  }

  // =============================================
  // RENDER: HOMELAB PANEL
  // =============================================
  function renderHomelabPanel() {
    if (!state.resolved) return '';
    var html = '<div class="dns-section dns-homelab-panel">';
    html += '<div class="dns-section-title"><span class="dns-bar" style="background:#4fffb0"></span>DEIN HOMELAB DNS-SETUP</div>';
    html += '<div class="dns-homelab-content">';
    html += '<div class="dns-homelab-flow">';
    html += '<div class="dns-flow-row">Alle Ger\u00E4te \u2500\u2500\u25B6 TP-Link Router (DHCP gibt 192.168.0.201 als DNS aus)</div>';
    html += '<div class="dns-flow-row dns-flow-indent">\u2502</div>';
    html += '<div class="dns-flow-row dns-flow-indent">\u25BC</div>';
    html += '<div class="dns-flow-row">\uD83D\uDEE1\uFE0F AdGuard Home (192.168.0.201)</div>';
    html += '<div class="dns-flow-row dns-flow-sub">\u251C\u2500 Blocklists: OISD, HaGeZi, AdGuard DNS Filter</div>';
    html += '<div class="dns-flow-row dns-flow-sub">\u251C\u2500 DNS Rewrites: *.homelab.local</div>';
    html += '<div class="dns-flow-row dns-flow-sub">\u2514\u2500 Cache: reduziert Latenz</div>';
    html += '<div class="dns-flow-row dns-flow-indent">\u2502</div>';
    html += '<div class="dns-flow-row dns-flow-indent">\u25BC</div>';
    html += '<div class="dns-flow-row">\u2601\uFE0F Cloudflare DoH (1.1.1.1) \u2014 verschl\u00FCsselt (HTTPS)</div>';
    html += '<div class="dns-flow-row dns-flow-indent">\u2502</div>';
    html += '<div class="dns-flow-row dns-flow-indent">\u25BC</div>';
    html += '<div class="dns-flow-row">\uD83C\uDF10 \u00D6ffentliches DNS (Root \u2192 TLD \u2192 Authoritative)</div>';
    html += '</div>';
    html += '<div class="dns-homelab-warning">';
    html += '\u26A0 <strong>Schwachstelle: Browser-DoH umgeht AdGuard!</strong><br>';
    html += 'Fix: Chrome flags \u2192 DNS-over-HTTPS deaktivieren<br>';
    html += 'Oder: UDP/443 (QUIC) + DoH-IPs auf Firewall blocken (OPNsense, Phase 2)';
    html += '</div>';
    html += '</div></div>';
    return html;
  }

  // =============================================
  // FULL RENDER
  // =============================================
  function renderAll() {
    var main = $('dns-main');
    if (!main) return;
    var html = '';
    html += renderInput();
    html += renderChain();
    html += renderControls();
    html += renderStepDetail();
    html += renderStepTable();
    html += renderResponse();
    html += renderHierarchy();
    html += renderHomelabPanel();
    main.innerHTML = html;
  }

  // =============================================
  // EVENTS
  // =============================================
  function bindEvents() {
    var main = $('dns-main');
    if (!main) return;

    main.addEventListener('click', function (e) {
      var t = e.target;

      // Resolve
      if (t.id === 'dns-resolve') { doResolve(); return; }

      // Controls
      if (t.id === 'dns-prev') { goStep(state.currentStep - 1); return; }
      if (t.id === 'dns-next') { goStep(state.currentStep + 1); return; }
      if (t.id === 'dns-reset') { resetAll(); return; }
      if (t.id === 'dns-auto') { toggleAutoPlay(); return; }

      // Speed
      if (t.dataset && t.dataset.speed) { state.speed = parseFloat(t.dataset.speed); renderAll(); return; }

      // Preset
      if (t.classList.contains('dns-preset-btn')) {
        state.domain = t.dataset.domain;
        state.recordType = t.dataset.type;
        state.scenario = 'normal';
        doResolve();
        return;
      }

      // Scenario
      if (t.classList.contains('dns-scenario-btn')) {
        state.scenario = t.dataset.scenario;
        if (state.scenario === 'blocked') {
          state.domain = 'ads.doubleclick.net';
        } else if (state.scenario === 'nxdomain') {
          state.domain = 'gibts.nicht.example.com';
        } else if (state.scenario === 'rewrite') {
          state.domain = 'proxmox.homelab.local';
        }
        doResolve();
        return;
      }

      // Server node click
      var node = t.closest('.dns-node');
      if (node && node.dataset.server) {
        state.selectedServer = state.selectedServer === node.dataset.server ? null : node.dataset.server;
        renderAll();
        return;
      }

      // Hierarchy toggle
      if (t.id === 'dns-hierarchy-toggle') { state.hierarchyOpen = !state.hierarchyOpen; renderAll(); return; }

      // Copy dig command
      var digCmd = t.closest('.dns-dig-cmd');
      if (digCmd && digCmd.dataset.cmd) {
        navigator.clipboard.writeText(digCmd.dataset.cmd).then(function () {
          var copyIcon = digCmd.querySelector('.dns-dig-copy');
          if (copyIcon) { copyIcon.textContent = '\u2713'; setTimeout(function () { copyIcon.textContent = '\uD83D\uDCCB'; }, 1500); }
        });
        return;
      }
    });

    main.addEventListener('change', function (e) {
      if (e.target.id === 'dns-domain') { state.domain = e.target.value.trim(); }
      if (e.target.id === 'dns-rectype') { state.recordType = e.target.value; renderAll(); }
    });

    main.addEventListener('keydown', function (e) {
      if (e.target.id === 'dns-domain' && e.key === 'Enter') { state.domain = e.target.value.trim(); doResolve(); }
    });
  }

  function doResolve() {
    var domainEl = $('dns-domain');
    if (domainEl) state.domain = domainEl.value.trim();
    if (!state.domain) return;

    // Auto-detect PTR
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(state.domain)) {
      state.recordType = 'PTR';
    }

    stopAutoPlay();
    state.selectedServer = null;
    resolveScenario();
    renderAll();
  }

  function goStep(n) {
    var max = state.steps.length;
    n = Math.max(0, Math.min(max, n));
    state.currentStep = n;
    renderAll();
  }

  function resetAll() {
    stopAutoPlay();
    state.currentStep = 0;
    state.selectedServer = null;
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
    if (state.currentStep >= state.steps.length) {
      stopAutoPlay();
      renderAll();
      return;
    }
    var delay = 1800 / state.speed;
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
