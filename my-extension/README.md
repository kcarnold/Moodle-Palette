# My Extension

This is a browser extension built with TypeScript. It consists of a background script, a content script, and a popup window.

## Project Structure

The project has the following file structure:

- `src/background/background.ts`: This file exports a class `Background` which is the main class for the background script of the extension. It sets up event listeners and handles communication with other parts of the extension.
- `src/background/manifest.json`: This file is the manifest file for the background script. It specifies the permissions and other metadata for the script.
- `src/content_scripts/content_script.ts`: This file exports a class `ContentScript` which is the main class for the content script of the extension. It sets up event listeners and handles communication with other parts of the extension.
- `src/content_scripts/manifest.json`: This file is the manifest file for the content script. It specifies the permissions and other metadata for the script.
- `src/popup/popup.html`: This file is the HTML file for the popup window of the extension. It contains the UI elements and scripts for the popup.
- `src/popup/popup.ts`: This file exports a class `Popup` which is the main class for the popup window of the extension. It sets up event listeners and handles communication with other parts of the extension.
- `src/popup/manifest.json`: This file is the manifest file for the popup window. It specifies the permissions and other metadata for the window.
- `src/utils/index.ts`: This file exports a function `sendMessage` which is a utility function for sending messages between different parts of the extension.
- `src/manifest.json`: This file is the main manifest file for the extension. It specifies the permissions, content scripts, and other metadata for the extension.
- `src/tsconfig.json`: This file is the configuration file for TypeScript. It specifies the compiler options and the files to include in the compilation.
- `package.json`: This file is the configuration file for npm. It lists the dependencies and scripts for the project.
- `README.md`: This file contains the documentation for the project.

## Getting Started

To get started with the project, follow these steps:

1. Clone the repository to your local machine.
2. Install the dependencies by running `npm install`.
3. Build the project by running `npm run build`.
4. Load the extension into your browser by following the instructions for your specific browser.

## Contributing

If you would like to contribute to the project, please follow these steps:

1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Make your changes and commit them with descriptive commit messages.
4. Push your changes to your fork.
5. Create a pull request to merge your changes into the main repository.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.