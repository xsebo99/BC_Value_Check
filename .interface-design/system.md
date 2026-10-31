# SparSchiene – Designsystem

Quelle der Wahrheit für Werte ist `styles.css` (`:root` und der Dark-Mode-Block). Diese Datei hält die **Entscheidungen** fest, damit neue Teile dazu passen.

## Intent

- **Wer:** Bahnfahrer*innen mit BahnCard, kurz vor der Verlängerung oder nach Ablauf. Sie wollen eine ehrliche Antwort, keine Finanz-App.
- **Aufgabe:** „Hat sich meine Karte gelohnt, und welche wäre besser gewesen?“
- **Gefühl:** wie ein Fahrschein, ruhig, gedruckt und eindeutig. Es wird nicht gefeiert und nicht verkauft.

## Farbe hat eine feste Bedeutung

| Token | Bedeutung | Nie für |
|---|---|---|
| `--verkehrsrot` / `-text` | Aktionen (Buttons) und Verlust/Minus | Überschriften, Deko, Ausgaben |
| `--signalgruen` | Ersparnis, Plus, günstigste Option | Auszeichnung ohne Ersparnisbezug |
| `--tinte` (+ `-2..-4`) | Text und **bezahlte Beträge**: Balken, Tarif-Bars, Fortschritt | – |
| `--bahncard` | die dunkle Karte als Objekt | Flächen/Panels |

Einzige Ausnahme: Die wechselnde Kartennummer (25/50/100) im Hero-Titel ist rot, als Echo des Logos. Sie steht auf Fallblättern (`.flap`).

Auf dunklen Fallblättern (`.tafel`, Titel) gelten in beiden Modi die Leuchttöne `--tafel-gruen` / `--tafel-rot`, das sind dieselben Töne wie Grün und Rot im Dark Mode.

Weitere Farben gibt es nicht. Wenn etwas eine neue Farbe zu brauchen scheint, wird es stattdessen über Gewicht oder Größe gelöst.

## Flächen & Tiefe

- Seite: `--schotter`. Panels: `--fahrkarte` mit `--schatten-flaeche`, also Haarlinien-Ring und weichem Schatten. Im Dark Mode gibt es nur den Ring.
- Eingaben sind eingelassen: `--eingabe` ist **dunkler** als die Fläche drumherum.
- Kanten sind rgba (`--kante`, `--kante-stark`), keine Hex-Grautöne.
- Radien: Fläche 24 px, Element 16 px, Feld 10 px, Mini-Karte 14 px.

## Typo

- Archivo (schmal, `font-stretch` 70–85 %) nur für Zahlen und große Titel. Instrument Sans für alles andere. Beide sind selbst gehostet (OFL), kein Google-Fonts-Aufruf.
- Skala 1,25 ab 17 px: meta 13 · klein 14 · text 17 · h3 21 · h2 26–33 · zahl 34–52 · display 42–76.
- Zahlen immer mit `tabular-nums`. Überschriften mit `text-wrap: balance`, Fließtext mit `pretty`.
- **Eyebrows** (rote Großbuchstaben) gibt es nur noch im Hero und bei „Stand“ auf der Datenschutzseite. Abschnitte bekommen stattdessen `h2` + `.meta`.

## Signatur-Elemente

- **BahnCard, die sich füllt** (`.bc`, `data-fill`): Die Ersparnis füllt die Karte bis zum Kartenpreis.
- **Hero** (`.bc--hero` + `.tafel`): Fallblatt-Titel, Musterkarte (Chip, Nummer, Glanz, kippt mit der Maus) und Abfahrtstafel wechseln gemeinsam 25 → 50 → 100, mit Beispielwerten aus `HERO_BEISPIELE` in `app.js`. Bei `prefers-reduced-motion` wird nicht geblättert und nicht gekippt.
- **Mini-BahnCards** im Vergleich (`.minicard`):
  - „Ohne BahnCard“ ist eine leere, gestrichelte Karte (`--ohne`).
  - Die günstigste ist grün (`--best`).
  - Die Preisfelder stehen unter der Karte, nicht darauf.
- **Fahrtbeleg** (`.beleg`): Eine Hero-Zahl (km) führt. Der Rest steht in Quittungszeilen `.posten` mit gepunkteter Linie (`.posten__linie`) bis zum Wert.
- **Gestapelte Monatsbalken:** Bezahlt ist Tinte, darauf liegt die Ersparnis in Grün. Die y-Achse umfasst bezahlt + gespart.

## Bewegung & Interaktion

- `--ease: cubic-bezier(.23,1,.32,1)`, Dauer 150–400 ms.
- Buttons: `:active { transform: scale(.97) }`.
- Diagramme haben immer einen Hover-Tooltip (`data-tip`) mit Trefferfläche `.hit`.

## Abstände

- 4/8-px-Raster. Panel-Padding ist fluid (`clamp`).
- Zwischen Panels liegen 20 px. Innerhalb eines Panels sind die Gruppen eng, die Abschnitte haben 24–28 px Luft.
