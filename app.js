'use strict';

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------
const BAHN_ORIGIN = 'https://www.bahn.de';
const STORE_KEY = 'bahncard-bilanz-daten';

// Listenpreise laut bahn.de, Stand Oktober 2026 (2. Klasse). In der Auswertung änderbar.
const LISTENPREIS = { BC25: 62.90, MYBC25: 39.90, BC50: 244, BC100: 4899 };

const $ = (sel, root = document) => root.querySelector(sel);
const eur = (n) => (n || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const eur0 = (n) => (n || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const int = (n) => Math.round(n || 0).toLocaleString('de-DE');
const datum = (d, opt = { day: '2-digit', month: '2-digit', year: 'numeric' }) => d ? new Date(d).toLocaleDateString('de-DE', opt) : '–';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tag = (d) => new Date(String(d).slice(0, 10) + 'T12:00:00');

// ---------------------------------------------------------------------------
// Ansichten
// ---------------------------------------------------------------------------
function show(view) {
  for (const id of ['view-start', 'view-import', 'view-result']) $('#' + id).classList.toggle('hidden', id !== view);
  $('#btn-reset').classList.toggle('hidden', view === 'view-start');
  $('#datenschutz').classList.toggle('hidden', view === 'view-import');
  $('#faq').classList.toggle('hidden', view === 'view-import');
  window.scrollTo({ top: 0 });
}

function reset() {
  try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* egal */ }
  history.replaceState(null, '', location.pathname);
  show('view-start');
}

// ---------------------------------------------------------------------------
// Lesezeichen erzeugen
// ---------------------------------------------------------------------------
async function setupBookmarklet() {
  const link = $('#bookmarklet');
  link.addEventListener('click', (e) => {
    e.preventDefault();
    alert('Zieh den Button in deine Lesezeichenleiste und klick ihn dann auf bahn.de an.');
  });
  if (location.protocol === 'file:') {
    $('#bookmarklet-hint').textContent = 'Hinweis: Die Seite muss über http(s) laufen (nicht als Datei geöffnet), damit das Lesezeichen funktioniert.';
    return;
  }
  try {
    const [src, core] = await Promise.all(['collector.js', 'core.js'].map(async (f) => (await fetch(f, { cache: 'no-cache' })).text()));
    // Chrome entfernt Zeilenumbrüche aus Lesezeichen-URLs – dann würde ein //-Kommentar den ganzen Rest auskommentieren.
    // Deshalb Kommentarzeilen raus und alles in eine Zeile (collector.js und core.js setzen überall Semikolons).
    const eineZeile = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.trim()).filter(Boolean).join(' ');
    const code = eineZeile(src)
      .replace('/*__CORE__*/', () => eineZeile(core))
      .replace("'__SITE__'", () => "'" + location.origin + location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '') + "'");
    link.href = 'javascript:' + encodeURIComponent(code);
  } catch (e) {
    $('#bookmarklet-hint').textContent = 'Das Lesezeichen konnte nicht erzeugt werden. Bitte lade die Seite neu.';
  }
}

// ---------------------------------------------------------------------------
// Datenempfang vom Lesezeichen
// ---------------------------------------------------------------------------
let pingTimer = null;

function importNachricht(m) {
  if (m.type === 'bc-progress') {
    $('#import-text').textContent = m.text || '';
    const pct = m.total ? Math.max(3, Math.round((m.done / m.total) * 100)) : 3;
    $('#import-bar span').style.width = pct + '%';
  } else if (m.type === 'bc-error') {
    clearInterval(pingTimer);
    $('#import-title').textContent = 'Das hat nicht geklappt';
    $('#import-text').textContent = m.text || 'Unbekannter Fehler.';
  } else if (m.type === 'bc-data') {
    clearInterval(pingTimer);
    loadData(m, true);
  }
}

function startImport() {
  show('view-import');
  let received = false;
  const ping = () => {
    if (received || !window.opener) return;
    try { window.opener.postMessage({ type: 'bc-ready' }, BAHN_ORIGIN); } catch (e) { /* Fenster weg */ }
  };
  ping();
  pingTimer = setInterval(ping, 700);
  if (!window.opener) {
    $('#import-text').textContent = 'Diese Seite wurde nicht vom Lesezeichen geöffnet. Starte das Lesezeichen auf bahn.de.';
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== BAHN_ORIGIN || !e.data || typeof e.data !== 'object') return;
    received = true;
    importNachricht(e.data);
  });
}

