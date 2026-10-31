// SparSchiene – Lesezeichen (Bookmarklet).
// Läuft auf www.bahn.de im eingeloggten Zustand, sammelt mit bcSammeln() aus core.js und schickt das Ergebnis
// per postMessage an das Auswertungsfenster. Nichts wird an einen Server geschickt.
// Beim Erzeugen des Lesezeichens (app.js) wird '__SITE__' durch die Adresse der Auswertungsseite und
// der __CORE__-Platzhalter durch core.js ersetzt.
void (async () => {
  const SITE = '__SITE__';
  const SITE_ORIGIN = new URL(SITE).origin;
  /*__CORE__*/

  if (location.hostname !== 'www.bahn.de') {
    alert('SparSchiene: Bitte öffne zuerst www.bahn.de, melde dich an und klicke dann erneut auf das Lesezeichen.');
    return;
  }
  let token;
  try { token = JSON.parse(sessionStorage.getItem('token')).accessToken; } catch (e) { /* nicht eingeloggt */ }
  if (!token) {
    alert('SparSchiene: Du bist auf bahn.de nicht angemeldet. Bitte melde dich an und klicke dann erneut auf das Lesezeichen.');
    return;
  }

  // Am Handy würde ein sofort geöffneter Tab bahn.de in den Hintergrund schicken, wo der Browser das Sammeln bremst.
  // Deshalb dort erst sammeln (mit Anzeige auf bahn.de) und die Auswertung danach per Tipp öffnen.
  const MOBIL = matchMedia('(pointer: coarse)').matches;

  // Am Desktop das Fenster sofort öffnen (noch im Klick), sonst blockt der Popup-Blocker.
  let win = MOBIL ? null : window.open(SITE + '/#import', 'sparschiene');
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
      if (last && win) win.postMessage(last, SITE_ORIGIN);
    }
  });

  const alsDatei = (daten) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(daten)], { type: 'application/json' }));
    a.download = 'sparschiene-daten.json';
    a.click();
    alert('SparSchiene: Das Auswertungsfenster war blockiert. Deine Daten wurden als Datei gespeichert – lade sie auf ' + SITE + ' hoch.');
  };

  // Anzeige am Handy: nur createElement/textContent, weil bahn.de innerHTML per CSP sperren könnte.
  let box = null;
  let boxText = null;
  if (MOBIL) {
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;background:#141920;color:#fff;font:16px/1.45 system-ui,sans-serif;padding:16px 18px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.35)';
    const titel = document.createElement('strong');
    titel.textContent = 'SparSchiene';
    titel.style.cssText = 'display:block;margin-bottom:4px';
    boxText = document.createElement('div');
    boxText.textContent = 'Starte … Bitte diesen Tab geöffnet lassen.';
    box.append(titel, boxText);
    document.body.appendChild(box);
  }

  let progress = { done: 0, total: 0, text: 'Starte …' };
  const step = (p) => {
    progress = { ...progress, ...p };
    send({ type: 'bc-progress', ...progress });
    if (boxText) boxText.textContent = progress.text;
  };

  try {
    const daten = await bcSammeln(token, step);
    send(daten);

    if (MOBIL) {
      boxText.textContent = (daten.auftraege || []).length + ' Buchungen gelesen.';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Auswertung öffnen';
      btn.style.cssText = 'display:block;width:100%;margin-top:12px;padding:14px;border:0;border-radius:999px;background:#e30613;color:#fff;font:600 16px system-ui,sans-serif';
      btn.addEventListener('click', () => {
        win = window.open(SITE + '/#import', 'sparschiene');
        if (!win) { alsDatei(daten); return; }
        box.remove();
      });
      box.appendChild(btn);
    } else if (!win || win.closed) {
      // Popup blockiert oder geschlossen: Daten als Datei anbieten.
      alsDatei(daten);
    }
  } catch (err) {
    send({ type: 'bc-error', text: err.message || String(err) });
    if (boxText) boxText.textContent = 'Fehler: ' + (err.message || err);
    else if (!win || win.closed) alert('SparSchiene: ' + (err.message || err));
  }
})();
