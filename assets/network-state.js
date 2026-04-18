/* === NETWORK STATE === */
async function loadNetwork() {
  try {
    const inSubdir = window.location.pathname.includes('/phases/') || window.location.pathname.includes('/steps/');
    const path = inSubdir ? '../homelab-network.json' : './homelab-network.json';
    const res = await fetch(path, { cache: 'no-cache' });
    const data = await res.json();
    window.NETWORK = {
      meta: data.meta || {},
      subnets: Array.isArray(data.subnets) ? data.subnets : [],
      firewall_rules: Array.isArray(data.firewall_rules) ? data.firewall_rules : [],
      migration: Array.isArray(data.migration) ? data.migration : [],
      principles: Array.isArray(data.principles) ? data.principles : []
    };
    console.info(`[network] ${window.NETWORK.subnets.length} Subnetze geladen`);
    window.dispatchEvent(new Event('network-ready'));
  } catch (err) {
    console.warn('Network load error:', err);
    window.NETWORK = { meta: {}, subnets: [], firewall_rules: [], migration: [], principles: [], loadError: err.message };
    window.dispatchEvent(new Event('network-ready'));
  }
}
loadNetwork();
