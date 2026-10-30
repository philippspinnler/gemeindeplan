# MCP-Server für Sonntags- und Klassenthemen

Design vom 2026-10-30.

## Absicht

Themen kommen oft gesammelt, zum Beispiel als Mail oder PDF mit den Ansprachethemen der nächsten Monate oder mit dem Lehrplan für die Sonntagsklassen. Heute muss man jedes Thema von Hand pro Sonntag eintragen. Mit einem MCP-Server kann man Claude Desktop oder Claude Code die Liste geben, und Claude trägt sie ein. Dabei gelten dieselben Rechte und dasselbe Änderungsprotokoll wie in der App.

## Ziele

- MCP-Endpunkt `/mcp` in der bestehenden SvelteKit-App, Transport „Streamable HTTP“. Es entsteht kein eigener Dienst.
- **Anmeldung per persönlichem Schlüssel** (Bearer-Token im Header `Authorization`).
  - Erzeugen unter „Konto“. Zunächst **nur für Admins**.
  - Der Schlüssel wird einmal angezeigt. In der Datenbank liegt nur ein Hash.
  - Unter „Konto“ sieht man, ob ein Schlüssel existiert und wann er zuletzt benutzt wurde, und kann ihn widerrufen. Neu erzeugen ersetzt den alten.
  - Ist das Konto deaktiviert oder nicht mehr Admin, gilt der Schlüssel nicht mehr.
- **Tools:**
  - `sonntage_lesen(von, bis)`: pro Sonntag Datum, Art der Versammlung (Klartext) und Thema, ob eine Versammlung mit Programm stattfindet, und ob ein Thema bereits gesetzt ist.
  - `sonntagsthemen_setzen(eintraege: [{datum, thema}], ueberschreiben = false)`: setzt nur das Thema, alle anderen Programmfelder bleiben unverändert.
  - `klassen_lesen(von, bis)`: pro Sonntag die Jugendklasse mit Thema und Link für JD und JM (bzw. ein gemeinsames Thema) und ob die Klasse stattfindet.
  - `klassenthemen_setzen(eintraege: [{datum, thema, link?, thema_jm?, link_jm?}], ueberschreiben = false)`: setzt Thema und Link der Klasse. Ist `thema_jm` angegeben, hat JM ein eigenes Thema, sonst gilt das Thema für beide (wie in der App).
- **Überschreiben:** Ohne `ueberschreiben` werden nur leere Felder gefüllt, bestehende bleiben. Die Antwort meldet pro Datum `eingetragen`, `übersprungen (bereits gesetzt: …)` oder `abgelehnt (Grund)`, z. B. „kein Sonntag“, „keine Versammlung mit Programm“, „keine Klasse an diesem Sonntag“, „Datum nicht gefunden“.
- **Rechte:** Jedes Tool prüft wie die App mit `can()`, immer mit der echten Rolle des Kontos, nie mit „Ansicht als“. Sonntagsthemen brauchen `meeting.program`, Klassenthemen `youth.common`. Solange nur Admins Schlüssel haben, ist das immer erfüllt. Die Prüfung gehört trotzdem in jedes Tool, damit spätere Rollen sicher sind.
- **Änderungsprotokoll:** Jede Änderung läuft über `recordChanges` mit der Person des Schlüssels: `sonntag.programm` pro Sonntag, `jugend.gemeinsam` pro Klasse. Jede Änderung erscheint im Verlauf und lässt sich einzeln rückgängig machen.
- **Live-Kanal:** Nach einer Änderung bekommen offene Browser ein Änderungs-Event und laden neu (`live.changed`). Der Hook macht das heute nur für Formular-POSTs, und MCP-Anfragen sind ebenfalls POSTs auf `/mcp`. Der Builder prüft, dass Lesezugriffe dabei kein unnötiges Neuladen auslösen.
- **Einbindung:** Unter „Konto“ steht nach dem Erzeugen eine kurze Anleitung mit fertigem Befehl für Claude Code (`claude mcp add --transport http …`) und fertigem JSON-Block für Claude Desktop (über `mcp-remote` mit Header).

## Nicht-Ziele

