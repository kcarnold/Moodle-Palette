class Background {
  constructor() {
    // Set up event listeners
    chrome.runtime.onMessage.addListener(this.handleMessage);
  }

  handleMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    // Handle messages from other parts of the extension
    if (message.type === 'popupOpen') {
      // Do something when the popup is opened
    }
  }
}

new Background();