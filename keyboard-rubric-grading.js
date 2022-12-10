// ==UserScript==
// @name         Keyboard rubric grading
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  On assignment pages with rubrics, use numbers to select rubric items.
// @author       You
// @match        https://moodle.calvin.edu/mod/assign/view.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=calvin.edu
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Usage:
    // 0-9: select the corresponding rubric item.
    // >  : Save and Show Next
    // n  : Toggle sending notifications
    // R  : Reset
    // G  : filter to Requires Grading
    let criterionIdx = 0;
    document.addEventListener('keydown', (event) => {
        if (event.repeat || event.defaultPrevented) return;
        if (event.target.tagName !== "BODY" && event.target.getAttribute('role') !== "button") return; // Ignore key presses in input boxes and contenteditable divs. Links are ok.
        let rubric = document.querySelector('[aria-label="Rubric"]');
        if (!rubric) return;
        let criteria = [...rubric.querySelectorAll('tr.criterion')];
        let criteriaOpts = [...criteria[criterionIdx].querySelector('[role="radiogroup"]').querySelectorAll('[role="radio"]')];
        console.log(event.key);
        if (event.key >= '0' && event.key <= '9') {
            let idx = +event.key;
            if (idx < criteriaOpts.length) {
                criteriaOpts[idx].click();
                criterionIdx = (criterionIdx + 1) % criteria.length;
            }
        } else if (event.key === '>') {
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
        }
    }, false);

})();
