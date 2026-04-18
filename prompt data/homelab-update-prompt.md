# Homelab – Update-Prompt (Copilot) v0.2
# Verwende diesen Prompt für alle Updates NACH dem initialen Build.
# Viel kürzer als der Haupt-Prompt – liest nur was nötig ist.

---

## Kontext (einmalig lesen, dann weißt du es)

- Projekt: `Y:/HomeLab/Dokumentation/`
- Drei State-Dateien:
  · `homelab-state.json`  – Roadmap, Steps, Diary (Single Source of Truth)
  · `homelab-ideas.json`  – Ideen-Backlog
  · `homelab-wiki.json`   – Wiki-Artikel / Wissensbasis
- Alle HTML-Seiten rendern dynamisch aus `window.STATE` (via assets/state.js)
  bzw. `window.WIKI` (via assets/wiki-state.js)
- localStorage überschreibt JSON beim Laden (User-Änderungen persistent)
- Prompts liegen in `prompt data/` (Doku-Ordner, nicht zur Repo-Logik)

---

## Update-Typen & was du tun musst

### Typ A – Nur JSON-Änderung
*Wenn: Status-Update, neuer Log-Eintrag, neue Idee, neues Diary-Entry, neuer Wiki-Artikel*

Tue: Nur die betreffende JSON-Datei an der genannten Stelle ändern.
HTML NICHT anfassen – rendert sich automatisch neu.

Beispiel-Anweisung:
  "Setze Step p1-bios auf status: done.
   Füge Log-Eintrag hinzu: 2026-04-16 · SVM Mode aktiviert."

---

### Typ B – HTML-Änderung an einer Stelle
*Wenn: Layout-Fix, neues UI-Element, Bug auf einer Seite*

Tue: Nur die genannte Datei öffnen, nur den genannten Block ändern.
Keine anderen Dateien anfassen.

Beispiel-Anweisung:
  "In steps/p1-proxmox-vm.html: Füge unter dem Details-Block
   eine Callout-Box ein die dynamic_ram_why als Warning anzeigt."

---

### Typ C – Neue Seite hinzufügen
*Wenn: Neuer Step, neue Phase, neues Feature*

Tue: Nur die neue Datei erstellen + betreffende JSON updaten.
Bestehende Dateien nur anfassen wenn eine Verlinkung nötig ist.

Beispiel-Anweisung:
  "Erstelle steps/p1-ipplan.html nach dem Template von steps/p1-bios.html.
   Ergänze im JSON unter p1-ipplan den aktuellen Stand."

---

### Typ D – State-Migration
*Wenn: Neues Feld in JSON-Struktur, Umbenennung, neue Array-Einträge*

Tue: Erst JSON-Struktur ändern, dann NUR die betroffenen HTML-Stellen
die dieses Feld rendern.

Beispiel-Anweisung:
  "homelab-wiki.json: Key 'articles' umbenennen zu 'entries'.
   wiki-state.js entsprechend anpassen, wiki-preview.html bleibt unverändert."

---

## Update-Anweisung Format (von Claude generiert, du führst aus)

Claude gibt dir Updates immer in diesem Format:

```
UPDATE [Typ A/B/C/D]
Datei: homelab-state.json
Stelle: phases[0].steps[0] (id: "p1-bios")
Änderung:
  status: "wip" → "done"
  log: append { date: "2026-04-16", entry: "SVM Mode im BIOS aktiviert" }
```

Du liest die Stelle im File, machst die Änderung, fertig.
Kein komplettes File neu lesen nötig.

---

## Wichtig

- Nie das komplette homelab-state.json / ideas.json / wiki.json neu generieren lassen – zu fehleranfällig
- Immer nur chirurgisch an der genannten Stelle ändern
- Bei Mehrdatei-Updates (z.B. Schema-Migration Typ D): jede Datei einzeln und sequentiell behandeln
- Nach jeder Änderung: `git commit -m "update: [was geändert wurde]"`
- Bei Unklarheit: Rückfrage statt Blind-Fix