/* === NAVIGATION === */
(function () {
  'use strict';

  function getDepth() {
    const path = window.location.pathname;
    return (path.includes('/phases/') || path.includes('/steps/')) ? 1 : 0;
  }

  function getRoot() {
    return getDepth() > 0 ? '../' : './';
  }

  function getCurrentFile() {
    const path = window.location.pathname;
    const file = path.split('/').pop() || 'index.html';
    return file;
  }

  function renderNav() {
    const nav = document.getElementById('nav');
    if (!nav) return;

    const root = getRoot();
    const current = getCurrentFile();
    const version = window.STATE ? window.STATE.meta.version : '0.2';

    const pages = [
      { href: root + 'index.html', label: 'Dashboard', file: 'index.html' },
      { href: root + 'network-plan.html', label: 'Network', file: 'network-plan.html' },
      { href: root + 'ideas.html', label: 'Ideen', file: 'ideas.html' },
      { href: root + 'diary.html', label: 'Tagebuch', file: 'diary.html' },
      { href: root + 'wiki-preview.html', label: 'Wiki', file: 'wiki-preview.html' },
    ];

    const links = pages.map(p => {
      const isActive = current === p.file || (p.file === 'wiki-preview.html' && current === 'osi-reference.html');
      return `<a href="${p.href}" class="nav-link${isActive ? ' active' : ''}">${p.label}</a>`;
    }).join('');

    nav.innerHTML = `
      <div class="nav">
        <a href="${root}index.html" class="nav-brand" style="text-decoration:none">// <span>homelab</span>_roadmap</a>
        <div class="nav-links">${links}</div>
        <div class="nav-right">
          <span class="nav-version">v<span>${version}</span></span>
          <a href="https://github.com/kaynethy/homelab" target="_blank" class="github-badge" title="GitHub Repository">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:middle;margin-right:5px"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            kaynethy/homelab
          </a>
          <button class="btn-export" onclick="exportJSON()">Export JSON</button>
        </div>
      </div>
    `;
  }

  if (window.STATE) {
    renderNav();
  } else {
    window.addEventListener('state-ready', renderNav);
  }
})();
