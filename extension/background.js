// BahnCard-Bilanz – Hintergrund: öffnet den bahn.de-Tab und reicht Nachrichten an die Auswertungsseite weiter.
// Der Zustand liegt in storage.session, weil der Service Worker zwischendurch beendet werden kann.
const START_URL = 'https://www.bahn.de/buchung/kundenkonto/bahncard';
const SITE_URL = 'https://xsebo99.github.io/BC_Value_Check/';

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: SITE_URL }));

const lesen = async () => (await chrome.storage.session.get('lauf')).lauf || null;
const schreiben = (lauf) => (lauf ? chrome.storage.session.set({ lauf }) : chrome.storage.session.remove('lauf'));
const anSeite = (lauf, msg) => chrome.tabs.sendMessage(lauf.siteTab, msg).catch(() => { /* Seite geschlossen */ });

chrome.runtime.onMessage.addListener((msg, sender, antwort) => {
  const tab = sender.tab && sender.tab.id;
  (async () => {
    const lauf = await lesen();
    if (msg.type === 'start') {
      if (lauf && lauf.bahnTab) await chrome.tabs.remove(lauf.bahnTab).catch(() => {});
      await schreiben({ siteTab: tab, bahnTab: null });
      const t = await chrome.tabs.create({ url: START_URL, openerTabId: tab });
      await schreiben({ siteTab: tab, bahnTab: t.id });
      antwort({ ok: true });
    } else if (msg.type === 'wer') {
      antwort({ sammeln: !!lauf && lauf.bahnTab === tab });
    } else if (lauf && lauf.bahnTab === tab && /^bc-(progress|data|error)$/.test(msg.type)) {
      await anSeite(lauf, msg);
      if (msg.type !== 'bc-progress') {
        await schreiben(null);
        if (msg.type === 'bc-data') await chrome.tabs.remove(tab).catch(() => {});
        await chrome.tabs.update(lauf.siteTab, { active: true }).catch(() => {});
      }
      antwort({ ok: true });
    } else {
      antwort({ ok: false });
    }
  })();
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const lauf = await lesen();
  if (!lauf) return;
  if (tabId === lauf.bahnTab) {
    await anSeite(lauf, { type: 'bc-error', text: 'Der bahn.de-Tab wurde geschlossen, bevor alles eingelesen war. Starte einfach nochmal.' });
    await schreiben(null);
  } else if (tabId === lauf.siteTab) {
    await schreiben(null);
  }
});
