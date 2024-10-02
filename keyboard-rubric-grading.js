// ==UserScript==
// @name         Keyboard rubric grading
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  On assignment pages with rubrics, use numbers to select rubric items.
// @author       You
// @match        https://moodle.calvin.edu/mod/assign/view.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=calvin.edu
// @grant        unsafeWindow
// @run-at document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Abort if we're inside a tinymce editor.
    if (document.body.classList.contains('mce-content-body')) {
        return;
    }

    // Usage:
    // 0-9: select the corresponding rubric item.
    // f  : Give full credit on the rubric
    // >  : Save and Show Next
    // n  : Toggle sending notifications
    // R  : Reset
    // G  : filter to Requires Grading
    let criterionIdx = 0;
    document.addEventListener('keydown', (event) => {
        if (event.repeat || event.defaultPrevented) return;
        if (event.target.tagName !== "BODY" && event.target.getAttribute('role') !== "button") return; // Ignore key presses in input boxes and contenteditable divs. Links are ok.
        if (event.key === '>') {
            document.querySelector('[name="saveandshownext"]').click();
        } else if (event.key === 'n') {
            document.querySelector('[data-region="grading-actions-form"] [name="sendstudentnotifications"]').click();
        } else if (event.key === 'R') {
            criterionIdx = 0;
            document.querySelector('[data-region="grading-actions-form"] [name="resetbutton"]').click();
        } else if (event.key === 'G') {
            let elt = document.querySelector('[data-region="configure-filters"] [name="filter"]');
            elt.value = 'requiregrading';
            elt.closest('select').dispatchEvent(new Event("change", {bubbles: true}));
        } else if (event.key === 'f' || event.key === '_' || (event.key >= '0' && event.key <= '9')) {
            let rubric = document.querySelector('.gradingform_rubric');
            if (!rubric) return;
            let criteria = [...rubric.querySelectorAll('tr.criterion')];

            for (let i = 0; i < criteria.length; i++) {
                let criteriaOpts = [...criteria[i].querySelector('[role="radiogroup"]').querySelectorAll('[role="radio"]')];
                let scores = criteriaOpts.map((opt) => +opt.querySelector('.scorevalue').innerText);
                console.log(scores);
                if (event.key === 'f') {
                    // give full credit.
                    let idxMaxScore = scores.indexOf(Math.max(...scores));
                    criteriaOpts[idxMaxScore].click();
                    criterionIdx = 0;
                } else if (event.key === '_') {
                    // give zero credit.
                    let idxMinScore = scores.indexOf(Math.min(...scores));
                    criteriaOpts[idxMinScore].click();
                    criterionIdx = 0;
                } else {
                    // Only adjust the current criterion.
                    if (criterionIdx !== i) continue;
                    // At this point we know that event.key is a number, since it's not f.
                    let targetScore = +event.key;
                    let idx = scores.indexOf(targetScore);
                    if (idx >= 0) {
                        // click the corresponding criterion.
                        criteriaOpts[idx].click();
                        criterionIdx = (criterionIdx + 1) % criteria.length;
                    } else {
                        console.error(`No score of ${targetScore} found in criterion ${criterionIdx}.`);
                    }
                }
            }
        }
    }, false);

})();