- OAuth und claude.ai-Connectors.
- Schlüssel für andere Rollen als Admin (später, wenn gewünscht).
- Weitere Tools (Gebete, Ansprachen, Lieder, Jugendplanung, Mitglieder).
- Nur-Lesen-Schlüssel und mehrere Schlüssel pro Person.
- Termine außerhalb des regulären Rasters anlegen (siehe „Noch nicht gespeicherte Termine“ unten).

## Anti-Ziele (das wäre ein Fehlschlag)

- Ein MCP-Aufruf kann etwas, das dieselbe Person in der App nicht darf.
- Eine Änderung per MCP fehlt im Änderungsprotokoll oder steht dort ohne Person.
- Ein Thema wird überschrieben, ohne dass `ueberschreiben` gesetzt war.
- Ein Thema-Setzen verändert andere Felder des Programms oder der Klasse (z. B. Art, Snack, Präsidierender).
- Der Schlüssel steht im Klartext in der Datenbank, in Logs oder im Änderungsprotokoll.
- Die Tools geben Personendaten an Claude weiter (Namen, Notizen, Jugendliche).
- Ein ungültiger, widerrufener oder fremder Schlüssel bekommt irgendeine Antwort außer „nicht angemeldet“.

## Entschieden

- Clients: Claude Desktop und Claude Code, deshalb Bearer-Token statt OAuth.
- Schlüssel vorerst nur für Admins.
- Erst die vier Tools für Themen.
- Standardmäßig nur leere Felder füllen.

## Meine Entscheidungen (bitte prüfen)

- Ein Schlüssel pro Person. Neu erzeugen ersetzt den alten.
- Zeitraum der Lese-Tools höchstens 12 Monate pro Aufruf, damit die Antworten klein bleiben.
- Ein Thema mit leerem Text in `…_setzen` löscht nichts. Löschen geht in der App oder per Rückgängig im Verlauf.
- Links nur mit `http://` oder `https://` (wie in der App).
- Tool-Namen und Antworten auf Deutsch, passend zur App.
- **„Nur leere füllen“ gilt pro Feld**, nicht pro Datum: Hat eine Klasse ein Thema, aber keinen Link, wird der Link ergänzt und das Thema übersprungen. Die Antwort nennt pro Datum, welche Felder eingetragen und welche übersprungen wurden (mit dem bestehenden Wert).
- **Gemeinsame Klasse und `thema_jm`:** Ist die Klasse auf „gemeinsam“ gestellt, wird `thema_jm`/`link_jm` für dieses Datum abgelehnt („Klasse ist gemeinsam, kein eigenes JM-Thema“). Die Tools schalten „gemeinsam“ nie um, weil das die JD/JM-Teile umbauen würde.
- **Bestehendes JM-Thema ohne `thema_jm`:** bleibt unverändert, auch mit `ueberschreiben`. Das passt zur Regel, dass leere Eingaben nichts löschen.
- **Noch nicht gespeicherte Termine:** Ein regulärer Sonntag bzw. eine reguläre Sonntagsklasse, die die App anzeigt, aber noch nicht in der Datenbank hat, wird beim Setzen angelegt, genau wie beim Öffnen der Detailseite (`createMeeting` für Sonntage mit Recht `meetings.create`, `ensureYouthEvents(datum, 0)` für Klassen). Lese- und Schreib-Tools zeigen damit dieselben Daten. „Keine neuen Termine anlegen“ meint: keine Daten außerhalb des regulären Rasters (z. B. kein Sonntag an einem Mittwoch).

## Dem Builder überlassen

- MCP-SDK (`@modelcontextprotocol/sdk`) oder eine schlanke eigene Umsetzung des JSON-RPC-Teils. Vorgabe aus dem Repo: keine neue Abhängigkeit für das, was ein paar Zeilen können. Das SDK ist hier aber vertretbar, wenn es den Transport sauber abdeckt.
- Speicherung des Schlüssels (z. B. Spalte am Benutzer oder eigene Tabelle) und Hash-Verfahren (ein schneller Hash wie SHA-256 genügt bei zufälligen Schlüsseln mit 256 Bit).
- Wie das Thema einzeln gesetzt wird, ohne `saveGeneral`/`saveYouthCommon` mit allen Feldern aufzurufen.
- Rate-Limit für fehlgeschlagene Anmeldungen (`loginAttempts` gibt es schon).
- Eintrag in `src/lib/server/news.ts` („Was ist neu“) vor dem Push nach Absprache.
