'use strict';
// Hell/Dunkel-Umschalter. Läuft im <head>, damit die gewählte Darstellung ohne Aufblitzen erscheint.
// Ohne eigene Wahl startet die Seite hell; die Wahl bleibt nur in diesem Browser (localStorage).
(function () {
  const KEY = 'sparschiene-design';
  const root = document.documentElement;
  root.dataset.theme = 'light';
  try {
    const gespeichert = localStorage.getItem(KEY);
    if (gespeichert === 'light' || gespeichert === 'dark') root.dataset.theme = gespeichert;
  } catch (e) { /* Speicher gesperrt: dann eben hell */ }

  const istDunkel = () => root.dataset.theme === 'dark';
  const beschrifte = (btn) => {
    const dunkel = istDunkel();
    const text = dunkel ? 'Helles Design einschalten' : 'Dunkles Design einschalten';
    btn.dataset.modus = dunkel ? 'dark' : 'light';
    btn.setAttribute('aria-label', text);
    btn.title = text;
  };

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-design');
    if (!btn) return;
    beschrifte(btn);
    btn.addEventListener('click', () => {
      const neu = istDunkel() ? 'light' : 'dark';
      root.dataset.theme = neu;
      try { localStorage.setItem(KEY, neu); } catch (e) { /* nur für diese Sitzung */ }
      beschrifte(btn);
    });
  });
})();
