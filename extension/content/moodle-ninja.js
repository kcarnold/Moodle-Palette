// Moodle Ninja — Command palette for Moodle (Ctrl/Cmd+P)
// Ported from Tampermonkey userscript to browser extension.
// AI features (OpenAI, Ollama) removed for initial port.

'use strict';

// Abort if we're inside a tinymce editor.
if (!document.body.classList.contains('mce-content-body')) {
(function() {

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

    let searchParams = new URLSearchParams(document.location.search);
    let courseId;
    let activityDirectory = [];

    function getCourseId() {
        if (window.M && window.M.cfg && window.M.cfg.courseId) {
            return window.M.cfg.courseId;
        }
        let dataResult = document.querySelector('[data-courseid]');
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
            let secId = section.getAttribute('id');
            let secTitle = section.dataset.sectionname.trim();
            let activities = [...section.querySelectorAll('ul.section > li.activity .activity-instance')].map(activityInstance => {
                if (!activityInstance) return;
                let titleElt = activityInstance.querySelector('.activityname');
                if (!titleElt) {
                    console.warn("OOPS, missing title", activityInstance);
                }
                let title = titleElt.querySelector('.instancename').textContent;
                let linkNode = titleElt.querySelector('a');
                if (!linkNode) {
                    console.warn("OOPS, missing link", activityInstance, title);
                }
                let url = linkNode.getAttribute('href');

                let activity = {title, url};
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
        let stored = localStorage[`activities-${courseId}`];
        if (stored) {
            activityDirectory = JSON.parse(stored);
        }
    }

    let activityDirectoryFlat = activityDirectory.flatMap(x => x.activities);

    // Workaround from https://github.com/ssleptsov/ninja-keys/issues/51
    let tag2 = document.createElement('script');
    tag2.setAttribute('type', 'importmap');
    tag2.textContent = `
    {
        "imports": {
            "https://unpkg.com/lit-html@latest/directives/ref.js?module": "https://unpkg.com/lit-html@2.2.6/directives/ref.js?module"
        }
    }`;
    document.body.appendChild(tag2);

    // https://github.com/ssleptsov/ninja-keys
    let tag = document.createElement('script');
    tag.setAttribute('type', 'module');
    tag.setAttribute('src', 'https://unpkg.com/ninja-keys?module');
    document.body.appendChild(tag);

    let ninja = document.createElement('ninja-keys');
    ninja.setAttribute('style', '--ninja-z-index: 1050;');
    ninja.setAttribute('openHotkey', "cmd+p,ctrl+p");
    document.body.appendChild(ninja);

    // Create the go-to-activity action hierarchy.
    function activityHandler(item) {
        window.location = item.url;
    }

    let ninjaData = [];
    let courseSections = [
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

    let activityItem = {id: "Act", title: "Activity", children: []};
    ninjaData.push(activityItem);
    activityDirectory.forEach(section => {
        let secId = section.secId;
        let children = section.activities.map(({title, url}) => ({
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
            let btn = document.getElementById('blocksliderbutton');
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

    async function showRaw(href) {
        let panel = document.querySelector('[data-region="review-panel"]');

        // Cleanup any object urls to avoid memory leaks.
        panel.querySelectorAll('iframe').forEach(x => {
            if (x.src.startsWith('blob:')) {
                URL.revokeObjectURL(x.src);
            }
        });
        panel.innerHTML = '';

        if (!href) return;

        panel.innerHTML = "<p>Loading...</p>";

        let response = await fetch(href);
        let responseBlob = await response.blob();
        if (responseBlob.type === "application/octet-stream") {
            responseBlob = new Blob([responseBlob], {type: 'text/plain;charset=utf-8'});
        }
        let iframe = document.createElement("iframe");
        iframe.setAttribute("sandbox", "allow-scripts allow-downloads");

        const allowedContentTypes = ["text/plain", "text/html", "application/pdf"];
        const responseType = responseBlob.type.split(';')[0];
        if (allowedContentTypes.indexOf(responseType) === -1) {
            iframe.srcdoc = `Click the file name to download it. (Not displaying because the response type was ${responseBlob.type}.)`;
        } else {
            if (responseType === "text/html") {
                let responseText = await new Response(responseBlob).text();
                let parser = new DOMParser();
                let doc = parser.parseFromString(responseText, "text/html");
                function rewriteURL(url) {
                    if (url.startsWith('http') || url.startsWith('data:')) return url;
                    const libPath = url.replace(/.*?\/libs\//, '');
                    return `https://calvin-data-science.github.io/data202/site_libs/${libPath}`;
                }
                doc.querySelectorAll('script').forEach(script => {
                    if (script.src) {
                        const fixedURL = rewriteURL(script.getAttribute('src'));
                        script.src = fixedURL;
                    }
                });
                doc.querySelectorAll('link').forEach(link => {
                    if (link.href) {
                        const fixedURL = rewriteURL(link.getAttribute('href'));
                        link.href = fixedURL;
                    }
                });

                let localStorageScript = doc.createElement('script');
                localStorageScript.textContent = `window.localStorage = {getItem: () => null, setItem: () => null, removeItem: () => null};`;
                doc.head.insertBefore(localStorageScript, doc.head.firstChild);

                responseText = doc.documentElement.outerHTML;
                responseBlob = new Blob([responseText], {type: "text/html"});
            }
            iframe.src = URL.createObjectURL(responseBlob);
        }
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        panel.appendChild(iframe);
    }

    ninjaData.push({
        id: "Show File Uploads",
        title: "Show File Uploads",
        parent: "Submission",
        handler: () => {
            let observer = new MutationObserver(mutCallback)
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
        for (let criterion of document.querySelectorAll("#advancedgrading-criteria tr.criterion")) {
            let scoreElt = criterion.querySelector('.score input');
            let outOf = criterion.querySelector('.score div').textContent;
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
            let column = prompt("Which column?", "4");
            if (column) {
                selector = `.c${column} ${selector}`;
            }
            document.getElementById('grade_edit_tree_table').querySelectorAll(selector).forEach(x => x.classList.remove('accesshide'));
        }
    });

    /* The silly gears... */
    let actionMenu = [...document.querySelectorAll('#region-main-settings-menu [data-enhance="moodle-core-actionmenu"] a[role="menuitem"]')].map(x => ({title: x.textContent, url: x.getAttribute("href")}));
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
                        let currentId = searchParams.get('update');
                        let currentActivityIndex = activityDirectoryFlat.findIndex(x => x.id === currentId);
                        if (currentActivityIndex === -1) {
                            alert("Couldn't find current activity in activity directory.");
                            return;
                        }
                        function slugify(s) {
                            return s.replace(/[^a-zA-Z]/g, '');
                        }
                        let currentActivitySlug = slugify(activityDirectoryFlat[currentActivityIndex].title);
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
            let userId = prompt("User ID?");
            if (!userId) return;

            let quizzes = activityDirectory.flatMap(category =>
                                                    category.activities.filter(x => x.type === "quiz"));
            let activityTitles = quizzes.map(x => x.title).join("\n");
            if (!confirm(`This will override the due date for the following quizzes:\n${activityTitles}\n\nContinue?`)) return;

            for (let quiz of quizzes) {
                let quizId = quiz.id;
                let response = await fetch("https://moodle.calvin.edu/mod/quiz/overrideedit.php", {
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
        let url = `/mod/quiz/report.php?sesskey=${window.M.cfg.sesskey}&download=json&id=${quizId}&mode=overview&attempts=enrolled_with&onlygraded=&onlyregraded=&slotmarks=1`;
        let gradesJSON = await fetch(url);
        let grades = await gradesJSON.json();
        grades = grades[0];
        let earliestAttemptByUser = new Map();
        for (let attempt of grades) {
            let email = attempt[2];
            let completionTime = attempt[5];
            let date = new Date(completionTime);
            let existingAttempt = earliestAttemptByUser.get(email);
            if (!existingAttempt || existingAttempt > date) {
                earliestAttemptByUser.set(email, date);
            }
        }
        return earliestAttemptByUser;
    }

    async function getAssignEarliestAttemptTimes(moduleId, userIdToEmail) {
        let url = `/report/log/index.php?sesskey=${window.M.cfg.sesskey}&download=json&id=${courseId}&modid=${moduleId}&modaction=c&chooselog=1&logreader=logstore_standard`;
        let response = await fetch(url);
        let data = await response.json();
        data = data[0];

        let earliestAttemptByUser = new Map();
        for (let row of data) {
            if (row[5] !== "Submission created.") continue;
            let userId = row[6].match(/user with id '(\d+)'/)[1];
            let email = userIdToEmail.get(userId);
            if (!email) {
                console.warn(`No email found for user ${userId}`);
                continue;
            }
            let date = new Date(row[0]);
            let existingAttempt = earliestAttemptByUser.get(email);
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
        let textBoxValue = textbox.value;
        value = "" + value;
        if (stripTrailingZeros(textbox.value) !== stripTrailingZeros(value)) {
            textbox.value = value;
            textbox.dispatchEvent(new Event('change'));
        }
    }

    async function creditAllAttempts(activities, userIdToEmail) {
        let exceptionDates = ['2023-02-27',
                              '2023-02-28',
                              '2023-03-01',
                              '2023-03-02',
                              '2023-03-03'].map(x => new Date(`${x}T00:00:00`));

        let activityIds = activities.map(activity => activity.id);
        let activityNames = new Map();
        for (let activity of activities) {
            activityNames.set(activity.id, activity.title);
        }

        let attemptsByActivity = new Map();
        for (let activity of activities) {
            attemptsByActivity.set(activity.id, await getEarliestAttemptTimes(activity, userIdToEmail));
        }

        let defaultDueDate = null, defaultDueElt;
        if (defaultDueElt = document.querySelector('#region-main [data-region="activity-dates"] div')) {
            defaultDueDate = new Date(defaultDueElt.textContent.trim().match(/Due: (.+)$/)[1]);
        }
        let userRows = document.querySelectorAll('.gradingtable table tbody tr');
        for (let userRow of userRows) {
            let email = userRow.querySelector('.email').textContent;
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
            for (let [activityId, attemptTimes] of attemptsByActivity) {
                let attemptTime = attemptTimes.get(email);
                if (!attemptTime) {
                    resultsByActivity.set(activityId, "No attempt");
                    continue;
                }
                if (attemptTime <= dueDate) {
                    resultsByActivity.set(activityId, "On time");
                    totalPoints++;
                } else {
                    let daysLate = countBusinessDaysBetween(dueDate, attemptTime, exceptionDates);
                    resultsByActivity.set(activityId, `${daysLate} days late`);
                    totalPoints += Math.max(0.2, 1 - daysLate * 0.2);
                }
            }
            let grade = totalPoints / activityIds.length;
            let gradeTextBox = userRow.querySelector('input[name^=quickgrade]');
            let outOfText = gradeTextBox.nextSibling.textContent;
            let maxGrade = parseInt(outOfText.match(/\d+/)[0]);
            fillInTextboxIfDifferent(gradeTextBox, (grade * maxGrade).toFixed(2));
            let feedbackText = '';
            if (grade < 1.0) {
                feedbackText = `Results by activity: `;
                let anyNoAttempt = false;
                for (let [activityId, result] of resultsByActivity) {
                    if (result === "No attempt") {
                        anyNoAttempt = true;
                    }
                    feedbackText += `${activityNames.get(activityId)}: ${result}, `;
                }
                if (anyNoAttempt) {
                    feedbackText += ` Don't forget to complete these activities on Moodle. Let the instructor know when you have done so.`;
                }
            }
            let feedbackTextBox = userRow.querySelector('textarea[name^=quickgrade_comments]');
            fillInTextboxIfDifferent(feedbackTextBox, feedbackText);
        }
    }

    function countBusinessDaysBetween(startDate, endDate, exceptionDates) {
        let count = 0;
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            let dayOf = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
            if (!exceptionDates.some(x => x - dayOf === 0)) {
                let day = currentDate.getDay();
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
        let matchingActivities = [];
        for (let category of activityDirectory) {
            for (let activity of category.activities || []) {
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
                let activityRegex = prompt('Enter a regex to match the activities you want to credit.');
                let activities = getMatchingActivities(activityRegex);
                if (activities.length === 0) {
                    alert("no matching activities.")
                    return;
                }
                let activityTitles = activities.map(activity => activity.title);
                let activityTitlesString = activityTitles.join('\n');
                let confirmed = confirm(`Are you sure you want to credit all completions of the following activities?\n\n${activityTitlesString}`);
                if (!confirmed) {
                    return;
                }

                let userIdToEmail = scrapeUserIdToEmailMap();
                await creditAllAttempts(activities, userIdToEmail);
            }
        });

        ninjaData.push({
            id: "CreditAnySubmissions",
            title: "Give credit for any submissions",
            handler: async () => {
                for (let userRow of document.querySelectorAll('.gradingtable table tbody tr')) {
                    let submitted = !!userRow.querySelector('.submissionstatussubmitted');
                    let gradeFrac = submitted ? 1 : 0;
                    let quickGradeInput = userRow.querySelector('input[name^=quickgrade]');
                    if (quickGradeInput) {
                        let outOfText = quickGradeInput.nextSibling.textContent;
                        let maxGrade = parseInt(outOfText.match(/\d+/)[0]);
                        const grade = maxGrade * gradeFrac;
                        fillInTextboxIfDifferent(quickGradeInput, grade.toFixed(1));
                    } else {
                        quickGradeInput = userRow.querySelector('select[name^=quickgrade]');
                        if (quickGradeInput) {
                            if (gradeFrac !== 1) {
                                console.warn("Can't handle a select box for non-submitted assignments yet.");
                                continue;
                            }
                            let options = [...quickGradeInput.querySelectorAll('option')];
                            let values = options.map(x => parseFloat(x.value));
                            let maxGrade = Math.max(...values);
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
                let userRows = document.querySelectorAll('.gradingtable table tbody tr');
                while (true) {
                    let randomRow = userRows[Math.floor(Math.random() * userRows.length)];
                    let link = randomRow.querySelector('a[href*="/mod/assign/view.php"]');
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
                    let label = sel.labels[0].textContent.trim();
                    let opts = (
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
        let userIdToEmail = new Map();
        let userRows = document.querySelectorAll('.gradingtable table tbody tr');
        for (let userRow of userRows) {
            let email = userRow.querySelector('.email').textContent;
            let linkWithUserId = userRow.querySelector('a[href*="user/view.php"]');
            let userId = new URL(linkWithUserId.href).searchParams.get('id');
            userIdToEmail.set(userId, email);
        }
        return userIdToEmail;
    }

    // Hack: group selection box bigger:
    function hackGroupSelect() {
        let elt = document.getElementById('addselect');
        if (!elt) return;
        elt.setAttribute('size', '40');
        const sortCompare = (a, b) => {
            let numA = parseInt(a.textContent.match(/\((\d+)\)\s*$/)?.[1] ?? '0', 10);
            let numB = parseInt(b.textContent.match(/\((\d+)\)\s*$/)?.[1] ?? '0', 10);
            if (numA === numB) {
                return a.textContent.localeCompare(b.textContent);
            }
            return numA - numB;
        };
        const styleOption = (option) => {
            if (option.textContent.match(/\(0\)$/)) option.style.color = 'red';
            if (option.textContent.match(/\(1\)$/)) option.style.color = 'green';
        };
        let groups = elt.querySelectorAll('optgroup');
        if (groups.length > 0) {
            for (let group of groups) {
                let options = [...group.querySelectorAll('option')];
                options.sort(sortCompare);
                options.forEach(option => { group.appendChild(option); styleOption(option); });
            }
        } else {
            let options = [...elt.querySelectorAll('option')];
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
        for (let activityHref of document.querySelectorAll('a[href*="/mod/assign/view"]')) {
            let activityId = new URL(activityHref.href).searchParams.get('id');
            if (!activityId) { continue }
            if (allComments.has(activityId)) { continue; }

            const gradingUrl = activityHref.href + '&action=grading';
            let response = await fetch(gradingUrl);
            let text = await response.text();
            let doc = new DOMParser().parseFromString(text, 'text/html');
            let comments = [...doc.querySelectorAll('.gradingtable [id^=quickgrade_comments]')].map(x => x.value);
            let name = doc.querySelector('.page-header-headings h1').textContent;
            allComments.set(activityId, {name, comments});
        }
        return allComments;
    }

    function scrapeAndStoreAllQuickGradeComments() {
        scrapeAllQuickGradeComments().then(comments => {
            let storageId = `all-quick-grade-comments-course-${courseId}`;
            let commentsAsObject = Object.fromEntries(comments);
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
                    let popup = window.open('', 'quick-grade-comments', 'width=400,height=600');
                    popup.document.body.innerHTML = comments.join('\n\n');
                    popup.document.body.style.backgroundColor = '#f5f5f5';
                    let styleElt = popup.document.createElement('style')
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
        let attemptId = new URL(window.location.href).searchParams.get('attempt');

        document.querySelectorAll('.commentlink a').forEach(commentLink => {
            let target = commentLink.getAttribute('href');

            let button = document.createElement('button');
            button.textContent = "Quick comment";
            button.style.marginLeft = '1em';
            commentLink.parentNode.appendChild(button);

            button.addEventListener('click', async (event) => {
                event.preventDefault();
                let text = await (await fetch(target)).text();

                let doc = new DOMParser().parseFromString(text, 'text/html');

                let form = new FormData();
                doc.querySelectorAll('#manualgradingform input').forEach(inputElement => {
                    let name = inputElement.name;
                    let value = inputElement.value;
                    if (name.endsWith('-mark')) {
                        value = "" + prompt("Grade?", value);
                    }
                    form.append(name, value);
                });

                let response = await fetch(target, {
                    method: 'POST',
                    body: form
                });
            }, false);
        });
    }

    // Inject export-one button into edit-quiz page
    if (window.location.pathname === '/mod/quiz/edit.php') {
        document.querySelectorAll('.mod-quiz-edit-content a[href*="/question.php"]').forEach(questionLink => {
            let questionId = new URL(questionLink.href).searchParams.get('id');
            let cmid = new URL(questionLink.href).searchParams.get('cmid');
            let row = questionLink.closest('.activity');
            let actionsSpan = row.querySelector('.actions');
            let exportButton = document.createElement('button');
            exportButton.textContent = ">";
            actionsSpan.appendChild(exportButton);
            exportButton.addEventListener('click', async (event) => {
                event.preventDefault();
                let exportUrl = `/question/exportone.php?cmid=${cmid}&id=${questionId}&sesskey=${window.M.cfg.sesskey}`;
                window.location = exportUrl;
            }, false);
        });
    }

    // Inject next-feedback navigation on single-view page
    if (window.location.pathname === '/grade/report/singleview/index.php') {
        const navigateFeedback = (delta) => {
            let curInput = document.activeElement;
            if (curInput.tagName !== 'INPUT' || !curInput.name.startsWith('feedback')) {
                return;
            }
            let curRow = curInput.closest('tr');
            let desiredRow = (delta > 0) ? curRow.nextElementSibling : curRow.previousElementSibling;
            if (!desiredRow) {
                return;
            }
            let nextInput = desiredRow.querySelector('[name^=feedback]');
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

})();
}
