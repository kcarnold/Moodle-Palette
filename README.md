# Moodle-Palette
Command palette for Moodle

I use Firefox, and our Moodle is 3.11 with a customized Fordson theme. If yours is different you might see some failures in the Javascript console. I tried to use robust selectors but I haven’t tried it on any other environment.
 
Control/command-P launches it. Try navigating home or to activities by name.
 
I’ve been hacking on the “Show Uploads” recently, because I’m grading submissions that are HTML or other documents that show better as themselves instead of a slow PDF conversion by mod_assign. It’s still kinda hacky, but once activated, it handles clicks on the file icons. (I did a MutationObserver there, but I just realized that a bubbling event handler on a sufficiently high-up parent node would have been easier.)
 
Quiz-ninja has more stuff specific to quizzes, I haven’t merged it in. Ctrl-K to launch, so I just have both running at the same time.
 
I have a few other scripts too, it’s a hodgepodge at the moment but I’d like to clean up and merge these sometime. Probably a project for some students someday.

## TODO

- Make it a browser extension https://github.com/cezaraugusto/extension.js
- Move to https://github.com/KonnorRogers/konnors-ninja-keys
