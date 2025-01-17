# AI Code Exporter

<div align="center">

![AI Code Exporter](resources/icon.png)

Export your code as XML for AI models like ChatGPT. Select files and folders via a tree view, then export to file or clipboard.

[![Version](https://img.shields.io/visual-studio-marketplace/v/EinonBititOy.ai-code-exporter)](https://marketplace.visualstudio.com/items?itemName=EinonBititOy.ai-code-exporter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

## Features

- 🌳 **Smart Tree View**:
  - Easy file/folder selection in the Activity Bar
  - Auto-expanded root folder for quick access
  - Shows partial selection state for folders
  - Remembers selections between sessions

- ✅ **Advanced Selection**:
  - Checkbox-based selection of files and folders
  - Recursive folder selection (selects all contents)
  - Clear all selections with one click
  - Visual feedback for partial folder selections

- 📤 **Flexible Export Options**:
  - Save as XML file
  - Copy to clipboard as XML
  - Preserves file paths and content
  - CDATA sections for safe content encoding

- 🔒 **Git Integration**:
  - Toggle .gitignore support with visual feedback
  - Automatically excludes .git directory
  - Respects .gitignore patterns when enabled
  - Shows current .gitignore state in UI

## Installation

You can install this extension through the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=EinonBititOy.ai-code-exporter).

1. Open VS Code
2. Press `Ctrl+P` (Windows/Linux) or `Cmd+P` (macOS)
3. Type `ext install EinonBititOy.ai-code-exporter`
4. Press Enter

## Usage

1. Click the "Export to XML" icon in the Activity Bar (side panel)
2. Use checkboxes to select files and folders:
   - Click checkbox to select/deselect individual files
   - Select a folder to include all its contents
   - Folders show partial state when some contents are selected
3. Use the toolbar buttons:
   - 📤 Export selected files to XML file
   - 📋 Copy selected files as XML to clipboard
   - 🔄 Toggle .gitignore support (hides ignored files)
   - ❌ Clear all selections
4. For file export:
   - Choose a location to save your XML file
   - The extension will generate an XML file containing all selected items
5. For clipboard export:
   - The XML content will be copied to your clipboard
   - Paste it wherever you need it (e.g., ChatGPT, documentation)

## XML Format

The exported XML follows this structure:

```xml
<project>
    <file path="path/to/file.ext">
        <content><![CDATA[
            // File contents here
        ]]></content>
    </file>
</project>
```

## Requirements

- Visual Studio Code ^1.93.1

## Extension Settings

This extension works out of the box with these features:
- Automatic .git directory exclusion
- Optional .gitignore support (toggle in toolbar)
- Selection state persistence between sessions
- Auto-expanded root folder view

## Known Issues

No known issues. If you find a bug, please [report it](https://github.com/eino-makitalo/ai-code-exporter/issues).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Development

1. Clone the repository
2. Run `npm install`
3. Build using `npm run compile`
4. Press F5 in VS Code to run/debug

Available scripts:
- `npm run compile`: Compile the extension
- `npm run watch`: Watch for changes and recompile
- `npm run lint`: Run ESLint
- `npm run test`: Run tests

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you find this extension helpful, please consider:
- ⭐ Starring the repository
- 📝 Writing a review on the VS Code Marketplace
- 🐛 Reporting any issues you find
- 💡 Contributing to the code
-  Buy me coffee 0x8775dfA69cEaec2a15761a6bcab660137ebEaCb0  (ERC-20/Base)