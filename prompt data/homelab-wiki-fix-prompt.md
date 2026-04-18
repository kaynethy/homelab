# Homelab Wiki – Fix-Prompt v0.1
# Übergib Copilot (Claude Opus) diese Datei + homelab-wiki.json + homelab-ideas.json
# Prompt: "Fixe wiki-preview.html – der Tab zeigt keine Artikel. Lies zuerst homelab-wiki.json und assets/wiki-state.js, dann halte dich strikt an diese Spezifikation."

---

## Problem

`wiki-preview.html` zeigt keine Artikel – Tab bleibt leer.
Grund: `homelab-wiki.json` hat die Struktur geändert. `wiki-state.js` und `wiki-preview.html` gehen noch vom alten Schema (`namespaces[]` + `articles[]`) aus, die Datei enthält aber inzwischen `ideas[]` – gleiche Struktur wie `homelab-ideas.json`.

Ziel: Wiki-Tab wieder funktional machen OHNE die anderen Tabs zu brechen.

---

## Dateistruktur (IST-Stand)

```
Y:/HomeLab/Dokumentation/
├── index.html                  # Dashboard / Welcome
├── roadmap.html                # Roadmap-Übersicht
├── ideas.html                  # Ideen-Übersicht (Flipcards)
├── backlog.html                # Backlog-View
├── diary.html                  # Session-Tagebuch
├── network.html                # Netzwerk-Übersicht
├── wiki-preview.html           # ⚠ Wiki-Tab – hier liegt der Bug
│
├── homelab-state.json          # Roadmap, Steps, Diary
├── homelab-ideas.json          # Ideen-Backlog
├── homelab-wiki.json           # Wiki-Daten (Struktur geändert – siehe unten)
│
├── phases/
│   └── phase1.html … phase4.html
│
├── steps/
│   └── p1-bios.html … p4-uptime.html
│
├── prompt data/
│   ├── homelab-copilot-prompt.md
│   ├── homelab-update-prompt.md
│   ├── homelab-wiki-prompt.md
│   └── homelab-wiki-fix-prompt.md   ← DIESE Datei
│
└── assets/
    ├── style.css               # Globales Design-System
    ├── state.js                # Lädt homelab-state.json
    ├── wiki-state.js           # ⚠ Lädt homelab-wiki.json – betroffene Datei
    └── nav.js                  # Globale Navigation
```

---

## Schema-Diff: Altes vs. aktuelles homelab-wiki.json

### Alt (was wiki-state.js erwartet)
```json
{
  "meta": { "version": "0.1", ... },
  "namespaces": [
    { "id": "proxmox", "label": "Proxmox", "color": "teal", "desc": "..." }
  ],
  "articles": [
    {
      "id": "doc-001",
      "title": "Proxmox unter Hyper-V",
      "namespace": "proxmox/installation",
      "tags": ["Proxmox", "Hyper-V"],
      "step_id": "p1-proxmox-vm",
      "summary": "...",
      "snippets": [{ "title": "...", "code": "...", "lang": "bash" }],
      "gotchas": ["..."],
      "links": [{ "title": "...", "url": "..." }]
    }
  ]
}
```

### Aktuell (was die Datei jetzt enthält)
```json
{
  "meta": { "version": "0.3", "updated": "2026-04-19", "main_state": "homelab-state.json" },
  "ideas": [
    {
      "id": "idea-001",
      "title": "...",
      "desc": "...",
      "phase_id": "phase2",
      "step_id": "p2-ddns",
      "prio": "high",
      "status": "idea",
      "tags": [...],
      "comments": [...]
    }
  ]
}
```

Keys `namespaces[]` und `articles[]` fehlen komplett.

---

## Arbeitsablauf (WICHTIG – nicht blind fixen)

### Schritt 1 – Diagnose zeigen
Lies und zeig mir BEVOR du änderst:
  1. `wiki-preview.html` komplett – welche Container werden gerendert, welche Skripte geladen
  2. `assets/wiki-state.js` komplett – wo wird gefetcht, welche Keys werden gelesen
  3. `assets/nav.js` – wie wird der Wiki-Tab aktiviert

Markiere die Zeilen die auf das alte Schema (`WIKI.articles`, `WIKI.namespaces`) zugreifen.

