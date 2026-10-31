// Bahnkarte24 – Lesezeichen (Bookmarklet).
// Läuft auf www.bahn.de im eingeloggten Zustand, sammelt mit bcSammeln() aus core.js und schickt das Ergebnis
// per postMessage an das Auswertungsfenster. Nichts wird an einen Server geschickt.
// Beim Erzeugen des Lesezeichens (app.js) wird '__SITE__' durch die Adresse der Auswertungsseite und
// der __CORE__-Platzhalter durch core.js ersetzt.
void (async () => {
  const SITE = '__SITE__';
  const SITE_ORIGIN = new URL(SITE).origin;
  /*__CORE__*/

  if (location.hostname !== 'www.bahn.de') {
    alert('Bahnkarte24: Bitte öffne zuerst www.bahn.de, melde dich an und klicke dann erneut auf das Lesezeichen.');
    return;
  }
  let token;
  try { token = JSON.parse(sessionStorage.getItem('token')).accessToken; } catch (e) { /* nicht eingeloggt */ }
  if (!token) {
    alert('Bahnkarte24: Du bist auf bahn.de nicht angemeldet. Bitte melde dich an und klicke dann erneut auf das Lesezeichen.');
    return;
  }

  // Fenster sofort öffnen (noch im Klick), sonst blockt der Popup-Blocker.
  const win = window.open(SITE + '/#import', 'bahnkarte24');
  let ready = false;
  let last = null;
  const send = (msg) => {
    last = msg;
    if (ready && win && !win.closed) win.postMessage(msg, SITE_ORIGIN);
  };
  window.addEventListener('message', (e) => {
    if (e.origin !== SITE_ORIGIN || !e.data) return;
    if (e.data.type === 'bc-ready') {
      ready = true;
      if (last) win.postMessage(last, SITE_ORIGIN);
    }
  });

  let progress = { done: 0, total: 0, text: 'Starte …' };
  const step = (p) => { progress = { ...progress, ...p }; send({ type: 'bc-progress', ...progress }); };

  try {
    const daten = await bcSammeln(token, step);
    send(daten);

    if (!win || win.closed) {
      // Popup blockiert oder geschlossen: Daten als Datei anbieten.
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(daten)], { type: 'application/json' }));
      a.download = 'bahnkarte24-daten.json';
      a.click();
      alert('Bahnkarte24: Das Auswertungsfenster war blockiert. Deine Daten wurden als Datei gespeichert – lade sie auf ' + SITE + ' hoch.');
    }
  } catch (err) {
    send({ type: 'bc-error', text: err.message || String(err) });
    if (!win || win.closed) alert('Bahnkarte24: ' + (err.message || err));
  }
})();
