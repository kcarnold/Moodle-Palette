// Make Retrieval Quiz — palette command to create a retrieval quiz via Moodle's form API.
// Registers into window.moodlePalette.

'use strict';

(function() {

    // Build and inject the dialog
    const dialog = document.createElement('dialog');
    dialog.id = 'moodle-palette-create-quiz';
    dialog.innerHTML = `
        <style>
            #moodle-palette-create-quiz {
                font-family: system-ui, sans-serif;
                border: 1px solid #ccc;
                border-radius: 8px;
                padding: 1.5em;
                max-width: 400px;
                box-shadow: 0 4px 24px rgba(0,0,0,.2);
            }
            #moodle-palette-create-quiz::backdrop {
                background: rgba(0,0,0,.3);
            }
            #moodle-palette-create-quiz h3 { margin-top: 0; }
            #moodle-palette-create-quiz label {
                display: block;
                margin-bottom: .75em;
                font-size: .9em;
            }
            #moodle-palette-create-quiz label span {
                display: block;
                font-weight: 600;
                margin-bottom: .2em;
            }
            #moodle-palette-create-quiz input {
                width: 100%;
                padding: .3em .5em;
                box-sizing: border-box;
            }
            #moodle-palette-create-quiz .btn-row {
                display: flex;
                gap: .5em;
                justify-content: flex-end;
                margin-top: 1em;
            }
            #moodle-palette-create-quiz button {
                padding: .4em 1em;
                border-radius: 4px;
                border: 1px solid #ccc;
                cursor: pointer;
            }
            #moodle-palette-create-quiz button[value="create"] {
                background: #0073aa;
                color: #fff;
                border-color: #0073aa;
            }
        </style>
        <form method="dialog">
            <h3>Create Retrieval Quiz</h3>
            <label>
                <span>Name suffix</span>
                <input name="name" placeholder="e.g., W6D2" required>
            </label>
            <label>
                <span>Date</span>
                <input name="date" type="date" required>
            </label>
            <label>
                <span>Section number</span>
                <input name="section" type="number" min="0" required>
            </label>
            <label>
                <span>Open time</span>
                <input name="openTime" type="time" value="13:25">
            </label>
            <label>
                <span>Close time</span>
                <input name="closeTime" type="time" value="16:00">
            </label>
            <label>
                <span>Password</span>
                <input name="password" value="parameter">
            </label>
            <label>
                <span>Grade category ID <small>(course-specific, optional)</small></span>
                <input name="gradecat" placeholder="e.g., 126656">
            </label>
            <div class="btn-row">
                <button type="submit" value="cancel">Cancel</button>
                <button type="submit" value="create">Create</button>
            </div>
        </form>
    `;
    document.body.appendChild(dialog);

    const form = dialog.querySelector('form');

    function openDialog() {
        dialog.showModal();
    }

    dialog.addEventListener('close', async () => {
        if (dialog.returnValue !== 'create') return;

        const data = new FormData(form);
        const name = data.get('name');
        const date = data.get('date');
        const section = data.get('section');
        const [openHour, openMinute] = data.get('openTime').split(':');
        const [closeHour, closeMinute] = data.get('closeTime').split(':');
        const password = data.get('password');
        const gradecat = data.get('gradecat');

        const courseId = window.moodlePalette?.courseId || window.M?.cfg?.courseId;
        const sesskey = window.M?.cfg?.sesskey;

        if (!courseId || !sesskey) {
            alert('Could not determine course ID or session key.');
            return;
        }

        const [year, month, day] = date.split('-').map(Number);

        const itemid1 = Math.floor(Math.random() * 900000000) + 100000000;
        const itemid2 = Math.floor(Math.random() * 900000000) + 100000000;
        const itemid3 = Math.floor(Math.random() * 900000000) + 100000000;

        const params = new URLSearchParams({
            grade: '100',
            boundary_repeats: '1',
            completionunlocked: '1',
            course: courseId,
            coursemodule: '',
            section: section,
            module: '13',
            modulename: 'quiz',
            instance: '',
            add: 'quiz',
            update: '0',
            return: '0',
            sr: '-1',
            beforemod: '0',
            showonly: '',
            sesskey: sesskey,
            '_qf__mod_quiz_mod_form': '1',
            'mform_isexpanded_id_general': '1',
            'mform_isexpanded_id_timing': '1',
            'mform_isexpanded_id_modstandardgrade': '1',
            'mform_isexpanded_id_layouthdr': '1',
            'mform_isexpanded_id_interactionhdr': '1',
            'mform_isexpanded_id_reviewoptionshdr': '1',
            'mform_isexpanded_id_security': '1',
            name: `Retrieval Quiz ${name}`,
            'introeditor[text]': '',
            'introeditor[format]': '1',
            'introeditor[itemid]': itemid1,
            showdescription: '0',
            'timeopen[enabled]': '1',
            'timeopen[day]': day,
            'timeopen[month]': month,
            'timeopen[year]': year,
            'timeopen[hour]': openHour,
            'timeopen[minute]': openMinute,
            'timeclose[enabled]': '1',
            'timeclose[day]': day,
            'timeclose[month]': month,
            'timeclose[year]': year,
            'timeclose[hour]': closeHour,
            'timeclose[minute]': closeMinute,
            overduehandling: 'autosubmit',
            gradepass: '',
            attempts: '0',
            grademethod: '1',
            questionsperpage: '1',
            navmethod: 'free',
            shuffleanswers: '1',
            preferredbehaviour: 'deferredfeedback',
            attemptonlast: '0',
            // Review options — all enabled for all phases
            maxmarksduring: '1',
            attemptimmediately: '1', correctnessimmediately: '1',
            maxmarksimmediately: '1', marksimmediately: '1',
            specificfeedbackimmediately: '1', generalfeedbackimmediately: '1',
            rightanswerimmediately: '1', overallfeedbackimmediately: '1',
            attemptopen: '1', correctnessopen: '1',
            maxmarksopen: '1', marksopen: '1',
            specificfeedbackopen: '1', generalfeedbackopen: '1',
            rightansweropen: '1', overallfeedbackopen: '1',
            attemptclosed: '1', correctnessclosed: '1',
            maxmarksclosed: '1', marksclosed: '1',
            specificfeedbackclosed: '1', generalfeedbackclosed: '1',
            rightanswerclosed: '1', overallfeedbackclosed: '1',
            showuserpicture: '0',
            decimalpoints: '2',
            questiondecimalpoints: '-1',
            showblocks: '0',
            quizpassword: password,
            subnet: '',
            browsersecurity: '-',
            allowofflineattempts: '0',
            'feedbacktext[0][text]': '',
            'feedbacktext[0][format]': '1',
            'feedbacktext[0][itemid]': itemid2,
            'feedbackboundaries[0]': '',
            'feedbacktext[1][text]': '',
            'feedbacktext[1][format]': '1',
            'feedbacktext[1][itemid]': itemid3,
            visible: '1',
            cmidnumber: '',
            lang: '',
            downloadcontent: '1',
            groupmode: '0',
            availabilityconditionsjson: '{"op":"&","c":[],"showc":[]}',
            completion: '0',
            tags: '_qf__force_multiselect_submission',
            competencies: '_qf__force_multiselect_submission',
            competency_rule: '0',
            submitbutton: 'Save and display',
        });

        if (gradecat) {
            params.set('gradecat', gradecat);
        }

        try {
            const resp = await fetch(`${window.location.origin}/course/modedit.php`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString(),
                method: 'POST',
            });

            if (resp.ok) {
                alert(`Created "Retrieval Quiz ${name}" in section ${section}.\n\n${resp.url}`);
            } else {
                alert(`Failed to create quiz: ${resp.status} ${resp.statusText}`);
            }
        } catch (err) {
            alert(`Error creating quiz: ${err.message}`);
        }
    });

    // Register with the shared palette
    const command = [{
        id: 'CreateRetrievalQuiz',
        title: 'Create Retrieval Quiz',
        handler: openDialog,
    }];

    if (window.moodlePalette && window.moodlePalette.register) {
        window.moodlePalette.register(command);
    } else {
        window.moodlePalette = window.moodlePalette || {};
        (window.moodlePalette._queue = window.moodlePalette._queue || []).push(command);
    }

})();
