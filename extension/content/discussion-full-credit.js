// Discussion Full Credit
// Keyboard shortcuts for forum grading:
// f : Full credit (last radio = highest)
// m : Missing (second radio = lowest)
// > : Proceed to the next user

'use strict';

document.addEventListener('keydown', (event) => {
    if (event.repeat || event.defaultPrevented) return;
    if (event.target.tagName === "TEXTAREA") return;
    if (event.key == "f") {
        document.querySelectorAll('.criterion [role="radiogroup"]').forEach(criterion => {
            let levels = [...criterion.querySelectorAll('[type="radio"]')];
            levels[levels.length - 1].click();
        });
    } else if (event.key == "m") {
        document.querySelectorAll('.criterion [role="radiogroup"]').forEach(criterion => {
            let levels = [...criterion.querySelectorAll('[type="radio"]')];
            levels[1].click();
        });
    } else if (event.key == '>') {
        let btn = document.querySelector('.page-link[title*="proceed to the next user"]');
        if (btn) btn.click();
    }
}, false);
