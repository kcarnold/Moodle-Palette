// ==UserScript==
// @name         Quiz Ninja
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://moodle.calvin.edu/mod/quiz/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=calvin.edu
// @grant        none
// @run-at document-idle
// ==/UserScript==

(function() {
    'use strict';

    let searchParams = new URLSearchParams(document.location.search);
    let quizId = searchParams.get('id') || searchParams.get('cmid') || searchParams.get('q') || document.querySelector('input[name=id]').value;// edit quiz uses cmid

    function go(path, search) {
        window.location = window.location.origin + path + search;
    }

    function goQuizReportSection(section) {
        // section: ['overview', 'grading', 'responses']
        go("/mod/quiz/report.php", `?id=${quizId}&mode=${section}&includeauto=1`);
    }

    function goEdit(activityId) {
        go("/course/modedit.php", `?update=${activityId}&return=1`);
    }

    // https://github.com/ssleptsov/ninja-keys
    let tag = document.createElement('script');
    tag.setAttribute('type', 'module');
    tag.setAttribute('src', "https://unpkg.com/ninja-keys?module");
    document.body.appendChild(tag);

    let ninja = document.createElement('ninja-keys');
    document.body.appendChild(ninja);

    ninja.data = [
        {
            id: "Index",
            title: "Quiz Index",
            handler: () => { go("/mod/quiz/view.php", `?id=${quizId}`); }
        },
        {
            id: "Settings",
            title: "Quiz Settings",
            handler: () => { goEdit(quizId); }
        },
        {
            id: "Edit Quiz",
            title: "Edit Quiz",
            handler: () => { go("/mod/quiz/edit.php", `?cmid=${quizId}`); }
        },
        {
            id: "Grading",
            title: "Manual Grading View",
            handler: () => { goQuizReportSection('grading'); }
        },
        {
            id: "QuizOverview",
            title: "Grade Overview View",
            handler: () => { goQuizReportSection('overview'); }
        },
        {
            id: "Responses",
            title: "Responses View",
            handler: () => { goQuizReportSection('responses'); }
        },
        {
            id: "Stats",
            title: "Statistics View",
            handler: () => { goQuizReportSection('statistics'); }
        },
        {
            id: "AddOverride",
            title: "Add User Override",
            handler: () => { go('/mod/quiz/overrideedit.php', `?action=adduser&cmid=${quizId}`); }
        },
        {
            id: "QBank",
            title: "Question Bank",
            handler: () => { go("/question/edit.php", `?cmid=${quizId}`); }
        },
        {
            id: "Credit All Short Answers",
            title: "Credit All Short Answers",
            handler: () => {
                //feedbackText = "Automatically credited; see solutions.";
                let feedbackText = prompt("Text to use", "Credit was given automatically.");
                window.$('input[name$="-mark"]').each(function() { let x = window.$(this), maxMark = x.next('[name$=maxmark]').val(); x.val(maxMark); })
                window.$('.editor_atto_content').each(function() { window.Y.one(this).setHTML(feedbackText); })
                setTimeout(function() { window.$('.icon.fa-code').click(); }, 1*1000);
                setTimeout(function() { window.$('.icon.fa-code').click(); }, 5*1000);
            }
        },
        {
            id: "Load feedback",
            title: "Load feedback for manual grading",
            handler: loadManualFeedback
        },
        {
            id: "Cleanup Manual Grading",
            title: "Cleanup Manual Grading",
            handler: () => {
                document.querySelectorAll('.qtype_essay_editor.qtype_essay_response.readonly').forEach(x => {x.style.minHeight=''});
            }
        },
        {
            id: "NextUngraded",
            title: "Go next ungraded manual feedback",
            handler: () => {
                // Get all non-empty previous responses
                for (let attempt of document.querySelectorAll('.que.essay')) {
                    let pointsBox = attempt.querySelector('input[name$="-mark"]');
                    if (pointsBox && pointsBox.value.trim() === "") {
                        pointsBox.focus();
                        break;
                    }
                }
            }
        }
    ];

    function loadManualFeedback() {
        const allComments = JSON.parse(prompt("paste comments JSON here: "));

        const allStudents = new Set(allComments.map(x => x.Name))
        console.log(allComments, allStudents);

        function getGrade(name) {
            for (let row of allComments) {
                if (name == row.name) {
                    allStudents.delete(name);
                    return row;
                }
            }
            console.warn("Missing student:", name)
            return {"Score": "", "Comments": ""};
        }

        window.$('input[name$="-mark"]').each(function(idx) {
            let elt = window.$(this);
            let container = elt.parents('.que');
            let parent = container.prevAll('h4').first().text();
            let name = /Attempt number \d+ for (.+)$/.exec(parent)[1];
            let grade = getGrade(name);
            elt.val(grade.score);
            let editor = container.find('.editor_atto_content');
            if (editor.length != 1) {
                console.warn("Failed to find editor " + name);
            }
            editor.html(grade.comments)
        })

        console.log(allStudents)

        setTimeout(function() { window.$('.icon.fa-code').click(); }, 1*1000);
        setTimeout(function() { window.$('.icon.fa-code').click(); }, 5*1000);
    }

    let reusePrevAction = {
        id: "ReusePrev",
        title: "Reuse Previous Manual Grade",
        hotkey: "cmd+alt+n",
        children: [],
        handler: () => {
            // Get all non-empty previous responses
            let prevResponses = new Map();
            for (let attempt of document.querySelectorAll('.que.essay')) {
                let editor = attempt.querySelector('.editor_atto_content');
                let text = editor.textContent.trim();
                if (text === "") continue;
                let points = attempt.querySelector('input[name$="-mark"]').value;
                let count = (prevResponses.get(text) || {count: 0}).count + 1;
                prevResponses.set(text, {
                    text: text,
                    html: editor.innerHTML,
                    points: points,
                    count: count
                })
            }

            cleanupReuseGrades();

            // Add a new entry for each response, in descending order of `count`.
            let sortedResponses = Array.from(prevResponses.values()).sort((a, b) => b.count - a.count);
            for (let response of sortedResponses) {
                let id = "ReusePrev" + response.text;
                ninja.data.push({
                    id: id,
                    title: `(${response.points}): ${response.text}`,
                    parent: "ReusePrev",
                    response: response,
                    handler: reusePriorResponseFromItem
                });
                reusePrevAction.children.push(id);
            }

            // Force update
            ninja.data = ninja.data;

            // Open the ninja menu
            ninja.open({parent: "ReusePrev"});
            // prevent from closing
            return {keepOpen: true};
        }
    }

    ninja.data.push(reusePrevAction);
    // force update
    ninja.data = ninja.data.slice();


    // Keep track of which Atto editor was last focused.
    let lastFocusedEditor = null;
    document.addEventListener('focusin', function(e) {
        if (e.target.classList.contains('editor_atto_content')) {
            lastFocusedEditor = e.target;
            window.global.hotkeys.filter = _event => true; // HACK: turn off hotkey filtering for input boxes.
        }
    });



    function cleanupReuseGrades() {
        // Clear out any existing responses in ninja-data
        // Loop through a copy of ninja.data so we can modify it.
        for (let item of ninja.data.slice()) {
            if (item.id === "ReusePrev") {
                item.children = [];
            } else if (item.parent === "ReusePrev") {
                // Remove this item from ninja.data
                let index = ninja.data.indexOf(item);
                ninja.data.splice(index, 1); // splice args: index, num items to remove, items to insert (none in this case)
            }
        }
    }

    function reusePriorResponseFromItem(item) {
        let {response} = item;
        let editor = lastFocusedEditor;
        if (!editor) {
            alert("No editor is focused.");
            return;
        }
        editor.innerHTML = response.html;
        let points = editor.closest('.que.essay').querySelector('input[name$="-mark"]');
        points.value = response.points;

        // Need to click the "code" button off and on to get the HTML change to save.
        let codeIcon = editor.closest('.que.essay').querySelector('.icon.fa-code');
        codeIcon.click();
        setTimeout(function() { codeIcon.click(); }, .25*1000);

        // Focus the points box so we can tab to the next one.
        points.focus();
    }

    // Autofocus search box.
    function autofocusSearchBox() {
        let elt = document.querySelector('#id_override input[data-fieldtype="autocomplete"]');
        console.log(elt);
        if (elt) elt.focus();
    }
    setTimeout(autofocusSearchBox, 500);

})();
