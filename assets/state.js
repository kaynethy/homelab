/* === STATE MANAGEMENT === */
(function () {
  'use strict';

  const USER_CHANGES_KEY = 'homelab_user_changes';

  // user_changes Struktur: { steps: { [stepId]: { status, notes, log } }, phases: { [phaseId]: { notes } } }
  function loadUserChanges() {
    try {
      return JSON.parse(localStorage.getItem(USER_CHANGES_KEY)) || { steps: {}, phases: {} };
    } catch (e) {
      return { steps: {}, phases: {} };
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
      const inSubdir = window.location.pathname.includes('/phases/') || window.location.pathname.includes('/steps/');
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

  // Speichert NUR User-Changes (status/notes/log) – nie Basis-Daten
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
        }
      };
      if (phase.steps) saveSteps(phase.steps);
      if (phase.sections) phase.sections.forEach(s => saveSteps(s.steps));
    }

    localStorage.setItem(USER_CHANGES_KEY, JSON.stringify(changes));
  };

  window.exportJSON = function () {
    if (!window.STATE) return;
    const blob = new Blob([JSON.stringify(window.STATE, null, 2)], {
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

  // Cycle status: todo → wip → done → todo
  window.cycleStatus = function (stepId) {
    const result = window.findStep(stepId);
    if (!result) return;
    const order = ['todo', 'wip', 'done'];
    const idx = order.indexOf(result.step.status);
    result.step.status = order[(idx + 1) % order.length];
    window.saveState();
    return result.step.status;
  };

  loadState();
})();
