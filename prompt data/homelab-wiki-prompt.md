# Homelab Wiki – Copilot Prompt v0.2
# Übergib Copilot diese Datei + homelab-wiki.json (+ homelab-state.json für Links)
# Prompt: "Baue wiki-preview.html nach dieser Spezifikation."

---

## Ziel

wiki-preview.html ist die lokale Wiki-Vorschau bis DokuWiki als VM läuft (Phase 3).
Datenquelle: homelab-wiki.json (separater State, unabhängig von homelab-state.json).
Syntax-Highlighting via highlight.js (cdnjs.cloudflare.com erlaubt).

---

## Dateistruktur (IST-Stand)

```
Y:/HomeLab/Dokumentation/
├── wiki-preview.html           # diese Seite
├── homelab-wiki.json           # Wiki-State (Single Source of Truth)
│
├── prompt data/
│   └── homelab-wiki-prompt.md  # DIESE Datei
│
└── assets/
    ├── style.css               # globales Design-System (bereits vorhanden)
    ├── wiki-state.js           # lädt homelab-wiki.json
    └── nav.js                  # globale Navigation (bereits vorhanden)
```

Kontext: wiki-preview.html ist einer von 7 Top-Level-Tabs der Site.
Die anderen: index.html, roadmap.html, ideas.html, backlog.html, diary.html, network.html.
Diese dürfen durch Wiki-Änderungen NICHT beeinflusst werden.

---

## assets/wiki-state.js

```js
// Lädt homelab-wiki.json, kein localStorage (Wiki ist read-only im Browser)
// Schreiben passiert nur über Claude → Copilot Update-Zyklus
async function loadWiki() {
  const res = await fetch('./homelab-wiki.json');
  window.WIKI = await res.json();
  window.dispatchEvent(new Event('wiki-ready'));
}
loadWiki();
```

---

## Design (erbt von assets/style.css)

Gleiche CSS-Variablen und Komponenten wie der Rest der Site.
Namespace-Farb-Mapping aus wiki.json namespaces[].color:
  teal   → var(--phase1)
  blue   → var(--phase2)
  purple → var(--phase3)
  amber  → var(--phase4)

---

## wiki-preview.html Layout

Breadcrumb: Dashboard > Docs & Wiki

```
┌─ Nav ──────────────────────────────────────────────────────┐
│ // homelab_roadmap  [Dashboard][Roadmap][Ideen][Backlog][Diary]... │
└────────────────────────────────────────────────────────────┘

┌─ Header ───────────────────────────────────────────────────┐
│ // docs_wiki                    [DokuWiki geplant – Phase 3]│
│ 1 Artikel · 1 Namespace                                     │
└────────────────────────────────────────────────────────────┘

┌─ Sidebar (200px) ──┐  ┌─ Artikel-Bereich ─────────────────┐
│ NAMESPACES         │  │                                    │
│                    │  │  [Artikel-Karten]                  │
│ ● proxmox (1)      │  │                                    │
│   netzwerk (0)     │  │                                    │
│   dienste  (0)     │  │                                    │
│   security (0)     │  │                                    │
└────────────────────┘  └───────────────────────────────────┘
```

---

## Sidebar – Namespaces

Aus WIKI.namespaces[] rendern.
Jeder Eintrag zeigt: farbiger Dot + Label + Artikel-Anzahl in Klammern.
Aktiver Namespace: accent-border-left, heller Hintergrund.
"Alle" als erster Eintrag (kein Filter).
Klick → filtert Artikel-Bereich.

---

## Artikel-Karte (collapsed)

```
┌──────────────────────────────────────────────────────────┐
│ [proxmox/installation]  [Proxmox] [Hyper-V] [nested virt]│  ← namespace + tags
│                                                          │
│ Proxmox unter Hyper-V (nested virtualization)            │  ← title, 15px bold
│ Proxmox VE als nested VM unter Windows 11...             │  ← summary, muted, 1 Zeile
│                                                [Öffnen ▾]│
└──────────────────────────────────────────────────────────┘
```

