# Backlog

## Extract page-specific features from moodle-ninja.js into plugins

Now that the plugin API exists, these page-gated blocks in moodle-ninja.js should be extracted as separate content scripts. Each is self-contained but needs testing on the actual Moodle pages.

### assign-grading-ninja.js (`/mod/assign/view.php`)
- Credit from Quizzes (+ all helper functions: `getEarliestAttemptTimes`, `getQuizEarliestAttemptTimes`, `getAssignEarliestAttemptTimes`, `creditAllAttempts`, `countBusinessDaysBetween`, `getMatchingActivities`, `scrapeUserIdToEmailMap`)
- Credit Any Submissions
- Grade From Random Student
- Show Quick-Grade Comments (+ `scrapeQuickGradeComments`)
- Needs `activityDirectory` and `courseId` from `moodlePalette` — both already exposed

### course-home-ninja.js (`/course/view.php`)
- Scrape All Quick Grade Comments (+ `scrapeAllQuickGradeComments`, `scrapeAndStoreAllQuickGradeComments`)

### grade-singleview-ninja.js (`/grade/report/singleview/index.php`)
- Show Full Feedback command
- Alt+Arrow feedback navigation (keydown listener)

### grade-import-ninja.js (`/grade/import/*`)
- Match Import Names

### quiz-review-ninja.js (`/mod/quiz/review.php`)
- Quick Comment Buttons (injected into attempt review page)

### quiz-edit-ninja.js (`/mod/quiz/edit.php`)
- Export One Question Button

### modedit-ninja.js (`/course/modedit.php`)
- Edit Next (jump to next activity of same slug)
- Needs `activityDirectoryFlat` — would need to be exposed on `moodlePalette` or computed from `activityDirectory`

### Notes
- Each extraction needs manifest.json entries with appropriate `matches` patterns
- Test each on the actual Moodle page after extraction — DOM selectors and Moodle globals are fragile
- The helper functions shared between assign-grading features are tightly coupled; extract them together
- `fillInTextboxIfDifferent` and `stripTrailingZeros` are only used by credit-grading; move with them
