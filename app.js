'use strict';

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------
const BAHN_ORIGIN = 'https://www.bahn.de';
const STORE_KEY = 'sparschiene-daten';

// Listenpreise laut bahn.de, Stand Oktober 2026 (2. Klasse). In der Auswertung änderbar.
// Listenpreise 2. Klasse laut bahn.de/angebot/bahncard (Stand Oktober 2026), je Kartenvariante
const LISTENPREIS = {
  BC25: { normal: 62.90, my: 39.90, senioren: 40.90, ermaessigt: 40.90, probe: 19.90, jugend: 0 },
  BC50: { normal: 244, my: 79.90, senioren: 122, ermaessigt: 122, probe: 76.90 },
  BC100: { normal: 4899, my: 3199, probe: 1459 },
};

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
// Hero: Fallblatt-Titel, Musterkarte und Abfahrtstafel wechseln gemeinsam 25 → 50 → 100.
// Beispielwerte einer erfundenen Person, damit jede Variante ein anderes Ergebnis zeigt.
const HERO_BEISPIELE = [
  { nr: '25', karte: 'BC 25', typ: 'BahnCard 25', gespart: 41, preis: 62.90, bilanz: 'NOCH NICHT', ton: '' },
  { nr: '50', karte: 'BC 50', typ: 'BahnCard 50', gespart: 312, preis: 244, bilanz: 'LOHNT SICH', ton: 'plus' },
  { nr: '100', karte: 'BC100', typ: 'BahnCard 100', gespart: 3910, preis: 4899, bilanz: 'LOHNT NICHT', ton: 'minus' },
];
const RUHIG = matchMedia('(prefers-reduced-motion: reduce)');
const FLAP_ZEICHEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// Blättert jede Zelle über ein paar Zufallszeichen zum Zielzeichen, leicht versetzt wie an der Tafel
function flapZu(el, text, rechts = false) {
  const zellen = [...el.children];
  const zeichen = [...text];
  const rest = Array(Math.max(0, zellen.length - zeichen.length)).fill(' ');
  const ziel = rechts ? rest.concat(zeichen) : zeichen.concat(rest);
  zellen.forEach((zelle, i) => {
    const soll = ziel[i] === ' ' ? ' ' : ziel[i];
    clearInterval(zelle._flap);
    if (zelle.textContent === soll) return;
    if (RUHIG.matches) { zelle.textContent = soll; return; }
    let schritte = 3 + i % 4 + Math.floor(Math.random() * 3);
    zelle._flap = setInterval(() => {
      zelle.textContent = --schritte > 0 ? FLAP_ZEICHEN[Math.floor(Math.random() * FLAP_ZEICHEN.length)] : soll;
      if (schritte <= 0) clearInterval(zelle._flap);
      if (zelle.animate) zelle.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(.35)', filter: 'brightness(.6)' }, { transform: 'scaleY(1)' }], { duration: 65, easing: 'ease-out' });
    }, 65);
  });
}

