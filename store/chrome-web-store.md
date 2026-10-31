# Chrome Web Store – Einreichung „Bahnkarte24“

Alles, was beim Einreichen im [Developer Dashboard](https://chrome.google.com/webstore/devconsole) abgefragt wird, zum Kopieren.
ZIP bauen: `node tools/build-extension.mjs` → `dist/bahnkarte24-<version>.zip`

## Store-Eintrag

**Name:** Bahnkarte24

**Kurzbeschreibung** (max. 132 Zeichen, steht schon im Manifest):
> Prüft mit deinen echten bahn.de-Fahrten, ob sich deine BahnCard gelohnt hat. Liest nur, nichts verlässt deinen Browser.

**Kategorie:** Tools (alternativ: Reisen)
**Sprache:** Deutsch

**Ausführliche Beschreibung:**

> Hat sich deine BahnCard gelohnt? Bahnkarte24 rechnet es mit deinen echten Fahrten von bahn.de nach – mit einem Klick.
>
> So funktioniert's:
> 1. Öffne https://xsebo99.github.io/SparSchiene/ und klicke auf „Meine Fahrten von bahn.de holen“.
> 2. bahn.de öffnet sich in einem neuen Tab. Melde dich an, falls nötig.
> 3. Die Erweiterung liest deine BahnCard und deine vergangenen Buchungen und bringt dich zur Auswertung zurück.
>
> Das bekommst du:
> • Ersparnis durch die BahnCard im Gültigkeitszeitraum – und ab wann sich die Karte bezahlt gemacht hat
> • Fahrten, bei denen du die BahnCard vergessen hast
> • Vergleich: Was hätten dieselben Fahrten ohne BahnCard, mit BahnCard 25, 50 oder 100 gekostet?
> • Statistiken: Kilometer, Stunden im Zug, Cent pro Kilometer, Lieblingsstrecke, meistgenutzte Züge, Ausgaben pro Monat
>
> Datenschutz:
> • Kein Server, kein Konto, kein Tracking – die Auswertung läuft komplett in deinem Browser.
> • Gelesen werden nur Fahrt- und Preisdaten; Namen, Adressen und Zahlungsdaten werden nicht übernommen.
> • Die Erweiterung liest nur und ändert nichts an deinen Buchungen.
> • Quellcode: https://github.com/xsebo99/SparSchiene
>
> Bahnkarte24 ist ein unabhängiges Projekt und steht in keiner Verbindung zur Deutschen Bahn AG. „BahnCard“ und „Deutsche Bahn“ sind Marken der Deutsche Bahn AG.

**Website:** https://xsebo99.github.io/SparSchiene/
**Support-URL:** https://github.com/xsebo99/SparSchiene/issues

## Grafiken

| Feld | Datei / Vorgabe |
|---|---|
| Store-Icon 128×128 | `extension/icons/icon128.png` |
| Screenshots (mind. 1, 1280×800 oder 640×400) | selbst aufnehmen: Startseite mit „Erweiterung erkannt“, Auswertung (Urteil + Kurve), Vergleichstabelle. Tipp: „Beispiel“ nutzen, dann sind keine echten Daten drauf. |
| Kleine Werbekachel 440×280 (optional) | – |

## Datenschutz-Tab

**Alleiniger Zweck (Single purpose):**
> Liest auf Wunsch des Nutzers seine BahnCard und vergangenen Bahnbuchungen aus seinem bahn.de-Konto und übergibt sie an die Webseite Bahnkarte24, die im Browser berechnet, ob sich die BahnCard gelohnt hat.

**Begründung je Berechtigung:**

- **storage:**
  > Merkt sich während eines Einlesevorgangs vorübergehend (chrome.storage.session), welcher bahn.de-Tab zu welchem Auswertungs-Tab gehört, damit die Daten auch dann richtig zugestellt werden, wenn der Service Worker zwischendurch beendet wird. Es werden keine Reisedaten gespeichert.

- **Host-Berechtigung https://www.bahn.de/*:**
  > Nur in dem Tab, den die Erweiterung auf Klick des Nutzers selbst öffnet, werden nach der Anmeldung des Nutzers seine BahnCard und vergangenen Buchungen über die Schnittstellen gelesen, die bahn.de selbst für „Meine Reisen“ nutzt. In allen anderen bahn.de-Tabs tut die Erweiterung nichts. Es wird nichts verändert oder gebucht.

- **Host-Berechtigung https://xsebo99.github.io/SparSchiene/*:**
  > Auf der eigenen Auswertungsseite zeigt die Erweiterung den Ein-Klick-Button an und übergibt die gelesenen Daten an die Seite, die sie lokal im Browser auswertet.

**Remote Code:** Nein, die Erweiterung lädt und führt keinen externen Code aus.

**Datennutzung – welche Daten werden erfasst?**
Ankreuzen:
- ☑ **Authentifizierungsinformationen** – das Login-Token von bahn.de wird im bahn.de-Tab für die Abfragen verwendet (nicht gespeichert, nicht übertragen).
- ☑ **Website-Inhalte** – Reisedaten aus dem bahn.de-Konto (Daten, Strecken, Preise).
- ☑ **Finanz- und Zahlungsinformationen** – vorsichtshalber, weil Ticketpreise einer Kaufhistorie ähneln (keine Kartendaten oder Kontonummern).

Nicht ankreuzen: personenbezogene Identifikationsdaten, Gesundheit, persönliche Kommunikation, Standort, Webprotokoll, Nutzeraktivität.

Alle drei Zusicherungen bestätigen:
- ☑ Ich verkaufe oder übertrage Nutzerdaten nicht an Dritte, außer in den genehmigten Anwendungsfällen.
- ☑ Ich verwende oder übertrage Nutzerdaten nicht für Zwecke, die nichts mit dem alleinigen Zweck des Artikels zu tun haben.
- ☑ Ich verwende oder übertrage Nutzerdaten nicht, um die Kreditwürdigkeit zu ermitteln oder für Darlehenszwecke.

**Datenschutzerklärung (URL):** https://xsebo99.github.io/SparSchiene/datenschutz.html

## Neue Version veröffentlichen

1. `version` in `extension/manifest.json` erhöhen (z. B. 0.1.1).
2. `node tools/build-extension.mjs`
3. Im Dashboard unter „Paket“ die neue ZIP hochladen und zur Prüfung einreichen.
