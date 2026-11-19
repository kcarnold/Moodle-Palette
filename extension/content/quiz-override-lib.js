// Shared helpers for the quiz-override content scripts
// (bulk-quiz-overrides.js, user-report-overrides.js).
// Loaded first in the same manifest entry; exposes window.moodlePaletteQuizOverrides.

(() => {
    if (window.moodlePaletteQuizOverrides) return;

    // Fetch a Moodle page and parse it. Adds a <base> so a.href on the parsed
    // document resolves relative links (e.g. "view.php?id=123") against that page.
    async function fetchDoc(url) {
        const res = await fetch(url, {credentials: 'include'});
        if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (!doc.querySelector('base')) {
            const base = doc.createElement('base');
            base.href = res.url;
            doc.head.prepend(base);
        }
        return {doc, res};
    }

    // Run fn over items with at most `limit` in flight.
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

    // Quiz cmid from an absolute URL to /mod/quiz/view.php?id=..., else null.
    function cmidFromHref(href) {
        try {
            const u = new URL(href, location.href);
            if (!u.pathname.endsWith('/mod/quiz/view.php')) return null;
            return u.searchParams.get('id');
        } catch { return null; }
    }

    // All user overrides on one quiz, from /mod/quiz/overrides.php?cmid=X&mode=user.
    // Returns Map userId(string) -> {overrideId, fields: [[label, value], ...], summary, active}.
    // The table puts the user cell (rowspan = number of overridden settings) and the
    // action icons in the first row; each row has one setting label + value cell.
    async function loadQuizOverrides(cmid) {
        const {doc} = await fetchDoc(`/mod/quiz/overrides.php?cmid=${cmid}&mode=user`);
        const result = new Map();
        for (const a of doc.querySelectorAll('td[rowspan] a[href*="/user/view.php"]')) {
            const userId = new URL(a.href).searchParams.get('id');
            const firstRow = a.closest('tr');
            if (!userId || !firstRow || result.has(userId)) continue;
            const span = parseInt(a.closest('td').getAttribute('rowspan') || '1', 10);
            const rows = [firstRow];
            for (let r = firstRow.nextElementSibling; r && rows.length < span; r = r.nextElementSibling) rows.push(r);
            const fields = rows.map(r => [...r.querySelectorAll('td:not([rowspan])')].map(td => td.textContent.trim()))
                .filter(cells => cells.length >= 2)
                .map(cells => [cells[0], cells[1]]);
            const edit = [...firstRow.querySelectorAll('a[href*="overrideedit.php"]')]
                .map(e => new URL(e.href))
                .find(e => !e.searchParams.get('action') && e.searchParams.get('id'));
            result.set(userId, {
                overrideId: edit?.searchParams.get('id') || null,
                fields,
                summary: fields.map(([l, v]) => `${l}: ${v}`).join('; '),
                // Moodle appends '*' to the name when the override isn't currently active
                // (e.g. the user is no longer enrolled or can't attempt the quiz).
                active: !a.textContent.trim().endsWith('*'),
            });
        }
        return result;
    }

    window.moodlePaletteQuizOverrides = {fetchDoc, pool, cmidFromHref, loadQuizOverrides};
})();
