// Keyboard rubric grading
// On assignment pages with rubrics, use numbers to select rubric items.
// 0-9: select the corresponding rubric item
// f  : Give full credit on the rubric
// _  : Give zero credit
// >  : Save and Show Next
// n  : Toggle sending notifications
// R  : Reset
// G  : Filter to Requires Grading



// Abort if we're inside a tinymce editor.
if (!document.body.classList.contains('mce-content-body')) {
    let criterionIdx = 0;
    document.addEventListener('keydown', (event) => {
        if (event.repeat || event.defaultPrevented) return;
        if (event.target.tagName !== "BODY" && event.target.getAttribute('role') !== "button") return;
        if (event.key === '>') {
            document.querySelector('[name="saveandshownext"]').click();
        } else if (event.key === 'n') {
            document.querySelector('[data-region="grading-actions-form"] [name="sendstudentnotifications"]').click();
        } else if (event.key === 'R') {
            criterionIdx = 0;
            document.querySelector('[data-region="grading-actions-form"] [name="resetbutton"]').click();
        } else if (event.key === 'G') {
            const elt = document.querySelector('[data-region="configure-filters"] [name="filter"]');
            elt.value = 'requiregrading';
            elt.closest('select').dispatchEvent(new Event("change", {bubbles: true}));
        } else if (event.key === 'f' || event.key === '_' || (event.key >= '0' && event.key <= '9')) {
            const rubric = document.querySelector('.gradingform_rubric');
            if (!rubric) return;
            const criteria = [...rubric.querySelectorAll('tr.criterion')];

            for (let i = 0; i < criteria.length; i++) {
                const criteriaOpts = [...criteria[i].querySelector('[role="radiogroup"]').querySelectorAll('[role="radio"]')];
                const scores = criteriaOpts.map((opt) => +opt.querySelector('.scorevalue').innerText);
                if (event.key === 'f') {
                    const idxMaxScore = scores.indexOf(Math.max(...scores));
                    criteriaOpts[idxMaxScore].click();
                    criterionIdx = 0;
                } else if (event.key === '_') {
                    const idxMinScore = scores.indexOf(Math.min(...scores));
                    criteriaOpts[idxMinScore].click();
                    criterionIdx = 0;
                } else {
                    if (criterionIdx !== i) continue;
                    const targetScore = +event.key;
                    const idx = scores.indexOf(targetScore);
                    if (idx >= 0) {
                        criteriaOpts[idx].click();
                        criterionIdx = (criterionIdx + 1) % criteria.length;
                    } else {
                        console.error(`No score of ${targetScore} found in criterion ${criterionIdx}.`);
                    }
                }
            }
        }
    }, false);
}
