// Bahnkarte24 – Brücke zwischen Auswertungsseite und Erweiterung (läuft auf der Auswertungsseite).
const QUELLE = 'bc-erweiterung';
const hallo = () => window.postMessage({ type: 'bc-ext-hallo', quelle: QUELLE, version: chrome.runtime.getManifest().version }, location.origin);

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || e.data.quelle === QUELLE) return;
  if (e.data.type === 'bc-ext-ping') hallo();
  if (e.data.type === 'bc-ext-start') chrome.runtime.sendMessage({ type: 'start' });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && /^bc-(progress|data|error)$/.test(msg.type)) window.postMessage({ ...msg, quelle: QUELLE }, location.origin);
});

hallo();