### Schritt 2 – Lösungsweg wählen (ich entscheide)

**Option A – Quick Fix: Wiki-Tab zeigt die Ideen aus wiki.json**
  - `wiki-state.js` liest `ideas[]` statt `articles[]`
  - Rendering nutzt Ideen-Felder: `title`, `desc`, `tags`, `prio`, `status`, `comments`
  - Gruppierung optional nach `phase_id`
  - Nachteil: Wiki-Tab wird zweiter Ideen-View, keine echten Wiki-Features (Snippets, Gotchas)

**Option B – Saubere Trennung: Wiki-Struktur wiederherstellen**
  - `homelab-wiki.json` zurück auf `namespaces[]` + `articles[]`
  - Wiki-Artikel werden separat gepflegt, Ideen bleiben in `homelab-ideas.json`
  - `wiki-state.js` bleibt größtenteils wie er war
  - Mehr Arbeit, aber semantisch korrekt:
    · Ideen = was ich machen will
    · Wiki = wie ich es gemacht habe
  - Ich pflege Artikel manuell via Claude nach, initial 4 Artikel aus Session 5:
    `doc-006` (GRUB-Recovery), `doc-007` (Interface-Bug nic0/eth0), `doc-008` (vim), `doc-009` (Autostart)

### Schritt 3 – Implementation nach meiner Entscheidung

---

## Akzeptanzkriterien

```
[ ] wiki-preview.html zeigt Inhalte nach Seitenaufruf
[ ] Browser-Console (F12) ohne JS-Errors auf dem Wiki-Tab
[ ] nav.js zeigt aktiven Wiki-Tab (accent underline)
[ ] roadmap.html, ideas.html, diary.html, backlog.html, network.html unverändert funktional
[ ] homelab-wiki.json bleibt valides JSON
[ ] Leere Felder (desc: "", tags: []) brechen Rendering nicht
[ ] wiki-state.js lauscht weiterhin auf 'wiki-ready' Event
```

---

## Technische Constraints (wie im Rest der Site)

1. Kein Framework – Vanilla JS only, kein jQuery
2. kein Build-Tool – Seite wird direkt via "Live Preview" in VS Code geöffnet
3. `fetch('./homelab-wiki.json')` – relative Pfade, von wiki-preview.html aus `./` (Root-Ebene)
4. localStorage für User-Präferenzen OK, aber Wiki-Daten bleiben read-only (Schreiben nur via Claude → Copilot)
5. Design-System aus `assets/style.css` nutzen – keine neuen CSS-Variablen erfinden
6. Alle Seiten lauschen auf `wiki-ready` Event bevor sie rendern
7. Bei Option B: `highlight.js` (cdnjs.cloudflare.com) bleibt Standard für Code-Blöcke

---

## Hinweise für Copilot

1. **Erst diagnostizieren, dann ändern** – zeig mir Zeilen bevor du fixest
2. **Keine Scope-Creeps** – nur Wiki-Tab fixen, nicht das UI redesignen
3. **Defensive Programmierung** – `data.articles || []`, `data.ideas || []` statt hart zugreifen
4. **vim-freundliche Fixes** – gib mir Suchphrasen (`:%s/alt/neu/g`) oder ganze Blöcke, keine reinen Zeilennummern
5. **Kommentare** – jede geänderte Zeile bekommt einen Grund-Kommentar im Code
6. **Wenn Verdacht falsch war**: sag es. Nicht stur auf die Hypothese losgehen.
7. **Regression-Test manuell** am Ende: alle 6 anderen HTML-Seiten kurz öffnen, keine Console-Errors
8. Bei Option B: `homelab-wiki.json` bekommt `meta.version` bump (0.3 → 0.4 oder 1.0 bei Re-Design)
9. Git-Commit-Message: `fix(wiki): wiki-preview.html rendert Artikel wieder – Schema-Anpassung`
10. **Keine destruktiven Aktionen** ohne Rückfrage (kein `rm`, kein Umschreiben ganzer Dateien auf Verdacht)

---

## Start

Beginn mit Schritt 1: Zeig mir `wiki-preview.html` + `assets/wiki-state.js` und markier die fehlerhaften Stellen. Dann gehen wir zusammen zu Schritt 2.
