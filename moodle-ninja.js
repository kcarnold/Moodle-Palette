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
            let secTitle = document.getElementById(section.getAttribute('aria-labeled-by')).textContent;
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
    ninjaData.push({
        id: "Home",
        title: "Course Home",
        handler: () => {window.location = `/course/view.php?id=${courseId}`; }
    });

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
        iframe.setAttribute("sandbox", ""); // Applies all restrictions: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#attr-sandbox

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

    function mutCallback(mutationList, observer) {
        mutationList.forEach(mutation => {
            if (mutation.type !== 'childList') return;
            //console.log(mutation.addedNodes, mutation.removedNodes);
            mutation.addedNodes.forEach(node => {
                if (!node.querySelectorAll) { return; }
                hookFileSubmissions(node);
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
})();
