// BahnCard-Bilanz – gemeinsame Sammel-Logik für Lesezeichen (collector.js) und Browser-Erweiterung.
// Läuft auf www.bahn.de mit dem Login-Token aus sessionStorage. Liest BahnCard(s) und vergangene Aufträge
// über die Schnittstellen, die bahn.de selbst nutzt, und reduziert sie auf das Nötige (keine Namen, Adressen, E-Mails).
// Wichtig: Wird fürs Lesezeichen in eine Zeile gepackt – nur ganze Kommentarzeilen, überall Semikolons.
// Kopie für die Erweiterung: extension/core.js (bei Änderungen mitkopieren).
async function bcSammeln(token, step) {
  const API = 'https://www.bahn.de/web/api';
  const H = { accept: 'application/json', Authorization: 'Bearer ' + token };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // bahn.de begrenzt die Anfragen pro Zeit (HTTP 429) – deshalb langsam und mit Backoff.
  async function get(path) {
    let wait = 2000;
    for (let i = 0; i < 7; i++) {
      const r = await fetch(API + path, { headers: H });
      if (r.ok) return r.json();
      if (r.status === 401 || r.status === 403) throw new Error('Deine Sitzung auf bahn.de ist abgelaufen. Bitte neu anmelden und nochmal versuchen.');
      if (r.status !== 429 && r.status < 500) throw new Error('bahn.de hat mit Fehler ' + r.status + ' geantwortet.');
      step({ text: 'bahn.de bremst kurz – warte ' + Math.round(wait / 1000) + ' s …' });
      await sleep(wait);
      wait = Math.min(wait * 2, 30000);
    }
    throw new Error('bahn.de antwortet gerade nicht. Bitte später nochmal versuchen.');
  }

  // Koordinaten stecken in der Halt-ID: "A=1@O=Bonn Hbf@X=7097136@Y=50732008@…" (Mikrograd).
  const coord = (halt) => {
    const m = /X=(-?\d+)@Y=(-?\d+)/.exec(halt && halt.id || '');
    return m ? [m[2] / 1e6, m[1] / 1e6] : null;
  };
  const km = (a, b) => {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const betrag = (txt) => {
    const m = /(\d{1,4}(?:[.,]\d{2}))\s*€/.exec(txt || '');
    return m ? parseFloat(m[1].replace(',', '.')) : 0;
  };

  function reise(richtung, teil, listTeil) {
    if (!teil) return null;
    const v = teil.verbindung || {};
    const abschnitte = (v.verbindungsAbschnitte || []).map((a) => {
      const vm = a.verkehrsmittel || {};
      let dist = 0;
      const pts = (a.halte || []).map(coord).filter(Boolean);
      for (let i = 1; i < pts.length; i++) dist += km(pts[i - 1], pts[i]);
      return {
        gattung: vm.produktGattung || null,
        kurz: vm.kurzText || null,
        linie: vm.mittelText || null,
        dauerS: a.abschnittsDauer || 0,
        km: Math.round(dist),
        fuss: vm.typ && vm.typ !== 'PUBLICTRANSPORT',
      };
    });
    const ab0 = (v.verbindungsAbschnitte || [])[0];
    const datum = (ab0 && ab0.abfahrt && ab0.abfahrt.sollzeit) || (listTeil && listTeil.abfahrt) ||
      (teil.zeitlicheGueltigkeit && teil.zeitlicheGueltigkeit.ersterGeltungszeitpunkt) || null;
    return {
      richtung,
      datum,
      von: (listTeil && listTeil.startort) || null,
      nach: (listTeil && listTeil.zielort) || null,
      storniert: teil.storniertStatus === 'STORNIERT' || teil.isKundenwunschStorniert === true,
      dauerS: v.verbindungsDauerInSeconds || 0,
      umstiege: v.umstiegsAnzahl || 0,
      abschnitte,
      angebote: (teil.angebote || []).map((a) => ({
        name: a.name,
        klasse: a.klasse,
        typ: a.angebotsTyp,
        kategorie: a.produktKategorie,
        preis: a.preis ? a.preis.betrag : 0,
        von: a.gueltigkeitsstrecke && a.gueltigkeitsstrecke.abgangsbahnhofName,
        nach: a.gueltigkeitsstrecke && a.gueltigkeitsstrecke.zielbahnhofName,
        ermaessigungen: [...new Set((a.reisende || []).flatMap((r) => (r.ermaessigungen || []).map((e) => e.art)))],
        reisende: (a.reisende || []).reduce((s, r) => s + (r.anzahl || 1), 0),
        bcErsparnis: (a.konditionsAnzeigen || []).filter((k) => k.kategorie === 'STREICHPREIS').reduce((s, k) => s + betrag(k.textKurz), 0),
        storniert: a.isStorniert === true,
      })),
      reservierung: (teil.sitzplatzAngebote || []).reduce((s, a) => s + (a.preis ? a.preis.betrag : 0), 0),
    };
  }

  step({ text: 'Lese deine BahnCard …' });
  const bc = await get('/kundenkonto/bahncard');
  const bahncards = (bc.bahnCardBestellungen || []).map((b) => ({
    typ: b.bahncardTyp,
    produkt: b.produktBezeichnung,
    code: b.produktCode,
    klasse: b.klasse,
    ermaessigt: b.ermaessigt,
    ab: b.gueltigAb,
    bis: b.gueltigBis,
  }));
  await sleep(800);

  step({ text: 'Lese dein Kundenkonto …' });
  const konto = await get('/kundenkonto/v2');
  const profile = (konto.kundenProfile || []).map((p) => p.id);

  // Nur so weit zurück, wie es für die BahnCards (bzw. die letzten 2 Jahre) nötig ist.
  const frueheste = bahncards.map((b) => b.ab).filter(Boolean).sort()[0];
  const grenze = new Date(frueheste || Date.now() - 730 * 864e5);
  grenze.setDate(grenze.getDate() - 7);

  const liste = [];
  const jetzt = new Date().toISOString();
  for (const pid of profile) {
    let start = 0;
    for (let seite = 0; seite < 50; seite++) {
      step({ text: 'Lese Reiseliste (' + liste.length + ' Aufträge) …' });
      const j = await get('/buchung/auftrag/v2?startIndex=' + start + '&auftraegeReturnSize=10&auftragSortOrder=DESCENDING&letzterGeltungszeitpunktVor=' +
        encodeURIComponent(jetzt) + '&kundenprofilId=' + encodeURIComponent(pid));
      const neu = j.auftraege || [];
      liste.push(...neu);
      const aeltester = neu.map((a) => (a.gesamtreisen || [])[0]).map((g) => g && g.hinfahrt && g.hinfahrt.abfahrt).filter(Boolean).sort()[0];
      if (!j.hasMoreAuftraege || (aeltester && new Date(aeltester) < grenze)) break;
      start += 10;
      await sleep(800);
    }
  }

  const relevant = liste.filter((a) => (a.gesamtreisen || []).some((g) => {
    const d = (g.hinfahrt && g.hinfahrt.abfahrt) || (g.rueckfahrt && g.rueckfahrt.abfahrt);
    return !d || new Date(d) >= grenze;
  }));
  const nummern = [...new Set(relevant.map((a) => a.auftragsnummer))];

  const auftraege = [];
  for (let i = 0; i < nummern.length; i++) {
    step({ done: i, total: nummern.length, text: 'Lese Auftrag ' + (i + 1) + ' von ' + nummern.length + ' …' });
    const nr = nummern[i];
    const d = await get('/buchung/auftrag/' + encodeURIComponent(nr));
    const l = relevant.find((a) => a.auftragsnummer === nr) || {};
    const lg = (l.gesamtreisen || [])[0] || {};
    const ga = d.gesamtangebot || {};
    auftraege.push({
      nr: String(nr).slice(-4),
      gebucht: d.anlagedatum || l.anlagedatum || null,
      gesamtpreis: d.gesamtpreis ? d.gesamtpreis.betrag : 0,
      reisen: [reise('hin', ga.hinfahrt, lg.hinfahrt), reise('rueck', ga.rueckfahrt, lg.rueckfahrt)].filter(Boolean),
    });
    if (i < nummern.length - 1) await sleep(1500);
  }

  step({ done: nummern.length, total: nummern.length, text: 'Fertig!' });
  return { type: 'bc-data', version: 1, abgerufen: new Date().toISOString(), bahncards, auftraege };
}
