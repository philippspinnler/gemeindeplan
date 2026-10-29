# Kalender-Abo für Mittwochaktivitäten und Sonntagsklassen

Design vom 2026-10-29.

## Absicht

Ein JM-Betreuer möchte die Jugendtermine im eigenen Kalender haben. Eltern (z. B. mit einer Tochter in den JD), Jugendliche und Jugendführer haben denselben Bedarf. Heute müssen alle die Jugendseite (`/j/<token>`) öffnen, um zu sehen, was ansteht.

Neu kann man auf der Jugendseite einen Kalender abonnieren (iCal-Abo-Link für iPhone, Google, Outlook). Man wählt dabei aus, welche Termine man sehen will. Der Kalender bleibt von selbst aktuell. Wie oft er sich aktualisiert, bestimmt die Kalender-App, üblicherweise alle paar Stunden.

## Ziele

- Abo-Link ohne Login, erreichbar über die Jugendseite.
- Auswahl ohne Person: **JD, JM oder beide**, **Mittwoch, Sonntag oder beides**.
- Auswahl „Nur meine“: Man wählt seinen Vornamen aus derselben Namensliste, die die Jugendseite schon nutzt (`shortNames`, Vornamen, bei Gleichnamigen mit Nachnamen-Initial).
  - **Jugendliche:** alle Mittwochsaktivitäten ihrer Seite (aus `youth.side`, Auswahl JD/JM entfällt), dazu die Sonntagsklassen, in denen sie unterrichten (`teacherMemberId`).
  - **Erwachsene (Jugendführer):** Mittwoch nur dort, wo sie als anwesend markiert sind (`youthEventAdults.present`), dazu die Sonntagsklassen, in denen sie unterrichten.
  - Die Auswahl Mittwoch/Sonntag gilt auch hier.
- Standardzeiten unter Einstellungen: Beginn und Ende der Mittwochsaktivität und der Sonntagsklasse. Alle Termine im Abo verwenden diese Zeiten.
- Inhalt eines Termins:
  - Titel Mittwoch: `JD Aktivität: {Titel}` bzw. `JM Aktivität: …`; gemeinsam: `JD/JM Aktivität: {Titel}`.
  - Titel Sonntag: `JD Klasse: {Thema}` bzw. `JM Klasse: …`.
  - Beschreibung: Thema, Leitung, Treffpunkt/Details, Snack, Gedanke, Lehrer, also dasselbe, was die Jugendseite für diesen Termin zeigt.

## Nicht-Ziele

- Keine Pfahl-, Tempel-, Ferien-, Supersamstag- oder Tanzabend-Einträge (`youthBreaks`) im Abo.
- Keine Abweichungen von der Standardzeit pro Termin. Wer abweicht, schreibt das in die Details.
- Kein persönliches Abo über das Login und keine Verknüpfung Benutzer ↔ Mitglied. Der Betreuer nutzt denselben Weg wie alle anderen. Das kann später kommen, falls es fehlt.
- Keine Termine im Abo, die die Jugendseite nicht zeigen darf.

## Anti-Ziele (das wäre ein Fehlschlag)

- Das Abo zeigt mehr als die Jugendseite (Ausnahme: die Namensliste, siehe unten): Nachnamen, Erwachsenen-Interna, Ideen, Sonntags-`text`/`details` (die `publicItem` heute bewusst ausblendet).
- Ein ausgefallener Termin (Ferien, Generalkonferenz, Klasse mit den Erwachsenen) steht weiterhin im Kalender.
- Der Abo-Link funktioniert ohne gültigen Jugendseiten-Token, oder ein alter Token funktioniert nach dem Neu-Erzeugen weiter.
- Termine springen bei jeder Aktualisierung (wechselnde UIDs → Duplikate oder verlorene Erinnerungen in der Kalender-App).

## Entschieden

