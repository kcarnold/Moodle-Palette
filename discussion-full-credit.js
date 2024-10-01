// ==UserScript==
// @name         Discussion Full Credit
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://moodle.calvin.edu/mod/forum/view.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=calvin.edu
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    document.addEventListener('keydown', (event) => {
        if (event.repeat || event.defaultPrevented) return;
        if (event.target.tagName === "TEXTAREA") return;
        //if (event.target.tagName !== "BODY" && event.target.tagName !== "A" && event.target.getAttribute('role') !== "button") return; // Ignore key presses in input boxes and contenteditable divs. Links are ok.
        if (event.key == "f") {
            document.querySelectorAll('.criterion [role="radiogroup"]').forEach(criterion => {
                let levels = [...criterion.querySelectorAll('[type="radio"]')];
                levels[levels.length - 1].click()
            });
        } else if (event.key == "m") {
            // Missing (use the second radio button, corresponding to the lowest score)
            document.querySelectorAll('.criterion [role="radiogroup"]').forEach(criterion => {
                let levels = [...criterion.querySelectorAll('[type="radio"]')];
                levels[1].click()
            });
        } else if (event.key == '>') {
            let btn = document.querySelector('.page-link[title*="proceed to the next user"]');
            if (btn) btn.click();
        }
    }, false);
})();