function setupHero() {
  const bc = $('#hero-bc');
  if (!bc) return;
  const tafelBilanz = $('#tafel-bilanz');
  const tafelSaldo = $('#tafel-saldo');

  const zeige = (b) => {
    const saldo = b.gespart - b.preis;
    const saldoText = (saldo >= 0 ? '+' : '−') + int(Math.abs(saldo)) + ' €';
    flapZu($('#wechsel'), b.nr, true);
    flapZu($('#tafel-karte'), b.karte);
    tafelBilanz.dataset.ton = b.ton;
    flapZu(tafelBilanz, b.bilanz);
    tafelSaldo.dataset.ton = saldo >= 0 ? 'plus' : 'minus';
    flapZu(tafelSaldo, saldoText, true);
    const fill = Math.min(1, b.gespart / b.preis);
    bc.style.setProperty('--fill', fill.toFixed(3));
    bc.classList.toggle('bc--full', fill >= 1);
    $('#hero-typ').textContent = b.typ;
    $('#hero-saldo').textContent = saldoText;
    $('#hero-sub').textContent = `${int(b.gespart)} € gespart · Karte ${eur(b.preis).replace(',00', '')}`;
  };

  let i = 0;
  setInterval(() => {
    if (document.hidden) return;
    i = (i + 1) % HERO_BEISPIELE.length;
    zeige(HERO_BEISPIELE[i]);
  }, 4200);

  // Karte kippt leicht mit der Maus, der Glanz wandert mit
  const tilt = $('.hero__tilt');
  if (RUHIG.matches || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const flaeche = $('.hero__card');
  flaeche.addEventListener('pointermove', (e) => {
    const r = tilt.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    tilt.classList.add('is-aktiv');
    tilt.style.setProperty('--ry', ((x - .5) * 14).toFixed(2) + 'deg');
    tilt.style.setProperty('--rx', ((.5 - y) * 10).toFixed(2) + 'deg');
    tilt.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
    tilt.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
  });
  flaeche.addEventListener('pointerleave', () => {
    tilt.classList.remove('is-aktiv');
    for (const p of ['--rx', '--ry', '--gx', '--gy']) tilt.style.removeProperty(p);
  });
}

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
    $('#import-text').textContent = 'Im bahn.de-Tab anmelden, dann geht es automatisch weiter.';
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

// Variante aus Produktcode und -name; Probe-Karten erkennt man auch an der kurzen Laufzeit
function kartenVariante(card) {
  if (!card) return 'normal';
  const s = ((card.code || '') + ' ' + (card.produkt || '')).toUpperCase().replace(/\s+/g, '');
  if (s.includes('JUGEND')) return 'jugend';
  if (s.includes('PROBE') || (card.ab && card.bis && tag(card.bis) - tag(card.ab) < 120 * 864e5)) return 'probe';
  if (s.includes('MYBAHNCARD') || s.includes('MYBC')) return 'my';
  if (s.includes('SENIOR')) return 'senioren';
  if (card.ermaessigt) return 'ermaessigt';
  return 'normal';
}

function listenPreis(typ, variante) {
  const t = LISTENPREIS[typ];
  if (!t) return 0;
  // Jugend gibt es nur als BC 25 – für 50/100 gilt dann der My-Preis
  if (t[variante] == null && variante === 'jugend') return t.my != null ? t.my : t.normal;
  return t[variante] != null ? t[variante] : t.normal;
}

function kartenPreis(card) {
  return card ? listenPreis(card.typ, kartenVariante(card)) : 0;
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
    bc25: state.preise.bc25 != null ? state.preise.bc25 : listenPreis('BC25', kartenVariante(card)),
    bc50: state.preise.bc50 != null ? state.preise.bc50 : listenPreis('BC50', kartenVariante(card)),
    bc100: state.preise.bc100 != null ? state.preise.bc100 : listenPreis('BC100', kartenVariante(card)),
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
    ${card && card.ermaessigt ? '<p class="toolbar__note">Ermäßigte Karte: Voreingestellt ist der ermäßigte Listenpreis – bitte prüfen.</p>' : ''}
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
        <p class="verdict__kicker">Deine Bilanz</p>
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
  if (ohneBC.length) hinweise.push(`<div class="note"><span class="note__icon" aria-hidden="true">💸</span><p><strong>${eur(verschenkt)} verschenkt.</strong> Bei ${ohneBC.length} ${ohneBC.length === 1 ? 'Fahrt' : 'Fahrten'} war keine BahnCard hinterlegt, obwohl der Tarif rabattfähig war (${ohneBC.map((x) => datum(x.datum, { day: '2-digit', month: '2-digit' })).join(', ')}). Tipp: BahnCard im Kundenkonto hinterlegen.</p></div>`);
  if (youngAnzahl) hinweise.push(`<div class="note note--good"><span class="note__icon" aria-hidden="true">🎒</span><p><strong>${youngAnzahl} Young-${youngAnzahl === 1 ? 'Ticket' : 'Tickets'}.</strong> Darauf wird die BahnCard nicht angerechnet. Ab 27 fallen Young-Preise weg – dann zählt die BahnCard bei diesen Fahrten wieder voll.</p></div>`);
  if (card && best.id !== 'ohne' && mineId && best.id !== mineId) hinweise.push(`<div class="note note--good"><span class="note__icon" aria-hidden="true">🔁</span><p>Mit deinem Fahrprofil wäre die <strong>${best.name}</strong> günstiger gewesen (${eur(sz.find((s) => s.id === mineId).gesamt - best.gesamt)} weniger).</p></div>`);
  if (hinweise.length) html += `<div class="notes">${hinweise.join('')}</div>`;
  html += `</div>`;

  // Kurve
  if (card && kurve.length) html += `<section class="panel block">
    <h2 class="h2">Wann hat sich die Karte bezahlt gemacht?</h2>
    <p class="meta">Jeder Punkt ist eine Fahrt mit BahnCard-Rabatt.</p>
    ${chartKurve(kurve, von, bis, meinPreis, heute)}
    <div class="legend"><span><i></i>Ersparnis, aufsummiert</span><span><i class="ref"></i>Kartenpreis</span></div>
  </section>`;

  // Vergleich: jede Variante als Mini-BahnCard – „ohne“ ist eine leere, gestrichelte Karte, die günstigste ist grün
  html += `<section class="panel block">
    <h2 class="h2">BahnCard 25, 50 oder 100?</h2>
    <p class="meta">Deine ${liste.length} Fahrten, mit jeder Karte gerechnet.</p>
    <div class="compare">${sz.map((s) => `<div class="option">
      <div class="minicard ${s.id === 'ohne' ? 'minicard--ohne' : ''} ${s.id === best.id ? 'minicard--best' : ''}">
        <div class="minicard__name"><span>${s.name}</span><span class="minicard__tag">${s.id === best.id ? 'günstigste' : s.id === mineId ? 'deine' : ''}</span></div>
        <div class="minicard__total">${eur0(s.gesamt)}</div>
      </div>
      <div class="option__row"><span>Tickets</span><span>${eur(s.tickets)}</span></div>
      <div class="option__row"><span>Karte</span>${s.id === 'ohne' ? '<span>–</span>' : `<input class="cell-input" data-preis="${s.id}" type="number" min="0" step="0.01" value="${s.karte.toFixed(2)}" aria-label="Kartenpreis ${s.name}">`}</div>
    </div>`).join('')}</div>
    ${breakEvenText(liste, preise)}
  </section>`;

  // Statistik als Fahrtbeleg: die Strecke führt, der Rest steht wie auf einer Quittung
  const posten = [
    ['Ausgegeben', eur(ausgegeben), liste.length ? `Ø ${eur(ausgegeben / liste.length)} pro Fahrt` : ''],
    ['Preis pro km', ctProKm ? ctProKm.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' ct' : '–', 'Auto: etwa 30–50 ct/km'],
    ['Teuerste Fahrt', teuerste ? eur(teuerste.preis) : '–', teuerste ? `${kurzName(teuerste.von)} → ${kurzName(teuerste.nach)}` : ''],
    ['Lieblingsstrecke', strecken[0] ? strecken[0][0] : '–', strecken[0] ? `${strecken[0][1]}-mal gefahren` : ''],
    ['Häufigstes Ziel', ziele[0] ? ziele[0][0] : '–', ziele[0] ? `${ziele[0][1]}-mal` : ''],
    ['Meistgenutzte Züge', zuege.length ? zuege.map(([z, n]) => `${z} ${n}×`).join(' · ') : '–', ''],
  ];
  html += `<section class="panel block">
    <h2 class="h2">Dein Fahrtbeleg</h2>
    <p class="meta">${card ? 'Im Gültigkeitszeitraum deiner Karte' : 'Letzte 12 Monate'}, ${datum(von)} – ${datum(bis)}</p>
    <div class="beleg">
      <div>
        <div class="beleg__label">Mit der Bahn gefahren</div>
        <div class="beleg__zahl">${int(km)} km</div>
        <div class="beleg__sub">
          <span><strong>${int(liste.length)}</strong> Fahrten</span>
          <span><strong>${int(stunden)} h</strong> im Zug</span>
          <span><strong>${int(new Set(liste.map((x) => x.nr)).size)}</strong> Buchungen</span>
        </div>
      </div>
      <ul class="posten">${posten.map(([n, w, s]) => `<li><span class="posten__name">${esc(n)}</span><span class="posten__linie" aria-hidden="true"></span><span class="posten__wert">${esc(w)}${s ? `<small>${esc(s)}</small>` : ''}</span></li>`).join('')}</ul>
    </div>
  </section>`;

  html += `<section class="duo">
    <div class="panel"><h3 class="h3">Ausgaben pro Monat</h3>${chartMonate(liste, von, bis)}
      <div class="legend"><span><i class="sw sw--bezahlt"></i>bezahlt</span><span><i class="sw"></i>durch BahnCard gespart</span></div></div>
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
  return `<p class="rule">Die BahnCard 50 lohnt sich gegenüber der 25 erst ab ca. <strong>${eur0(diff / 0.25)}</strong> Flexpreis-Tickets (ohne Rabatt) im Jahr. Du hattest ${eur0(flexVoll)}.</p>`;
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
    ${kurve.map((p, i) => {
      // Trefferfläche: senkrechter Streifen bis zur Mitte zwischen den Nachbarpunkten, über die ganze Höhe
      const px = x(p.datum);
      const links = i ? (x(kurve[i - 1].datum) + px) / 2 : Math.max(PAD.l, px - 12);
      const rechts = i < kurve.length - 1 ? (px + x(kurve[i + 1].datum)) / 2 : Math.min(W - PAD.r, px + 12);
      return `<g data-tip="${esc(`${datum(p.datum)}: ${kurzName(p.von)} → ${kurzName(p.nach)}<br>Ersparnis ${eur(p.ersparnis)} · gesamt ${eur(p.kum)}`)}"><rect class="hit" x="${links}" y="${PAD.t}" width="${Math.max(rechts - links, 1)}" height="${H - PAD.t - PAD.b}"/><line class="guide" x1="${px}" x2="${px}" y1="${PAD.t}" y2="${H - PAD.b}"/><circle class="dot" cx="${px}" cy="${y(p.kum)}" r="4"/></g>`;
    }).join('')}
    <line class="axis" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(0)}" y2="${y(0)}"/>
  </svg>`;
}

function chartMonate(liste, von, bis) {
  const months = [];
  const m = new Date(von.getFullYear(), von.getMonth(), 1);
  while (m <= bis) { months.push({ d: new Date(m), sum: 0, gespart: 0, n: 0 }); m.setMonth(m.getMonth() + 1); }
  for (const x of liste) {
    const e = months.find((o) => o.d.getFullYear() === x.datum.getFullYear() && o.d.getMonth() === x.datum.getMonth());
    if (e) { e.sum += x.preis + x.reservierung; e.gespart += x.ersparnis; e.n++; }
  }
  if (!months.length) return '<p class="muted">Keine Daten.</p>';
  // Ein Balken zeigt, was du bezahlt hast – oben drauf in Grün, was die BahnCard dabei gespart hat.
  const ymax = niceMax(Math.max(...months.map((o) => o.sum + o.gespart)));
  const bw = (W - PAD.l - PAD.r) / months.length;
  const y = (v) => H - PAD.b - (v / ymax) * (H - PAD.t - PAD.b);
  const ticks = [0, ymax / 2, ymax];
  const barW = Math.max(4, Math.min(28, bw - 6));
  const rund = (x0, x1, top, unten, r) => `M${x0},${unten} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x1 - r} Q${x1},${top} ${x1},${top + r} V${unten} Z`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ausgaben und Ersparnis pro Monat">
    ${ticks.map((t) => `<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${PAD.l - 8}" y="${y(t) + 4}" text-anchor="end">${eur0(t)}</text>`).join('')}
    ${months.map((o, i) => {
      const cx = PAD.l + bw * i + bw / 2;
      const x0 = cx - barW / 2, x1 = cx + barW / 2;
      const yBez = y(o.sum), yGes = y(o.sum + o.gespart);
      const r = Math.min(4, barW / 2);
      let bars = '';
      if (o.gespart > 0) {
        bars += `<rect class="bar" x="${x0}" y="${yBez}" width="${barW}" height="${Math.max(0, y(0) - yBez)}"/>`;
        bars += `<path class="bar bar--gespart" d="${rund(x0, x1, yGes, yBez - 1.5, Math.min(r, (yBez - yGes) / 2))}"/>`;
      } else if (o.sum > 0) {
        bars += `<path class="bar" d="${rund(x0, x1, yBez, y(0), Math.min(r, (y(0) - yBez) / 2))}"/>`;
      }
      const label = months.length <= 13 || i % 2 === 0 ? `<text x="${cx}" y="${H - 8}" text-anchor="middle">${o.d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')}</text>` : '';
      return `<g data-tip="${esc(`${o.d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}<br>${eur(o.sum)} bezahlt · ${o.n} ${o.n === 1 ? 'Fahrt' : 'Fahrten'}${o.gespart ? `<br>${eur(o.gespart)} durch BahnCard gespart` : ''}`)}"><rect class="hit" x="${cx - bw / 2}" y="${PAD.t}" width="${bw}" height="${H - PAD.t - PAD.b}"/>${bars}</g>${label}`;
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
setupHero();

if (location.hash === '#import') {
  startImport();
} else {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(STORE_KEY)); } catch (e) { /* nichts */ }
  if (saved && validData(saved)) loadData(saved, false);
}