- **Ort:** Feed unter dem bestehenden Token, z. B. `/j/<token>/kalender.ics?…`, mit derselben Token-Prüfung wie `src/routes/j/[token]/+page.server.ts`. Wird der Token neu erzeugt, sterben alle Abos. Das ist gewollt.
- **Auswahl-UI:** Ein Knopf „Im Kalender abonnieren“ auf der Jugendseite öffnet die Auswahl. Daraus entsteht der Link mit `webcal://`-Variante zum direkten Öffnen und einer Kopieren-Möglichkeit für Google.
- **Datenquelle:** dieselbe Logik wie die Jugendseite (`youthPageItems`/`toItem` in `src/lib/server/youth-page.ts`), nur mit anderem Zeitfenster. Ausgefallene Termine (`status === 'off'`) erscheinen nicht.
- **Einstellungen:** neue Keys in `SETTING_DEFAULTS` (`src/lib/server/settings.ts`), Bearbeitung auf `/einstellungen` nach dem Muster aus `CLAUDE.md` (Autosave, Versionsprüfung, Live-Kanal).
- **Namensliste:** Die Auswahl zeigt alle Vornamen aus `shortNames` (alle Jugendlichen, Leiter/innen, Bischofschaft), auch wenn jemand gerade nirgends eingeteilt ist. Das ist bewusst so entschieden, auch wenn die Jugendseite heute nur eingeteilte Namen zeigt.
- **Erwachsene an getrennten Mittwochen:** „Anwesend“ gilt pro Datum. An einem getrennten Mittwoch bekommen JD-Leiterinnen den JD-Eintrag, der JM-Berater und die Bischofschaft den JM-Eintrag. Bei einer gemeinsamen Aktivität gibt es ohnehin nur einen Eintrag.
- **Termine ohne Plan:** Ein regulärer Mittwoch oder Sonntag, der noch nicht geplant ist (`status === 'open'`), erscheint mit Titel ohne Zusatz (`JD Aktivität`). So ist die Zeit im Kalender schon geblockt.

## Meine Entscheidungen (bitte prüfen)

- **Zeitfenster:** 1 Monat zurück bis 6 Monate voraus (entspricht `ensureYouthEvents`).
- **Klasse mit den Erwachsenen** (`erwachsene`): erscheint nicht, weil keine Jugendklasse stattfindet. Die App behandelt sie schon heute als „off“.
- **Basel-Aktivitäten** (`basel*`): normale Mittwochsaktivitäten, erscheinen also.
- **Pfahlanlass, der die Aktivität nicht absagt** (`cancels = false`): Die Mittwochsaktivität erscheint normal, der Anlass selbst nicht.
- **„Nur meine“ bei gemeinsamer Aktivität:** Jugendliche beider Seiten sehen sie.
- **Standardzeiten nicht gesetzt:** Termine werden als ganztägige Einträge ausgegeben, bis Zeiten eingetragen sind.
- **Zeitzone:** Europe/Zurich.
- **Gemeinsame Sonntagsklasse:** Titel `JD/JM Klasse: {Thema}`.
- **Veraltete Person im Link** (Mitglied gelöscht): Der Feed liefert einen leeren Kalender und keinen Fehler, weil Kalender-Apps bei Fehlern das Abo teils stillschweigend löschen.
- **Wer die Zeiten bearbeiten darf:** dieselbe Rolle wie für die übrigen Einstellungen.

## Dem Builder überlassen

- iCal von Hand erzeugen (wenige Zeilen, RFC 5545: Escaping, Zeilenfaltung, CRLF) oder kleine Bibliothek. Vorgabe aus dem Repo: keine neue Abhängigkeit für das, was ein paar Zeilen können.
- Genaues Parameterformat im Link und Aussehen der Auswahl.
- Stabile UID pro Termin und Seite, z. B. aus Datum + Seite abgeleitet.
- Eintrag in `src/lib/server/news.ts` („Was ist neu“) vor dem Push nach Absprache.