// ---------------------------------------------------------------------------
// Browser-Erweiterung (optional): meldet sich per postMessage aus ihrem Content-Script auf dieser Seite.
// ---------------------------------------------------------------------------
function setupErweiterung() {
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.quelle !== 'bc-erweiterung') return;
    if (e.data.type === 'bc-ext-hallo') {
      $('#ext-card').classList.remove('hidden');
      document.body.classList.add('has-ext');
      $('#so-gehts h2').textContent = 'Ohne Erweiterung: in drei Schritten';
    } else {
      importNachricht(e.data);
    }
  });
  $('#btn-ext').addEventListener('click', () => {
    show('view-import');
    $('#import-title').textContent = 'Hole deine Fahrten von bahn.de …';
    $('#import-text').textContent = 'Im neuen bahn.de-Tab anmelden (falls nötig) – danach geht es automatisch weiter.';
    $('#import-bar span').style.width = '3%';
    window.postMessage({ type: 'bc-ext-start' }, location.origin);
  });
  window.postMessage({ type: 'bc-ext-ping' }, location.origin);
}

function validData(d) {
  return d && d.type === 'bc-data' && Array.isArray(d.auftraege) && Array.isArray(d.bahncards);
}

function loadData(d, persist) {
  if (!validData(d)) {
    alert('Die Daten haben nicht das erwartete Format.');
    return;
  }
  if (persist) {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch (e) { /* zu groß oder gesperrt – egal */ }
  }
  history.replaceState(null, '', location.pathname + '#auswertung');
  state.data = d;
  state.cardIdx = defaultCard(d.bahncards);
  state.preise = {};
  render();
  show('view-result');
}

// ---------------------------------------------------------------------------
// Aufbereitung
// ---------------------------------------------------------------------------
function tarifArt(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('young')) return 'young';
  if (n.includes('spar')) return 'spar';
  if (n.includes('flex') || n.includes('normalpreis')) return 'flex';
  return 'sonst';
}

// Eine Zeile pro gefahrener Reise (Hin- bzw. Rückfahrt) mit ihren Tickets.
function fahrten(data) {
  const out = [];
  for (const a of data.auftraege) {
    for (const r of a.reisen || []) {
      const tickets = (r.angebote || []).filter((t) => t.typ === 'REISEANGEBOT' && !t.storniert);
      if (r.storniert || !tickets.length || !r.datum) continue;
      const t0 = tickets[0];
      const preis = tickets.reduce((s, t) => s + (t.preis || 0), 0);
      const ersparnis = tickets.reduce((s, t) => s + (t.bcErsparnis || 0), 0);
      const mitBC = tickets.some((t) => (t.ermaessigungen || []).some((e) => /BAHNCARD/i.test(e)));
      const art = tarifArt(t0.name);
      const zug = (r.abschnitte || []).filter((x) => !x.fuss);
      out.push({
        nr: a.nr,
        datum: tag(r.datum),
        von: r.von || t0.von || '?',
        nach: r.nach || t0.nach || '?',
        tarif: t0.name || 'Ticket',
        klasse: t0.klasse === 'KLASSE_1' ? 1 : 2,
        art,
        preis,
        ersparnis,
        voll: preis + ersparnis,
        mitBC,
        // Hätte die BahnCard hier gegriffen, wurde aber nicht angegeben?
        verschenkt: !mitBC && (art === 'spar' || art === 'flex') ? Math.round((preis * 0.25) * 100) / 100 : 0,
        reservierung: r.reservierung || 0,
        km: zug.reduce((s, x) => s + (x.km || 0), 0),
        dauerS: r.dauerS || zug.reduce((s, x) => s + (x.dauerS || 0), 0),
        zuege: zug.map((x) => x.kurz).filter(Boolean),
      });
    }
  }
  return out.sort((a, b) => a.datum - b.datum);
}

function defaultCard(cards) {
  if (!cards.length) return -1;
  const heute = new Date();
  const gueltig = cards.findIndex((c) => tag(c.ab) <= heute && heute <= tag(c.bis));
  if (gueltig >= 0) return gueltig;
  let best = 0;
  cards.forEach((c, i) => { if (c.bis > cards[best].bis) best = i; });
  return best;
}

function kartenPreis(card) {
  if (!card) return 0;
  const code = (card.code || '').toUpperCase();
  if (code.includes('MYBAHNCARD25')) return LISTENPREIS.MYBC25;
  return LISTENPREIS[card.typ] || 0;
}

function kartenName(card) {
  return (card.produkt || card.typ || 'BahnCard').replace(/, ?2nd class/i, ', 2. Klasse').replace(/, ?1st class/i, ', 1. Klasse');
}

function zeitraum() {
  const card = state.data.bahncards[state.cardIdx];
  if (card) return { von: tag(card.ab), bis: tag(card.bis), card };
  const bis = new Date();
  const von = new Date(bis); von.setFullYear(von.getFullYear() - 1);
  return { von, bis, card: null };
}

