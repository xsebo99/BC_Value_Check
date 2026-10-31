// Bahnkarte24 – läuft auf www.bahn.de, aber nur im Tab, den die Erweiterung selbst geöffnet hat.
// Wartet auf die Anmeldung, sammelt mit bcSammeln() (core.js) und schickt das Ergebnis an den Hintergrund.
(async () => {
  const { sammeln } = await chrome.runtime.sendMessage({ type: 'wer' });
  if (!sammeln) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const token = () => {
    try { return JSON.parse(sessionStorage.getItem('token')).accessToken; } catch (e) { return null; }
  };

  // Kleiner Hinweis unten rechts, im Shadow DOM, damit sich die Stile von bahn.de nicht einmischen.
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'closed' });
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:320px;padding:14px 16px;' +
    'border-radius:12px;background:#fff;color:#1f2329;box-shadow:0 8px 30px rgba(0,0,0,.25);' +
    'font:14px/1.4 system-ui,sans-serif;border-left:5px solid #e30613';
  const titel = document.createElement('strong');
  titel.textContent = 'Bahnkarte24';
  const text = document.createElement('div');
  text.style.marginTop = '4px';
  box.append(titel, text);
  root.append(box);
  document.documentElement.append(host);
  const zeigen = (t) => { text.textContent = t; };

  let progress = { done: 0, total: 0, text: '' };
  const step = (p) => {
    progress = { ...progress, ...p };
    zeigen(progress.text);
    chrome.runtime.sendMessage({ type: 'bc-progress', ...progress });
  };

  let t = token();
  if (!t) {
    step({ text: 'Warte auf deine Anmeldung bei bahn.de …' });
    zeigen('Bitte melde dich bei bahn.de an (oben rechts „Anmelden“). Danach geht es automatisch weiter.');
    while (!(t = token())) await sleep(1000);
  }

  try {
    const daten = await bcSammeln(t, step);
    zeigen('Fertig! Du wirst zur Auswertung zurückgebracht …');
    chrome.runtime.sendMessage(daten);
  } catch (err) {
    const msg = err.message || String(err);
    zeigen('Fehler: ' + msg);
    chrome.runtime.sendMessage({ type: 'bc-error', text: msg });
  }
})();
