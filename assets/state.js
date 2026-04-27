/* === STATE MANAGEMENT === */
(function () {
  'use strict';

  const USER_CHANGES_KEY = 'homelab_user_changes';

  // user_changes Struktur: { steps: {}, phases: {}, custom_steps: [], removed_steps: [] }
  function loadUserChanges() {
    try {
      var c = JSON.parse(localStorage.getItem(USER_CHANGES_KEY)) || {};
      if (!c.steps) c.steps = {};
      if (!c.phases) c.phases = {};
      if (!c.custom_steps) c.custom_steps = [];
      if (!c.removed_steps) c.removed_steps = [];
      return c;
    } catch (e) {
      return { steps: {}, phases: {}, custom_steps: [], removed_steps: [] };
    }
  }

  function applyUserChanges(state, changes) {
    if (!changes) return state;
    // Apply step-level changes
    if (changes.steps) {
      for (const phase of state.phases) {
        const applyToSteps = (steps) => {
          for (const step of steps) {
            if (changes.steps[step.id]) {
              const c = changes.steps[step.id];
              if (c.status !== undefined) step.status = c.status;
              if (c.notes !== undefined) step.notes = c.notes;
              if (c.log !== undefined) step.log = c.log;
              if (c.deferred_reason !== undefined) step.deferred_reason = c.deferred_reason;
            }
          }
        };
        if (phase.steps) applyToSteps(phase.steps);
      if (phase.sections) phase.sections.forEach(s => { if (s.steps) applyToSteps(s.steps); });
      }
    }
    // Apply phase-level changes (notes)
    if (changes.phases) {
      for (const phase of state.phases) {
        if (changes.phases[phase.id]) {
          const c = changes.phases[phase.id];
          if (c.notes !== undefined) phase.notes = c.notes;
        }
      }
    }

    // Remove user-deleted steps
    if (changes.removed_steps && changes.removed_steps.length > 0) {
      for (const phase of state.phases) {
        if (phase.steps) phase.steps = phase.steps.filter(s => !changes.removed_steps.includes(s.id));
        if (phase.sections) phase.sections.forEach(sec => {
          sec.steps = (sec.steps || []).filter(s => !changes.removed_steps.includes(s.id));
        });
      }
    }

    // Inject user-created custom steps
    if (changes.custom_steps && changes.custom_steps.length > 0) {
      for (const cs of changes.custom_steps) {
        const phase = state.phases.find(p => p.id === cs.phase_id);
        if (!phase) continue;
        const allSteps = [...(phase.steps||[]), ...(phase.sections||[]).flatMap(s => s.steps||[])];
        if (allSteps.some(s => s.id === cs.step.id)) continue;
        if (cs.section_idx != null && phase.sections && phase.sections[cs.section_idx]) {
          phase.sections[cs.section_idx].steps = phase.sections[cs.section_idx].steps || [];
          phase.sections[cs.section_idx].steps.push(cs.step);
        } else if (phase.steps) {
          phase.steps.push(cs.step);
        } else if (phase.sections && phase.sections[0]) {
          phase.sections[0].steps = phase.sections[0].steps || [];
          phase.sections[0].steps.push(cs.step);
        }
      }
    }

    return state;
  }

  function calcProgress(state) {
    let done = 0, wip = 0, total = 0;
    for (const phase of state.phases) {
      const steps = [
        ...(phase.steps || []),
        ...(phase.sections || []).flatMap(s => s.steps || [])
      ];
      for (const step of steps) {
        if (step.status === 'deferred') continue; // deferred zählt nicht
        total++;
        if (step.status === 'done') done++;
        else if (step.status === 'wip') wip++;
      }
    }
    const pct = total === 0 ? 0 : Math.round((done + wip * 0.5) / total * 100);
    return { pct, done, wip, total };
  }

  async function loadState() {
    try {
      const path = window.location.pathname;
      const root = (path.includes('/steps/hardware/') || path.includes('/steps/equinox/')) ? '../../'
                 : (path.includes('/phases/') || path.includes('/steps/') || path.includes('/demos/')) ? '../'
                 : './';
      const dataDir = root + 'phasen-ideen-deferred/';

      // Step 1: Hauptdatei laden (meta, hardware, phase-summaries, file-index)
      const mainResp = await fetch(dataDir + 'homelab-state.json', { cache: 'no-cache' });
      if (!mainResp.ok) throw new Error('Failed to load homelab-state.json');
      const base = await mainResp.json();

      // Step 2: Alle abhängigen Dateien parallel laden
      const files = base.files || {};
      const phaseFiles = files.phases || [
        'homelab-state-phase1.json',
        'homelab-state-phase2.json',
        'homelab-state-phase3.json',
        'homelab-state-phase4.json'
      ];
      const diaryFile    = files.diary    || 'homelab-diary.json';
      const deferredFile = files.deferred || 'homelab-deferred.json';
      const ideasFile    = files.ideas    || 'homelab-ideas.json';

      const [phaseResults, diaryResp, deferredResp, ideasResp] = await Promise.all([
        Promise.all(phaseFiles.map(f =>
          fetch(dataDir + f, { cache: 'no-cache' })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )),
        fetch(dataDir + diaryFile,    { cache: 'no-cache' }),
        fetch(dataDir + deferredFile, { cache: 'no-cache' }),
        fetch(dataDir + ideasFile,    { cache: 'no-cache' })
      ]);

      // Step 3: Phase-Steps in base.phases einmergen
      phaseResults.forEach((phaseData, i) => {
        if (!phaseData) return;
        const phaseId = phaseData.meta && phaseData.meta.phase_id;
        const phase = (phaseId && base.phases.find(p => p.id === phaseId)) || base.phases[i];
        if (!phase) return;
        if (phaseData.steps)    phase.steps    = phaseData.steps;
        if (phaseData.sections) phase.sections = phaseData.sections;
        if (phaseData.meta && phaseData.meta.progress) phase.progress = phaseData.meta.progress;
      });

      // Step 4: Diary laden → STATE.diary = sessions[]
      if (diaryResp.ok) {
        const diaryData = await diaryResp.json();
        window.DIARY = diaryData;
        base.diary = diaryData.sessions || [];
      } else {
        base.diary = [];
      }

      // Step 5: Deferred Items laden — NUR in window.DEFERRED speichern, NICHT in Phasen injizieren.
      // Deferred Items gehören ausschließlich auf das Deferred-Board (deferred.html).
      // Phase-Boards und Fortschrittsbalken sind damit sauber getrennt.
      if (deferredResp.ok) {
        const deferredData = await deferredResp.json();
        window.DEFERRED = deferredData;
      } else {
        window.DEFERRED = { items: [] };
      }

      // Step 6: Ideas laden
      if (ideasResp.ok) {
        const ideasData = await ideasResp.json();
        window.IDEAS = ideasData;
        base.ideas = ideasData.ideas || [];
      }

      // User-Changes aus localStorage anwenden (nur status/notes/log – nie Basis-Daten)
      const changes = loadUserChanges();
      window.STATE = applyUserChanges(base, changes);

    } catch (err) {
      console.error('State load error:', err);
      window.STATE = null;
    }

    if (window.STATE) {
      // Dynamische Fortschrittsberechnung – überschreibt den statischen JSON-Wert
      const progress = calcProgress(window.STATE);
      window.STATE.meta.progress_pct = progress.pct;
      window.STATE.meta.progress_done = progress.done;
      window.STATE.meta.progress_wip = progress.wip;
      window.STATE.meta.progress_total = progress.total;

      const p1 = window.STATE.phases[0];
      const p1Steps = p1 ? (p1.steps ? p1.steps.length : (p1.sections || []).reduce((a,s)=>a+(s.steps||[]).length,0)) : 0;
      console.log(
        '[STATE] loaded v' + window.STATE.meta.version,
        p1Steps + ' steps p1',
        (window.STATE.ideas || []).length + ' ideas',
        (window.STATE.diary || []).length + ' diary sessions',
        'progress ' + progress.pct + '% (' + progress.done + '/' + progress.total + ' done, ' + progress.wip + ' wip)'
      );
    }

    // calcProgress global verfügbar machen für Re-Renders
    window.calcProgress = calcProgress;

    window.dispatchEvent(new Event('state-ready'));

    // Tracks asynchron laden (jeder Track feuert 'tracks-ready' wenn geladen)
    if (window.STATE && window.STATE.files && window.STATE.files.tracks) {
      const tPath = window.location.pathname;
      const tRoot = (tPath.includes('/steps/hardware/') || tPath.includes('/steps/equinox/')) ? '../../'
                  : (tPath.includes('/phases/') || tPath.includes('/steps/') || tPath.includes('/demos/')) ? '../'
                  : './';
      const tDataDir = tRoot + 'phasen-ideen-deferred/';
      window.STATE.tracks = window.STATE.tracks || {};
      window.STATE.files.tracks.forEach(function(trackFile) {
        fetch(tDataDir + trackFile, { cache: 'no-cache' })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            var trackId = data.meta.track_id;
            window.STATE.tracks[trackId] = data;
            var stepCount = (data.sections || []).reduce(function(sum, s) { return sum + (s.steps || []).length; }, 0);
            console.log('[state] Track geladen:', trackId, '—', stepCount, 'Steps');
            window.dispatchEvent(new Event('tracks-ready'));
          })
          .catch(function(err) { console.error('[state] Track-Fehler:', trackFile, err); });
      });
    }
  }

  // Speichert User-Changes (status/notes/log + custom/removed steps)
  window.saveState = function () {
    if (!window.STATE) return;
    const changes = loadUserChanges();

    for (const phase of window.STATE.phases) {
      // Phase notes
      if (phase.notes !== undefined) {
        if (!changes.phases[phase.id]) changes.phases[phase.id] = {};
        changes.phases[phase.id].notes = phase.notes;
      }
      const saveSteps = (steps) => {
        for (const step of steps) {
          if (!changes.steps[step.id]) changes.steps[step.id] = {};
          changes.steps[step.id].status = step.status;
          changes.steps[step.id].notes  = step.notes || '';
          changes.steps[step.id].log    = step.log || [];
          changes.steps[step.id].deferred_reason = step.deferred_reason || '';
        }
      };
      if (phase.steps) saveSteps(phase.steps);
      if (phase.sections) phase.sections.forEach(s => saveSteps(s.steps));
    }

    localStorage.setItem(USER_CHANGES_KEY, JSON.stringify(changes));
  };

  // Add a user-created step to a phase
  window.addCustomStep = function (phaseId, sectionIdx, step) {
    const changes = loadUserChanges();
    changes.custom_steps.push({ phase_id: phaseId, section_idx: sectionIdx, step: step });
    changes.removed_steps = changes.removed_steps.filter(id => id !== step.id);
    localStorage.setItem(USER_CHANGES_KEY, JSON.stringify(changes));
    // Add to STATE in memory
    const phase = window.STATE.phases.find(p => p.id === phaseId);
    if (!phase) return;
    if (sectionIdx != null && phase.sections && phase.sections[sectionIdx]) {
      phase.sections[sectionIdx].steps = phase.sections[sectionIdx].steps || [];
      phase.sections[sectionIdx].steps.push(step);
    } else if (phase.steps) {
      phase.steps.push(step);
    } else if (phase.sections && phase.sections[0]) {
      phase.sections[0].steps = phase.sections[0].steps || [];
      phase.sections[0].steps.push(step);
    }
    window.saveState();
  };

  // Remove a step (custom or base) from the roadmap
  window.removeCustomStep = function (stepId) {
    const changes = loadUserChanges();
    const wasCustom = changes.custom_steps.some(cs => cs.step.id === stepId);
    if (wasCustom) {
      changes.custom_steps = changes.custom_steps.filter(cs => cs.step.id !== stepId);
    } else {
      if (!changes.removed_steps.includes(stepId)) changes.removed_steps.push(stepId);
    }
    delete changes.steps[stepId];
    localStorage.setItem(USER_CHANGES_KEY, JSON.stringify(changes));
    // Remove from STATE in memory
    if (window.STATE) {
      for (const phase of window.STATE.phases) {
        if (phase.steps) phase.steps = phase.steps.filter(s => s.id !== stepId);
        if (phase.sections) phase.sections.forEach(sec => {
          sec.steps = (sec.steps || []).filter(s => s.id !== stepId);
        });
      }
    }
  };

  window.exportJSON = function () {
    if (!window.STATE) return;
    // Export nur die Hauptdatei (meta, hardware, phases-summaries ohne Steps)
    const exportData = JSON.parse(JSON.stringify({
      meta: window.STATE.meta,
      hardware: window.STATE.hardware,
      files: window.STATE.files,
      phases: window.STATE.phases.map(function(p) {
        // Nur Summary-Felder exportieren, keine Steps/Sections (die liegen in eigenen Dateien)
        return {
          id: p.id, label: p.label, title: p.title, subtitle: p.subtitle,
          status: p.status, color: p.color, file: p.file
        };
      })
    }));

    // Dynamisch berechnete Felder entfernen
    delete exportData.meta.progress_pct;
    delete exportData.meta.progress_done;
    delete exportData.meta.progress_wip;
    delete exportData.meta.progress_total;

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'homelab-state.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  window.resetState = function () {
    localStorage.removeItem(USER_CHANGES_KEY);
    // Legacy cleanup
    localStorage.removeItem('homelab_state');
    location.reload();
  };

  // Find a step by ID — sucht in STATE.phases und zusätzlich in window.DEFERRED
  window.findStep = function (stepId) {
    if (!window.STATE) return null;
    for (const phase of window.STATE.phases) {
      if (phase.steps) {
        const step = phase.steps.find((s) => s.id === stepId);
        if (step) return { step, phase };
      }
      if (phase.sections) {
        for (const section of phase.sections) {
          const step = section.steps.find((s) => s.id === stepId);
          if (step) return { step, phase };
        }
      }
    }
    // Fallback: auch in window.DEFERRED suchen (damit step.html?id=... für deferred Steps funktioniert)
    if (window.DEFERRED) {
      const item = (window.DEFERRED.items || []).find(i => i.id === stepId);
      if (item) {
        const phase = window.STATE.phases.find(p => p.id === item.phase_id)
          || { id: item.phase_id, title: item.phase_id };
        return { step: item, phase };
      }
    }
    return null;
  };

  // Get all steps as flat array
  window.getAllSteps = function () {
    if (!window.STATE) return [];
    const steps = [];
    for (const phase of window.STATE.phases) {
      if (phase.steps) steps.push(...phase.steps);
      if (phase.sections) {
        for (const section of phase.sections) steps.push(...section.steps);
      }
    }
    return steps;
  };

  // Cycle status: todo → wip → done → todo (deferred is separate, set explicitly)
  window.cycleStatus = function (stepId) {
    const result = window.findStep(stepId);
    if (!result) return;
    const order = ['todo', 'wip', 'done'];
    const idx = order.indexOf(result.step.status);
    result.step.status = order[(idx + 1) % order.length];
    window.saveState();
    return result.step.status;
  };

  // Get all deferred steps with their phase info (liest aus window.DEFERRED, nicht aus STATE.phases)
  window.getDeferredSteps = function () {
    if (!window.STATE || !window.DEFERRED) return [];
    const result = [];
    for (const item of (window.DEFERRED.items || [])) {
      if (item.status !== 'deferred') continue;
      const phase = window.STATE.phases.find(p => p.id === item.phase_id);
      result.push({ step: item, phase: phase || { id: item.phase_id, title: item.phase_id } });
    }
    return result;
  };

  loadState();
})();
