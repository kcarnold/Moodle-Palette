// ==UserScript==
// @name         Moodle Ninja
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://moodle.calvin.edu/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=calvin.edu
// @grant        none
// @run-at document-idle
// ==/UserScript==

(function() {
    'use strict';

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
            let secTitle = document.getElementById(section.getAttribute('aria-labeled-by')).textContent;
            let activities = [...section.querySelectorAll('ul.section > li.activity .activityinstance')].map(activityInstance => {
                if (!activityInstance) return;
                let titleElt = activityInstance.querySelector('.instancename');
                if (!titleElt) {
                    console.warn("OOPS, missing title", activityInstance);
                    alert("Missing title for activity in " + secTitle);
                    // intentionally crash rather than give corrupt data.
                }
                let title = titleElt.firstChild.textContent;
                let linkNode = titleElt.closest('a');
                if (!linkNode) {
                    console.warn("OOPS, missing link", activityInstance, title);
                }
                let url = linkNode.getAttribute('href');
                return {title, url};
            });
            return {secId, secTitle, activities};
        });
        localStorage[`activities-${courseId}`] = JSON.stringify(activityDirectory);
    } else {
        // Load the stored activities for this course.
        courseId = getCourseId();
        let stored = localStorage[`activities-${courseId}`];
        if (stored) {
            activityDirectory = JSON.parse(stored);
        }
    }

    // https://github.com/ssleptsov/ninja-keys
    let tag = document.createElement('script');
    tag.setAttribute('type', 'module');
    tag.setAttribute('src', "https://unpkg.com/ninja-keys?module");
    document.body.appendChild(tag);

    let ninja = document.createElement('ninja-keys');
    ninja.setAttribute('style', '--ninja-z-index: 102;'); // Get it in front of the course blocks.
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
        children.forEach(child => {ninjaData.push(child);}); // is there an .extend for arrays?
    });

    // I think this is broken somehow: https://github.com/ssleptsov/ninja-keys/blob/main/src/ninja-keys.ts#L192
    /**    ninja.data = [
        {
            id: "Act",
            title: "Activity",
            children: activityDirectory.map(({secTitle, activities}) => ({
                id: secTitle,
                title: secTitle,
                children: activities.map(({title, url}) => ({id: title, title: title, url: url, handler: activityHandler}))
            }))
        }
    ];*/

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

    /* TODO: Merge quiz ninja into here */

    /* Assignment */
    // TODO:
    // Download all: https://moodle.calvin.edu/mod/assign/view.php?id=1517797&action=downloadall

    /* Convert-assignment-thing */
    ninjaData.push({
        id: "Submission",
        title: "Submission",
        children: ["Show File Uploads", "Save-Next", "Reset"]
    });

    async function showRaw(href) {
        let panel = document.querySelector('[data-region="review-panel"]');
        panel.innerHTML = '';
        let response = await fetch(href);
        //let responseText = await response.text();
        let responseBlob = await response.blob();
        if (responseBlob.type === "application/octet-stream") {
            // Avoid downloading it.
            responseBlob = responseBlob.slice(0, responseBlob.size, "text/plain");
        }
        let iframe = document.createElement("iframe");
        iframe.setAttribute("sandbox", "allow-scripts allow-downloads"); // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#attr-sandbox

        const allowedContentTypes = ["text/plain", "text/html", "application/pdf"];
        const responseType = responseBlob.type.split(';')[0]; // split off ;charset=utf-8 etc.
        if (allowedContentTypes.indexOf(responseType) === -1) {
            iframe.srcdoc = `Click the file name to download it. (Not displaying becaause the response type was ${responseBlob.type}.)`;
        } else {
            //iframe.srcdoc = responseText;
            // FIXME: should revoke this object URL sometime to avoid memory leaks.
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
        //hotkey: "cmd-opt-h",
        handler: () => {
            let observer = new MutationObserver(mutCallback)
            observer.observe(document.querySelector('[data-region="grade-panel"]'), {childList: true, attributes: false, subtree: true});
            hookFileSubmissions(document.body);
        }
    });
    ninjaData.push({
        id: "Save-Next",
        title: "Save and Show Next",
        //hotkey: "cmd-opt-s",
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
        let shownTag = null;
        parentNode.querySelectorAll('.fileuploadsubmission a').forEach(tag => {
            //console.log("Got node", m, "from", parentNode);
            // Be careful: we seem to get addedNodes from several different parent nodes (why??),
            // so abort if we've already handled this one.
            if (tag.hooked) return;
            tag.hooked = true;
            tag.parentNode.addEventListener('click', () => showAndHighlightRaw(tag), false);
            if (!shownTag) {
                showAndHighlightRaw(tag)
                shownTag = tag;
            }

        });
    }

    function mutCallback(mutationList, observer) {
        mutationList.forEach(mutation => {
            if (mutation.type !== 'childList') return;
            //console.log(mutation.addedNodes, mutation.removedNodes);
            mutation.addedNodes.forEach(node => {
                if (!node.querySelectorAll) { return; }
                hookFileSubmissions(node);
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
    console.log(ninja.data);

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

    /*
    *** Activity crediting stuff
    *** This should be in a separate file
    *** but it was easy code to write
    */
    async function getEmailsWhoAttempted(quizId) {
        /* get the response CSV */
        let url = `/mod/quiz/report.php?sesskey=${window.M.cfg.sesskey}&download=json&id=${quizId}&mode=overview&attempts=enrolled_with&onlygraded=&onlyregraded=&slotmarks=1`;
        let gradesJSON = await fetch(url);
        let grades = await gradesJSON.json();
        /* for some reason there's an extra array layer */
        grades = grades[0];
        // the columns aren't labeled.
        return new Set(grades.map(attempt => attempt[2]));
    }

    async function creditAllAttempts(quizIds) {
        let quizzesAttemptedByEmail = new Map(); // from email to number of quizzes attempted
        for (let quizId of quizIds) {
            let emailsWhoAttemptedQuiz = await getEmailsWhoAttempted(quizId);
            // add the number of quizzes attempted to the map
            for (let email of emailsWhoAttemptedQuiz) {
                let quizzesAttemptedSoFar = quizzesAttemptedByEmail.get(email) || 0;
                quizzesAttemptedByEmail.set(email, quizzesAttemptedSoFar + 1);
            }
        }

        // now we have a map of emails to number of quizzes attempted

        // For each user, fill in the grade and feedback comments.
        let userRows = document.querySelectorAll('.gradingtable table tbody tr');
        for (let userRow of userRows) {
            let email = userRow.querySelector('.email').textContent; // should also be .c3
            let quizzesAttempted = quizzesAttemptedByEmail.get(email) || 0;
            let grade = quizzesAttempted / quizIds.length;
            // round to 2 decimal places
            grade = Math.round(grade * 100) / 100;
            // Set the grade text box.
            let gradeTextBox = userRow.querySelector('input[name^=quickgrade]');
            // The maximum grade is the text just after the text box
            // FIXME: hard-coded to 100.
            let maxGrade = 100;
            // type the grade into the text box
            gradeTextBox.value = grade * maxGrade;
            // trigger the change event
            gradeTextBox.dispatchEvent(new Event('change'));
            // Set the feedback text box.
            if (grade < 1.0) {
                let feedbackText = `You have completed ${quizzesAttempted} out of ${quizIds.length} quizzes that are part of this assignment. Don't forget to complete these quizzes on Moodle; let the instructor know when you have done so.`;
                let feedbackTextBox = userRow.querySelector('textarea[name^=quickgrade_comments]');
                feedbackTextBox.value = feedbackText;
                // trigger the change event
                feedbackTextBox.dispatchEvent(new Event('change'));
            }
        }
    }


    function getMatchingActivities(regex) {
        // make sure the regex is a regex
        if (typeof regex === 'string') {
            regex = new RegExp(regex);
        }

        // activityDirectory is organized by category, so we need to flatten it.
        let matchingActivities = [];
        for (let category of activityDirectory) {
            for (let activity of category.activities || []) {
                // if the activity URL doesn't contain /mod/quiz/view.php, it's not a quiz.
                if (!/\/mod\/quiz\/view.php/.test(activity.url)) {
                    continue;
                }
                // check that the title matches.
                if (!regex.test(activity.title)) {
                    continue;
                }

                // extract the quiz id while we're here
                let quizId = new URL(activity.url).searchParams.get('id');
                activity.id = quizId;

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
                // Confirm that these are the activities you want to credit.
                let activityTitles = activities.map(activity => activity.title);
                let activityTitlesString = activityTitles.join('\n');
                let confirmed = confirm(`Are you sure you want to credit all completions of the following activities?\n\n${activityTitlesString}`);
                if (!confirmed) {
                    return;
                }
                let quizIds = activities.map(activity => activity.id);
                await creditAllAttempts(quizIds);
            }
        });
    }

    // Hack: group selection box bigger:
    function hackGroupSelect() {
        let elt = document.getElementById('addselect');
        if (!elt) return;
        elt.setAttribute('size', '40');
        elt.querySelectorAll("option").forEach(x => {
            if (x.textContent.match(/\(0\)$/)) x.style.color = 'red'
        });
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
})();
