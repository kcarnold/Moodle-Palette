/**
 * Utility function for sending messages between different parts of the extension.
 * @param message - The message to send.
 * @param callback - The callback function to handle the response.
 */
export function sendMessage(message: any, callback: (response: any) => void): void {
  chrome.runtime.sendMessage(message, callback);
}