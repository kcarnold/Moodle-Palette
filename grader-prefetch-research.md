Going to the next student is pretty slow (several seconds of latency). How hard would it be to prefetch or hide the latency some other way?

The "View all submissions" page has the following link that pulls a complete submission text (but also other stuff...)
https://moodle.calvin.edu/mod/assign/view.php?id=2205702&sid=2875285&gid=2875285&plugin=onlinetext&action=viewpluginassignsubmission&returnaction=grading&returnparams
but it looks like this page is making an ajax request that may be better.

We could also download all submissions as ZIP, which I found as https://moodle.calvin.edu/mod/assign/view.php?id=2205702&action=downloadall

---


Great question. I did a deep dive into Moodle's grading SPA architecture and the network calls involved. Here's what I found:

## How the Grading Navigation Works

The grading page is actually a **single-page app** — clicking the next/prev arrows doesn't do a full page reload. Instead, it triggers a jQuery `user-changed` event that fires two parallel AJAX calls:

1. **`mod_assign_get_participant`** — fetches the user info header (name, photo, submission status). ~175–515ms. The `grading_navigation_user_info` module already caches these in `_userCache`, so repeat visits are instant.

2. **`core_get_fragment` (gradingpanel callback)** — this is the big one. It asks the server to server-side render the entire grading form (submission display, grade input, TinyMCE feedback editor) and returns ~15KB of HTML+JS. **475–700ms** in my tests.

After the fragment returns, there are additional serial requests: TinyMCE editor initialization (~800ms!), draft file listings (~120ms), and editpdf quicklist loading (~130ms). Plus fade-in/fade-out animations on both the loading spinner and final content.

**Total perceived latency: ~1.5–2+ seconds**, and likely worse on a cold server or busy periods.

## Prefetch Strategy: Feasibility = Medium, Impact = High

The good news: **prefetching is very doable** because the user list is already loaded client-side (via `mod_assign_list_participants`), so we always know which user comes next. Here's a concrete approach:

### Option 1: Prefetch the Fragment (best bang for the buck)

Inject a script that, after the current student finishes loading, immediately fires the `core_get_fragment` call for the **next** user and caches the HTML+JS. When the user clicks "next", serve from cache instead of making the network request. This eliminates the ~500–700ms server round-trip.

The code would look roughly like:

```javascript
// After 'finish-loading-user' fires, prefetch next user's grading panel
$(document).on('finish-loading-user', function() {
    const users = navigationInstance._filteredUsers;
    const currentId = parseInt($('[data-action=change-user]').attr('data-selected'));
    const idx = users.findIndex(u => u.id == currentId);
    const nextId = users[(idx + 1) % users.length]?.id;
    
    if (nextId && !prefetchCache[nextId]) {
        // Prefetch participant info
        ajax.call([{
            methodname: 'mod_assign_get_participant',
            args: {userid: nextId, assignid: assignmentId, embeduser: true},
            done: (data) => { participantCache[nextId] = data; }
        }]);
        
        // Prefetch grading panel fragment
        fragment.loadFragment('mod_assign', 'gradingpanel', contextId, {
            userid: nextId, attemptnumber: -1, jsonformdata: '""'
        }).done((html, js) => {
            prefetchCache[nextId] = {html, js};
        });
    }
});
```

Then monkey-patch `_refreshGradingPanel` to check the cache before making the network call.

**Difficulty: Medium.** The tricky parts are: (a) getting a reference to the live `GradingNavigation` instance to access `_filteredUsers` (you'd need to intercept construction or walk the DOM), and (b) the TinyMCE initialization that happens *after* the HTML is inserted still takes ~800ms and can't easily be prefetched since it needs to be in the DOM.

### Option 2: Download All as ZIP + Custom UI

The `action=downloadall` URL would give you all submission text at once. You could build a completely separate grading interface that loads all submissions up front and navigates instantly. This would be the fastest user experience but the most work — essentially replacing Moodle's grading UI.

### Option 3: Quick Wins to Reduce Perceived Latency

Even without full prefetching:

- **Remove the fade animations**: The existing code does `fadeOut("fast")` → replace → `fadeIn("fast")` in multiple places. That's ~400ms of animation on top of the network time. You could monkey-patch `_niceReplaceNodeContents` to do instant replacement.
- **Prefetch just the participant data**: The `_userCache` in `grading_navigation_user_info` already caches this. You could pre-warm it for next/prev users with a single line, saving ~200–500ms of the header update.
- **Pre-render the loading spinner**: The current code renders the loading template via a Mustache call *before* starting the fragment fetch, introducing a small serial delay.

### My Recommendation

I'd go with **Option 1 + Option 3 combined**, implemented as a Tampermonkey/Greasemonkey userscript or a small Moodle local plugin. The fragment prefetch eliminates the biggest bottleneck, and removing the fade animations gets you another 400ms. The remaining latency would just be TinyMCE initialization (~200ms with warm cache), which is harder to eliminate but could be masked by showing the submission text first and letting the feedback editor load in the background.

Want me to prototype any of these approaches?