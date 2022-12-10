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
    let quizId = searchParams.get('id') || searchParams.get('cmid') || document.querySelector('input[name=id]').value;// edit quiz uses cmid

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
            id: "Cleanup Manual Grading",
            title: "Cleanup Manual Grading",
            handler: () => {
                document.querySelectorAll('.qtype_essay_editor.qtype_essay_response.readonly').forEach(x => {x.style.minHeight=''});
            }
        }

    ];

if (false) {
    // Add overrides in bulk. TODO: parameterize the user id.
    async function temp() {

    for (let quizId of ["1515007", "1491733", "1528545", "1491830", "1491846"]) {
    console.log(quizId);
    let response = await fetch("https://moodle.calvin.edu/mod/quiz/overrideedit.php", {
        "credentials": "include",
        "headers": {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:107.0) Gecko/20100101 Firefox/107.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Content-Type": "application/x-www-form-urlencoded",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-User": "?1"
        },
        "referrer": `https://moodle.calvin.edu/mod/quiz/overrideedit.php?action=adduser&cmid=${quizId}`,
        "body": `action=adduser&cmid=${quizId}&sesskey=7lYGVOE5k2&_qf__quiz_override_form=1&mform_isexpanded_id_override=1&userid=25090&password=&timeclose%5Bday%5D=9&timeclose%5Bmonth%5D=12&timeclose%5Byear%5D=2022&timeclose%5Bhour%5D=23&timeclose%5Bminute%5D=59&timeclose%5Benabled%5D=1&timelimit%5Bnumber%5D=40&timelimit%5Btimeunit%5D=60&timelimit%5Benabled%5D=1&attempts=1&submitbutton=Save`,
        "method": "POST",
        "mode": "cors"
    });
    console.log(response)
}}

}
})();
