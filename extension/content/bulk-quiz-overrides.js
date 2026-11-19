// Bulk Quiz Overrides — on a quiz's "user override" edit page, offer to apply
// the same override to other quizzes in the course.
//
// How it works (no quiz-instance IDs or web services needed):
//   - Quiz list: scraped from /mod/quiz/index.php?id=COURSE.
//   - Existing overrides for the student: scraped from each quiz's
//     /mod/quiz/overrides.php?cmid=X&mode=user page.
//   - Student attempts: scraped from the per-user "complete report"
//     (/report/outline/user.php?mode=complete), one fetch for the whole course.
//   - Applying: for each target quiz, GET that quiz's own override form
//     (adduser, or edit if the student already has an override there), replace
//     only the fields you chose to copy with the values from this page's form,
//     and POST it exactly as the browser would. Every other field keeps the
//     target quiz's own default, so e.g. this quiz's open date or password is
//     never copied by accident.

(() => {
    if (window.location.pathname !== '/mod/quiz/overrideedit.php') return;

    const form = [...document.querySelectorAll('form')].find(f =>
        f.querySelector('input[name^="_qf__"][name*="override"]'));
    if (!form) return;
    // Only user overrides, not group overrides.
    if (!form.querySelector('[name="userid"]')) return;

    const SETTINGS = [
        {key: 'timeopen', label: 'Open the quiz'},
        {key: 'timeclose', label: 'Close the quiz'},
        {key: 'timelimit', label: 'Time limit'},
        {key: 'attempts', label: 'Attempts allowed'},
        {key: 'password', label: 'Password'},
    ];

    const courseId = window.M?.cfg?.courseId;
    let thisCmid = null;
    document.body.classList.forEach(c => {
        const m = /^cmid-(\d+)$/.exec(c);
        if (m) thisCmid = m[1];
    });

    // Snapshot of the form as first rendered, to figure out which fields the user changed.
    // (Reads element state directly, ignoring `disabled`, because Moodle's JS toggles
    // disabled on date sub-fields and may not have run yet.)
    const initialEntries = settingSnapshot();

    function settingSnapshot() {
        const out = {};
        for (const {key} of SETTINGS) {
            out[key] = [...form.elements]
                .filter(el => el.name === key || el.name?.startsWith(key + '['))
                .filter(el => el.type !== 'button' && el.type !== 'submit')
                .map(el => `${el.name}=${el.type === 'checkbox' ? el.checked : el.value}`)
                .sort().join('&');
        }
        return out;
    }

    function currentUserId() {
        return new FormData(form).get('userid') || '';
    }

    function currentUserLabel() {
        const sel = form.querySelector('select[name="userid"]');
        if (sel && sel.selectedOptions.length) return sel.selectedOptions[0].textContent.trim();
        // Frozen (edit mode): label is rendered as static text.
        const frozen = form.querySelector('#fitem_id_userid [data-fieldtype="static"], #fitem_id_userid .form-control-static');
        return frozen ? frozen.textContent.trim() : `user ${currentUserId()}`;
    }

    // ---------- fetching helpers ----------

    async function fetchDoc(url) {
        const res = await fetch(url, {credentials: 'include'});
        if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        // Make relative links (e.g. "view.php?id=123" on the quiz index) resolve
        // against the fetched page, so a.href gives the absolute URL.
        if (!doc.querySelector('base')) {
            const base = doc.createElement('base');
            base.href = res.url;
            doc.head.prepend(base);
        }
        return {doc, res};
    }

    async function pool(items, limit, fn) {
        let i = 0;
        const workers = Array.from({length: Math.min(limit, items.length)}, async () => {
            while (i < items.length) {
                const item = items[i++];
                await fn(item);
            }
        });
        await Promise.all(workers);
    }

    // Pass an absolute URL (a.href on a fetched doc, which has a <base>).
    function cmidFromHref(href) {
        try {
            const u = new URL(href);
            if (!u.pathname.endsWith('/mod/quiz/view.php')) return null;
            return u.searchParams.get('id');
        } catch { return null; }
    }

    function findQuizLink(el) {
        return [...el.querySelectorAll('a[href]')].find(a => cmidFromHref(a.href));
    }

    async function loadQuizList() {
        const {doc} = await fetchDoc(`/mod/quiz/index.php?id=${courseId}`);
        const table = doc.querySelector('table.generaltable') || doc.querySelector('table');
        if (!table) return [];
        const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim().toLowerCase());
        const closeIdx = headers.findIndex(h => h.includes('close'));
        const quizzes = [];
        let section = '';
        for (const tr of table.querySelectorAll('tbody tr')) {
            const cells = [...tr.children];
            const link = findQuizLink(tr);
            if (!link) continue;
            const sec = cells[0]?.textContent.trim();
            if (sec && !cells[0].contains(link)) section = sec;
            quizzes.push({
                cmid: cmidFromHref(link.href),
                name: link.textContent.trim(),
                section,
                closes: closeIdx >= 0 ? (cells[closeIdx]?.textContent.trim() || '') : '',
                hidden: link.classList.contains('dimmed') || tr.classList.contains('dimmed_text'),
            });
        }
        return quizzes;
    }

    // Returns Map cmid -> summary string of the student's attempts.
    async function loadAttempts(userId) {
        const {doc} = await fetchDoc(`/report/outline/user.php?id=${userId}&course=${courseId}&mode=complete`);
        const result = new Map();
        for (const h4 of doc.querySelectorAll('h4')) {
            const link = findQuizLink(h4);
            if (!link) continue;
            const cmid = cmidFromHref(link.href);
            let text = '';
            for (let el = h4.nextElementSibling; el && el.tagName !== 'H4'; el = el.nextElementSibling) {
                text += ' ' + el.textContent;
            }
            text = text.replace(/\s+/g, ' ').trim();
            const attempts = text.match(/Attempt \d+:[^]*?(?=Attempt \d+:|$)/g) || [];
            result.set(cmid, {count: attempts.length, detail: attempts.map(a => a.trim()).join('\n') || text});
        }
        return result;
    }

    // Returns {overrideId, summary} or null.
    async function loadExistingOverride(cmid, userId) {
        const {doc} = await fetchDoc(`/mod/quiz/overrides.php?cmid=${cmid}&mode=user`);
        for (const a of doc.querySelectorAll('a[href*="/user/view.php"]')) {
            const u = new URL(a.href);
            if (u.searchParams.get('id') !== String(userId)) continue;
            const firstRow = a.closest('tr');
            if (!firstRow) continue;
            const span = parseInt(a.closest('td')?.getAttribute('rowspan') || '1', 10);
            const rows = [firstRow];
            for (let r = firstRow.nextElementSibling; r && rows.length < span; r = r.nextElementSibling) rows.push(r);
            const parts = rows.map(r => [...r.querySelectorAll('td:not([rowspan])')]
                .map(td => td.textContent.trim()).join(': '));
            const edit = [...firstRow.querySelectorAll('a[href*="overrideedit.php"]')]
                .map(e => new URL(e.href))
                .find(e => !e.searchParams.get('action') && e.searchParams.get('id'));
            return {overrideId: edit?.searchParams.get('id') || null, summary: parts.join('; ')};
        }
        return null;
    }

    // ---------- dates ----------
    //
    // Date arithmetic is done on wall-clock components (treated as if UTC), so
    // shifting by whole days never drifts by an hour across a DST change.

    const DATE_KEYS = ['timeopen', 'timeclose'];
    const DATE_PARTS = ['year', 'month', 'day', 'hour', 'minute'];

    // Read a date_time_selector from a form (live or fetched). Returns
    // {enabled, wall} where wall is ms of the wall-clock time treated as UTC, or null.
    function readDate(f, key) {
        const el = n => f.querySelector(`[name="${key}[${n}]"]`);
        const enabledBox = f.querySelector(`input[type="checkbox"][name="${key}[enabled]"]`);
        const [y, mo, d, h, mi] = DATE_PARTS.map(n => parseInt(el(n)?.value, 10));
        if ([y, mo, d, h, mi].some(Number.isNaN)) return null;
        return {enabled: enabledBox ? enabledBox.checked : true, wall: Date.UTC(y, mo - 1, d, h, mi)};
    }

    function writeDate(fd, key, wall) {
        for (const name of [...new Set(fd.keys())]) {
            if (name === key || name.startsWith(key + '[')) fd.delete(name);
        }
        const t = new Date(wall);
        const vals = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes()];
        DATE_PARTS.forEach((n, i) => fd.append(`${key}[${n}]`, String(vals[i])));
        fd.append(`${key}[enabled]`, '1');
    }

    const fmtWall = wall => new Intl.DateTimeFormat(undefined, {
        timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date(wall));

    const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
        'september', 'october', 'november', 'december'];
    // Parse e.g. "Saturday, September 12, 2026, 11:59 PM" (quiz index, English). Preview only.
    function parseIndexDate(text) {
        const m = /([A-Za-z]+) (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2}) ?(AM|PM)/i.exec(text || '');
        if (!m) return null;
        const mo = MONTHS.indexOf(m[1].toLowerCase());
        if (mo < 0) return null;
        let h = parseInt(m[4], 10) % 12;
        if (m[6].toUpperCase() === 'PM') h += 12;
        return Date.UTC(+m[3], mo, +m[2], h, +m[5]);
    }

    function findOverrideForm(doc) {
        return [...doc.querySelectorAll('form')].find(f =>
            f.querySelector('input[name^="_qf__"][name*="override"]'));
    }

    // The quiz's own (non-overridden) settings, via the override form with reset=1.
    // reset=1 only changes which values pre-fill the form; a GET never saves anything.
    async function fetchQuizDefaults(formUrl) {
        const u = new URL(formUrl, location.origin);
        u.searchParams.set('reset', '1');
        const {doc} = await fetchDoc(u.pathname + u.search);
        const f = findOverrideForm(doc);
        if (!f) throw new Error('Could not load quiz defaults');
        return Object.fromEntries(DATE_KEYS.map(k => [k, readDate(f, k)]));
    }

    let sourceDefaultsPromise = null;
    function sourceDefaults() {
        // This page's URL (add, edit, or duplicate) with reset=1 gives this quiz's own dates.
        sourceDefaultsPromise ??= fetchQuizDefaults(location.pathname + location.search);
        return sourceDefaultsPromise;
    }

    // ---------- applying ----------

    // plan = {keys: [...settings to copy], shifts: {timeclose: minutes, ...}}
    // A date key with an entry in shifts is shifted from the target quiz's own date
    // instead of copied.
    async function applyToQuiz(quiz, userId, plan, existing) {
        const formUrl = existing?.overrideId
            ? `/mod/quiz/overrideedit.php?id=${existing.overrideId}`
            : `/mod/quiz/overrideedit.php?action=adduser&cmid=${quiz.cmid}`;
        const {doc} = await fetchDoc(formUrl);
        const targetForm = findOverrideForm(doc);
        if (!targetForm) {
            const err = doc.querySelector('.errorbox, .alert-danger');
            throw new Error(err ? err.textContent.trim() : 'Could not find override form');
        }

        // Base dates for shifting: the target quiz's own dates. For a new override the
        // adduser form already shows them; for an existing one, ask for the reset form.
        const shiftKeys = plan.keys.filter(k => plan.shifts[k] !== undefined);
        let targetDefaults = null;
        if (shiftKeys.length) {
            targetDefaults = existing?.overrideId
                ? await fetchQuizDefaults(formUrl)
                : Object.fromEntries(DATE_KEYS.map(k => [k, readDate(targetForm, k)]));
            for (const k of shiftKeys) {
                const base = targetDefaults[k];
                if (!base || !base.enabled) {
                    throw new Error(`This quiz has no ${k === 'timeclose' ? 'close' : 'open'} date to shift`);
                }
            }
        }

        const fd = new FormData(targetForm);
        if (!existing?.overrideId) {
            const opt = targetForm.querySelector(`select[name="userid"] option[value="${CSS.escape(String(userId))}"]`);
            if (!opt) throw new Error('Student not selectable on this quiz (already has an override, or not eligible)');
            fd.set('userid', userId);
        }

        const source = new FormData(form);
        for (const key of plan.keys) {
            if (plan.shifts[key] !== undefined) {
                writeDate(fd, key, targetDefaults[key].wall + plan.shifts[key] * 60000);
                continue;
            }
            const match = name => name === key || name.startsWith(key + '[');
            for (const name of [...new Set([...fd.keys()])]) if (match(name)) fd.delete(name);
            for (const [name, value] of source.entries()) if (match(name)) fd.append(name, value);
        }
        // Make sure no stray button values are present, then press "Save".
        for (const b of ['againbutton', 'resetbutton', 'cancel']) fd.delete(b);
        fd.set('submitbutton', targetForm.querySelector('[name="submitbutton"]')?.value || 'Save');

        const action = new URL(targetForm.getAttribute('action') || formUrl, location.origin + '/mod/quiz/');
        const res = await fetch(action, {
            method: 'POST',
            credentials: 'include',
            body: new URLSearchParams([...fd.entries()]),
        });
        if (res.redirected && new URL(res.url).pathname.endsWith('/mod/quiz/overrides.php')) {
            return 'saved';
        }
        const respDoc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const errors = [...respDoc.querySelectorAll('.invalid-feedback, .error, .errorbox, .alert-danger')]
            .map(e => e.textContent.trim()).filter(Boolean);
        throw new Error(errors.join(' | ') || `Unexpected response (${res.status} ${res.url})`);
    }


    // ---------- UI ----------

    const panel = document.createElement('div');
    panel.className = 'card mt-4';
    panel.innerHTML = `
      <div class="card-body">
        <h3 class="h5 card-title">Also apply this override to other quizzes</h3>
        <button type="button" class="btn btn-secondary" data-act="open">Show other quizzes…</button>
        <div data-region="bqo-body" hidden>
          <p class="text-muted small mb-2">
            Checked settings are applied to each selected quiz; unchecked settings keep that quiz's
            own defaults (or its existing override). Dates can be copied exactly or shifted relative to
            each quiz's own date. Saving the form above is separate; remember to save it too.
          </p>
          <div class="mb-2"><strong>Student:</strong> <span data-region="bqo-user"></span></div>
          <div class="mb-2" data-region="bqo-settings"></div>
          <div class="mb-2">
            Select:
            <button type="button" class="btn btn-link btn-sm p-0" data-act="all">all</button> ·
            <button type="button" class="btn btn-link btn-sm p-0" data-act="none">none</button> ·
            <button type="button" class="btn btn-link btn-sm p-0" data-act="noattempt">all without attempts</button> ·
            <button type="button" class="btn btn-link btn-sm p-0" data-act="refresh">refresh status</button>
          </div>
          <div style="max-height: 60vh; overflow: auto;">
            <table class="table table-sm table-hover generaltable">
              <thead><tr><th></th><th>Quiz</th><th>Closes</th><th>Attempts</th><th>Existing override</th><th>Result</th></tr></thead>
              <tbody data-region="bqo-rows"></tbody>
            </table>
          </div>
          <button type="button" class="btn btn-primary" data-act="apply">Apply to selected quizzes</button>
          <span class="ml-2 ms-2" data-region="bqo-status"></span>
        </div>
      </div>`;
    form.after(panel);

    const $ = sel => panel.querySelector(sel);
    const settingsDiv = $('[data-region="bqo-settings"]');
    const rowsBody = $('[data-region="bqo-rows"]');
    const statusEl = $('[data-region="bqo-status"]');
    const userEl = $('[data-region="bqo-user"]');

    let quizzes = [];
    const rowState = new Map(); // cmid -> {quiz, tr, cb, closesTd, attemptsTd, existingTd, resultTd, ...}
    let loadedForUser = null;

    // ----- settings controls -----

    const settingUI = {}; // key -> {row, checkbox, badge, touched, mode radios, offset inputs, ...}
    let srcDefaults = null; // this quiz's own dates, once loaded

    function fmtOffset(min) {
        const sign = min < 0 ? '−' : '+';
        let m = Math.abs(min);
        const d = Math.floor(m / 1440); m -= d * 1440;
        const h = Math.floor(m / 60); m -= h * 60;
        const parts = [];
        if (d) parts.push(`${d} day${d === 1 ? '' : 's'}`);
        if (h) parts.push(`${h} h`);
        if (m) parts.push(`${m} min`);
        return sign + (parts.join(' ') || '0');
    }

    function buildSettings() {
        settingsDiv.innerHTML = '<strong>Apply these settings:</strong>';
        for (const {key, label} of SETTINGS) {
            const row = document.createElement('div');
            row.className = 'ml-3 ms-3 my-1';
            row.innerHTML = `
              <label class="mb-0"><input type="checkbox" data-key="${key}"> ${label}</label>
              <span data-region="badge"></span>`;
            const ui = {row, checkbox: row.querySelector('input'), badge: row.querySelector('[data-region="badge"]'),
                touched: false};
            ui.checkbox.addEventListener('change', () => { ui.touched = true; updateSettings(); });

            if (DATE_KEYS.includes(key)) {
                row.insertAdjacentHTML('beforeend', `
                  <div class="ml-4 ms-4 small">
                    <label class="mb-0 mr-2 me-2"><input type="radio" name="bqo-mode-${key}" value="exact"> exact date from the form</label>
                    <label class="mb-0"><input type="radio" name="bqo-mode-${key}" value="shift"> shift each quiz's own date by</label>
                    <input type="number" data-part="days" style="width:4.5em" value="0"> days
                    <input type="number" data-part="hours" style="width:4em" value="0"> h
                    <input type="number" data-part="minutes" style="width:4em" value="0"> min
                    <button type="button" class="btn btn-link btn-sm p-0 ml-1 ms-1" data-region="fromform">use the form's change</button>
                    <div class="text-muted" data-region="hint"></div>
                    <div class="text-danger" data-region="warn"></div>
                  </div>`);
                ui.modeTouched = false;
                ui.manualOffset = false;
                ui.radios = [...row.querySelectorAll('input[type="radio"]')];
                ui.parts = Object.fromEntries([...row.querySelectorAll('[data-part]')].map(el => [el.dataset.part, el]));
                ui.hint = row.querySelector('[data-region="hint"]');
                ui.warn = row.querySelector('[data-region="warn"]');
                ui.radios.forEach(r => r.addEventListener('change', () => { ui.modeTouched = true; updateSettings(); }));
                Object.values(ui.parts).forEach(el => el.addEventListener('input', () => {
                    ui.manualOffset = true;
                    ui.radios.find(r => r.value === 'shift').checked = true;
                    ui.modeTouched = true;
                    updateSettings();
                }));
                row.querySelector('[data-region="fromform"]').addEventListener('click', () => {
                    ui.manualOffset = false;
                    updateSettings();
                });
            }
            settingUI[key] = ui;
            settingsDiv.append(row);
        }
    }

    function modeOf(key) {
        return settingUI[key].radios?.find(r => r.checked)?.value || 'exact';
    }

    function offsetMinutes(key) {
        const p = settingUI[key].parts;
        const n = el => parseInt(el.value, 10) || 0;
        return n(p.days) * 1440 + n(p.hours) * 60 + n(p.minutes);
    }

    function setOffset(key, min) {
        const p = settingUI[key].parts;
        const sign = min < 0 ? -1 : 1;
        let m = Math.abs(min);
        const d = Math.floor(m / 1440); m -= d * 1440;
        const h = Math.floor(m / 60); m -= h * 60;
        p.days.value = sign * d; p.hours.value = sign * h; p.minutes.value = sign * m;
    }

    function updateSettings() {
        const now = settingSnapshot();
        for (const {key, label} of SETTINGS) {
            const ui = settingUI[key];
            const changed = now[key] !== initialEntries[key];
            ui.badge.innerHTML = changed ? '<span class="badge bg-info badge-info">changed</span>' : '';
            if (!ui.touched) ui.checkbox.checked = changed;
            if (!DATE_KEYS.includes(key)) continue;

            const cur = readDate(form, key);
            const base = srcDefaults?.[key];
            const what = key === 'timeclose' ? 'close' : 'open';
            let delta = null;
            if (!srcDefaults) {
                ui.hint.textContent = 'Loading this quiz\'s own dates…';
            } else if (!base || !base.enabled) {
                ui.hint.textContent = `This quiz has no ${what} date of its own, so the shift can't be worked out from the form; type it in.`;
            } else if (!cur || !cur.enabled) {
                ui.hint.textContent = `This quiz's own ${what} date: ${fmtWall(base.wall)}.`;
            } else {
                delta = Math.round((cur.wall - base.wall) / 60000);
                ui.hint.textContent = `In the form: ${fmtWall(base.wall)} → ${fmtWall(cur.wall)} (${fmtOffset(delta)}).`;
            }
            if (delta !== null && !ui.manualOffset) setOffset(key, delta);
            if (!ui.modeTouched) {
                ui.radios.find(r => r.value === (delta !== null && delta !== 0 ? 'shift' : 'exact')).checked = true;
            }

            ui.warn.textContent = (ui.checkbox.checked && modeOf(key) === 'exact' && cur && !cur.enabled)
                ? `The ${what} date is unchecked in the form. Moodle treats an unchecked date as "no override" ` +
                  `(each quiz keeps its own ${what} date); it cannot remove a ${what} date. ` +
                  (what === 'close' ? 'To effectively remove it, set a close date far in the future.' : '')
                : '';
        }
        updatePreviews();
    }

    function selectedKeys() {
        return SETTINGS.map(s => s.key).filter(k => settingUI[k].checkbox.checked);
    }

    function currentPlan() {
        const keys = selectedKeys();
        const shifts = {};
        for (const k of keys) {
            if (DATE_KEYS.includes(k) && modeOf(k) === 'shift') shifts[k] = offsetMinutes(k);
        }
        return {keys, shifts};
    }

    function describePlan(plan) {
        return SETTINGS.filter(s => plan.keys.includes(s.key)).map(s =>
            plan.shifts[s.key] !== undefined ? `${s.label} (shift ${fmtOffset(plan.shifts[s.key])})` : s.label,
        ).join(', ');
    }

    // ----- quiz table -----

    function cell(text, title) {
        const td = document.createElement('td');
        td.textContent = text;
        if (title) td.title = title;
        return td;
    }

    function updatePreviews() {
        const plan = currentPlan();
        const cur = readDate(form, 'timeclose');
        for (const s of rowState.values()) {
            const base = parseIndexDate(s.quiz.closes);
            const orig = base !== null ? fmtWall(base) : (s.quiz.closes || '(none)');
            s.closesTd.className = '';
            if (s.isThis || !plan.keys.includes('timeclose')) {
                s.closesTd.textContent = orig;
            } else if (plan.shifts.timeclose !== undefined) {
                if (base === null) {
                    s.closesTd.textContent = `${orig} (no close date to shift; will fail)`;
                    s.closesTd.className = 'text-danger';
                } else {
                    s.closesTd.textContent = `${orig} → ${fmtWall(base + plan.shifts.timeclose * 60000)}`;
                }
            } else {
                s.closesTd.textContent = cur && cur.enabled ? `${orig} → ${fmtWall(cur.wall)}` : orig;
            }
        }
    }

    function renderRows() {
        rowsBody.innerHTML = '';
        rowState.clear();
        let lastSection = null;
        for (const q of quizzes) {
            if (q.section && q.section !== lastSection) {
                lastSection = q.section;
                const tr = document.createElement('tr');
                tr.innerHTML = `<th colspan="6" class="bg-light"></th>`;
                tr.firstChild.textContent = q.section;
                rowsBody.append(tr);
            }
            const tr = document.createElement('tr');
            const cbTd = document.createElement('td');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cbTd.append(cb);
            const isThis = q.cmid === thisCmid;
            if (isThis) { cb.disabled = true; tr.classList.add('table-secondary'); }
            const nameTd = cell(q.name + (isThis ? ' (this quiz)' : '') + (q.hidden ? ' (hidden)' : ''));
            const closesTd = cell(q.closes);
            const attemptsTd = cell('…');
            const existingTd = cell('…');
            const resultTd = cell('');
            tr.append(cbTd, nameTd, closesTd, attemptsTd, existingTd, resultTd);
            rowsBody.append(tr);
            rowState.set(q.cmid, {quiz: q, tr, cb, closesTd, attemptsTd, existingTd, resultTd, isThis});
        }
        updatePreviews();
    }

    async function loadStatus() {
        const userId = currentUserId();
        userEl.textContent = userId ? currentUserLabel() : '(select a user in the form above)';
        loadedForUser = userId;
        for (const s of rowState.values()) {
            s.attemptsTd.textContent = userId ? '…' : '';
            s.existingTd.textContent = userId ? '…' : '';
            s.existing = undefined; s.attempts = undefined;
        }
        if (!userId) return;

        loadAttempts(userId).then(map => {
            if (loadedForUser !== userId) return;
            for (const s of rowState.values()) {
                const a = map.get(s.quiz.cmid);
                s.attempts = a ? a.count : null;
                s.attemptsTd.textContent = a ? String(a.count) : '?';
                s.attemptsTd.title = a ? a.detail : 'Not listed in the student\'s complete report (hidden from them?)';
                if (a && a.count > 0) s.attemptsTd.classList.add('font-weight-bold', 'fw-bold');
            }
        }).catch(e => {
            for (const s of rowState.values()) { s.attemptsTd.textContent = '!'; s.attemptsTd.title = e.message; }
        });

        await pool([...rowState.values()], 4, async s => {
            try {
                const ex = await loadExistingOverride(s.quiz.cmid, userId);
                if (loadedForUser !== userId) return;
                s.existing = ex;
                s.existingTd.textContent = ex ? ex.summary : '—';
            } catch (e) {
                s.existingTd.textContent = '!';
                s.existingTd.title = e.message;
            }
        });
    }

    async function openPanel() {
        $('[data-act="open"]').hidden = true;
        $('[data-region="bqo-body"]').hidden = false;
        buildSettings();
        updateSettings();
        form.addEventListener('change', updateSettings);
        form.addEventListener('input', updateSettings);
        sourceDefaults().then(d => { srcDefaults = d; updateSettings(); }).catch(e => {
            for (const k of DATE_KEYS) settingUI[k].hint.textContent = `Couldn't load this quiz's own dates: ${e.message}`;
        });

        statusEl.textContent = 'Loading quizzes…';
        try {
            quizzes = await loadQuizList();
        } catch (e) {
            statusEl.textContent = `Failed to load quiz list: ${e.message}`;
            return;
        }
        statusEl.textContent = '';
        renderRows();
        loadStatus();
        // The user selector and date fields may be changed by Moodle JS (jQuery events,
        // which don't reach native listeners), so poll as well.
        let lastSnap = JSON.stringify(settingSnapshot());
        setInterval(() => {
            if (currentUserId() !== loadedForUser) loadStatus();
            const snap = JSON.stringify(settingSnapshot());
            if (snap !== lastSnap) { lastSnap = snap; updateSettings(); }
        }, 750);
    }

    async function apply() {
        const userId = currentUserId();
        if (!userId) { statusEl.textContent = 'Select a user first.'; return; }
        const plan = currentPlan();
        if (!plan.keys.length) { statusEl.textContent = 'Choose at least one setting to apply.'; return; }
        const targets = [...rowState.values()].filter(s => s.cb.checked && !s.isThis);
        if (!targets.length) { statusEl.textContent = 'No quizzes selected.'; return; }
        const nUpdate = targets.filter(s => s.existing).length;
        if (!confirm(`Apply [${describePlan(plan)}] for ${currentUserLabel()} to ${targets.length} quizzes?` +
            (nUpdate ? `\n\n${nUpdate} of them already have an override for this student; those will be updated.` : ''))) return;

        const applyBtn = $('[data-act="apply"]');
        applyBtn.disabled = true;
        let ok = 0, failed = 0;
        for (const s of targets) {
            s.resultTd.textContent = 'saving…';
            s.resultTd.className = '';
            try {
                if (s.existing === undefined) s.existing = await loadExistingOverride(s.quiz.cmid, userId);
                await applyToQuiz(s.quiz, userId, plan, s.existing);
                s.resultTd.textContent = '✓ saved';
                s.resultTd.className = 'text-success';
                s.cb.checked = false;
                ok++;
                s.existing = await loadExistingOverride(s.quiz.cmid, userId).catch(() => s.existing);
                if (s.existing) s.existingTd.textContent = s.existing.summary;
            } catch (e) {
                s.resultTd.textContent = '✗ ' + e.message;
                s.resultTd.className = 'text-danger';
                failed++;
            }
            statusEl.textContent = `${ok} saved, ${failed} failed`;
        }
        applyBtn.disabled = false;
    }

    panel.addEventListener('click', e => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        const rows = [...rowState.values()].filter(s => !s.isThis);
        switch (act) {
            case 'open': openPanel(); break;
            case 'all': rows.forEach(s => s.cb.checked = true); break;
            case 'none': rows.forEach(s => s.cb.checked = false); break;
            case 'noattempt': rows.forEach(s => s.cb.checked = s.attempts === 0); break;
            case 'refresh': loadStatus(); break;
            case 'apply': apply(); break;
        }
    });
})();
