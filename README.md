# RuzzKey Cards – Stream-Display (PWA)

Hintergrund-Display für Whatnot-Livestreams, optimiert für Samsung Galaxy S10 Plus (Chrome, Querformat, Vollbild).

## Ordner
```
index.html              Seite
styles.css / app.js     Design und Logik
manifest.webmanifest    App-Manifest (Name, Icons, Vollbild, Querformat)
sw.js                   Service Worker (Offline-Start, versionierter Cache)
logo.jpg                DEIN Logo (1024 x 1024) – hier ablegen
icons/                  icon-192.png, icon-512.png, icon-maskable-512.png, favicon-64.png
fonts/                  Orbitron + Nunito (lokal, SIL Open Font License)
vendor/qrcode.js        QR-Code-Erzeugung (MIT-Lizenz, lokal)
tools/                  Icon-Generator (Browser) und make_icons.py
```

## Vor dem Hochladen: Logo und Icons
1. `logo.jpg` in den Hauptordner legen (genau dieser Dateiname).
2. Icons erzeugen, eine der zwei Varianten:
   - **Browser:** `tools/icon-generator.html` öffnen → logo.jpg wählen → alle vier PNGs herunterladen → in `icons/` legen.
   - **Python:** `pip install pillow` und dann `python tools/make_icons.py`.

## Updates
Nach jeder Änderung in `sw.js` die Zeile `const VERSION = 'v1.0.0';` hochzählen (z. B. `v1.0.1`).
Dann landet die neue Version sicher auf dem Handy (spätestens beim zweiten Start).

## Bedienung
- Ein Fingertipp auf die Anzeige öffnet die **Schnellleiste**: Module an/aus, Ziel +1/+5/+10 €/Rückgängig, Timer, Farbwelt, Vollbild, Menü.
- **☰ Menü**: alle Einstellungen. Schnellleiste und Menü verschwinden nach einigen Sekunden von selbst.
- Alles wird im Browser gespeichert (Einstellungen in localStorage, Fotos/Medien in IndexedDB).