---

## Artikel-Detailansicht (expandiert inline, accordion-style)

Öffnet unterhalb der Karte, schiebt andere Karten nach unten.
Schließen per [Schließen ▴] Button oder erneuter Klick auf Karte.

### Abschnitt: Befehle & Snippets
Für jeden snippets[]:

```
Set-VMProcessor -VMName "Proxmox" ...      [Copy ⧉]
```
  - Code-Block: bg #0d0f14, border var(--border), font JetBrains Mono 12px
  - Sprach-Label oben links (powershell / bash / yaml etc.)
  - Copy-Button oben rechts: navigator.clipboard.writeText(snippet.code)
    → kurzes visuelles Feedback: Button-Text wechselt zu "Kopiert ✓" für 1.5s

### Abschnitt: Stolpersteine & Lösungen
Für jeden gotchas[]:

```
┌─────────────────────────────────────────────────────────┐
│ ⚠  Kein Dynamic RAM: Proxmox plant RAM beim Start...    │
└─────────────────────────────────────────────────────────┘
```
  - bg: rgba(255,181,71,0.08), border-left: 3px solid var(--amber)
  - Icon ⚠ in amber, Text in var(--text)

### Abschnitt: Weiterführende Links
Für jeden links[]:
  → Proxmox VE Download   [proxmox.com ↗]
  - Pfeil in accent-Farbe, URL als muted subtext
  - Öffnet in neuem Tab

---

## Dashboard-Card (index.html updaten)

Füge eine Wiki-Card in index.html ein, neben den Phase-Cards:

```
┌──────────────────────────────────────┐
│ [WIKI]                               │  ← badge, accent2-Farbe
│                                      │
│ Docs & Wiki                          │  ← titel
│ Technische Referenz & Snippets       │  ← subtitle, muted
│                                      │
│ 1 Artikel  ·  proxmox/              │  ← dynamisch aus WIKI
│                                      │
│ DokuWiki · geplant in Phase 3        │  ← muted, phase3-Farbe
└──────────────────────────────────────┘
```
  - border-left: 3px solid var(--accent2)
  - Klick → wiki-preview.html
  - Artikel-Anzahl: fetch homelab-wiki.json → WIKI.articles.length
    (oder hardcoded falls fetch auf index.html zu komplex)

---

## Update-Workflow (für Copilot)

Wiki-Artikel werden NICHT im Browser bearbeitet.
Workflow:
  1. Nutzer sagt Claude was dokumentiert werden soll
  2. Claude fügt neuen Artikel in homelab-wiki.json ein
  3. Copilot bekommt: "UPDATE Typ A – homelab-wiki.json: Artikel X hinzugefügt"
  4. wiki-preview.html rendert automatisch (liest JSON beim Laden)

→ Kein HTML anfassen für neue Artikel.

---

## Hinweise für Copilot

1. Separate Datei wiki-state.js – nicht in state.js mischen
2. WIKI.articles[] filtern per namespace.split('/')[0] === aktiver Namespace
3. Accordion: max-height 0 → auto mit CSS transition (kein display:none)
4. Copy-Button Feedback: setTimeout(() => btn.textContent = 'Copy ⧉', 1500)
5. highlight.js von cdnjs: https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js
   Init: hljs.highlightAll() nach dem Expandieren eines Artikels aufrufen
6. Namespace-Farben aus WIKI.namespaces[].color mappen (teal/blue/purple/amber)
7. Artikel-Anzahl pro Namespace: articles.filter(a => a.namespace.startsWith(ns.id)).length
8. Kein Framework, kein jQuery – Vanilla JS
9. Defensive: WIKI.articles || [], WIKI.namespaces || [] – Schema-Änderungen sollen nicht zum Leer-Rendering führen