// Dates report, e.g., https://moodle.calvin.edu/report/editdates/index.php?id=61910&activitytype=quiz
// Set close times according to element names.

document.querySelectorAll('fieldset[id^=id_section]').forEach(header => {
  const activities = header.querySelectorAll('.fcontainer strong');
  activities.forEach(activityHeader => {
    const activityName = activityHeader.textContent;
    console.log(activityName);
    // The layout of this page isn't helpful: the times are just siblings of the activity name.
    // So we have to find the activity name, then find the next sibling that has an 'id' ending in 'timeclose'.
    // Alternatively, I notice that the icons have URLs like https://moodle.calvin.edu/theme/image.php/boost/quiz/1704903128/monologo?filtericon=1
    // which gives the activity id, so we could use that to find the timeclose element.
    
  })
})

// Set all close times to 11:59pm
document.querySelectorAll('[data-groupname$=timeclose]').forEach(datetime => {
    datetime.querySelector('select[id$=_hour]').value = 23;
    datetime.querySelector('select[id$=_minute]').value = 59;
});

