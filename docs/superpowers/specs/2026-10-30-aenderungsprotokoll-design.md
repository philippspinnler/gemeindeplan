# Änderungsprotokoll mit Zurücksetzen

Design vom 2026-10-30.

## Absicht

Heute sieht niemand, wer was geändert hat. Wenn etwas im Programm oder in der Jugendplanung plötzlich anders ist, kann man nur herumfragen. Gewünscht ist, nachvollziehen zu können, wer wann was geändert hat, und eine Änderung bei Bedarf rückgängig zu machen.

Hauptzweck ist das Nachvollziehen. Zurücksetzen ist das Werkzeug, wenn man dabei eine falsche Änderung findet.

## Ziele

- Jede Änderung über die App wird protokolliert: wer (Benutzer), wann, welcher Bereich/Abschnitt, Stand vorher und nachher.
- **Alle Bereiche**, die über die App bearbeitet werden:
  - Sonntage: alle Abschnitte, die `sectionVersions` heute kennt (Programm inkl. Ansprachen, Ankündigungen, Bestätigungen/Entlassungen; Gebete; Musik; Leitung). Auch Zuteilungen über `/fragen` (`assignOpenSlot`).
  - Jugendtermine: die Abschnitte aus `youthSectionVersions` (gemeinsam, JD, JM, beide, Erwachsene).
  - Mitglieder: Anlegen und Ändern (Name, Gruppe, aktiv, Pfahlberufung, Notizen, „kein Gebet/keine Ansprache“).
  - Berufungen (Bischofschaft, Musik, Jugendführer), Jugendliche (Zuordnung JD/JM/Gruppe), Pfahlbeamte, Lieder.
  - Jugend-Ideen (anlegen, verwerfen, einplanen), Ausfälle/Pfahlanlässe (`youthBreaks`: anlegen, ändern, löschen).
  - Einstellungen (Gemeindename, Jugend-Zeiten, Jugendseiten-Token als „neu erzeugt“ ohne Wert).
- **Zusammenfassen:** Speicherungen derselben Person am selben Abschnitt innerhalb von 5 Minuten ergeben einen Eintrag (vorher = Stand vor der ersten, nachher = Stand nach der letzten Speicherung). Grund: Autosave speichert bei jeder Feldänderung.
- **Anzeige beim Objekt:** Beim Sonntag und beim Jugendtermin eine Zeile „Zuletzt geändert von Anna B., Dienstag 20:14“. Ein Klick öffnet den Verlauf dieses Termins, neueste zuerst: Person, Zeitpunkt, Abschnitt, was sich geändert hat (vorher → nachher, lesbar mit Namen statt IDs).
- **Gesamtliste** auf der Seite „Änderungen“ (Benutzermenü): alle Einträge, neueste zuerst, filterbar nach Person und Bereich, mit Link zum betroffenen Objekt.
- **Zurücksetzen** pro Eintrag, beim Objekt und in der Gesamtliste: „Auf diesen Stand zurücksetzen“ schreibt den Stand *vorher* dieses Eintrags zurück. (Geplanter Wortlaut der Aktion bleibt dem Builder; wichtig ist, dass klar ist, welcher Stand entsteht.)
  - Das Zurücksetzen läuft über dieselbe Speicherlogik wie eine normale Änderung: es wird selbst protokolliert, sendet ein Live-Event, und andere offene Browser aktualisieren sich.
  - Wurde der Abschnitt seit diesem Eintrag weiter geändert, fragt die App vorher nach („Seither von Max T. geändert. Trotzdem zurücksetzen?“) statt still zu überschreiben.
  - Ein Eintrag „gelöscht“ (Ausfall/Pfahlanlass) lässt sich zurücksetzen, d. h. der Eintrag wird wiederhergestellt. Ein „angelegt“-Eintrag zurücksetzen heisst löschen – nur wo die App das Löschen ohnehin anbietet; sonst kein Zurücksetzen-Knopf.
- **Rechte:** Wer einen Bereich bearbeiten darf (`permissions.ts`), sieht dessen Einträge und darf sie zurücksetzen. Die Gesamtliste zeigt jeder Person nur diese Bereiche. Die Seite „Änderungen“ ist für alle Rollen erreichbar, die irgendetwas bearbeiten dürfen.
- **Aufbewahrung:** Einträge älter als 90 Tage werden automatisch gelöscht.

## Nicht-Ziele

- Benutzerkonten, Rollen, Einladungen, Logins, Sessions, „Was ist neu gesehen“.
- Automatisch erzeugte Daten ohne Benutzer: das Anlegen leerer Sonntage/Jugendtermine (`ensureSundays`, `ensureYouthEvents`).
- Importe (`src/lib/server/import`): werden als ein Eintrag „Import“ protokolliert, aber nicht zurückgesetzt.
- Zurücksetzen über mehrere Abschnitte auf einmal („alles von gestern Abend“).
- Mitglieder löschen: die App kennt das heute nicht (nur deaktivieren), also auch kein Wiederherstellen.

