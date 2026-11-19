// User Report Overrides — on the gradebook User report, show each student's
// quiz overrides under the quiz's name.
//
// Rows look like:
//   <th id="row_{gradeitemid}_{userid}" ...>
//     ... <div class="rowtitle"><a class="gradeitemheader" href=".../mod/quiz/view.php?id={cmid}">
// Overrides come from each quiz's /mod/quiz/overrides.php?cmid=X&mode=user page,
// which lists every student's override, so the cost is one fetch per quiz shown,
// whether the report is for one student or all of them. Results are cached in
// sessionStorage for a few minutes.

(() => {
    if (window.location.pathname !== '/grade/report/user/index.php') return;
    const lib = window.moodlePaletteQuizOverrides;
    if (!lib) return;

    const CACHE_MS = 5 * 60 * 1000;
    const PREF_KEY = 'moodlePalette-showQuizOverrides';

    function findRows() {
        const rows = [];
        for (const th of document.querySelectorAll('th[id^="row_"]')) {
            const m = /^row_\d+_(\d+)$/.exec(th.id);
            const link = th.querySelector('a.gradeitemheader, .rowtitle a');
            const cmid = link && lib.cmidFromHref(link.href);
            if (!m || !cmid) continue;
            rows.push({th, userId: m[1], cmid, title: th.querySelector('.rowtitle') || link.parentElement});
        }
        return rows;
    }

    const rows = findRows();
    if (!rows.length) return;

    async function overridesFor(cmid, refresh) {
        const key = `moodlePalette-quizOverrides-${cmid}`;
        if (!refresh) {
            try {
                const cached = JSON.parse(sessionStorage.getItem(key));
                if (cached && Date.now() - cached.t < CACHE_MS) return new Map(cached.entries);
            } catch { /* ignore bad cache */ }
        }
        const map = await lib.loadQuizOverrides(cmid);
        try {
            sessionStorage.setItem(key, JSON.stringify({t: Date.now(), entries: [...map.entries()]}));
        } catch { /* storage full; fine */ }
        return map;
    }

    // ---------- UI ----------

    const bar = document.createElement('div');
    bar.className = 'mb-2 d-flex align-items-center';
    bar.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" data-act="toggle">Show quiz overrides</button>
      <button type="button" class="btn btn-link btn-sm" data-act="refresh" hidden>Refresh</button>
      <span class="small text-muted ml-2 ms-2" data-region="status"></span>`;
    (document.querySelector('.user-report-container') || rows[0].th.closest('table')).before(bar);
    const toggleBtn = bar.querySelector('[data-act="toggle"]');
    const refreshBtn = bar.querySelector('[data-act="refresh"]');
    const statusEl = bar.querySelector('[data-region="status"]');

    let shown = false;

    function clearBadges() {
        document.querySelectorAll('.mp-quiz-override').forEach(el => el.remove());
    }

    function badgeFor(row, ov) {
        const div = document.createElement('div');
        div.className = 'mp-quiz-override small mt-1';
        if (ov) {
            const a = document.createElement('a');
            a.className = 'badge bg-warning text-dark badge-warning mr-1 me-1';
            a.textContent = ov.active ? 'Override' : 'Override (inactive)';
            a.title = 'Edit override';
            a.href = ov.overrideId
                ? `/mod/quiz/overrideedit.php?id=${ov.overrideId}`
                : `/mod/quiz/overrides.php?cmid=${row.cmid}&mode=user`;
            const details = document.createElement('span');
            details.className = 'text-muted';
            details.textContent = ov.summary;
            div.append(a, details);
        } else {
            const a = document.createElement('a');
            a.className = 'text-muted';
            a.textContent = '+ override';
            a.title = 'Add a user override for this quiz';
            a.href = `/mod/quiz/overrideedit.php?action=adduser&cmid=${row.cmid}`;
            div.append(a);
        }
        return div;
    }

    async function show(refresh) {
        shown = true;
        localStorage.setItem(PREF_KEY, '1');
        toggleBtn.textContent = 'Hide quiz overrides';
        refreshBtn.hidden = false;
        clearBadges();

        const cmids = [...new Set(rows.map(r => r.cmid))];
        const byCmid = new Map();
        let done = 0, failed = 0;
        statusEl.textContent = `Loading overrides for ${cmids.length} quizzes…`;
        await lib.pool(cmids, 4, async cmid => {
            try {
                byCmid.set(cmid, await overridesFor(cmid, refresh));
            } catch (e) {
                failed++;
                console.warn('Moodle Palette: could not load overrides for quiz', cmid, e);
            }
            done++;
            statusEl.textContent = `Loading overrides… ${done}/${cmids.length}`;
        });
        if (!shown) return; // hidden while loading

        let count = 0;
        for (const row of rows) {
            const map = byCmid.get(row.cmid);
            if (!map) continue;
            const ov = map.get(row.userId);
            if (ov) count++;
            row.title.append(badgeFor(row, ov));
        }
        statusEl.textContent = `${count} override${count === 1 ? '' : 's'} shown` +
            (failed ? `; ${failed} quiz${failed === 1 ? '' : 'zes'} failed to load (see console)` : '');
    }

    function hide() {
        shown = false;
        localStorage.removeItem(PREF_KEY);
        toggleBtn.textContent = 'Show quiz overrides';
        refreshBtn.hidden = true;
        statusEl.textContent = '';
        clearBadges();
    }

    toggleBtn.addEventListener('click', () => (shown ? hide() : show(false)));
    refreshBtn.addEventListener('click', () => show(true));

    // Remember the choice: if overrides were shown last time, show them again.
    if (localStorage.getItem(PREF_KEY)) show(false);
})();
