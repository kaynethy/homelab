# Homelab Roadmap – Copilot Prompt v0.5
# Übergib Copilot (Claude Opus) diese Datei + homelab-state.json
# Prompt: "Baue das komplette Homelab-Projekt nach dieser Spezifikation. Lies zuerst homelab-state.json."

---

## Projektziel

Interaktives, lokales Multi-Page Web-Projekt. Persönliches Homelab-Planungs-, Tagebuch- und Ideentool.
Alle Daten aus homelab-state.json. Kein Backend, kein Framework – reines HTML/CSS/JS + localStorage.

---

## Dateistruktur (IST-Stand)

```
Y:/HomeLab/Dokumentation/
├── index.html                  # Dashboard / Welcome
├── roadmap.html                # Roadmap-Übersicht (alle Phasen auf einer Seite)
├── ideas.html                  # Ideen-Übersicht (Flipcards)
├── backlog.html                # Backlog-View (Ideen ohne phase_id/step_id)
├── diary.html                  # Session-Tagebuch
├── network.html                # Netzwerk-Übersicht (IPs, Subnetze, VLANs)
├── wiki-preview.html           # Wiki-Tab (liest homelab-wiki.json)
│
├── phases/
│   ├── phase1.html             # Phase-Übersicht: Fundament
│   ├── phase2.html             # Phase-Übersicht: Netz & Erreichbarkeit
│   ├── phase3.html             # Phase-Übersicht: Dienste & Intranet
│   └── phase4.html             # Phase-Übersicht: Security & Experimente
│
├── steps/
│   └── [step-id].html          # Dynamisch: eine HTML pro Step-ID (z.B. p1-bios.html)
│
├── homelab-state.json          # Single Source of Truth (Roadmap + Diary)
├── homelab-ideas.json          # Ideen-Backlog (getrennt vom State)
├── homelab-wiki.json           # Wiki-Daten (getrennt vom State)
│
├── prompt data/                # Alle Copilot-Prompts zentral abgelegt
│   ├── homelab-copilot-prompt.md   # DIESE Datei
│   ├── homelab-update-prompt.md    # kurzer Update-Prompt (Typ A-D Änderungen)
│   ├── homelab-wiki-prompt.md      # Wiki-Spezifikation (initialer Build)
│   └── homelab-wiki-fix-prompt.md  # Fix für Wiki-Tab bei Schema-Änderung
│
└── assets/
    ├── style.css               # Globales Design-System
    ├── state.js                # State laden, speichern, exportieren
    ├── wiki-state.js           # Wiki-spezifischer State (homelab-wiki.json)
    └── nav.js                  # Globale Navigation
```

Copilot generiert ALLE steps/[id].html Dateien aus steps[] im JSON.
Step-IDs aus JSON direkt als Dateinamen: p1-bios.html, p1-proxmox-vm.html, etc.

---

## Design-System (assets/style.css)

Dark Theme – Terminal/DevOps-Ästhetik. Subtiles CSS-Gitter im Hintergrund (opacity 0.25, 40px).
Fonts: JetBrains Mono (Headings, Labels, Code) + Inter (Body) via Google Fonts.

CSS-Variablen:
  --bg: #0d0f14        --bg2: #13161e       --bg3: #1a1e29
  --border: #2a2f3f    --border2: #3a4055
  --text: #c8cedd      --muted: #5a6278
  --accent: #4fffb0    --accent2: #7b61ff
  --phase1: #00d4aa    --phase2: #4db8ff    --phase3: #a78bfa    --phase4: #fb923c
  --done: #22c55e      --wip: #eab308       --todo: #3a4055

Globale Komponenten:
  .card             – bg2, border, border-radius 8px, hover: translateY(-1px)
  .card-accent-1/2/3/4 – border-left: 3px solid phase-farbe
  .status-dot       – kleiner Kreis (●), .wip animiert pulse
  .tag              – JetBrains Mono, klein, bg/border
  .phase-badge      – Phase-Nummer Badge mit Phase-Farbe
  .section-label    – Mono, uppercase, letter-spacing, muted
  .btn              – Button Basis-Style
  .btn-accent       – accent-farbener Button
  .breadcrumb       – Pfad-Navigation oben (Dashboard > Phase 1 > BIOS)
  .idea-card        – Flipcard Container (perspective, transform-style preserve-3d)
  .idea-front/back  – Vorder-/Rückseite der Flipcard
  .comment-entry    – einzelner Kommentar (Text + Datum + Edit/Delete Buttons)
  .progress-track/fill – schmale Fortschrittsleiste

---

## State Management (assets/state.js)

