/* === ACADEMY STATE — loads OSI wiki + glossary modules === */
(function () {
  'use strict';

  function getRoot() {
    var path = window.location.pathname;
    return (path.includes('/phases/') || path.includes('/steps/')) ? '../' : './';
  }

  async function loadAcademy() {
    var root = getRoot();
    var modules = [
      { key: 'netzwerk', file: 'wiki/homelab-glossary-netzwerk.json' },
      { key: 'security', file: 'wiki/homelab-glossary-security.json' },
      { key: 'infra', file: 'wiki/homelab-glossary-infra.json' },
      { key: 'admin', file: 'wiki/homelab-glossary-admin.json' }
    ];

    var academy = { osiwiki: null, glossary: {} };

    // OSI-Wiki laden (existiert bereits)
    try {
      var osi = await fetch(root + 'wiki/homelab-osiwiki.json', { cache: 'no-cache' });
      academy.osiwiki = await osi.json();
    } catch (e) {
      console.warn('[academy] osiwiki load failed');
    }

    // Glossar-Module laden (fehler-tolerant)
    for (var i = 0; i < modules.length; i++) {
      var mod = modules[i];
      try {
        var res = await fetch(root + mod.file, { cache: 'no-cache' });
        if (!res.ok) throw new Error(res.status);
        academy.glossary[mod.key] = await res.json();
        console.info('[academy] ' + mod.key + ': ' + academy.glossary[mod.key].entries.length + ' Einträge');
      } catch (e) {
        academy.glossary[mod.key] = { meta: {}, entries: [] };
        console.warn('[academy] ' + mod.key + ' nicht gefunden — Tab wird als "Coming Soon" angezeigt');
      }
    }

    window.ACADEMY = academy;
    window.dispatchEvent(new Event('academy-ready'));
  }

  loadAcademy();
})();
