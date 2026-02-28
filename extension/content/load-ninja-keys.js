// Inject the locally-bundled ninja-keys as an ES module.
// Runs in ISOLATED world so chrome.runtime.getURL is available.
const script = document.createElement('script');
script.type = 'module';
script.src = chrome.runtime.getURL('lib/ninja-keys.mjs');
(document.head || document.documentElement).appendChild(script);
