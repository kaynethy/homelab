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
        if (phase.sections) phase.sections.forEach(s => applyToSteps(s.steps));
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
      const inSubdir = window.location.pathname.includes('/phases/') || window.location.pathname.includes('/steps/') || window.location.pathname.includes('/demos/');
      const root = inSubdir ? '../' : './';

      const fetches = [
        fetch(root + 'homelab-state.json', { cache: 'no-cache' }),
        fetch(root + 'homelab-ideas.json', { cache: 'no-cache' })
      ];

      const [stateResp, ideasResp] = await Promise.all(fetches);

      if (!stateResp.ok) throw new Error('Failed to load homelab-state.json');
      const base = await stateResp.json();

      // Ideas aus separater Datei
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

      console.log(
        '[STATE] loaded v' + window.STATE.meta.version,
        window.STATE.phases[0].steps ? window.STATE.phases[0].steps.length + ' steps p1' : '',
        (window.STATE.ideas || []).length + ' ideas',
        'progress ' + progress.pct + '% (' + progress.done + '/' + progress.total + ' done, ' + progress.wip + ' wip)'
      );
    }

    // calcProgress global verfügbar machen für Re-Renders
    window.calcProgress = calcProgress;

    window.dispatchEvent(new Event('state-ready'));
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
    // Deep-clone nur die relevanten Teile (ohne ideas)
    const exportData = JSON.parse(JSON.stringify({
      meta: window.STATE.meta,
      hardware: window.STATE.hardware,
      phases: window.STATE.phases,
      diary: window.STATE.diary
    }));

    // Dynamisch berechnete Felder entfernen (werden von calcProgress() beim Laden neu berechnet)
    delete exportData.meta.progress_pct;
    delete exportData.meta.progress_done;
    delete exportData.meta.progress_wip;
    delete exportData.meta.progress_total;

    // Leere Felder bereinigen die durch localStorage-Merge entstanden sind
    for (const phase of exportData.phases) {
      if (phase.notes === '') delete phase.notes;
      const cleanSteps = function(steps) {
        for (const step of steps) {
          if (step.deferred_reason === '') delete step.deferred_reason;
          if (step.notes === '') delete step.notes;
          if (Array.isArray(step.log) && step.log.length === 0) delete step.log;
        }
      };
      if (phase.steps) cleanSteps(phase.steps);
      if (phase.sections) phase.sections.forEach(function(s) { cleanSteps(s.steps || []); });
    }

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

  // Find a step by ID across all phases
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

  // Get all deferred steps with their phase info
  window.getDeferredSteps = function () {
    if (!window.STATE) return [];
    const result = [];
    for (const phase of window.STATE.phases) {
      const collect = (steps) => {
        for (const step of steps) {
          if (step.status === 'deferred') result.push({ step, phase });
        }
      };
      if (phase.steps) collect(phase.steps);
      if (phase.sections) phase.sections.forEach(s => collect(s.steps));
    }
    return result;
  };

  loadState();
})();
