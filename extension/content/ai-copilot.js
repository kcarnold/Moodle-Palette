// AI Copilot — AI-powered commands for the Moodle Palette.
// Two configurable AI profiles: one for instructor-written text, one for student-written text.
// Config stored in localStorage, dialog shown on first use or via palette command.

'use strict';

(function() {

    const STORAGE_KEY = 'moodle-palette-ai-config';

    const DEFAULT_CONFIG = {
        instructor: {
            endpoint: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-3.5-turbo',
            apiKey: '',
        },
        student: {
            endpoint: 'http://localhost:11434/v1/chat/completions',
            model: 'llama3.1:latest',
            apiKey: '',
        },
    };

    function loadConfig() {
        try {
            let stored = localStorage.getItem(STORAGE_KEY);
            if (stored) return JSON.parse(stored);
        } catch (_) {}
        return null;
    }

    function saveConfig(config) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }

    function getConfig() {
        return loadConfig() || DEFAULT_CONFIG;
    }

    // --- Config dialog ---

    const dialog = document.createElement('dialog');
    dialog.id = 'moodle-palette-ai-config';
    dialog.innerHTML = `
        <style>
            #moodle-palette-ai-config {
                font-family: system-ui, sans-serif;
                border: 1px solid #ccc;
                border-radius: 8px;
                padding: 1.5em;
                max-width: 500px;
                box-shadow: 0 4px 24px rgba(0,0,0,.2);
            }
            #moodle-palette-ai-config::backdrop {
                background: rgba(0,0,0,.3);
            }
            #moodle-palette-ai-config h3 { margin-top: 0; }
            #moodle-palette-ai-config h4 { margin: 1em 0 .3em; }
            #moodle-palette-ai-config label {
                display: block;
                margin-bottom: .5em;
                font-size: .9em;
            }
            #moodle-palette-ai-config label span {
                display: block;
                font-weight: 600;
                margin-bottom: .15em;
            }
            #moodle-palette-ai-config input {
                width: 100%;
                padding: .3em .5em;
                box-sizing: border-box;
            }
            #moodle-palette-ai-config .btn-row {
                display: flex;
                gap: .5em;
                justify-content: flex-end;
                margin-top: 1em;
            }
            #moodle-palette-ai-config button {
                padding: .4em 1em;
                border-radius: 4px;
                border: 1px solid #ccc;
                cursor: pointer;
            }
            #moodle-palette-ai-config button[value="save"] {
                background: #0073aa;
                color: #fff;
                border-color: #0073aa;
            }
            #moodle-palette-ai-config fieldset {
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: .75em;
                margin-bottom: .5em;
            }
            #moodle-palette-ai-config legend {
                font-weight: 600;
                font-size: .95em;
            }
        </style>
        <form method="dialog">
            <h3>AI Copilot Settings</h3>
            <p style="font-size:.85em;color:#666">Both use the OpenAI-compatible chat completions API format.</p>
            <fieldset>
                <legend>Instructor-written text (e.g., Get Confusions)</legend>
                <label><span>API Endpoint</span><input name="instructor-endpoint"></label>
                <label><span>Model</span><input name="instructor-model"></label>
                <label><span>API Key <small>(blank if not needed)</small></span><input name="instructor-apiKey" type="password"></label>
            </fieldset>
            <fieldset>
                <legend>Student-written text (e.g., Clarify Posts)</legend>
                <label><span>API Endpoint</span><input name="student-endpoint"></label>
                <label><span>Model</span><input name="student-model"></label>
                <label><span>API Key <small>(blank if not needed)</small></span><input name="student-apiKey" type="password"></label>
            </fieldset>
            <div class="btn-row">
                <button type="submit" value="cancel">Cancel</button>
                <button type="submit" value="save">Save</button>
            </div>
        </form>
    `;
    document.body.appendChild(dialog);

    const configForm = dialog.querySelector('form');

    function populateDialog(config) {
        for (let profile of ['instructor', 'student']) {
            for (let field of ['endpoint', 'model', 'apiKey']) {
                configForm.querySelector(`[name="${profile}-${field}"]`).value = config[profile][field];
            }
        }
    }

    function readDialog() {
        let config = { instructor: {}, student: {} };
        for (let profile of ['instructor', 'student']) {
            for (let field of ['endpoint', 'model', 'apiKey']) {
                config[profile][field] = configForm.querySelector(`[name="${profile}-${field}"]`).value.trim();
            }
        }
        return config;
    }

    function openConfigDialog() {
        populateDialog(getConfig());
        dialog.showModal();
    }

    // Returns a promise that resolves with the config (or null if cancelled)
    function openConfigDialogAsync() {
        return new Promise(resolve => {
            openConfigDialog();
            dialog.addEventListener('close', function handler() {
                dialog.removeEventListener('close', handler);
                if (dialog.returnValue === 'save') {
                    let config = readDialog();
                    saveConfig(config);
                    resolve(config);
                } else {
                    resolve(null);
                }
            });
        });
    }

    // Get a profile config, prompting if not yet configured
    async function ensureProfile(profileName) {
        let config = getConfig();
        let profile = config[profileName];
        if (profile.endpoint && profile.model) return profile;
        // Need configuration
        config = await openConfigDialogAsync();
        if (!config) return null;
        return config[profileName];
    }

    // --- Shared API call ---

    async function chatComplete(profile, messages) {
        let headers = { 'Content-Type': 'application/json' };
        if (profile.apiKey) {
            headers['Authorization'] = `Bearer ${profile.apiKey}`;
        }
        let resp = await fetch(profile.endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: profile.model,
                messages,
                temperature: 0.7,
                max_tokens: 2048,
                stream: false,
            }),
        });
        let data = await resp.json();
        return data.choices[0].message.content;
    }

    // --- Commands ---

    async function getConfusions() {
        let profile = await ensureProfile('instructor');
        if (!profile) return;

        let results = document.createElement('div');
        Object.assign(results.style, {
            position: 'fixed', top: '0', right: '0',
            width: '25%', height: '25%',
            backgroundColor: 'white', zIndex: '10000',
            overflow: 'scroll', padding: '1em',
            border: '1px solid black', boxShadow: '0 0 10px black',
            fontSize: 'small', whiteSpace: 'pre-wrap',
        });

        let closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        Object.assign(closeBtn.style, { position: 'absolute', top: '0', right: '0' });
        closeBtn.addEventListener('click', () => results.remove());
        results.appendChild(closeBtn);
        document.body.appendChild(results);

        let text = prompt('Instructions?');
        if (!text) { results.remove(); return; }

        results.textContent = 'Thinking...';
        try {
            let response = await chatComplete(profile, [
                { role: 'system', content: 'What clarification questions might students have about these instructions?' },
                { role: 'user', content: text },
            ]);
            results.textContent = response;
        } catch (err) {
            results.textContent = `Error: ${err.message}`;
        }
    }

    async function clarifyDiscussionPosts() {
        let profile = await ensureProfile('student');
        if (!profile) return;

        let contentContainers = document.querySelectorAll('.post-content-container');
        for (let contentContainer of contentContainers) {
            let origHTML = contentContainer.innerHTML;
            let content = contentContainer.textContent;

            try {
                let message = await chatComplete(profile, [
                    { role: 'system', content: 'Insert paragraph breaks in the following text. Also, bold any names mentioned. Include just the result, no explanation.' },
                    { role: 'user', content: content },
                ]);

                // Simple markdown-to-HTML: bold and paragraphs
                let rendered = message
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .split(/\n{2,}/)
                    .map(p => `<p>${p}</p>`)
                    .join('');
                contentContainer.innerHTML = rendered;

                let details = document.createElement('details');
                let summary = document.createElement('summary');
                summary.textContent = 'Original content';
                details.appendChild(summary);
                let div = document.createElement('div');
                div.innerHTML = origHTML;
                details.appendChild(div);
                contentContainer.appendChild(details);
            } catch (err) {
                console.error('Clarify failed for post:', err);
            }
        }
    }

    // --- Registration ---

    const commands = [
        {
            id: 'AI',
            title: 'Moodle Copilot',
            children: ['AIConfusions', 'AIConfig'],
        },
        {
            id: 'AIConfusions',
            title: 'Get Confusions',
            parent: 'AI',
            handler: getConfusions,
        },
        {
            id: 'AIConfig',
            title: 'AI Settings',
            parent: 'AI',
            handler: openConfigDialog,
        },
        {
            id: 'ClarifyPosts',
            title: 'Clarify posts using local AI',
            handler: clarifyDiscussionPosts,
        },
    ];

    if (window.moodlePalette && window.moodlePalette.register) {
        window.moodlePalette.register(commands);
    } else {
        window.moodlePalette = window.moodlePalette || {};
        (window.moodlePalette._queue = window.moodlePalette._queue || []).push(commands);
    }

})();