Beim Laden:
  1. fetch('../homelab-state.json') relativ zum Aufrufer (Pfad-aware)
  2. localStorage 'homelab_state' prüfen – wenn vorhanden mergen (localStorage gewinnt)
  3. window.STATE = gemergter State, window.dispatchEvent(new Event('state-ready'))

Funktionen:
  saveState()     → localStorage.setItem('homelab_state', JSON.stringify(window.STATE))
  exportJSON()    → Blob-Download des aktuellen STATE als homelab-state.json
  getStep(id)     → findet Step über alle Phasen/Sections hinweg
  getPhase(id)    → gibt Phase-Objekt zurück

Alle Seiten lauschen auf 'state-ready' bevor sie rendern.
fetch-Pfad anpassen je nach Tiefe: index.html → './homelab-state.json', phases/ → '../homelab-state.json', steps/ → '../homelab-state.json'

---

## Navigation (assets/nav.js)

Injiziert in <div id="nav"> auf jeder Seite:

  // homelab_roadmap    [Dashboard] [Roadmap] [Ideen] [Backlog] [Diary] [Network] [Wiki]    [Export JSON]  v0.5

Aktive Seite per window.location.pathname erkennen → accent underline.
Breadcrumb wird SEPARAT pro Seite gesetzt (nicht in nav.js) via <div id="breadcrumb">.

---

## Seiten im Detail

### index.html – Dashboard

Breadcrumb: (keiner – Root)

Inhalt:
  - Header: // homelab_dashboard + Version + Datum
  - Gesamt-Fortschrittsbalken (meta.progress_pct)
  - 4 Phase-Karten nebeneinander (Grid 2x2 oder 4er Row)
    Jede Karte zeigt: Phase-Badge, Titel, Subtitle, Step-Fortschritt (X/Y done),
    aktive Phase hat accent-border + "← aktiv" Badge
    → Klick führt zu phases/phase1.html etc.
  - "Letzte Aktivität" Box: letzten diary-Eintrag anzeigen (datum + titel)
  - "Neue Ideen" Counter: Anzahl backlog-Items mit prio "high"

---

### phases/phase1.html (und phase2–4 analog)

Breadcrumb: Dashboard > Phase 1 – Fundament

Inhalt:
  - Phase-Header mit Badge, Titel, Subtitle, Fortschrittsbalken für diese Phase
  - Hardware-Box (nur Phase 1, aus hardware{})
  - Step-Karten Grid (wie bisher: auto-fill, minmax 220px)
    Jede Karte: Titel, Desc, Tags, Status-Dot
    → Klick führt zu steps/[step-id].html
  - Ideen dieser Phase (alle ideas[] die phase_id dieser Phase haben)
    Als kleine Vorschau-Liste + "Alle Ideen" Link → ideas.html?filter=phase1
  - Phase-Notizen Box (editierbar, saveState())

Phase 3+4: sections[] mit Label-Überschriften, dann steps[] darunter.

---

### steps/[step-id].html – Step-Detailseite

Breadcrumb: Dashboard > Phase X > Step-Titel

Jede Step-HTML lädt denselben Template-Code, ermittelt die eigene ID
aus dem Dateinamen (window.location.pathname) und rendert den passenden Step.

Inhalt:
  - Step-Titel + Status-Badge (groß)
  - Status-Toggle: [todo] [wip] [done] → saveState()
  - Tags[]
  - Beschreibung (desc)
  - Details{} als formatierter Code-Block (falls vorhanden)
    Inklusive Erklärungen wie dynamic_ram_why als Callout-Box hervorgehoben
  - Notizen – editierbare Textarea, auto-save on blur
  - Log-Einträge
    Chronologisch, neueste zuerst
    Format: Datum · Eintrag-Text
    [+ Log-Eintrag] → inline Formular (Datum auto, Text) → saveState()
  - Ideen zu diesem Step
    Kleine Karten der ideas[] die step_id dieses Steps haben
    [+ Idee hinzufügen] Button → öffnet Ideen-Formular (s.u.)
    Neue Idee bekommt automatisch: phase_id + step_id als Tags

Ideen-Formular (inline, kein Modal):
  Titel (Input)
  Beschreibung (Textarea)
  Priorität (Dropdown: high / medium / low)
  [Speichern] → STATE.ideas.push({ id, title, desc, phase_id, step_id, prio, comments: [] })
              → saveState(), re-render

---

### ideas.html – Ideen-Übersicht

Breadcrumb: Dashboard > Ideen

URL-Parameter: ?filter=phase1 filtert automatisch nach phase_id

