// CommandPalette: a small keyboard command palette with fuzzy search.
// Replaces ninja-keys; keeps the parts of its API we used:
//   palette.data = [{id, title, parent?, children?, keywords?, hotkey?, handler?(item), ...}]
//   palette.open({parent?}), palette.close()
// A handler may return {keepOpen: true} to leave the palette open.
// Items with children open a submenu. At the top level, typing searches every
// item; inside a submenu it searches that submenu's items only.
// Fuzzy matching and ranking come from fuzzysort (lib/fuzzysort.js, global `fuzzysort`).

(() => {
if (window.CommandPalette) return;

const MOD_ALIASES = {
    cmd: 'meta', command: 'meta', meta: 'meta', '⌘': 'meta',
    ctrl: 'ctrl', control: 'ctrl',
    alt: 'alt', option: 'alt', opt: 'alt', '⌥': 'alt',
    shift: 'shift', '⇧': 'shift',
};
const KEY_ALIASES = {esc: 'escape', return: 'enter', del: 'delete', space: ' '};

// "cmd+p,ctrl+p" -> [{meta: true, ctrl: false, alt: false, shift: false, key: 'p'}, ...]
function parseHotkey(spec) {
    return spec.split(',').map(s => s.trim()).filter(Boolean).map(combo => {
        const parsed = {meta: false, ctrl: false, alt: false, shift: false, key: null};
        for (const part of combo.toLowerCase().split('+')) {
            if (MOD_ALIASES[part]) parsed[MOD_ALIASES[part]] = true;
            else parsed.key = KEY_ALIASES[part] || part;
        }
        return parsed;
    });
}

// Matches on e.key (the character the user's layout types, so Dvorak works), not e.code
// (the QWERTY position). Caveat: on macOS, Option changes e.key (Option+N is '˜'),
// so avoid alt/option in hotkeys.
function comboMatches(combo, e) {
    if (e.metaKey !== combo.meta || e.ctrlKey !== combo.ctrl ||
        e.altKey !== combo.alt || e.shiftKey !== combo.shift) return false;
    return e.key.toLowerCase() === combo.key;
}

function hotkeyMatches(combos, e) {
    return combos.some(c => comboMatches(c, e));
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

function formatHotkey(spec) {
    const combo = parseHotkey(spec)[0];
    if (!combo) return '';
    const parts = [];
    if (combo.ctrl) parts.push(isMac ? '⌃' : 'Ctrl');
    if (combo.alt) parts.push(isMac ? '⌥' : 'Alt');
    if (combo.shift) parts.push(isMac ? '⇧' : 'Shift');
    if (combo.meta) parts.push(isMac ? '⌘' : 'Meta');
    parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
    return parts.join(isMac ? '' : '+');
}

const STYLE = `
:host { all: initial; }
dialog {
    padding: 0; border: none; border-radius: 10px;
    width: min(640px, calc(100vw - 32px));
    margin: 12vh auto auto auto;
    max-height: 70vh;
    background: #fff; color: #1d2125;
    box-shadow: 0 16px 48px rgba(0,0,0,.28);
    font: 15px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    overflow: hidden;
}
dialog[open] { display: flex; flex-direction: column; }
dialog::backdrop { background: rgba(0,0,0,.25); }
.crumbs { padding: 10px 16px 0; font-size: 12px; color: #6a737b; }
.crumbs span { cursor: pointer; }
.crumbs span:hover { text-decoration: underline; }
.crumbs .sep { cursor: default; text-decoration: none; padding: 0 4px; }
input {
    all: unset; box-sizing: border-box; width: 100%;
    padding: 12px 16px; font-size: 17px;
    border-bottom: 1px solid #e3e6e8;
}
input::placeholder { color: #8a9299; }
ul { list-style: none; margin: 0; padding: 6px 0; overflow-y: auto; flex: 1; }
li {
    display: flex; align-items: baseline; gap: 10px;
    padding: 7px 16px; cursor: pointer;
    border-left: 3px solid transparent;
}
li.selected { background: #eef3fb; border-left-color: #0f6cbf; }
.title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; }
.title mark { background: none; color: #0f6cbf; font-weight: 600; }
.context { color: #6a737b; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1 1 0; min-width: 0; }
.hint { color: #6a737b; font-size: 12px; white-space: nowrap; }
kbd { font: inherit; background: #f0f2f4; border-radius: 4px; padding: 1px 5px; }
.empty { padding: 14px 16px; color: #6a737b; }
footer {
    padding: 6px 16px; font-size: 11px; color: #8a9299;
    border-top: 1px solid #e3e6e8;
}
`;

class CommandPalette {
    constructor({openHotkey = 'cmd+k,ctrl+k', placeholder = 'Type a command or search…', maxResults = 50} = {}) {
        this.openCombos = parseHotkey(openHotkey);
        this.placeholder = placeholder;
        this.maxResults = maxResults;
        this._data = [];
        this._byId = new Map();
        this._itemHotkeys = [];
        this._root = undefined;   // id of the submenu being shown, or undefined for the top level
        this._matches = [];       // [{item, indexes}]
        this._selected = 0;

        this._buildDom();
        this._onGlobalKeydown = this._onGlobalKeydown.bind(this);
        window.addEventListener('keydown', this._onGlobalKeydown, true);
    }

    /* ---------- Public API ---------- */

    get data() { return this._data; }

    // Reassign (even to the same array) after mutating items, to re-index them.
    set data(items) {
        this._data = items;
        this._byId = new Map();
        for (const item of items) {
            if (item.id != null && !this._byId.has(item.id)) this._byId.set(item.id, item);
        }
        this._itemHotkeys = items
            .filter(item => item.hotkey)
            .map(item => ({item, combos: parseHotkey(item.hotkey)}));
        if (this.isOpen) this._refresh();
    }

    get isOpen() { return this._dialog.open; }

    open({parent} = {}) {
        if (!this.isOpen) this._dialog.showModal();
        this.setParent(parent);
        this._input.focus();
    }

    close() {
        if (this.isOpen) this._dialog.close();
    }

    setParent(parent) {
        this._root = parent || undefined;
        this._input.value = '';
        this._refresh();
    }

    /* ---------- DOM ---------- */

    _buildDom() {
        this.element = document.createElement('moodle-command-palette');
        const shadow = this.element.attachShadow({mode: 'open'});
        shadow.innerHTML = `
            <style>${STYLE}</style>
            <dialog aria-label="Command palette">
                <div class="crumbs" hidden></div>
                <input type="text" autocomplete="off" spellcheck="false" role="combobox"
                       aria-autocomplete="list" aria-controls="results" aria-expanded="true">
                <ul id="results" role="listbox"></ul>
                <footer>↑↓ move · ↵ select · ⌫ back · esc close</footer>
            </dialog>`;
        this._dialog = shadow.querySelector('dialog');
        this._crumbs = shadow.querySelector('.crumbs');
        this._input = shadow.querySelector('input');
        this._list = shadow.querySelector('ul');
        this._input.placeholder = this.placeholder;

        this._input.addEventListener('input', () => this._refresh());
        this._input.addEventListener('keydown', e => this._onInputKeydown(e));
        // Keep Moodle's own keyboard handlers from reacting to typing in the palette.
        for (const type of ['keydown', 'keyup', 'keypress']) {
            this._dialog.addEventListener(type, e => e.stopPropagation());
        }
        // Esc: the dialog fires 'cancel'; let it close normally.
        this._dialog.addEventListener('click', e => {
            if (e.target === this._dialog) this.close();   // click on the backdrop
        });
        this._list.addEventListener('mousemove', e => {
            const li = e.target.closest('li[data-index]');
            if (li) this._setSelected(+li.dataset.index, false);
        });
        this._list.addEventListener('click', e => {
            const li = e.target.closest('li[data-index]');
            if (li) this._choose(this._matches[+li.dataset.index]?.item);
        });

        (document.body || document.documentElement).appendChild(this.element);
    }

    /* ---------- Keyboard ---------- */

    _onGlobalKeydown(e) {
        if (hotkeyMatches(this.openCombos, e)) {
            e.preventDefault();
            e.stopPropagation();
            this.isOpen ? this.close() : this.open();
            return;
        }
        if (this.isOpen) return;
        for (const {item, combos} of this._itemHotkeys) {
            if (hotkeyMatches(combos, e)) {
                e.preventDefault();
                e.stopPropagation();
                this._runHandler(item);
                return;
            }
        }
    }

    _onInputKeydown(e) {
        const n = this._matches.length;
        if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
            e.preventDefault();
            if (n) this._setSelected((this._selected + 1) % n);
        } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
            e.preventDefault();
            if (n) this._setSelected((this._selected - 1 + n) % n);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            this._choose(this._matches[this._selected]?.item);
        } else if (e.key === 'Backspace' && this._input.value === '' && this._root !== undefined) {
            e.preventDefault();
            this.setParent(this._byId.get(this._root)?.parent);
        }
    }

    /* ---------- Search and rendering ---------- */

    _ancestors(item) {
        const path = [];
        const seen = new Set();
        let parentId = item.parent;
        while (parentId != null && !seen.has(parentId)) {
            seen.add(parentId);
            const parent = this._byId.get(parentId);
            if (!parent) break;
            path.unshift(parent);
            parentId = parent.parent;
        }
        return path;
    }

    _candidates() {
        const query = this._input.value.trim();
        if (this._root !== undefined) return this._data.filter(item => item.parent === this._root);
        if (query) return this._data;   // top level: search everything
        return this._data.filter(item => item.parent == null);
    }

    _refresh() {
        const query = this._input.value.trim();
        const candidates = this._candidates().filter(item => item.title);
        if (!query) {
            this._matches = candidates.map(item => ({item, indexes: []}));
        } else {
            const results = window.fuzzysort.go(query, candidates, {
                keys: ['title', 'keywords'],
                limit: this.maxResults,
                // fuzzysort's default threshold (.5) drops abbreviation matches
                // like "hw13" -> "Homework 13" (score ~.3). Keep every match; ranking handles order.
                threshold: 0,
            });
            this._matches = Array.from(results, r => ({item: r.obj, indexes: r[0]?.indexes || []}));
        }
        this._selected = 0;
        this._render();
    }

    _render() {
        // Breadcrumbs for the current submenu.
        this._crumbs.replaceChildren();
        const rootItem = this._root !== undefined ? this._byId.get(this._root) : null;
        this._crumbs.hidden = !rootItem;
        if (rootItem) {
            const trail = [{title: 'Home', id: undefined}, ...this._ancestors(rootItem), rootItem];
            trail.forEach((crumb, i) => {
                if (i > 0) {
                    const sep = document.createElement('span');
                    sep.className = 'sep';
                    sep.textContent = '›';
                    this._crumbs.append(sep);
                }
                const span = document.createElement('span');
                span.textContent = crumb.title;
                span.addEventListener('click', () => { this.setParent(crumb.id); this._input.focus(); });
                this._crumbs.append(span);
            });
        }

        const showContext = this._root === undefined && this._input.value.trim() !== '';
        const lis = this._matches.map(({item, indexes}, i) => {
            const li = document.createElement('li');
            li.dataset.index = i;
            li.setAttribute('role', 'option');

            const title = document.createElement('span');
            title.className = 'title';
            title.append(...highlight(item.title, indexes));
            li.append(title);

            const context = document.createElement('span');
            context.className = 'context';
            if (showContext) context.textContent = this._ancestors(item).map(a => a.title).join(' › ');
            li.append(context);

            const hint = document.createElement('span');
            hint.className = 'hint';
            if (item.hotkey) {
                const kbd = document.createElement('kbd');
                kbd.textContent = formatHotkey(item.hotkey);
                hint.append(kbd);
            }
            if (item.children?.length) hint.append(' ›');
            li.append(hint);
            return li;
        });
        if (lis.length) {
            this._list.replaceChildren(...lis);
        } else {
            const empty = document.createElement('li');
            empty.className = 'empty';
            empty.textContent = 'No matches';
            this._list.replaceChildren(empty);
        }
        this._setSelected(0);
    }

    _setSelected(index, scroll = true) {
        const prev = this._list.querySelector('li.selected');
        if (prev) {
            prev.classList.remove('selected');
            prev.removeAttribute('aria-selected');
        }
        this._selected = index;
        const li = this._list.querySelector(`li[data-index="${index}"]`);
        if (li) {
            li.classList.add('selected');
            li.setAttribute('aria-selected', 'true');
            if (scroll) li.scrollIntoView({block: 'nearest'});
        }
    }

    /* ---------- Actions ---------- */

    _choose(item) {
        if (!item) return;
        if (item.children?.length) {
            this.setParent(item.id);
        } else {
            this._input.value = '';
        }
        if (item.handler) {
            const result = this._runHandler(item);
            if (!result?.keepOpen) this.close();
        } else if (!item.children?.length) {
            this.close();
        }
    }

    _runHandler(item) {
        try {
            return item.handler(item);
        } catch (err) {
            console.error('Command palette handler failed:', item.title, err);
        }
    }
}

// Split text into nodes, wrapping matched character positions in <mark>.
function highlight(text, indexes) {
    if (!indexes.length) return [text];
    const marked = new Set(indexes);
    const nodes = [];
    let run = '', runMarked = false;
    const flush = () => {
        if (!run) return;
        if (runMarked) {
            const m = document.createElement('mark');
            m.textContent = run;
            nodes.push(m);
        } else {
            nodes.push(run);
        }
        run = '';
    };
    for (let i = 0; i < text.length; i++) {
        const isMarked = marked.has(i);
        if (isMarked !== runMarked) { flush(); runMarked = isMarked; }
        run += text[i];
    }
    flush();
    return nodes;
}

window.CommandPalette = CommandPalette;
})();