// Was hätten dieselben Fahrten mit welcher Karte gekostet?
function szenarien(liste, preise) {
  const sum = (f) => liste.reduce((s, x) => s + f(x), 0);
  const tickets = {
    ohne: sum((x) => x.voll),
    bc25: sum((x) => (x.art === 'spar' || x.art === 'flex') ? x.voll * 0.75 : x.preis),
    bc50: sum((x) => x.art === 'spar' ? x.voll * 0.75 : x.art === 'flex' ? x.voll * 0.5 : x.preis),
    bc100: sum((x) => x.art === 'sonst' ? x.preis : 0),
  };
  return [
    { id: 'ohne', name: 'Ohne BahnCard', karte: 0, tickets: tickets.ohne },
    { id: 'bc25', name: 'BahnCard 25', karte: preise.bc25, tickets: tickets.bc25 },
    { id: 'bc50', name: 'BahnCard 50', karte: preise.bc50, tickets: tickets.bc50 },
    { id: 'bc100', name: 'BahnCard 100', karte: preise.bc100, tickets: tickets.bc100 },
  ].map((s) => ({ ...s, gesamt: s.karte + s.tickets }));
}

function topN(arr, key, n = 3) {
  const m = new Map();
  for (const x of arr) { const k = key(x); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

// ---------------------------------------------------------------------------
// Darstellung
// ---------------------------------------------------------------------------
const state = { data: null, cardIdx: -1, preise: {} };

function render() {
  const d = state.data;
  const alle = fahrten(d);
  const { von, bis, card } = zeitraum();
  const heute = new Date();
  const liste = alle.filter((x) => x.datum >= von && x.datum <= bis);

  const typ = card ? card.typ : null;
  const meinPreis = state.preise.mein != null ? state.preise.mein : kartenPreis(card);
  const preise = {
    bc25: state.preise.bc25 != null ? state.preise.bc25 : (card && /MYBAHNCARD25/i.test(card.code || '') ? LISTENPREIS.MYBC25 : LISTENPREIS.BC25),
    bc50: state.preise.bc50 != null ? state.preise.bc50 : LISTENPREIS.BC50,
    bc100: state.preise.bc100 != null ? state.preise.bc100 : LISTENPREIS.BC100,
  };
  if (typ === 'BC25') preise.bc25 = meinPreis;
  if (typ === 'BC50') preise.bc50 = meinPreis;
  if (typ === 'BC100') preise.bc100 = meinPreis;

  const ersparnis = liste.reduce((s, x) => s + x.ersparnis, 0);
  const verschenkt = liste.reduce((s, x) => s + x.verschenkt, 0);
  const ausgegeben = liste.reduce((s, x) => s + x.preis + x.reservierung, 0);
  const netto = ersparnis - meinPreis;
  const plus = netto >= 0;
  const laeuft = card && heute <= bis;
  const restTage = laeuft ? Math.ceil((bis - heute) / 864e5) : 0;

  // Break-even: ab welcher Fahrt war die Karte bezahlt?
  let kum = 0, breakEven = null;
  const kurve = liste.filter((x) => x.ersparnis > 0).map((x) => {
    kum += x.ersparnis;
    if (!breakEven && card && kum >= meinPreis) breakEven = x;
    return { ...x, kum };
  });

  const youngAnzahl = liste.filter((x) => x.art === 'young').length;
  const ohneBC = liste.filter((x) => x.verschenkt > 0);
  const sz = szenarien(liste, preise);
  const best = sz.reduce((a, b) => (b.gesamt < a.gesamt ? b : a));
  const mineId = typ ? typ.toLowerCase() : null;

  const km = liste.reduce((s, x) => s + x.km, 0);
  const stunden = liste.reduce((s, x) => s + x.dauerS, 0) / 3600;
  const strecken = topN(liste, (x) => [x.von, x.nach].map(kurzName).sort().join(' ↔ '));
  const ziele = topN(liste, (x) => kurzName(x.nach));
  const zuege = topN(liste.flatMap((x) => x.zuege.map((z) => ({ z }))), (o) => o.z, 4);
  const teuerste = liste.reduce((a, b) => (!a || b.preis > a.preis ? b : a), null);
  const mitKm = liste.filter((x) => x.km > 0);
  const ctProKm = mitKm.length ? mitKm.reduce((s, x) => s + x.preis, 0) / mitKm.reduce((s, x) => s + x.km, 0) * 100 : 0;

  const cardOptions = d.bahncards.map((c, i) => `<option value="${i}" ${i === state.cardIdx ? 'selected' : ''}>${esc(kartenName(c))} · ${datum(c.ab)}–${datum(c.bis)}</option>`).join('');

  let html = '<div class="wrap result">';

  // Karte & Preis – ruhige Werkzeugleiste
  html += `<div class="panel panel--lead"><div class="toolbar">
    ${d.bahncards.length ? `<label class="field">Deine BahnCard<select id="sel-card">${cardOptions}</select></label>` : '<p class="toolbar__note">Keine BahnCard im Konto gefunden – wir rechnen mit den letzten 12 Monaten.</p>'}
    ${card ? `<label class="field">Kartenpreis in €<input id="inp-preis" type="number" min="0" step="0.01" value="${meinPreis.toFixed(2)}"></label>` : ''}
    ${card && card.klasse === 'KLASSE_1' ? '<p class="toolbar__note">1.-Klasse-Karte: Bitte prüfe den Kartenpreis – voreingestellt ist der Preis der 2. Klasse.</p>' : ''}
    ${card && card.ermaessigt ? '<p class="toolbar__note">Ermäßigte Karte: Bitte trage deinen tatsächlichen Kartenpreis ein.</p>' : ''}
  </div>`;

  // Urteil: die Karte füllt sich mit der Ersparnis bis zum Kartenpreis
  if (card) {
    const anteil = meinPreis > 0 ? Math.min(ersparnis / meinPreis, 1) : 1;
    const prozent = meinPreis > 0 ? Math.round((ersparnis / meinPreis) * 100) : 100;
    html += `<div class="verdict ${plus ? 'verdict--plus' : 'verdict--minus'}">
      <div class="bc ${plus ? '' : 'bc--minus'} ${anteil >= 1 ? 'bc--full' : ''}" data-fill="${anteil.toFixed(3)}" role="img"
        aria-label="${esc(kartenName(card))}: ${prozent} Prozent des Kartenpreises gespart">
        <div class="bc__fill"></div>
        <div class="bc__top"><span class="bc__logo">%</span><span class="bc__type">${esc(kartenName(card))}</span></div>
        <div class="bc__amount">${plus ? '+' : '−'}${eur(Math.abs(netto))}</div>
        <div class="bc__bottom"><span>${datum(von)} – ${datum(bis)}</span><span class="bc__pct">${prozent} %</span></div>
      </div>
      <div>
        <p class="eyebrow">Deine Bilanz</p>
        <h1 class="verdict__title">${plus ? 'Ja, sie hat sich gelohnt.' : laeuft ? 'Noch nicht drin.' : 'Nein, leider nicht.'}</h1>
        <dl class="verdict__facts">
          <div><dt>Gespart</dt><dd>${eur(ersparnis)}</dd></div>
          <div><dt>Kartenpreis</dt><dd>${eur(meinPreis)}</dd></div>
        </dl>
        <p class="verdict__text">${
          breakEven ? `Seit dem <strong>${datum(breakEven.datum)}</strong> (${esc(kurzName(breakEven.von))} → ${esc(kurzName(breakEven.nach))}) bist du im Plus.`
          : laeuft ? `Noch <strong>${eur(meinPreis - ersparnis)}</strong> bis zum Break-even – und ${restTage} Tage Zeit.` : 'Der Break-even wurde nicht erreicht.'
        }${laeuft && plus ? ` Die Karte gilt noch ${restTage} Tage – jede weitere Fahrt ist Gewinn.` : ''}</p>
      </div>
    </div>`;
  }

  // Hinweise
  const hinweise = [];
  if (ohneBC.length) hinweise.push(`<div class="note"><span class="note__icon" aria-hidden="true">💸</span><p><strong>${eur(verschenkt)} verschenkt.</strong> Bei ${ohneBC.length} ${ohneBC.length === 1 ? 'Fahrt' : 'Fahrten'} war keine BahnCard hinterlegt, obwohl der Tarif rabattfähig war (${ohneBC.map((x) => datum(x.datum, { day: '2-digit', month: '2-digit' })).join(', ')}). Tipp: BahnCard im Kundenkonto als Ermäßigung speichern.</p></div>`);
  if (youngAnzahl) hinweise.push(`<div class="note note--good"><span class="note__icon" aria-hidden="true">🎒</span><p><strong>${youngAnzahl} Young-${youngAnzahl === 1 ? 'Ticket' : 'Tickets'}.</strong> Darauf wird die BahnCard nicht angerechnet. Ab 27 fallen Young-Preise weg – dann zählt die BahnCard bei diesen Fahrten wieder voll.</p></div>`);
  if (card && best.id !== 'ohne' && mineId && best.id !== mineId) hinweise.push(`<div class="note note--good"><span class="note__icon" aria-hidden="true">🔁</span><p>Mit deinem Fahrprofil wäre die <strong>${best.name}</strong> günstiger gewesen (${eur(sz.find((s) => s.id === mineId).gesamt - best.gesamt)} weniger).</p></div>`);
  if (hinweise.length) html += `<div class="notes">${hinweise.join('')}</div>`;
  html += `</div>`;

  // Kurve
  if (card && kurve.length) html += `<section class="panel block">
    <p class="eyebrow">Verlauf</p>
    <h2 class="h2">Wann hat sich die Karte bezahlt gemacht?</h2>
    <p class="block__intro">Jeder Punkt ist eine Fahrt mit BahnCard-Rabatt. Wo die Linie den Kartenpreis kreuzt, war die Karte bezahlt.</p>
    ${chartKurve(kurve, von, bis, meinPreis, heute)}
    <div class="legend"><span><i></i>Ersparnis, aufsummiert</span><span><i class="ref"></i>Kartenpreis</span></div>
  </section>`;

  // Vergleich
  html += `<section class="panel block">
    <p class="eyebrow">Vergleich</p>
    <h2 class="h2">BahnCard 25, 50 oder 100?</h2>
    <p class="block__intro">Was dieselben ${liste.length} Fahrten mit jeder Karte gekostet hätten. Die Kartenpreise kannst du anpassen.</p>
    <div class="compare">${sz.map((s) => `<div class="option ${s.id === best.id ? 'option--best' : ''}">
      <div class="option__badges">${s.id === best.id ? '<span class="badge badge--best">Am günstigsten</span>' : ''}${s.id === mineId ? '<span class="badge">Deine Karte</span>' : ''}</div>
      <div class="option__name">${s.name}</div>
      <div class="option__total">${eur(s.gesamt)}</div>
      <div class="option__row"><span>Tickets</span><span>${eur(s.tickets)}</span></div>
      <div class="option__row"><span>Karte</span>${s.id === 'ohne' ? '<span>–</span>' : `<input class="cell-input" data-preis="${s.id}" type="number" min="0" step="0.01" value="${s.karte.toFixed(2)}" aria-label="Kartenpreis ${s.name}">`}</div>
    </div>`).join('')}</div>
    ${breakEvenText(liste, preise)}
  </section>`;

  // Statistiken – sechs Kennzahlen, der Rest als Text
  html += `<section class="panel block">
    <p class="eyebrow">${card ? 'Im Gültigkeitszeitraum' : 'Letzte 12 Monate'} · ${datum(von)} – ${datum(bis)}</p>
    <h2 class="h2">Dein Jahr auf der Schiene</h2>
    <div class="stats">
      ${stat('Fahrten', int(liste.length), `${new Set(liste.map((x) => x.nr)).size} Buchungen`)}
      ${stat('Ausgegeben', eur0(ausgegeben), liste.length ? `Ø ${eur(ausgegeben / liste.length)} pro Fahrt` : '')}
      ${stat('Strecke', int(km) + ' km', km ? `≈ ${(km / 40075).toLocaleString('de-DE', { maximumFractionDigits: 2 })}-mal um die Erde` : 'keine Angaben')}
      ${stat('Im Zug', int(stunden) + ' h', stunden ? `≈ ${(stunden / 24).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Tage` : '')}
      ${stat('Preis pro km', ctProKm ? ctProKm.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' ct' : '–', 'Auto: etwa 30–50 ct/km')}
      ${stat('Teuerste Fahrt', teuerste ? eur(teuerste.preis) : '–', teuerste ? `${kurzName(teuerste.von)} → ${kurzName(teuerste.nach)}` : '')}
      ${stat('Lieblingsstrecke', strecken[0] ? strecken[0][0] : '–', strecken[0] ? `${strecken[0][1]}-mal gefahren` : '', true)}
      ${stat('Häufigstes Ziel', ziele[0] ? ziele[0][0] : '–', ziele[0] ? `${ziele[0][1]}-mal` : '', true)}
      ${stat('Meistgenutzte Züge', zuege.length ? zuege.map(([z, n]) => `${z} ${n}×`).join(' · ') : '–', 'Zugabschnitte', true)}
    </div>
  </section>`;

  html += `<section class="duo">
    <div class="panel"><h3 class="h3">Ausgaben pro Monat</h3>${chartMonate(liste, von, bis)}</div>
    <div class="panel"><h3 class="h3">Nach Tarif</h3>${tarifBars(liste)}</div>
  </section>`;

  // Tabelle – eingeklappt
  html += `<details class="panel trips">
    <summary><h2 class="h2">Alle ${liste.length} Fahrten</h2></summary>
    <div class="tablewrap"><table>
      <thead><tr><th>Datum</th><th>Strecke</th><th class="hide-sm">Tarif</th><th class="r">Preis</th><th class="r">BahnCard</th></tr></thead>
      <tbody>${liste.slice().reverse().map((x) => `<tr>
        <td class="num">${datum(x.datum)}</td>
        <td>${esc(kurzName(x.von))} → ${esc(kurzName(x.nach))}</td>
        <td class="hide-sm">${esc(x.tarif)}${x.klasse === 1 ? ' · 1. Kl.' : ''}</td>
        <td class="r">${eur(x.preis)}</td>
        <td class="r">${x.ersparnis ? `<span class="tag tag--bc">−${eur(x.ersparnis)}</span>` : x.verschenkt ? '<span class="tag tag--miss">vergessen</span>' : x.art === 'young' ? '<span class="tag">Young</span>' : '<span class="tag">–</span>'}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">Keine Fahrten in diesem Zeitraum.</td></tr>'}</tbody>
    </table></div>
  </details>
  <p class="stand">Stand: ${datum(d.abgerufen)} · ${d.demo ? 'Demo-Daten' : 'Daten von bahn.de'} · stornierte Fahrten ausgeblendet</p>
  </div>`;

  const root = $('#view-result');
  const offen = root.querySelector('.trips[open]');
  root.innerHTML = html;
  if (offen) root.querySelector('.trips').open = true;
  bind(root);
  // Karte erst leer zeichnen, dann füllen – beim ersten Anzeigen sieht man sie volllaufen.
  const bc = root.querySelector('.bc[data-fill]');
  if (bc) requestAnimationFrame(() => requestAnimationFrame(() => bc.style.setProperty('--fill', bc.dataset.fill)));
}

function breakEvenText(liste, preise) {
  // Ab welchem Volumen an Flex-/Normalpreis-Fahrten lohnt BC50 statt BC25?
  const diff = preise.bc50 - preise.bc25;
  if (diff <= 0) return '';
  const flexVoll = liste.filter((x) => x.art === 'flex').reduce((s, x) => s + x.voll, 0);
  return `<p class="rule">Faustregel: Die BahnCard 50 lohnt sich gegenüber der 25 erst ab etwa <strong>${eur0(diff / 0.25)}</strong> Flex- und Normalpreis-Tickets (Preis ohne Rabatt) im Jahr – bei Sparpreisen geben beide 25 %. Du hattest ${eur0(flexVoll)}.</p>`;
}

function stat(label, value, note, text) {
  return `<div class="stat"><div class="stat__label">${esc(label)}</div><div class="stat__value ${text ? 'stat__value--text' : ''}">${esc(value)}</div>${note ? `<div class="stat__note">${esc(note)}</div>` : ''}</div>`;
}

function kurzName(s) {
  return String(s || '?').replace(/\s*\(tief\)/, '').replace(/\(Westf\)/, '').replace(/\s+/g, ' ').trim();
}

function tarifBars(liste) {
  const m = new Map();
  for (const x of liste) {
    const k = x.tarif;
    const e = m.get(k) || { n: 0, sum: 0 };
    e.n++; e.sum += x.preis; m.set(k, e);
  }
  const rows = [...m.entries()].sort((a, b) => b[1].sum - a[1].sum);
  const max = Math.max(1, ...rows.map(([, v]) => v.sum));
  return `<div class="hbars">${rows.map(([k, v]) => `<div class="hbar">
    <div class="hbar__head"><span>${esc(k)}</span><span class="hbar__val">${eur0(v.sum)} · ${v.n}×</span></div>
    <span class="hbar__track"><span class="hbar__fill" style="width:${(v.sum / max) * 100}%"></span></span></div>`).join('') || '<p class="muted">Keine Daten.</p>'}</div>`;
}

// --- SVG-Diagramme ---------------------------------------------------------
const W = 640, H = 240, PAD = { l: 48, r: 16, t: 16, b: 28 };

function niceMax(v) {
  if (v <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= v) return f * p;
  return 10 * p;
}

function chartKurve(kurve, von, bis, preis, heute) {
  // Volle Seitenbreite – breiteres Koordinatensystem, damit die Schrift nicht mitwächst.
  const W = 1040, H = 340;
  const ymax = niceMax(Math.max(preis * 1.15, kurve[kurve.length - 1].kum * 1.1));
  const x = (d) => PAD.l + ((d - von) / (bis - von)) * (W - PAD.l - PAD.r);
  const y = (v) => H - PAD.b - (v / ymax) * (H - PAD.t - PAD.b);
  const ticks = [0, ymax / 4, ymax / 2, (ymax * 3) / 4, ymax];
  let path = `M${x(von)},${y(0)}`;
  for (const p of kurve) path += ` H${x(p.datum).toFixed(1)} V${y(p.kum).toFixed(1)}`;
  const endX = x(Math.min(heute, bis));
  path += ` H${endX.toFixed(1)}`;
  const area = path + ` V${y(0)} H${x(von)} Z`;
  const months = [];
  const m = new Date(von.getFullYear(), von.getMonth() + 1, 1);
  while (m <= bis) { months.push(new Date(m)); m.setMonth(m.getMonth() + 2); }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kumulierte Ersparnis">
    ${ticks.map((t) => `<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${PAD.l - 8}" y="${y(t) + 4}" text-anchor="end">${eur0(t)}</text>`).join('')}
    ${months.map((d) => `<text x="${x(d)}" y="${H - 8}" text-anchor="middle">${d.toLocaleDateString('de-DE', { month: 'short' })}</text>`).join('')}
    ${heute < bis ? `<line class="today" x1="${x(heute)}" x2="${x(heute)}" y1="${PAD.t}" y2="${H - PAD.b}"/><text x="${x(heute) + 4}" y="${PAD.t + 10}">heute</text>` : ''}
    <path class="area" d="${area}"/>
    <path class="line" d="${path}"/>
    <line class="ref" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(preis)}" y2="${y(preis)}"/>
    <text class="ref-label" x="${W - PAD.r}" y="${y(preis) - 6}" text-anchor="end">Kartenpreis ${eur(preis)}</text>
    ${kurve.map((p) => `<g data-tip="${esc(`${datum(p.datum)}: ${kurzName(p.von)} → ${kurzName(p.nach)}<br>Ersparnis ${eur(p.ersparnis)} · gesamt ${eur(p.kum)}`)}"><circle class="hit" cx="${x(p.datum)}" cy="${y(p.kum)}" r="12"/><circle class="dot" cx="${x(p.datum)}" cy="${y(p.kum)}" r="4"/></g>`).join('')}
    <line class="axis" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(0)}" y2="${y(0)}"/>
  </svg>`;
}

function chartMonate(liste, von, bis) {
  const months = [];
  const m = new Date(von.getFullYear(), von.getMonth(), 1);
  while (m <= bis) { months.push({ d: new Date(m), sum: 0, n: 0 }); m.setMonth(m.getMonth() + 1); }
  for (const x of liste) {
    const e = months.find((o) => o.d.getFullYear() === x.datum.getFullYear() && o.d.getMonth() === x.datum.getMonth());
    if (e) { e.sum += x.preis + x.reservierung; e.n++; }
  }
  if (!months.length) return '<p class="muted">Keine Daten.</p>';
  const ymax = niceMax(Math.max(...months.map((o) => o.sum)));
  const bw = (W - PAD.l - PAD.r) / months.length;
  const y = (v) => H - PAD.b - (v / ymax) * (H - PAD.t - PAD.b);
  const ticks = [0, ymax / 2, ymax];
  const barW = Math.max(4, Math.min(28, bw - 2));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ausgaben pro Monat">
    ${ticks.map((t) => `<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${PAD.l - 8}" y="${y(t) + 4}" text-anchor="end">${eur0(t)}</text>`).join('')}
    ${months.map((o, i) => {
      const cx = PAD.l + bw * i + bw / 2;
      const h = Math.max(0, y(0) - y(o.sum));
      const r = Math.min(4, h / 2, barW / 2);
      const top = y(o.sum);
      const bar = h > 0 ? `<path class="bar" d="M${cx - barW / 2},${y(0)} V${top + r} Q${cx - barW / 2},${top} ${cx - barW / 2 + r},${top} H${cx + barW / 2 - r} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + r} V${y(0)} Z"/>` : '';
      const label = months.length <= 13 || i % 2 === 0 ? `<text x="${cx}" y="${H - 8}" text-anchor="middle">${o.d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')}</text>` : '';
      return `<g data-tip="${esc(`${o.d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}<br>${eur(o.sum)} · ${o.n} ${o.n === 1 ? 'Fahrt' : 'Fahrten'}`)}"><rect class="hit" x="${cx - bw / 2}" y="${PAD.t}" width="${bw}" height="${H - PAD.t - PAD.b}"/>${bar}</g>${label}`;
    }).join('')}
    <line class="axis" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(0)}" y2="${y(0)}"/>
  </svg>`;
}

// --- Interaktion -------------------------------------------------------------
function bind(root) {
  const sel = $('#sel-card', root);
  if (sel) sel.addEventListener('change', () => { state.cardIdx = +sel.value; state.preise = {}; render(); });
  const inp = $('#inp-preis', root);
  if (inp) inp.addEventListener('change', () => { state.preise.mein = Math.max(0, parseFloat(inp.value) || 0); render(); });
  root.querySelectorAll('[data-preis]').forEach((el) => el.addEventListener('change', () => {
    const v = Math.max(0, parseFloat(el.value) || 0);
    const card = state.data.bahncards[state.cardIdx];
    if (card && card.typ.toLowerCase() === el.dataset.preis) state.preise.mein = v;
    else state.preise[el.dataset.preis] = v;
    render();
  }));
}

const tooltip = $('#tooltip');
document.addEventListener('mousemove', (e) => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (!t) { tooltip.classList.add('hidden'); return; }
  tooltip.replaceChildren(...t.dataset.tip.split('<br>').flatMap((line, i) => (i ? [document.createElement('br'), line] : [line])));
  tooltip.classList.remove('hidden');
  const r = tooltip.getBoundingClientRect();
  let left = e.clientX + 14, top = e.clientY + 14;
  if (left + r.width > innerWidth - 8) left = e.clientX - r.width - 14;
  if (top + r.height > innerHeight - 8) top = e.clientY - r.height - 14;
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
});

// ---------------------------------------------------------------------------
// Demo-Daten
// ---------------------------------------------------------------------------
function demoDaten() {
  const heute = new Date();
  const ab = new Date(heute.getFullYear(), heute.getMonth() - 9, 15);
  const bis = new Date(ab); bis.setFullYear(bis.getFullYear() + 1); bis.setDate(bis.getDate() - 1);
  const iso = (d) => d.toISOString().slice(0, 10);
  const plan = [
    [10, 'Köln Hbf', 'Berlin Hbf', 'Super Sparpreis', 39.99, 1, 575, 4.4, ['ICE']],
    [12, 'Berlin Hbf', 'Köln Hbf', 'Super Sparpreis', 45.99, 1, 575, 4.5, ['ICE']],
    [31, 'Köln Hbf', 'Bonn Hbf', 'Normalpreis', 8.20, 1, 28, 0.4, ['RE5']],
    [46, 'Köln Hbf', 'Frankfurt(Main)Hbf', 'Sparpreis', 29.99, 1, 152, 1.2, ['ICE']],
    [48, 'Frankfurt(Main)Hbf', 'Köln Hbf', 'Flexpreis', 82.40, 1, 152, 1.1, ['ICE']],
    [70, 'Köln Hbf', 'Hamburg Hbf', 'Super Sparpreis', 25.99, 0, 357, 4.0, ['IC']],
    [73, 'Hamburg Hbf', 'Köln Hbf', 'Super Sparpreis', 31.99, 1, 357, 4.1, ['ICE']],
    [95, 'Köln Hbf', 'Aachen Hbf', 'Normalpreis', 15.30, 1, 64, 0.9, ['RE1']],
    [120, 'Köln Hbf', 'München Hbf', 'Sparpreis', 54.99, 1, 456, 4.6, ['ICE']],
    [124, 'München Hbf', 'Köln Hbf', 'Super Sparpreis', 49.99, 1, 456, 4.7, ['ICE']],
    [150, 'Köln Hbf', 'Bonn Hbf', 'Normalpreis', 8.20, 1, 28, 0.4, ['RB48']],
    [181, 'Köln Hbf', 'Berlin Hbf', 'Super Sparpreis', 35.99, 1, 575, 4.3, ['ICE']],
    [184, 'Berlin Hbf', 'Köln Hbf', 'Flexpreis', 139.90, 1, 575, 4.4, ['ICE']],
    [215, 'Köln Hbf', 'Frankfurt(Main)Hbf', 'Super Sparpreis', 21.99, 1, 152, 1.1, ['ICE']],
    [217, 'Frankfurt(Main)Hbf', 'Köln Hbf', 'Super Sparpreis', 21.99, 1, 152, 1.1, ['ICE']],
    [240, 'Köln Hbf', 'Bonn Hbf', 'EinzelTicket NRW', 9.40, 0, 28, 0.5, ['RE5']],
  ];
  const auftraege = plan.map(([tagNr, von, nach, name, voll, bc, km, h, zuege], i) => {
    const d = new Date(ab); d.setDate(d.getDate() + tagNr);
    const art = tarifArt(name);
    const mitBC = bc && art !== 'sonst';
    const preis = mitBC ? Math.round(voll * 0.75 * 100) / 100 : voll;
    return {
      nr: String(1000 + i), gebucht: iso(d), gesamtpreis: preis,
      reisen: [{
        richtung: 'hin', datum: iso(d) + 'T09:00:00', von, nach, storniert: false, dauerS: h * 3600, umstiege: 0,
        abschnitte: zuege.map((z) => ({ gattung: null, kurz: z.replace(/\d+/, ''), linie: z, dauerS: h * 3600, km, fuss: false })),
        angebote: [{ name, klasse: 'KLASSE_2', typ: 'REISEANGEBOT', preis, ermaessigungen: mitBC ? ['BAHNCARD25'] : ['KEINE_ERMAESSIGUNG'], bcErsparnis: mitBC ? Math.round((voll - preis) * 100) / 100 : 0, storniert: false }],
        reservierung: 0,
      }],
    };
  }).filter((a) => new Date(a.reisen[0].datum) <= heute);
  return {
    type: 'bc-data', version: 1, demo: true, abgerufen: heute.toISOString(),
    bahncards: [{ typ: 'BC25', produkt: 'BahnCard 25, 2. Klasse', code: 'BAHNCARD252KLASSE', klasse: 'KLASSE_2', ermaessigt: false, ab: iso(ab), bis: iso(bis) }],
    auftraege,
  };
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
$('#btn-reset').addEventListener('click', reset);
$('#btn-demo').addEventListener('click', () => loadData(demoDaten(), false));
$('#file-input').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { loadData(JSON.parse(await f.text()), true); } catch (err) { alert('Die Datei konnte nicht gelesen werden.'); }
});

setupBookmarklet();
setupErweiterung();

if (location.hash === '#import') {
  startImport();
} else {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(STORE_KEY)); } catch (e) { /* nichts */ }
  if (saved && validData(saved)) loadData(saved, false);
}
