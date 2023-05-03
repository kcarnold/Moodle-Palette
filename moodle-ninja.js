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
            let labeledByElt = section.getAttribute('aria-labeled-by') || section.getAttribute('aria-labelledby');
            if (!labeledByElt) console.warn("Couldn't find title for", section);
            let secTitle = document.getElementById(labeledByElt).textContent;
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
            rubricNumbers(document.body); // FIXME: proper hook mechanism
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

    function rubricNumbers(parentNode) {
        for (let criterion of document.querySelectorAll("#advancedgrading-criteria tr.criterion")) {
            let scoreElt = criterion.querySelector('.score input');
            let outOf = criterion.querySelector('.score div').textContent;
            scoreElt.type = 'number';
            scoreElt.min = "0";
            scoreElt.max = ""+outOf;
        }
    }

    function mutCallback(mutationList, observer) {
        mutationList.forEach(mutation => {
            if (mutation.type !== 'childList') return;
            //console.log(mutation.addedNodes, mutation.removedNodes);
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
     * Giving credit for timely completion of quizzes.
     * This should be in a separate file.
     */
    async function getEarliestAttemptTimes(activity, userIdToEmail) {
        if (activity.type === 'quiz') {
            return await getQuizEarliestAttemptTimes(activity.id);
        } else if (activity.type === 'assign') {
            return await getAssignEarliestAttemptTimes(activity.id, userIdToEmail);
        } else {
            // complain
            throw new Error(`Don't know how to get earliest attempt times for ${activity.type}`);
        }
    }

    async function getQuizEarliestAttemptTimes(quizId) {
        /**
         * Get the times when each user completed the quiz.
         * Returns a map from email to date.
         */
        /* get the response CSV */
        let url = `/mod/quiz/report.php?sesskey=${window.M.cfg.sesskey}&download=json&id=${quizId}&mode=overview&attempts=enrolled_with&onlygraded=&onlyregraded=&slotmarks=1`;
        let gradesJSON = await fetch(url);
        let grades = await gradesJSON.json();
        /* for some reason there's an extra array layer */
        grades = grades[0];
        // Get the earliest attempt for each user.
        let earliestAttemptByUser = new Map();
        for (let attempt of grades) {
            // the columns aren't labeled! It's last,first,email,status,startTime,completionTime,duration,grade then grades for each question
            let email = attempt[2];
            let completionTime = attempt[5];
            // Parse the date, format looks like "February 17 2023  11:28 AM".
            let date = new Date(completionTime);
            let existingAttempt = earliestAttemptByUser.get(email);
            if (!existingAttempt || existingAttempt > date) {
                earliestAttemptByUser.set(email, date);
            }
        }
        return earliestAttemptByUser;
    }

    async function getAssignEarliestAttemptTimes(moduleId, userIdToEmail) {
        /**
         * Get the earliest submission time for each user.
         * Returns a map from email to date.
         *
         * Since the assignment module doesn't have a report, we have to get the data from the log.
         * The log data doesn't include the email, so this function requires a map from user ID to email.
         */

        /** get the submission times from the log */
        let url = `/report/log/index.php?sesskey=${window.M.cfg.sesskey}&download=json&id=${courseId}&modid=${moduleId}&modaction=c&chooselog=1&logreader=logstore_standard`;
        let response = await fetch(url);
        let data = await response.json();

        // for some reason there's an extra array layer
        data = data[0];

        /* The format isn't documented, so apologies for the atrocious code. */
        let earliestAttemptByUser = new Map();
        for (let row of data) {
            // The log entries we care about have a column 5 that looks like "Submission created." and a column 6 that looks like
            // "The user with id '21655' created an online text submission with '4' words in the assignment with course module id '1575205'."
            // There is no column for the email; we have to look it up.
            if (row[5] !== "Submission created.") continue;

            let userId = row[6].match(/user with id '(\d+)'/)[1];
            let email = userIdToEmail.get(userId);
            if (!email) {
                console.warn(`No email found for user ${userId}`);
                continue;
            }

            // The date format looks like "03/3/23, 20:16". Fortunately, the Date constructor seems to handle it.
            let date = new Date(row[0]);

            let existingAttempt = earliestAttemptByUser.get(email);
            if (!existingAttempt || existingAttempt > date) {
                earliestAttemptByUser.set(email, date);
            }
        }
        return earliestAttemptByUser;
    }

    function fillInTextboxIfDifferent(textbox, value) {
        value = "" + value; // make sure it's a string
        if (textbox.value !== value) {
            textbox.value = value;
            // trigger the change event
            textbox.dispatchEvent(new Event('change'));
        }
    }

    async function creditAllAttempts(activities, userIdToEmail) {
        // don't count spring break as business days.
        // Treat the days as local times, since that's needed for business day calculations.
        let exceptionDates = ['2023-02-27',
                              '2023-02-28',
                              '2023-03-01',
                              '2023-03-02',
                              '2023-03-03'].map(x => new Date(`${x}T00:00:00`));

        let activityIds = activities.map(activity => activity.id);
        // Make a map from activity id to activity name
        let activityNames = new Map();
        for (let activity of activities) {
            activityNames.set(activity.id, activity.title);
        }


        let attemptsByActivity = new Map(); // from email to array of dates
        for (let activity of activities) {
            attemptsByActivity.set(activity.id, await getEarliestAttemptTimes(activity, userIdToEmail));
        }

        // now we have a map of emails to dates of activity attempts

        // For each user, fill in the grade and feedback comments.
        let defaultDueDate = null, defaultDueElt;
        if (defaultDueElt = document.querySelector('#region-main [data-region="activity-dates"] div')) {
            defaultDueDate = new Date(defaultDueElt.textContent.trim().match(/Due: (.+)$/)[1]);
        }
        let userRows = document.querySelectorAll('.gradingtable table tbody tr');
        for (let userRow of userRows) {
            let email = userRow.querySelector('.email').textContent; // should also be .c3
            // due date column is only present if different students have different due dates
            let dueDate = userRow.querySelector('.duedate')?.textContent; // yay, optional chaining
            if (!dueDate) {
                if (!defaultDueDate) {
                    defaultDueDate = prompt("What is the due date for this assignment? (e.g. 2021-03-31 23:59:59)");
                    defaultDueDate = new Date(defaultDueDate);
                }
                dueDate = defaultDueDate;
            } else {
                dueDate = new Date(dueDate);
            }

            // Loop through each activity, count how many days late each one is.
            let resultsByActivity = new Map(), totalPoints = 0;
            for (let [activityId, attemptTimes] of attemptsByActivity) {
                let attemptTime = attemptTimes.get(email);
                if (!attemptTime) {
                    // They didn't attempt this activity.
                    resultsByActivity.set(activityId, "No attempt");
                    continue;
                }
                if (attemptTime <= dueDate) {
                    resultsByActivity.set(activityId, "On time");
                    totalPoints++;
                } else {
                    let daysLate = countBusinessDaysBetween(dueDate, attemptTime, exceptionDates);
                    resultsByActivity.set(activityId, `${daysLate} days late`);
                    // Subtract 1/5 of a point for each day late.
                    totalPoints += Math.max(0, 1 - daysLate * 0.2);
                }
            }
            let grade = totalPoints / activityIds.length;
            // Set the grade text box.
            let gradeTextBox = userRow.querySelector('input[name^=quickgrade]');
            // The maximum grade is the text just after the text box
            let outOfText = gradeTextBox.nextSibling.textContent;
            // extract just the number out of that.
            let maxGrade = parseInt(outOfText.match(/\d+/)[0]);
            fillInTextboxIfDifferent(gradeTextBox, (grade * maxGrade).toFixed(2));
            // Set the feedback text box.
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
        // Ignore any dates that are in the exception list.
        // The initial structure was generated by GitHub Copilot, but accidentally modified the startDate, and
        // its initial suggestion for exceptionDates didn't work because array.includes doesn't work on Date objects.
        let count = 0;
        // Make sure to COPY THE DATE VALUES, otherwise we'll be modifying the original dates.
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            // Get just the date part of the date.
            let dayOf = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
            // Can't use `.includes` because it doesn't properly compare Date objects.
            if (!exceptionDates.some(x => x - dayOf === 0)) {
                let day = currentDate.getDay();
                // day 0 is Sunday, day 6 is Saturday
                if (day !== 0 && day !== 6) {
                    count++;
                }
            }
            // go to the next day.
            // Note: this actually works, because setDate handles out-of-range by wrapping to the next month.
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return count;
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
                // Extract the activity type from the URL.
                if (/\/mod\/quiz\/view.php/.test(activity.url)) {
                    activity.type = 'quiz';
                } else if (/\/mod\/assign\/view.php/.test(activity.url)) {
                    activity.type = 'assign'; // Match the name of the module.
                } else if (/\/mod\/forum\/view.php/.test(activity.url)) {
                    activity.type = 'forum';
                } else {
                    // not a type we care about.
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

                let userIdToEmail = scrapeUserIdToEmailMap();
                await creditAllAttempts(activities, userIdToEmail);
            }
        });
    }

    function scrapeUserIdToEmailMap() {
        let userIdToEmail = new Map();
        let userRows = document.querySelectorAll('.gradingtable table tbody tr');
        for (let userRow of userRows) {
            let email = userRow.querySelector('.email').textContent; // should also be .c3

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

    function getMoodleTimeValue(doc, baseName) {
        let year = doc.querySelector(`[name="${baseName}[year]"]`).value;
        let month = doc.querySelector(`[name="${baseName}[month]"]`).value;
        let day = doc.querySelector(`[name="${baseName}[day]"]`).value;
        let hour = doc.querySelector(`[name="${baseName}[hour]"]`).value;
        let minute = doc.querySelector(`[name="${baseName}[minute]"]`).value;
        return new Date(year, month - 1, day, hour, minute);
    }

    function getMoodleTimeWithEnabled(doc, baseName) {
        let enabled = doc.querySelector(`[name="${baseName}[enabled]"]`).checked;
        let time = getMoodleTimeValue(doc, baseName);
        return {enabled, time};
    }

    // Retrieve quiz metadata
    async function getQuizMeta(quizId) {
        let quizModEditPage = await fetch(`https://moodle.calvin.edu/course/modedit.php?update=${quizId}`);
        // parse the HTML
        let quizModEditPageHTML = await quizModEditPage.text();
        let quizModEditPageDOM = new DOMParser().parseFromString(quizModEditPageHTML, 'text/html');
        let meta = {};
        // get grading method
        meta['gradingMethod'] = quizModEditPageDOM.querySelector('#id_grademethod').value;
        meta['gradingMethodText'] = quizModEditPageDOM.querySelector('#id_grademethod option[selected]').textContent;
        // get number of attempts allowed
        meta['attemptsAllowed'] = quizModEditPageDOM.querySelector('#id_attempts option[selected]').textContent;
        // get open time
        meta['openTime'] = getMoodleTimeWithEnabled(quizModEditPageDOM, 'timeopen');
        // get close time
        meta['closeTime'] = getMoodleTimeWithEnabled(quizModEditPageDOM, 'timeclose');
        // get time limit
        meta['timeLimit'] = {
            limit: quizModEditPageDOM.querySelector(`[name="timelimit[number]"]`).value,
            enabled: quizModEditPageDOM.querySelector(`[name="timelimit[enabled]"]`).value,
        };
        // get grade category
        meta['gradeCategory'] = quizModEditPageDOM.querySelector('#id_gradecat option[selected]').textContent;
        return meta;
    }
})();
