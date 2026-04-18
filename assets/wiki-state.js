/* === WIKI STATE === */
async function loadWiki() {
  try {
    const inSubdir = window.location.pathname.includes('/phases/') || window.location.pathname.includes('/steps/');
    const path = inSubdir ? '../homelab-wiki.json' : './homelab-wiki.json';
    const res = await fetch(path);
    window.WIKI = await res.json();
  } catch (e) {
    console.warn('Wiki load error:', e);
    window.WIKI = { meta: {}, namespaces: [], articles: [] };
  }
  window.dispatchEvent(new Event('wiki-ready'));
}
loadWiki();
