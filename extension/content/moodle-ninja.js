// Moodle Ninja — Command palette for Moodle (Ctrl/Cmd+P)
// Ported from Tampermonkey userscript to browser extension.
// AI features (OpenAI, Ollama) removed for initial port.



// Abort if we're inside a tinymce editor.
if (!document.body.classList.contains('mce-content-body')) {
(() => {

    function addTree(parent, children) {
        if (!parent.children) parent.children = [];
        ninjaData.push(parent);
        children.forEach(c => {
            if (!c.id) c.id = c.title;
            c.parent = parent.id;
            parent.children.push(c.id);
            ninjaData.push(c);
        });
    }

    const searchParams = new URLSearchParams(document.location.search);
    let courseId;
    let activityDirectory = [];

    function getCourseId() {
        if (window.M && window.M.cfg && window.M.cfg.courseId) {
            return window.M.cfg.courseId;
        }
        const dataResult = document.querySelector('[data-courseid]');
        if (dataResult) {
            return dataResult.getAttribute('data-courseid');
        }
        // Find the course id by looking for a course nav link. (TODO: this feels fragile.)
        return new URL(document.querySelector('header a[href*="/course/view.php"]').href).searchParams.get('id');
    }

    if (window.location.pathname === '/course/view.php') {
        // Capture the activities for this course.
        courseId = searchParams.get('id');

        activityDirectory = [...document.querySelectorAll('li.section')].map(section => {
            const secId = section.getAttribute('id');
            const secTitle = section.dataset.sectionname.trim();
            const activities = [...section.querySelectorAll('ul.section > li.activity .activity-instance')].map(activityInstance => {
                if (!activityInstance) return;
                const titleElt = activityInstance.querySelector('.activityname');
                if (!titleElt) {
                    console.warn("OOPS, missing title", activityInstance);
                }
                const title = titleElt.querySelector('.instancename').textContent;
                const linkNode = titleElt.querySelector('a');
                if (!linkNode) {
                    console.warn("OOPS, missing link", activityInstance, title);
                }
                const url = linkNode.getAttribute('href');

                const activity = {title, url};
                if (/\/mod\/quiz\/view.php/.test(activity.url)) {
                    activity.type = 'quiz';
                } else if (/\/mod\/assign\/view.php/.test(activity.url)) {
                    activity.type = 'assign';
                } else if (/\/mod\/forum\/view.php/.test(activity.url)) {
                    activity.type = 'forum';
                }
                activity.id = new URL(activity.url).searchParams.get('id');
                return activity;
            });
            return {secId, secTitle, activities};
        });
        localStorage[`activities-${courseId}`] = JSON.stringify(activityDirectory);
    } else {
        courseId = getCourseId();
        const stored = localStorage[`activities-${courseId}`];
        if (stored) {
            activityDirectory = JSON.parse(stored);
        }
    }

    const activityDirectoryFlat = activityDirectory.flatMap(x => x.activities);

    // ninja-keys is loaded by content/load-ninja-keys.js (ISOLATED world, document_start).
    const ninja = document.createElement('ninja-keys');
    ninja.setAttribute('style', '--ninja-z-index: 1050;');
    ninja.setAttribute('openHotkey', "cmd+p,ctrl+p");
    document.body.appendChild(ninja);

    // Create the go-to-activity action hierarchy.
    function activityHandler(item) {
        window.location = item.url;
    }

    const ninjaData = [];
    const courseSections = [
        {title: "Course Home", handler: () => {window.location = `/course/view.php?id=${courseId}&perpage=5000`; }},
        {
            id: "Participants",
            title: "Course Participants",
            handler: () => {window.location = `/user/index.php?id=${courseId}`; }
        },
        {title: "Gradebook", handler: () => {window.location = `/grade/report/index.php?id=${courseId}`; }}
    ];
    (() => {
        let x;
        if (x = document.querySelector('a.editingbutton')) {
            courseSections.push({title: "Toggle Editing", handler: () => {x.click(); }})
        }
    })();

    addTree({id: "Sections", title: "Course Sections"}, courseSections);

    const activityItem = {id: "Act", title: "Activity", children: []};
    ninjaData.push(activityItem);
    activityDirectory.forEach(section => {
        const secId = section.secId;
        const children = section.activities.map(({title, url}) => ({
            id: title, title: title,
            parent: secId,
            url: url, handler: activityHandler
        }));
        activityItem.children.push(section.secId);
        ninjaData.push({id: section.secId, title: section.secTitle, parent: "Act", children: children.map(x => x.id)});
        children.forEach(child => {ninjaData.push(child);});
    });

    /* Course blocks */
    ninjaData.push({
        id: "CourseBlocks",
        title: "Course Blocks Open-Close",
        handler: () => {
            const btn = document.getElementById('blocksliderbutton');
            if (btn) {
                btn.click();
                btn.scrollIntoView();
            }
        }
    });

    /* Submission */
    ninjaData.push({
        id: "Submission",
        title: "Submission",
        children: ["Show File Uploads", "Save-Next", "Reset"]
    });

    /* ---------- File Panel Web Component ---------- */

    function loadJSZip() {
        if (window._jszipPromise) return window._jszipPromise;
        window._jszipPromise = new Promise((resolve, reject) => {
            require(['https://unpkg.com/jszip@3.10.1/dist/jszip.min.js'], resolve, reject);
        });
        return window._jszipPromise;
    }

    class FilePanelElement extends HTMLElement {
        constructor() {
            super();
            this._blobUrls = [];
            this._previewBlobUrls = [];
        }

        disconnectedCallback() {
            this._cleanup();
        }

        async show(href) {
            this._cleanup();
            if (!href) return;
            this._showLoading('Loading...');
            try {
                await this._load(href);
            } catch (err) {
                this._showError(err);
            }
        }

        _cleanup() {
            for (const url of this._blobUrls) URL.revokeObjectURL(url);
            this._blobUrls = [];
            this._previewBlobUrls = [];
            this.innerHTML = '';
        }

        _trackBlob(url) {
            this._blobUrls.push(url);
            return url;
        }

        _showLoading(msg) {
            this.innerHTML = `<p class="fp-loading">${msg}</p>`;
        }

        _showError(err) {
            this.innerHTML = `<p class="fp-error">Error: ${err.message}</p>`;
        }

        async _load(href) {
            const response = await fetch(href);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const mimeType = blob.type.split(';')[0];
            const isZip = mimeType === 'application/zip'
                       || mimeType === 'application/x-zip-compressed'
                       || href.split('?')[0].toLowerCase().endsWith('.zip');
            if (isZip) {
                await this._showZip(blob);
            } else {
                await this._showFile(blob, mimeType);
            }
        }

        async _showFile(blob, mimeType) {
            if (mimeType === 'application/octet-stream') {
                blob = new Blob([blob], {type: 'text/plain;charset=utf-8'});
                mimeType = 'text/plain';
            }
            const iframe = document.createElement('iframe');
            iframe.setAttribute('sandbox', 'allow-scripts allow-downloads');
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            const allowed = ['text/plain', 'text/html', 'application/pdf'];
            if (!allowed.includes(mimeType)) {
                iframe.srcdoc = `Click the file name to download it. (Not displaying because the response type was ${blob.type}.)`;
            } else {
                if (mimeType === 'text/html') {
                    blob = await this._rewriteHtmlBlob(blob);
                }
                iframe.src = this._trackBlob(URL.createObjectURL(blob));
            }
            this.innerHTML = '';
            this.appendChild(iframe);
        }

        async _rewriteHtmlBlob(blob) {
            const responseText = await blob.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(responseText, 'text/html');
            function rewriteURL(url) {
                if (url.startsWith('http') || url.startsWith('data:')) return url;
                const libPath = url.replace(/.*?\/libs\//, '');
                return `https://calvin-data-science.github.io/data202/site_libs/${libPath}`;
            }
            doc.querySelectorAll('script').forEach(script => {
                if (script.src) script.src = rewriteURL(script.getAttribute('src'));
            });
            doc.querySelectorAll('link').forEach(link => {
                if (link.href) link.href = rewriteURL(link.getAttribute('href'));
            });
            const localStorageScript = doc.createElement('script');
            localStorageScript.textContent = `window.localStorage = {getItem: () => null, setItem: () => null, removeItem: () => null};`;
            doc.head.insertBefore(localStorageScript, doc.head.firstChild);
            return new Blob([doc.documentElement.outerHTML], {type: 'text/html'});
        }

        async _showZip(zipBlob) {
            const JSZip = await loadJSZip();
            this._showLoading('Parsing ZIP...');
            const zip = await JSZip.loadAsync(zipBlob);
            this.innerHTML = '';
            this.appendChild(this._buildZipTree(zip));
        }

        _buildZipTree(zip) {
            // Build logical folder tree from flat JSZip paths
            const root = {children: new Map()};
            for (const [path, entry] of Object.entries(zip.files)) {
                if (entry.dir) continue;
                const parts = path.split('/');
                let node = root;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!node.children.has(parts[i])) {
                        node.children.set(parts[i], {name: parts[i], isDir: true, children: new Map()});
                    }
                    node = node.children.get(parts[i]);
                }
                const filename = parts[parts.length - 1];
                if (filename) node.children.set(filename, {name: filename, isDir: false, entry});
            }

            const container = document.createElement('div');
            container.className = 'fp-zip-browser';
            const previewArea = document.createElement('div');
            previewArea.className = 'fp-zip-preview';
            container.appendChild(this._renderTreeNode(root, previewArea));
            container.appendChild(previewArea);
            return container;
        }

        _renderTreeNode(node, previewArea) {
            const ul = document.createElement('ul');
            ul.className = 'fp-zip-tree';
            for (const child of node.children.values()) {
                const li = document.createElement('li');
                if (child.isDir) {
                    const details = document.createElement('details');
                    details.open = true;
                    const summary = document.createElement('summary');
                    summary.textContent = child.name + '/';
                    details.appendChild(summary);
                    details.appendChild(this._renderTreeNode(child, previewArea));
                    li.appendChild(details);
                } else {
                    const a = document.createElement('a');
                    a.href = '#';
                    a.textContent = child.name;
                    a.addEventListener('click', e => {
                        e.preventDefault();
                        this._previewZipEntry(child.entry, child.name, previewArea);
                    });
                    li.appendChild(a);
                }
                ul.appendChild(li);
            }
            return ul;
        }

        async _previewZipEntry(entry, filename, previewArea) {
            // Revoke previous preview blob URLs
            for (const url of this._previewBlobUrls) URL.revokeObjectURL(url);
            this._previewBlobUrls = [];

            previewArea.innerHTML = '<p class="fp-loading">Loading...</p>';
            try {
                const ext = filename.split('.').pop().toLowerCase();
                const textExts = new Set(['txt','py','js','ts','jsx','tsx','html','htm','css',
                    'json','md','csv','xml','yaml','yml','r','java','c','cpp','h','sh','sql','toml','ini']);
                const imageExts = new Set(['png','jpg','jpeg','gif','svg','webp','bmp']);

                if (textExts.has(ext)) {
                    const text = await entry.async('string');
                    const pre = document.createElement('pre');
                    pre.className = 'fp-zip-code';
                    pre.textContent = text;
                    previewArea.innerHTML = '';
                    previewArea.appendChild(pre);
                } else if (imageExts.has(ext)) {
                    const blob = await entry.async('blob');
                    const url = URL.createObjectURL(blob);
                    this._previewBlobUrls.push(url);
                    this._blobUrls.push(url);
                    const img = document.createElement('img');
                    img.src = url;
                    img.style.maxWidth = '100%';
                    previewArea.innerHTML = '';
                    previewArea.appendChild(img);
                } else {
                    const blob = await entry.async('blob');
                    const url = URL.createObjectURL(blob);
                    this._previewBlobUrls.push(url);
                    this._blobUrls.push(url);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    a.textContent = `Download ${filename}`;
                    previewArea.innerHTML = '';
                    previewArea.appendChild(a);
                }
            } catch (err) {
                previewArea.innerHTML = `<p class="fp-error">Preview error: ${err.message}</p>`;
            }
        }
    }

    if (!customElements.get('file-panel')) {
        customElements.define('file-panel', FilePanelElement);
    }

    if (!document.getElementById('fp-styles')) {
        const style = document.createElement('style');
        style.id = 'fp-styles';
        style.textContent = `
            file-panel { display: contents; }
            file-panel .fp-zip-browser { display:flex; flex-direction:column; height:100%; overflow:hidden; }
            file-panel .fp-zip-tree { list-style:none; padding:0 0 0 1em; margin:0; overflow-y:auto; max-height:40%; border-bottom:1px solid #ccc; font-size:.9em; }
            file-panel .fp-zip-tree li { padding:2px 0; }
            file-panel .fp-zip-tree details > summary { cursor:pointer; }
            file-panel .fp-zip-tree a { cursor:pointer; }
            file-panel .fp-zip-preview { flex:1; overflow-y:auto; padding:.5em; }
            file-panel .fp-zip-code { white-space:pre-wrap; word-break:break-all; font-size:.85em; margin:0; }
            file-panel .fp-loading { color:#666; font-style:italic; }
            file-panel .fp-error { color:red; }
        `;
        document.head.appendChild(style);
    }

    /* ---------- End File Panel Web Component ---------- */

    async function showRaw(href) {
        const panel = document.querySelector('[data-region="review-panel"]');
        let filePanel = panel.querySelector('file-panel');
        if (!filePanel) {
            filePanel = document.createElement('file-panel');
            panel.innerHTML = '';
            panel.appendChild(filePanel);
        }
        await filePanel.show(href);
    }

    ninjaData.push({
        id: "Show File Uploads",
        title: "Show File Uploads",
        parent: "Submission",
        handler: () => {
            const observer = new MutationObserver(mutCallback)
            observer.observe(document.querySelector('[data-region="grade-panel"]'), {childList: true, attributes: false, subtree: true});
            hookFileSubmissions(document.body);
            rubricNumbers(document.body);
        }
    });
    ninjaData.push({
        id: "Save-Next",
        title: "Save and Show Next",
        parent: "Submission",
        handler: () => { document.querySelector('[name="saveandshownext"]').click(); }
    });
    ninjaData.push({
        id: "Reset",
        title: "Reset Grading Form",
        parent: "Submission",
        handler: () => { window.$(document).trigger('reset'); }
    });

    function showAndHighlightRaw(tag) {
        showRaw(tag.href);
        document.querySelectorAll('.fileuploadsubmission a').forEach(x => {
            x.style.fontWeight = 'normal';
        })
        tag.style.fontWeight = 'bold';
    }

    function hookFileSubmissions(parentNode) {
        if (!parentNode.parentNode.querySelector('.submissionstatustable')) { return; }
        let shownTag = null;
        parentNode.querySelectorAll('.fileuploadsubmission a').forEach(tag => {
            if (tag.hooked) return;
            tag.hooked = true;
            tag.parentNode.addEventListener('click', () => showAndHighlightRaw(tag), false);
            if (!shownTag) {
                showAndHighlightRaw(tag)
                shownTag = tag;
            }
        });
        if (!shownTag) showRaw(null);
    }

    function rubricNumbers(parentNode) {
        for (const criterion of document.querySelectorAll("#advancedgrading-criteria tr.criterion")) {
            const scoreElt = criterion.querySelector('.score input');
            const outOf = criterion.querySelector('.score div')?.textContent;
            if (!scoreElt || !outOf) continue;
            scoreElt.type = 'number';
            scoreElt.min = "0";
            scoreElt.max = ""+outOf;
            scoreElt.step = "0.1";
            scoreElt.required = true;
        }
    }

    function mutCallback(mutationList, observer) {
        mutationList.forEach(mutation => {
            if (mutation.type !== 'childList') return;
            mutation.addedNodes.forEach(node => {
                if (!node.querySelectorAll) { return; }
                hookFileSubmissions(node);
                rubricNumbers(node);
            })
        })
    }

    /* Gradebook setup */
    ninjaData.push({
        id: "GradebookSetup",
        title: "Gradebook Setup",
        children: ["UnhideLabels"]
    });
    ninjaData.push({
        id: "UnhideLabels",
        parent: "GradebookSetup",
        title: "Unhide checkbox labels",
        handler: () => {
            let selector = ".accesshide";
            const column = prompt("Which column?", "4");
            if (column) {
                selector = `.c${column} ${selector}`;
            }
            document.getElementById('grade_edit_tree_table').querySelectorAll(selector).forEach(x => {x.classList.remove('accesshide')});
        }
    });

    /* The silly gears... */
    const actionMenu = [...document.querySelectorAll('#region-main-settings-menu [data-enhance="moodle-core-actionmenu"] a[role="menuitem"]')].map(x => ({title: x.textContent, url: x.getAttribute("href")}));
    if (actionMenu.length > 0) {
        addTree(
            {id: "MenuActions", title: "Gear"},
            actionMenu.map(m => ({id: "Gear-" + m.title, "title": m.title, url: m.url, handler: activityHandler }))
        );
    }

    ninja.data = ninjaData;

    if (window.location.pathname === '/grade/report/singleview/index.php') {
        addTree(
            {id: "Grading", title: "Grading"},
            [
                {
                    title: "Show full feedback",
                    handler: () => {
                        document.querySelectorAll('input[id^=feedback][disabled]').forEach(x => {x.closest('td').style.textAlign = "left"; x.outerHTML = x.value; } )
                    }
                }
            ]
        );
    }

    if (window.location.pathname === '/course/modedit.php') {
        addTree(
            {id: "Edit", title: "Editing"},
            [
                {
                    title: "Edit next",
                    handler: () => {
                        const currentId = searchParams.get('update');
                        let currentActivityIndex = activityDirectoryFlat.findIndex(x => x.id === currentId);
                        if (currentActivityIndex === -1) {
                            alert("Couldn't find current activity in activity directory.");
                            return;
                        }
                        function slugify(s) {
                            return s.replace(/[^a-zA-Z]/g, '');
                        }
                        const currentActivitySlug = slugify(activityDirectoryFlat[currentActivityIndex].title);
                        currentActivityIndex++;
                        let matched = false, nextActivity;
                        while (currentActivityIndex < activityDirectoryFlat.length - 1) {
                            nextActivity = activityDirectoryFlat[currentActivityIndex];
                            if (slugify(nextActivity.title) === currentActivitySlug) {
                                matched = true;
                                break;
                            }
                            currentActivityIndex++;
                        }

                        if (!matched) {
                            alert("No next activity.");
                            return;
                        }
                        window.location = `/course/modedit.php?update=${nextActivity.id}`;
                    }
                }
            ])
    }

    ninjaData.push({
        id: "BulkOverride",
        title: "Bulk Quiz Overrides",
        handler: async () => {
            const userId = prompt("User ID?");
            if (!userId) return;

            const quizzes = activityDirectory.flatMap(category =>
                                                    category.activities.filter(x => x.type === "quiz"));
            const activityTitles = quizzes.map(x => x.title).join("\n");
            if (!confirm(`This will override the due date for the following quizzes:\n${activityTitles}\n\nContinue?`)) return;

            for (const quiz of quizzes) {
                const quizId = quiz.id;
                const response = await fetch("https://moodle.calvin.edu/mod/quiz/overrideedit.php", {
                    "credentials": "include",
                    "headers": {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    "referrer": `https://moodle.calvin.edu/mod/quiz/overrideedit.php?action=adduser&cmid=${quizId}`,
                    "body": `action=adduser&cmid=${quizId}&sesskey=${window.M.cfg.sesskey}&_qf__quiz_override_form=1&mform_isexpanded_id_override=1&userid=${userId}&password=&attempts=0&submitbutton=Save`,
                    "method": "POST",
                    "mode": "cors"
                });
                console.log(response);
            }
        }
    });

    /*
     * Giving credit for timely completion of quizzes.
     */
    async function getEarliestAttemptTimes(activity, userIdToEmail) {
        if (activity.type === 'quiz') {
            return await getQuizEarliestAttemptTimes(activity.id);
        } else if (activity.type === 'assign') {
            return await getAssignEarliestAttemptTimes(activity.id, userIdToEmail);
        } else {
            throw new Error(`Don't know how to get earliest attempt times for ${activity.type}`);
        }
    }

    async function getQuizEarliestAttemptTimes(quizId) {
        const url = `/mod/quiz/report.php?sesskey=${window.M.cfg.sesskey}&download=json&id=${quizId}&mode=overview&attempts=enrolled_with&onlygraded=&onlyregraded=&slotmarks=1`;
        const gradesJSON = await fetch(url);
        let grades = await gradesJSON.json();
        grades = grades[0];
        const earliestAttemptByUser = new Map();
        for (const attempt of grades) {
            const email = attempt[2];
            const completionTime = attempt[5];
            const date = new Date(completionTime);
            const existingAttempt = earliestAttemptByUser.get(email);
            if (!existingAttempt || existingAttempt > date) {
                earliestAttemptByUser.set(email, date);
            }
        }
        return earliestAttemptByUser;
    }

    async function getAssignEarliestAttemptTimes(moduleId, userIdToEmail) {
        const url = `/report/log/index.php?sesskey=${window.M.cfg.sesskey}&download=json&id=${courseId}&modid=${moduleId}&modaction=c&chooselog=1&logreader=logstore_standard`;
        const response = await fetch(url);
        let data = await response.json();
        data = data[0];

        const earliestAttemptByUser = new Map();
        for (const row of data) {
            if (row[5] !== "Submission created.") continue;
            const userId = row[6].match(/user with id '(\d+)'/)[1];
            const email = userIdToEmail.get(userId);
            if (!email) {
                console.warn(`No email found for user ${userId}`);
                continue;
            }
            const date = new Date(row[0]);
            const existingAttempt = earliestAttemptByUser.get(email);
            if (!existingAttempt || existingAttempt > date) {
                earliestAttemptByUser.set(email, date);
            }
        }
        return earliestAttemptByUser;
    }

    function stripTrailingZeros(value) {
        return value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    }

    function fillInTextboxIfDifferent(textbox, value) {
        const textBoxValue = textbox.value;
        value = "" + value;
        if (stripTrailingZeros(textbox.value) !== stripTrailingZeros(value)) {
            textbox.value = value;
            textbox.dispatchEvent(new Event('change'));
        }
    }

    async function creditAllAttempts(activities, userIdToEmail) {
        const exceptionDates = ['2023-02-27',
                              '2023-02-28',
                              '2023-03-01',
                              '2023-03-02',
                              '2023-03-03'].map(x => new Date(`${x}T00:00:00`));

        const activityIds = activities.map(activity => activity.id);
        const activityNames = new Map();
        for (const activity of activities) {
            activityNames.set(activity.id, activity.title);
        }

        const attemptsByActivity = new Map();
        for (const activity of activities) {
            attemptsByActivity.set(activity.id, await getEarliestAttemptTimes(activity, userIdToEmail));
        }

        let defaultDueDate = null, defaultDueElt;
        if (defaultDueElt = document.querySelector('#region-main [data-region="activity-dates"] div')) {
            defaultDueDate = new Date(defaultDueElt.textContent.trim().match(/Due: (.+)$/)[1]);
        }
        const userRows = document.querySelectorAll('.gradingtable table tbody tr');
        for (const userRow of userRows) {
            const email = userRow.querySelector('.email').textContent;
            let dueDate = userRow.querySelector('.duedate')?.textContent;
            if (!dueDate) {
                if (!defaultDueDate) {
                    defaultDueDate = prompt("What is the due date for this assignment? (e.g. 2021-03-31 23:59:59)");
                    defaultDueDate = new Date(defaultDueDate);
                }
                dueDate = defaultDueDate;
            } else {
                dueDate = new Date(dueDate);
            }

            let resultsByActivity = new Map(), totalPoints = 0;
            for (const [activityId, attemptTimes] of attemptsByActivity) {
                const attemptTime = attemptTimes.get(email);
                if (!attemptTime) {
                    resultsByActivity.set(activityId, "No attempt");
                    continue;
                }
                if (attemptTime <= dueDate) {
                    resultsByActivity.set(activityId, "On time");
                    totalPoints++;
                } else {
                    const daysLate = countBusinessDaysBetween(dueDate, attemptTime, exceptionDates);
                    resultsByActivity.set(activityId, `${daysLate} days late`);
                    totalPoints += Math.max(0.2, 1 - daysLate * 0.2);
                }
            }
            const grade = totalPoints / activityIds.length;
            const gradeTextBox = userRow.querySelector('input[name^=quickgrade]');
            const outOfText = gradeTextBox.nextSibling.textContent;
            const maxGrade = parseInt(outOfText.match(/\d+/)[0]);
            fillInTextboxIfDifferent(gradeTextBox, (grade * maxGrade).toFixed(2));
            let feedbackText = '';
            if (grade < 1.0) {
                feedbackText = `Results by activity: `;
                let anyNoAttempt = false;
                for (const [activityId, result] of resultsByActivity) {
                    if (result === "No attempt") {
                        anyNoAttempt = true;
                    }
                    feedbackText += `${activityNames.get(activityId)}: ${result}, `;
                }
                if (anyNoAttempt) {
                    feedbackText += ` Don't forget to complete these activities on Moodle. Let the instructor know when you have done so.`;
                }
            }
            const feedbackTextBox = userRow.querySelector('textarea[name^=quickgrade_comments]');
            fillInTextboxIfDifferent(feedbackTextBox, feedbackText);
        }
    }

    function countBusinessDaysBetween(startDate, endDate, exceptionDates) {
        let count = 0;
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const dayOf = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
            if (!exceptionDates.some(x => x - dayOf === 0)) {
                const day = currentDate.getDay();
                if (day !== 0 && day !== 6) {
                    count++;
                }
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return count;
    }

    function getMatchingActivities(regex) {
        if (typeof regex === 'string') {
            regex = new RegExp(regex);
        }
        const matchingActivities = [];
        for (const category of activityDirectory) {
            for (const activity of category.activities || []) {
                if (activity.type !== "quiz" && activity.type !== "assign" && activity.type !== "forum") {
                    continue;
                }
                if (!regex.test(activity.title)) {
                    continue;
                }
                matchingActivities.push(activity);
            }
        }
        return matchingActivities;
    }

    if (window.location.pathname === '/mod/assign/view.php') {
        ninjaData.push({
            id: "CreditFromQuizzes",
            title: "Give credit from quizzes",
            handler: async () => {
                const activityRegex = prompt('Enter a regex to match the activities you want to credit.');
                const activities = getMatchingActivities(activityRegex);
                if (activities.length === 0) {
                    alert("no matching activities.")
                    return;
                }
                const activityTitles = activities.map(activity => activity.title);
                const activityTitlesString = activityTitles.join('\n');
                const confirmed = confirm(`Are you sure you want to credit all completions of the following activities?\n\n${activityTitlesString}`);
                if (!confirmed) {
                    return;
                }

                const userIdToEmail = scrapeUserIdToEmailMap();
                await creditAllAttempts(activities, userIdToEmail);
            }
        });

        ninjaData.push({
            id: "CreditAnySubmissions",
            title: "Give credit for any submissions",
            handler: async () => {
                for (const userRow of document.querySelectorAll('.gradingtable table tbody tr')) {
                    const submitted = !!userRow.querySelector('.submissionstatussubmitted');
                    const gradeFrac = submitted ? 1 : 0;
                    let quickGradeInput = userRow.querySelector('input[name^=quickgrade]');
                    if (quickGradeInput) {
                        const outOfText = quickGradeInput.nextSibling.textContent;
                        const maxGrade = parseInt(outOfText.match(/\d+/)[0]);
                        const grade = maxGrade * gradeFrac;
                        fillInTextboxIfDifferent(quickGradeInput, grade.toFixed(1));
                    } else {
                        quickGradeInput = userRow.querySelector('select[name^=quickgrade]');
                        if (quickGradeInput) {
                            if (gradeFrac !== 1) {
                                console.warn("Can't handle a select box for non-submitted assignments yet.");
                                continue;
                            }
                            const options = [...quickGradeInput.querySelectorAll('option')];
                            const values = options.map(x => parseFloat(x.value));
                            const maxGrade = Math.max(...values);
                            quickGradeInput.value = maxGrade;
                            quickGradeInput.dispatchEvent(new Event('change'));
                        }
                    }
                }
            }
        })

        ninjaData.push({
            id: "GradeFromRandom",
            title: "Start grading at a random student",
            handler: async () => {
                const userRows = document.querySelectorAll('.gradingtable table tbody tr');
                while (true) {
                    const randomRow = userRows[Math.floor(Math.random() * userRows.length)];
                    const link = randomRow.querySelector('a[href*="/mod/assign/view.php"]');
                    if (!link) { continue; }
                    window.location.href = link.href;
                    break;
                }
            }
        })
    }

    if (window.location.pathname.startsWith("/grade/import/")) {
        ninjaData.push({
            id: "MatchImportNames",
            title: "Match Import Names",
            handler: () => {
                document.querySelectorAll('#id_general_map select').forEach(sel => {
                    if (sel.labels.length !== 1) {
                        console.log("Missing or inconsistent label for", sel);
                        return;
                    }
                    const label = sel.labels[0].textContent.trim();
                    const opts = (
                        [...sel.querySelectorAll('[label="Grade items"] option')]
                        .filter(x => x.textContent.endsWith(label))
                    );
                    if (opts.length !== 1) {
                        console.log("No match or inconsistent match for", label);
                        return;
                    }
                    sel.value = opts[0].value;
                })
            }
        });
    }

    function scrapeUserIdToEmailMap() {
        const userIdToEmail = new Map();
        const userRows = document.querySelectorAll('.gradingtable table tbody tr');
        for (const userRow of userRows) {
            const email = userRow.querySelector('.email').textContent;
            const linkWithUserId = userRow.querySelector('a[href*="user/view.php"]');
            const userId = new URL(linkWithUserId.href).searchParams.get('id');
            userIdToEmail.set(userId, email);
        }
        return userIdToEmail;
    }

    // Hack: group selection box bigger:
    function hackGroupSelect() {
        const elt = document.getElementById('addselect');
        if (!elt) return;
        elt.setAttribute('size', '40');
        const sortCompare = (a, b) => {
            const numA = parseInt(a.textContent.match(/\((\d+)\)\s*$/)?.[1] ?? '0', 10);
            const numB = parseInt(b.textContent.match(/\((\d+)\)\s*$/)?.[1] ?? '0', 10);
            if (numA === numB) {
                return a.textContent.localeCompare(b.textContent);
            }
            return numA - numB;
        };
        const styleOption = (option) => {
            if (option.textContent.match(/\(0\)$/)) option.style.color = 'red';
            if (option.textContent.match(/\(1\)$/)) option.style.color = 'green';
        };
        const groups = elt.querySelectorAll('optgroup');
        if (groups.length > 0) {
            for (const group of groups) {
                const options = [...group.querySelectorAll('option')];
                options.sort(sortCompare);
                options.forEach(option => { group.appendChild(option); styleOption(option); });
            }
        } else {
            const options = [...elt.querySelectorAll('option')];
            options.sort(sortCompare);
            options.forEach(option => { elt.appendChild(option); styleOption(option); });
        }
    }
    hackGroupSelect();

    // Hack: double-click on review options to set all.
    function hackReviewOptions() {
        document.querySelectorAll('#id_reviewoptionshdr [data-groupname]').forEach(gg => {
            gg.querySelector('p').addEventListener('dblclick', () => {
                gg.querySelectorAll('fieldset input[type="checkbox"]').forEach(x => {x.click();})
            }, false);
        });
    }
    hackReviewOptions();

    // Scrape quick-grade comments
    if (window.location.pathname === '/mod/assign/view.php' && window.location.search.includes('action=grading')) {
        scrapeQuickGradeComments();
    }

    function scrapeQuickGradeComments() {
        const curActivityId = new URL(window.location.href).searchParams.get('id');
        const gradingTable = document.querySelector('.gradingtable');
        if (!gradingTable) { return; }
        const comments = [...gradingTable.querySelectorAll('[id^=quickgrade_comments]')].map(x => x.value);
        localStorage.setItem(`grading-comments-${curActivityId}`, JSON.stringify(comments));
    }

    async function scrapeAllQuickGradeComments() {
        const allComments = new Map();
        for (const activityHref of document.querySelectorAll('a[href*="/mod/assign/view"]')) {
            const activityId = new URL(activityHref.href).searchParams.get('id');
            if (!activityId) { continue }
            if (allComments.has(activityId)) { continue; }

            const gradingUrl = activityHref.href + '&action=grading';
            const response = await fetch(gradingUrl);
            const text = await response.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');
            const comments = [...doc.querySelectorAll('.gradingtable [id^=quickgrade_comments]')].map(x => x.value);
            const name = doc.querySelector('.page-header-headings h1').textContent;
            allComments.set(activityId, {name, comments});
        }
        return allComments;
    }

    function scrapeAndStoreAllQuickGradeComments() {
        scrapeAllQuickGradeComments().then(comments => {
            const storageId = `all-quick-grade-comments-course-${courseId}`;
            const commentsAsObject = Object.fromEntries(comments);
            localStorage.setItem(storageId, JSON.stringify(commentsAsObject));
        });
    }

    if (window.location.pathname === '/course/view.php') {
        ninjaData.push({
            id: "ScrapeAllQuickGradeComments",
            title: "Scrape all quick grade comments in this course",
            handler: scrapeAndStoreAllQuickGradeComments
        })
    }

    if (window.location.pathname === '/mod/assign/view.php') {
        const curActivityId = new URL(window.location.href).searchParams.get('id');
        const comments = JSON.parse(localStorage.getItem(`grading-comments-${curActivityId}`));
        if (comments) {
            ninjaData.push({
                id: "ShowQuickGradeComments",
                title: "Show Quick-Grade Comments",
                handler: () => {
                    const popup = window.open('', 'quick-grade-comments', 'width=400,height=600');
                    popup.document.body.innerHTML = comments.join('\n\n');
                    popup.document.body.style.backgroundColor = '#f5f5f5';
                    const styleElt = popup.document.createElement('style')
                    styleElt.textContent = `
                        h1, h2, h3, h4, h5, h6 { margin: 0; }
                    `;
                    popup.document.head.appendChild(styleElt);
                }
            });
        }
    }

    // Inject quick-comment buttons into attempt review page
    if (window.location.pathname === '/mod/quiz/review.php') {
        const attemptId = new URL(window.location.href).searchParams.get('attempt');

        document.querySelectorAll('.commentlink a').forEach(commentLink => {
            const target = commentLink.getAttribute('href');

            const button = document.createElement('button');
            button.textContent = "Quick comment";
            button.style.marginLeft = '1em';
            commentLink.parentNode.appendChild(button);

            button.addEventListener('click', async (event) => {
                event.preventDefault();
                const text = await (await fetch(target)).text();

                const doc = new DOMParser().parseFromString(text, 'text/html');

                const form = new FormData();
                doc.querySelectorAll('#manualgradingform input').forEach(inputElement => {
                    const name = inputElement.name;
                    let value = inputElement.value;
                    if (name.endsWith('-mark')) {
                        value = "" + prompt("Grade?", value);
                    }
                    form.append(name, value);
                });

                const response = await fetch(target, {
                    method: 'POST',
                    body: form
                });
            }, false);
        });
    }

    // Inject export-one button into edit-quiz page
    if (window.location.pathname === '/mod/quiz/edit.php') {
        document.querySelectorAll('.mod-quiz-edit-content a[href*="/question.php"]').forEach(questionLink => {
            const questionId = new URL(questionLink.href).searchParams.get('id');
            const cmid = new URL(questionLink.href).searchParams.get('cmid');
            const row = questionLink.closest('.activity');
            const actionsSpan = row.querySelector('.actions');
            const exportButton = document.createElement('button');
            exportButton.textContent = ">";
            actionsSpan.appendChild(exportButton);
            exportButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const exportUrl = `/question/exportone.php?cmid=${cmid}&id=${questionId}&sesskey=${window.M.cfg.sesskey}`;
                window.location = exportUrl;
            }, false);
        });
    }

    // Inject next-feedback navigation on single-view page
    if (window.location.pathname === '/grade/report/singleview/index.php') {
        const navigateFeedback = (delta) => {
            const curInput = document.activeElement;
            if (curInput.tagName !== 'INPUT' || !curInput.name.startsWith('feedback')) {
                return;
            }
            const curRow = curInput.closest('tr');
            const desiredRow = (delta > 0) ? curRow.nextElementSibling : curRow.previousElementSibling;
            if (!desiredRow) {
                return;
            }
            const nextInput = desiredRow.querySelector('[name^=feedback]');
            if (nextInput) {
                nextInput.focus();
            }
        }
        document.addEventListener('keydown', (event) => {
            if (event.altKey && event.key === 'ArrowDown') {
                event.preventDefault();
                navigateFeedback(1);
            }
            if (event.altKey && event.key === 'ArrowUp') {
                event.preventDefault();
                navigateFeedback(-1);
            }
        });
    }

    // Re-assign ninja data to pick up late additions
    ninja.data = ninjaData;

    // Plugin API — allows other content scripts to register commands
    function registerCommands(commands) {
        ninjaData.push(...commands);
        ninja.data = ninjaData;
    }

    // Process any commands queued before core loaded
    if (window.moodlePalette && window.moodlePalette._queue) {
        for (const commands of window.moodlePalette._queue) {
            registerCommands(commands);
        }
    }

    window.moodlePalette = {
        register: registerCommands,
        addTree: addTree,
        ninja: ninja,
        courseId: courseId,
        activityDirectory: activityDirectory,
    };

})();
}