## Anti-Ziele (das wäre ein Fehlschlag)

- Eine Änderung fehlt im Protokoll, weil ein Speicherweg vergessen wurde. Neue Speicherwege müssen schwer zu bauen sein, ohne zu protokollieren.
- Zurücksetzen überschreibt eine neuere Änderung einer anderen Person ohne Rückfrage.
- Das Protokoll zeigt jemandem Daten aus einem Bereich, den diese Person sonst nicht sehen darf (z. B. Jugendleiterin sieht Notizen zu Ansprachen).
- Das Protokoll wird zur Dauerablage von Personendaten (keine Löschung nach 90 Tagen).
- Durch Autosave entstehen pro Bearbeitung Dutzende Einträge.
- Eine fehlgeschlagene Protokollierung lässt die Änderung trotzdem durch (oder umgekehrt): Änderung und Eintrag passieren zusammen oder gar nicht.

## Entschieden

- Zurücksetzen gehört dazu, pro Abschnitt, mit Rückfrage bei neueren Änderungen.
- Anzeige sowohl beim Termin als auch in einer Gesamtliste.
- Alle oben genannten Bereiche.
- Gespeichert wird pro Abschnitt der vollständige Stand vor und nach der Änderung (nötig fürs Zurücksetzen); angezeigt wird nur der Unterschied.

## Meine Entscheidungen (bitte prüfen)

- Aufbewahrung 90 Tage.
- Zusammenfassen innerhalb von 5 Minuten, gleiche Person, gleicher Abschnitt.
- Ort der Gesamtliste: eigene Seite `/aenderungen`, verlinkt im Benutzermenü (Einstellungen ist nur für Admins sichtbar).
- Verweist ein alter Stand auf ein inzwischen deaktiviertes Mitglied, wird es trotzdem eingesetzt (wie heute, wenn ein deaktiviertes Mitglied schon eingetragen ist).
- Für Mitglieder, Lieder, Pfahlbeamte usw. gibt es keinen Verlauf „beim Objekt“, nur die Gesamtliste (gefiltert). Ausnahme lohnt sich nicht.
- Einträge aus Bereichen, auf die die eigene Rolle nur Leserechte hat, werden nicht angezeigt (Recht = Bearbeitungsrecht).
- **Ein Eintrag pro tatsächlich geändertem Datenabschnitt**, nicht pro Formular. Speichert das Programm-Formular auch Gebete, entstehen bei einer Gebetsänderung ein Eintrag „Gebete“ (für die Rolle `gebete` sichtbar) und nur bei Programmänderungen einer „Programm“. Dasselbe für Musik/Leitung. Zurücksetzen schreibt nur diesen einen Abschnitt zurück.
- **Gemeinsam ein/aus beim Jugendtermin:** Das Umschalten fasst heute JD und JM zusammen bzw. teilt sie auf und verliert dabei Text. Der Eintrag „gemeinsam“ enthält deshalb auch die Teile JD/JM/beide; Zurücksetzen stellt die getrennten Texte wieder her. Zurücksetzen darf, wer `youth.common` hat, also dieselben Personen, die heute umschalten und damit beide Seiten verändern können.
- **Notizen zu Ansprache/Gebet** (bearbeitet in `/fragen`) sind eigene Bereiche „Notiz Ansprache“ und „Notiz Gebet“, sichtbar für `notes.talk` bzw. `notes.prayer`, nicht Teil von „Mitglieder“ (admin-only).
- **Zusammenfassen** nur, wenn dazwischen niemand anderes denselben Abschnitt gespeichert hat. Sonst könnte das Zurücksetzen eines zusammengefassten Eintrags dessen Änderung ohne Rückfrage überschreiben.
- **Importe** laufen als Skripte ohne Benutzer und erscheinen als „Import“ ohne Person.

## Dem Builder überlassen

- Tabellenform des Protokolls (z. B. `changes`: Zeitpunkt, `userId`, Bereich, Objekt-Schlüssel, Abschnitt, `before`/`after` als JSON) und wie Zusammenfassen technisch läuft.
- Wo protokolliert wird: zentral in den Speicherfunktionen in `src/lib/server/*` oder in einem gemeinsamen Wrapper, solange kein Speicherweg ohne Protokoll möglich ist (Anti-Ziel 1). Muster: `src/routes/(app)/sonntag/[date]`.
- Wie „seither geändert“ erkannt wird (z. B. Vergleich des aktuellen Abschnitt-Hashes mit dem `after` des Eintrags).
- Wie der Unterschied lesbar dargestellt wird.
- Wann die 90-Tage-Löschung läuft (z. B. beim Schreiben eines neuen Eintrags).
- Eintrag in `src/lib/server/news.ts` („Was ist neu“) vor dem Push nach Absprache.