Inhalt:
  - Header: // ideen_board
  - Filter-Leiste: [Alle] [Phase 1] [Phase 2] [Phase 3] [Phase 4] [● High] [● Medium] [● Low]
    URL-Parameter setzt aktiven Filter beim Laden
  - [+ Neue Idee] Button → inline Formular oben
  - Flipcard-Grid (auto-fill, minmax 280px)

Flipcard Vorderseite:
  Titel
  Kurze Desc (max 2 Zeilen, truncated)
  Phase-Badge + Step-Badge (Herkunft)
  Prio-Badge (high=orange, medium=gelb, low=grau)
  Status-Badge (Idee / In Planung / Umgesetzt)
  Tags[]
  Kommentar-Anzahl als kleiner Counter (💬 3)

Flipcard Rückseite (Klick auf Karte dreht sie):
  Kommentar-Thread:
    Liste aller comments[] für diese Idee
    Jeder Kommentar:
      ┌─────────────────────────────┐
      │ 2026-04-16                  │
      │ Das könnte auch mit ...     │  ← comment.text
      │                    [✎] [✕] │  ← Edit / Delete Buttons
      └─────────────────────────────┘
    Edit: macht Text zur inline Textarea, [Speichern] updated comment.text + setzt edited: true
    Delete: entfernt Kommentar nach Bestätigung (kleines confirm())

  [+ Kommentar] Button:
    Inline Textarea + [Speichern]
    → comments.push({ id, date, text, edited: false })
    → saveState(), re-render

  [← Zurückdrehen] Button unten

Ideen-Formular (Neue Idee, inline oben):
  Titel, Beschreibung, Phase (Dropdown), Prio
  [Hinzufügen] → STATE.ideas.push(...), saveState()

---

### diary.html – Tagebuch

Breadcrumb: Dashboard > Tagebuch

Inhalt:
  - Header: // session_log
  - [+ Neue Session] Button
  - Sessions aus diary[], neueste zuerst, als aufklappbare Karten

Session-Karte:
  Session #N · YYYY-MM-DD · Titel
  ────────────────────────────────
  · entry 1
  · entry 2

Neue Session (inline Formular):
  Datum (auto heute), Titel, Einträge (Textarea, Zeile = entry)
  [Speichern] → STATE.diary.push(), saveState(), re-render

---

## JSON-Datenstruktur – Erweiterungen

Die bestehende homelab-state.json braucht folgende Ergänzungen:

```json
{
  "ideas": [
    {
      "id": "idea-001",
      "title": "Tailscale als WireGuard-Alternative",
      "desc": "Einfacher einzurichten, kein Port-Forwarding nötig",
      "phase_id": "phase2",
      "step_id": "p2-wireguard",
      "prio": "medium",
      "status": "idea",
      "tags": ["VPN", "Tailscale"],
      "comments": [
        {
          "id": "c-001",
          "date": "2026-04-16",
          "text": "Könnte gut sein für den Anfang bevor eigener WireGuard steht",
          "edited": false
        }
      ]
    }
  ]
}
```

Backlog-Items aus backlog[] in ideas[] migrieren:
  - prio übernehmen
  - phase_id: null (noch nicht zugewiesen)
  - step_id: null
  - comments: []

---

## Verlinkungs-Logik (wichtig für Copilot)

Eine Idee erscheint auf DREI Stellen gleichzeitig:
  1. steps/[step-id].html   → wenn idea.step_id === step.id
  2. phases/[phase-id].html → wenn idea.phase_id === phase.id
  3. ideas.html             → immer (mit Filter-Option)

Beim Hinzufügen einer Idee auf einer Step-Seite:
  → phase_id und step_id werden automatisch gesetzt
  → Idee erscheint sofort auf allen drei Seiten (da alles aus STATE gerendert)

---

## Hinweise für Copilot

1. state.js zuerst, alle Seiten warten auf 'state-ready' Event
2. fetch-Pfad ist relativ – je nach Ordnertiefe anpassen
3. steps/ Seiten: ID aus window.location.pathname extrahieren (letztes Segment ohne .html)
4. Flipcard: CSS perspective auf Container, rotateY(180deg) auf .flipped Klasse
5. Kommentar Edit: Text → <textarea>, Speichern updated comment.text in STATE
6. Kommentar Delete: STATE.ideas[i].comments.splice(j,1), saveState()
7. Filter in ideas.html: URL-Parameter per URLSearchParams lesen
8. Phase-Farb-Mapping: { teal: phase1, blue: phase2, purple: phase3, amber: phase4 }
9. Kein Framework – Vanilla JS only, kein jQuery
10. Git-Repo Wurzel: Y:/HomeLab/Dokumentation/
11. Prompts liegen in `prompt data/` – diesen Ordner NICHT zur Repo-Logik rechnen, nur Doku