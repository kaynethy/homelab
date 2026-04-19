/* === PROTOCOLS STATE — loads homelab-osiwiki.json === */
(function() {
  'use strict';

  function getRoot() {
    var path = window.location.pathname;
    return (path.includes('/phases/') || path.includes('/steps/')) ? '../' : './';
  }

  async function loadProtocols() {
    try {
      var res = await fetch(getRoot() + 'homelab-osiwiki.json', { cache: 'no-cache' });
      var data = await res.json();
      window.PROTOCOLS = {
        meta: data.meta || {},
        protocols: Array.isArray(data.protocols) ? data.protocols : []
      };
      console.info('[protocols] ' + window.PROTOCOLS.protocols.length + ' Protokolle geladen');
      window.dispatchEvent(new Event('protocols-ready'));
    } catch (err) {
      window.PROTOCOLS = { meta: {}, protocols: [], loadError: err.message };
      console.error('[protocols] Load failed:', err);
      window.dispatchEvent(new Event('protocols-ready'));
    }
  }

  loadProtocols();
})();
