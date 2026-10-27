# Gemeindeplan

Planung der Abendmahlsversammlung (Programm, Sprecher, Gebete, Lieder, Leitungszettel) und der Jugendtermine (JD/JM). SvelteKit, SQLite, ein Container.

## Rollen

| Rolle | darf |
|---|---|
| Admin | alles, inkl. Benutzer, Mitglieder, Einstellungen |
| Bischofschaft | Sonntage planen, Seite "Fragen", Musik |
| Gebete | Anfangs- und Schlussgebet eintragen, "Fragen" für Gebete |
| Musik | Lieder, Orgel/Klavier, Dirigieren, Liederbuch |
| Dirigent/in | nur Dirigieren |
| JM-Berater | JM-Termine und Sonntagsklasse JM, Ideen, Ausfälle |
| JD-Präsidentschaft | dasselbe für JD (die Bischofschaft bearbeitet nur JM) |

## Jugend (JD/JM)

Einstellungen → Berufungen: Bischofschaft, JM-Berater, JD-Beraterin, JD-Präsidentschaft. Einstellungen → Jugendliche: Seite (JD/JM) und Gruppe/Kollegium je Person; Quelle ist die Mitgliederliste.

Menü "Jugend": Die Terminliste zeigt Sonntage und Mittwoche, 6 Monate im Voraus. Die Terminseite hat die Abschnitte Allgemein / JD / JM (bzw. Gemeinsam / Erwachsene) und speichert automatisch. Der Ideen-Topf sammelt Ideen, die beim Ausfüllen per "übernehmen" in einen Termin wandern. Unter Ausfälle & Pfahltermine werden Zeiträume erfasst: Ferien gelten nur für Mittwoche; Pfahl- und Tempeltermine erscheinen auf der Jugendseite.

Der Sonntag folgt der Abendmahlsversammlung: keine Klasse bei General-/Pfahlkonferenz, Ostern und am Sonntag vor Weihnachten.

Die Jugendseite ist ohne Login erreichbar. Link unter Einstellungen → Allgemein erzeugen und kopieren; es erscheinen nur Vornamen. "Neu erzeugen" macht den alten Link ungültig. **Der Text in "Details" eines Ausfalls erscheint als Begründung auf der Jugendseite – dort keine Erwachsenen-Interna eintragen.** Zum Datenimport siehe [Import Jugend aus Airtable](#import-jugend-aus-airtable).

## Betrieb

```bash
cp .env.example .env     # ORIGIN = öffentliche Adresse, sonst schlagen Formulare fehl
docker compose up -d     # zieht philippspinnler/gemeindeplan:latest
```

Beim ersten Aufruf wird unter `/setup` das Admin-Konto angelegt. Weitere Personen lädt der Admin unter Einstellungen → Benutzer per Link ein. Das eigene Passwort ändert jede Person über ihren Namen oben rechts (Konto). Passwörter werden mit Argon2 gehasht gespeichert.

Die Datenbank liegt in `./data/app.db`. Backup über Einstellungen → Allgemein → "Datenbank herunterladen".

Mit `DATABASE_KEY` in `.env` ist die Datenbank verschlüsselt gespeichert, auch der Backup-Download. Eine bestehende unverschlüsselte Datei wird beim nächsten Start verschlüsselt. **Ohne den Schlüssel sind Datenbank und Backups unlesbar – im Passwort-Manager aufbewahren, nicht neben den Backups.** Alte unverschlüsselte Backups danach löschen. Das `sqlite3`-Kommandozeilenwerkzeug kann die verschlüsselte Datei nicht öffnen.

## Import aus den bisherigen Sheets

Beide Google Sheets als `.xlsx` exportieren und bei gestopptem Container auf dem Host importieren:

```bash
docker compose stop
npm install
DATABASE_PATH=data/app.db npm run import -- import/av-programm.xlsx import/liederplanung.xlsx
docker compose up -d
```

## Import Jugend aus Airtable

Zuerst unter Einstellungen die Jugendlichen und die Berufungen (Bischofschaft, JD/JM-Leitung) erfassen, denn die Airtable kennt nur Vornamen. Dann die Tabelle "JD/JM" als CSV exportieren (Grid-Ansicht → Download CSV; Klassen sind die Zeilen mit Art "JD/AP Klassen") und bei gestopptem Container auf dem Host importieren. Der Export enthält nur, was der Filter der Ansicht zeigt. Vorher `data/app.db` sichern.

```bash
docker compose stop
DATABASE_PATH=data/app.db npm run import:jugend -- import/jd-jm.csv
docker compose up -d
```

Nicht auflösbare Vornamen werden als Hinweis ausgegeben; die von Jugendlichen zusätzlich im Feld "Details" des Termins vermerkt, die von Erwachsenen nicht. Ein erneuter Import überschreibt die Termine desselben Datums.

## Entwicklung

```bash
npm install
npm run dev          # http://localhost:5173
npm test
npm run check
npm run db:generate  # Migration nach Schema-Änderung
```

Umgebungsvariablen: `DATABASE_PATH` (Standard `data/app.db`), `DATABASE_KEY` (optional, verschlüsselt die Datenbank), `ORIGIN`, `PORT`.

## Docker-Image

Jeder Push auf `main` baut das Image und veröffentlicht es als `philippspinnler/gemeindeplan:latest` auf Docker Hub (GitHub Actions, Secrets `DOCKERHUB_USERNAME` und `DOCKERHUB_TOKEN`).
