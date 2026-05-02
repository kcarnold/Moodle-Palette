// Quiz Ninja — Quiz-specific commands for the shared Moodle Palette.
// Registers into window.moodlePalette when on a quiz page.



(() => {

    const searchParams = new URLSearchParams(document.location.search);
    let quizId = null;
    document.body.classList.forEach(x => {
        const match = /^cmid-(\d+)$/.exec(x);
        if (match) {
            quizId = match[1];
        }
    });
    if (quizId === null) {
        quizId = searchParams.get('id') || searchParams.get('cmid') || searchParams.get('q') || document.querySelector('input[name=id]')?.value;
    }

    function go(path, search) {
        window.location = window.location.origin + path + search;
    }

    function goQuizReportSection(section) {
        go("/mod/quiz/report.php", `?id=${quizId}&mode=${section}&includeauto=1`);
    }

    function goEdit(activityId) {
        go("/course/modedit.php", `?update=${activityId}&return=1`);
    }

    const commands = [
        {
            id: "QuizIndex",
            title: "Quiz Index",
            handler: () => { go("/mod/quiz/view.php", `?id=${quizId}`); }
        },
        {
            id: "QuizSettings",
            title: "Quiz Settings",
            handler: () => { goEdit(quizId); }
        },
        {
            id: "EditQuiz",
            title: "Edit Quiz",
            handler: () => { go("/mod/quiz/edit.php", `?cmid=${quizId}`); }
        },
        {
            id: "QuizGrading",
            title: "Manual Grading View",
            handler: () => { goQuizReportSection('grading'); }
        },
        {
            id: "QuizOverview",
            title: "Grade Overview View",
            handler: () => { goQuizReportSection('overview'); }
        },
        {
            id: "QuizResponses",
            title: "Responses View",
            handler: () => { goQuizReportSection('responses'); }
        },
        {
            id: "QuizStats",
            title: "Statistics View",
            handler: () => { goQuizReportSection('statistics'); }
        },
        {
            id: "QuizAddOverride",
            title: "Add User Override",
            handler: () => { go('/mod/quiz/overrideedit.php', `?action=adduser&cmid=${quizId}`); }
        },
        {
            id: "QuizQBank",
            title: "Question Bank",
            handler: () => { go("/question/edit.php", `?cmid=${quizId}`); }
        },
        {
            id: "CreditAllShortAnswers",
            title: "Credit All Short Answers",
            handler: () => {
                const feedbackText = prompt("Text to use", "Credit was given automatically.");
                window.$('input[name$="-mark"]').each(function() { const x = window.$(this), maxMark = x.next('[name$=maxmark]').val(); x.val(maxMark); })
                window.$('.editor_atto_content').each(function() { window.Y.one(this).setHTML(feedbackText); })
                setTimeout(() => { window.$('.icon.fa-code').click(); }, 1*1000);
                setTimeout(() => { window.$('.icon.fa-code').click(); }, 5*1000);
            }
        },
        {
            id: "LoadFeedback",
            title: "Load feedback for manual grading",
            handler: loadManualFeedback
        },
        {
            id: "CleanupManualGrading",
            title: "Cleanup Manual Grading",
            handler: () => {
                document.querySelectorAll('.qtype_essay_editor.qtype_essay_response.readonly').forEach(x => {x.style.minHeight=''});
                document.querySelectorAll('.que.correct').forEach(x => {
                    const wrapper = document.createElement('details');
                    const header = x.previousElementSibling;
                    if (!header) return;
                    header.style.display = 'inline';
                    x.parentNode.insertBefore(wrapper, header);
                    const summary = document.createElement('summary');
                    summary.appendChild(header)
                    wrapper.appendChild(summary);
                    wrapper.appendChild(x);
                  });
            }
        },
        {
            id: "NextUngraded",
            title: "Go next ungraded manual feedback",
            handler: () => {
                for (const attempt of document.querySelectorAll('.que')) {
                    const pointsBox = attempt.querySelector('input[name$="-mark"]');
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

        function getGrade(name) {
            for (const row of allComments) {
                if (name === row.name) {
                    allStudents.delete(name);
                    return row;
                }
            }
            console.warn("Missing student:", name)
            return {"Score": "", "Comments": ""};
        }

        window.$('input[name$="-mark"]').each(function(idx) {
            const elt = window.$(this);
            const container = elt.parents('.que');
            const parent = container.prevAll('h4').first().text();
            const name = /Attempt number \d+ for (.+)$/.exec(parent)[1];
            const grade = getGrade(name);
            elt.val(grade.score);
            const editor = container.find('.editor_atto_content');
            if (editor.length !== 1) {
                console.warn("Failed to find editor " + name);
            }
            editor.html(grade.comments)
        })

        console.log(allStudents)

        setTimeout(() => { window.$('.icon.fa-code').click(); }, 1*1000);
        setTimeout(() => { window.$('.icon.fa-code').click(); }, 5*1000);
    }

    // Reuse Previous Grade — needs direct ninja access for dynamic children
    function setupReusePrev(ninja) {
        const reusePrevAction = {
            id: "ReusePrev",
            title: "Reuse Previous Manual Grade",
            hotkey: "cmd+alt+n",
            children: [],
            handler: () => {
                const prevResponses = new Map();
                for (const attempt of document.querySelectorAll('.que')) {
                    const editor = attempt.querySelector('.editor_atto_content');
                    const text = editor.textContent.trim();
                    if (text === "") continue;
                    const points = attempt.querySelector('input[name$="-mark"]').value;
                    const count = (prevResponses.get(text) || {count: 0}).count + 1;
                    prevResponses.set(text, {
                        text: text,
                        html: editor.innerHTML,
                        points: points,
                        count: count
                    })
                }

                cleanupReuseGrades();

                const sortedResponses = Array.from(prevResponses.values()).sort((a, b) => b.count - a.count);
                for (const response of sortedResponses) {
                    const id = "ReusePrev" + response.text;
                    ninja.data.push({
                        id: id,
                        title: `(${response.points}): ${response.text}`,
                        parent: "ReusePrev",
                        response: response,
                        handler: reusePriorResponseFromItem
                    });
                    reusePrevAction.children.push(id);
                }

                ninja.data = ninja.data;

                ninja.open({parent: "ReusePrev"});
                return {keepOpen: true};
            }
        };

        function cleanupReuseGrades() {
            for (const item of ninja.data.slice()) {
                if (item.id === "ReusePrev") {
                    item.children = [];
                } else if (item.parent === "ReusePrev") {
                    const index = ninja.data.indexOf(item);
                    ninja.data.splice(index, 1);
                }
            }
        }

        function reusePriorResponseFromItem(item) {
            const {response} = item;
            const editor = lastFocusedEditor;
            if (!editor) {
                alert("No editor is focused.");
                return;
            }
            editor.innerHTML = response.html;
            const points = editor.closest('.que').querySelector('input[name$="-mark"]');
            points.value = response.points;

            const codeIcon = editor.closest('.que').querySelector('.icon.fa-code');
            codeIcon.click();
            setTimeout(() => { codeIcon.click(); }, .25*1000);

            points.focus();
        }

        return reusePrevAction;
    }

    // Keep track of which Atto editor was last focused.
    let lastFocusedEditor = null;
    document.addEventListener('focusin', (e) => {
        if (e.target.classList.contains('editor_atto_content')) {
            lastFocusedEditor = e.target;
            if (window.global && window.global.hotkeys) {
                window.global.hotkeys.filter = _event => true;
            }
        }
    });

    // Check rubric items using keypress
    function editorKeypress(event) {
        if (!event.altKey) return;
        const code = event.code;
        let toMark;
        if (event.code === 'Equal') {
            toMark = 'all';
        } else {
            const match = /^Digit(\d)$/.exec(code);
            if (!match) return;
            const digit = match[1];
            toMark = digit - 1;
        }

        const rubricItems = [];
        event.target.closest('.que').querySelector('.qtext').querySelectorAll('li').forEach((li) => {
            const inputBox = li.querySelector('input');
            if (!inputBox) return;
            const curIndex = rubricItems.length;
            let checked = inputBox.checked;
            const text = li.textContent.trim();
            if (toMark === 'all' || curIndex === toMark) {
                inputBox.checked = checked = !checked;
            }
            rubricItems.push({text, checked});
        });

        const rubricText = rubricItems.map((item) => {
            return (item.checked ? "\u2611\uFE0F" : "\uD83D\uDD32") + " " + item.text;
        }).join("\n");
        navigator.clipboard.writeText(rubricText);

        event.preventDefault();
        return false;
    }

    if (window.location.pathname === "/mod/quiz/report.php" && searchParams.get('mode') === "grading") {
        document.querySelectorAll('.editor_atto_content').forEach(x => {
            x.addEventListener('keydown', editorKeypress);
        })
    }

    // Autofocus search box.
    function autofocusSearchBox() {
        const elt = document.querySelector('#id_override input[data-fieldtype="autocomplete"]');
        if (elt) elt.focus();
    }
    setTimeout(autofocusSearchBox, 500);

    // Register with the shared palette
    function doRegister(palette) {
        palette.register(commands);
        const reusePrevAction = setupReusePrev(palette.ninja);
        palette.register([reusePrevAction]);
    }

    if (window.moodlePalette && window.moodlePalette.register && window.moodlePalette.ninja) {
        doRegister(window.moodlePalette);
    } else {
        // Queue for when core loads
        window.moodlePalette = window.moodlePalette || {};
        window.moodlePalette._queue = window.moodlePalette._queue || [];
        window.moodlePalette._queue.push(commands);
    }

})();
