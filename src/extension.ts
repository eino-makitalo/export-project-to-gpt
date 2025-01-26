import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';

/**
 * Key used for storing file paths in workspaceState.
 */
const CHECKED_PATHS_KEY = 'ai-code-exporter.checkedPaths';

/**
 * Represents each item in the tree (folder or file).
 */
class MyTreeItem extends vscode.TreeItem {
  public children: MyTreeItem[] | undefined;
  public fsPath: string;
  public isDirectory: boolean;

  constructor(fsPath: string, label: string, isDirectory: boolean) {
    super(
      label,
      isDirectory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    this.fsPath = fsPath;
    this.isDirectory = isDirectory;
    this.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
    
    // Remove all default icons and context menu items
    this.resourceUri = undefined;
    this.contextValue = '';
    this.iconPath = undefined;

    // Only add the command for non-directory items or for the checkbox click
    if (!isDirectory) {
      this.command = {
        command: 'myExportTree.toggleCheckbox',
        title: 'Toggle Selection',
        arguments: [this]
      };
    }
  }

  setPartialState() {
    this.description = '(partial)';
    this.tooltip = 'Some items in this folder are selected';
    this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
  }

  clearPartialState() {
    this.description = undefined;
    this.tooltip = undefined;
    this.iconPath = undefined;
  }
}

class ExportTreeProvider implements vscode.TreeDataProvider<MyTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<MyTreeItem | undefined | void> =
    new vscode.EventEmitter<MyTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<MyTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  private checkedPaths: Set<string> = new Set<string>();
  public itemCache: Map<string, MyTreeItem> = new Map();
  private useGitignore: boolean = false;
  private gitignoreFilter = ignore();

  /**
   * Store all workspace folder paths. If multiple folders are open in a multi-root
   * workspace, we show top-level items for each.
   */
  constructor(
    public workspaceFolders: readonly vscode.WorkspaceFolder[],
    private context: vscode.ExtensionContext
  ) {
    // Load previously stored checked paths
    const stored = context.workspaceState.get<string[]>(CHECKED_PATHS_KEY) || [];
    this.checkedPaths = new Set(stored);

    // Load and initialize .gitignore state
    this.useGitignore = context.workspaceState.get<boolean>('useGitignore') || false;
    if (this.useGitignore) {
      this.initGitignoreFilter();
    }

    // Log the loaded settings
    console.log(`Loaded checked paths from workspaceState:`, Array.from(this.checkedPaths));
    console.log(`Loaded .gitignore support state:`, this.useGitignore);

    // Initialize the tree and calculate states
    this.initializeTree();
  }

  /**
   * Initialize the tree by pre-loading all items into cache and calculating states
   */
  private async initializeTree(): Promise<void> {
    // First, recursively load all items into cache
    for (const folder of this.workspaceFolders) {
      await this.preloadItemsIntoCache(folder.uri.fsPath);
    }

    // Then calculate states for all folders
    await this.calculateInitialFolderStates();
  }

  /**
   * Recursively load all items in a directory into the cache
   */
  private async preloadItemsIntoCache(dirPath: string): Promise<void> {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      
      // Create/update item for this directory
      const name = path.basename(dirPath);
      let item = this.itemCache.get(dirPath);
      if (!item) {
        item = new MyTreeItem(dirPath, name, true);
        if (dirPath === this.workspaceFolders[0].uri.fsPath) {
          item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
        this.itemCache.set(dirPath, item);
      }

      // Process all entries
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        // Skip if path should be excluded
        if (!this.shouldIncludePath(fullPath)) {
          continue;
        }

        // Create/update cache entry
        let childItem = this.itemCache.get(fullPath);
        if (!childItem) {
          childItem = new MyTreeItem(fullPath, entry.name, entry.isDirectory());
          this.itemCache.set(fullPath, childItem);
        }

        // Set initial checkbox state
        if (this.checkedPaths.has(fullPath)) {
          childItem.checkboxState = vscode.TreeItemCheckboxState.Checked;
        }

        // Recursively process subdirectories
        if (entry.isDirectory()) {
          await this.preloadItemsIntoCache(fullPath);
        }
      }
    } catch (err) {
      console.error(`Error preloading items from ${dirPath}:`, err);
    }
  }

  private initGitignoreFilter() {
    if (this.workspaceFolders && this.workspaceFolders.length > 0) {
      const gitignorePath = path.join(this.workspaceFolders[0].uri.fsPath, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        
        // Create a new ignore instance
        this.gitignoreFilter = ignore();
        
        // Split content into lines and process each line
        const lines = gitignoreContent.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#')); // Remove empty lines and comments
        
        // Log the patterns we're adding
        console.log('Adding .gitignore patterns:', lines);
        
        // Add all patterns at once
        this.gitignoreFilter.add(lines);
      }
    }
  }

  public async updateFolderCheckState(item: MyTreeItem): Promise<void> {
    if (!item.isDirectory) return;

    const files = await this.getAllFilesInFolder(item.fsPath);
    const checkedCount = files.filter(file => this.checkedPaths.has(file)).length;

    // Check if this is a root folder
    const isRootFolder = this.workspaceFolders.some(folder => folder.uri.fsPath === item.fsPath);

    // Update folder state based on children's state
    if (checkedCount === 0) {
      // No children selected - uncheck folder
      this.checkedPaths.delete(item.fsPath);
      item.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
      item.clearPartialState();
    } else if (checkedCount === files.length) {
      // All children selected - check folder
      this.checkedPaths.add(item.fsPath);
      item.checkboxState = vscode.TreeItemCheckboxState.Checked;
      item.clearPartialState();
    } else {
      // Some children selected - partial state
      this.checkedPaths.delete(item.fsPath);
      item.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
      // Only show partial state for non-root folders
      if (!isRootFolder) {
        item.setPartialState();
      } else {
        item.clearPartialState();
      }
    }
  }

  public async clearSelections(): Promise<void> {
    // Clear the checked paths set
    this.checkedPaths.clear();

    // Clear all item states in cache
    for (const item of this.itemCache.values()) {
      item.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
      item.clearPartialState();
    }

    // Update storage and refresh
    await this.context.workspaceState.update(CHECKED_PATHS_KEY, []);
    this.refresh();
  }

  public async setUseGitignore(value: boolean) {
    this.useGitignore = value;
    if (value) {
      this.initGitignoreFilter();
    }
    await this.context.workspaceState.update('useGitignore', value);

    // Clear the item cache to force a full refresh
    this.itemCache.clear();
    
    // Force a complete refresh of the tree
    this._onDidChangeTreeData.fire();
  }

  private shouldIncludePath(fullPath: string): boolean {
    // Always exclude .git directory
    if (fullPath.includes(path.sep + '.git' + path.sep) || fullPath.endsWith(path.sep + '.git')) {
      return false;
    }

    // Check against .gitignore if enabled
    if (this.useGitignore && this.gitignoreFilter) {
      // Convert the full path to a relative path from workspace root
      const workspaceRoot = this.workspaceFolders[0].uri.fsPath;
      const relativePath = path.relative(workspaceRoot, fullPath)
        .split(path.sep)
        .join('/'); // Convert to forward slashes for consistent pattern matching

      // Log for debugging
      console.log(`Checking path: ${relativePath} against .gitignore patterns`);
      const isIgnored = this.gitignoreFilter.ignores(relativePath);
      console.log(`Path ${relativePath} is ${isIgnored ? 'ignored' : 'not ignored'}`);
      
      return !isIgnored;
    }

    return true;
  }

  /**
   * Returns the children of a given element, or if none is provided, returns the
   * top-level workspace folders.
   */
  public async getChildren(element?: MyTreeItem): Promise<MyTreeItem[]> {
    // If there are no workspace folders, show a message and return empty.
    if (!this.workspaceFolders || !this.workspaceFolders.length) {
      vscode.window.showInformationMessage('No workspace folder is open');
      return [];
    }

    // If there is no parent element, we're at the top level.
    if (!element) {
      return this.workspaceFolders.map(folder => {
        const folderName = folder.name || path.basename(folder.uri.fsPath);
        const fsPath = folder.uri.fsPath;
        
        // Check cache first
        let item = this.itemCache.get(fsPath);
        if (!item) {
          item = new MyTreeItem(fsPath, folderName, true);
          item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
          this.itemCache.set(fsPath, item);
        }
        
        // Only set checked state if explicitly checked
        if (this.checkedPaths.has(fsPath)) {
          item.checkboxState = vscode.TreeItemCheckboxState.Checked;
        }
        
        return item;
      });
    }

    // If the element is a directory, list its children
    if (element.isDirectory) {
      const dirPath = element.fsPath;
      try {
    const childNames = await fs.promises.readdir(dirPath);
    const items: MyTreeItem[] = [];

    for (const name of childNames) {
      const fullPath = path.join(dirPath, name);
          
          // Skip if path should be excluded
          if (!this.shouldIncludePath(fullPath)) {
            continue;
          }

          try {
      const stat = await fs.promises.stat(fullPath);
      const isDir = stat.isDirectory();

            // Check cache first
            let item = this.itemCache.get(fullPath);
            if (!item) {
              item = new MyTreeItem(fullPath, name, isDir);
              this.itemCache.set(fullPath, item);
            } else {
              // Update basic properties in case they changed
              item.label = name;
              item.isDirectory = isDir;
              item.collapsibleState = isDir 
                ? vscode.TreeItemCollapsibleState.Collapsed 
                : vscode.TreeItemCollapsibleState.None;
            }

            // Only set checked state if explicitly checked
      if (this.checkedPaths.has(fullPath)) {
        item.checkboxState = vscode.TreeItemCheckboxState.Checked;
      }

      items.push(item);
          } catch (err) {
            console.error(`Error accessing ${fullPath}:`, err);
          }
    }

    items.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
      return (a.label as string).localeCompare(b.label as string);
    });

    return items;
      } catch (err) {
        console.error(`Error reading directory ${dirPath}:`, err);
        return [];
      }
    }

    return [];
  }

  public getTreeItem(element: MyTreeItem): vscode.TreeItem {
    return element;
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Recursively gather all files in a folder to manage checking/unchecking
   * entire folders at once. Only includes files that are visible in the tree
   * (respects .gitignore and other exclusions).
   */
  private async getAllFilesInFolder(folderPath: string): Promise<string[]> {
    const result: string[] = [];
    try {
      const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(folderPath, entry.name);
        
        // Skip hidden/ignored paths
        if (!this.shouldIncludePath(fullPath)) {
          continue;
        }
        
        if (entry.isDirectory()) {
          const subFiles = await this.getAllFilesInFolder(fullPath);
          result.push(...subFiles);
        } else {
          result.push(fullPath);
        }
      }
    } catch (err) {
      console.error(`Error getting files in folder: ${err}`);
    }
    return result;
  }

  /**
   * Recursively process all items in a directory, regardless of their visibility state
   */
  private async processDirectoryContents(dirPath: string, shouldCheck: boolean): Promise<void> {
    try {
      // Process this directory itself
      const dirItem = this.itemCache.get(dirPath);
      if (dirItem) {
        if (shouldCheck) {
          this.checkedPaths.add(dirPath);
          dirItem.checkboxState = vscode.TreeItemCheckboxState.Checked;
        } else {
          this.checkedPaths.delete(dirPath);
          dirItem.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
        }
        dirItem.clearPartialState();
      }

      // Get all files and directories recursively
      const processEntry = async (entryPath: string): Promise<void> => {
        try {
          const stat = await fs.promises.stat(entryPath);
          const isDir = stat.isDirectory();
          const entryName = path.basename(entryPath);

          // Skip if path should be excluded
          if (!this.shouldIncludePath(entryPath)) {
            return;
          }

          // Create or get cache entry
          let item = this.itemCache.get(entryPath);
          if (!item) {
            item = new MyTreeItem(entryPath, entryName, isDir);
            this.itemCache.set(entryPath, item);
          }

          // Update state for this item
          if (shouldCheck) {
            this.checkedPaths.add(entryPath);
            item.checkboxState = vscode.TreeItemCheckboxState.Checked;
          } else {
            this.checkedPaths.delete(entryPath);
            item.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
          }
          item.clearPartialState();

          // If it's a directory, process its contents
          if (isDir) {
            const entries = await fs.promises.readdir(entryPath);
            for (const childName of entries) {
              await processEntry(path.join(entryPath, childName));
            }
          }
        } catch (err) {
          console.error(`Error processing entry ${entryPath}:`, err);
        }
      };

      // Start recursive processing from the root directory
      const entries = await fs.promises.readdir(dirPath);
      for (const entry of entries) {
        await processEntry(path.join(dirPath, entry));
      }
    } catch (err) {
      console.error(`Error processing directory ${dirPath}:`, err);
    }
  }

  public async toggleCheckbox(item: MyTreeItem) {
    const isChecked = this.checkedPaths.has(item.fsPath);
    console.log(`Toggling checkbox for: ${item.fsPath}, currently checked: ${isChecked}`);

    // Process the item and all its children
    await this.processDirectoryContents(item.fsPath, !isChecked);

    // Update parent folder states recursively
    let currentPath = path.dirname(item.fsPath);
    const rootPath = this.workspaceFolders[0].uri.fsPath;
    
    while (currentPath !== rootPath && currentPath !== path.dirname(currentPath)) {
      const parentItem = this.itemCache.get(currentPath);
      if (parentItem) {
        await this.updateFolderCheckState(parentItem);
      }
      currentPath = path.dirname(currentPath);
    }

    // Also update the root folder state if we're not already at root
    if (item.fsPath !== rootPath) {
      const rootItem = this.itemCache.get(rootPath);
      if (rootItem) {
        await this.updateFolderCheckState(rootItem);
      }
    }

    await this.context.workspaceState.update(CHECKED_PATHS_KEY, Array.from(this.checkedPaths));
    console.log(`Updated checked paths:`, Array.from(this.checkedPaths));
    this.refresh();
  }

  /**
   * Return all checked paths that still resolve to files, respecting .gitignore if enabled.
   * Note: This method filters out files that are in .gitignore even if they are selected,
   * but the selection state is preserved for when .gitignore is disabled.
   */
  public getCheckedPaths(): string[] {
    // Get all checked paths regardless of visibility state
    const allCheckedPaths = Array.from(this.checkedPaths);
    console.log('All checked paths before filtering:', allCheckedPaths);

    // Filter to only include existing files and respect gitignore
    const validPaths = allCheckedPaths.filter(filePath => {
      try {
        // Check if path exists and is a file
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
          console.log(`Skipping non-file: ${filePath}`);
          return false;
        }

        // Check gitignore if enabled
        if (this.useGitignore && !this.shouldIncludePath(filePath)) {
          console.log(`Excluding gitignored file: ${filePath}`);
          return false;
        }

        return true;
      } catch (err) {
        console.log(`Error checking path ${filePath}:`, err);
        return false;
      }
    });

    console.log('Final valid paths:', validPaths);
    return validPaths;
  }

  /**
   * Calculate initial folder states after the tree is built.
   * This should be called once after the tree is initially populated.
   */
  private async calculateInitialFolderStates(): Promise<void> {
    // Disable refresh temporarily
    const tempRefresh = this.refresh.bind(this);
    this.refresh = () => {};

    try {
      // Process all folders bottom-up
      const folders = Array.from(this.itemCache.values())
        .filter(item => item.isDirectory)
        .sort((a, b) => b.fsPath.length - a.fsPath.length); // Process deepest folders first

      // Process folders sequentially to ensure proper state calculation
      for (const folder of folders) {
        await this.updateFolderCheckState(folder);
      }
    } finally {
      // Restore refresh function and do a single refresh
      this.refresh = tempRefresh;
      this.refresh();
    }
  }
}

/**
 * Generates XML content from the given file paths
 */
function generateXmlContent(paths: string[]): string {
  console.log('Generating XML for paths:', paths); // Debug log
  const fileContents: string[] = [];
  for (const fsPath of paths) {
    try {
      const stat = fs.statSync(fsPath);
      if (stat.isFile()) {
        const content = fs.readFileSync(fsPath, 'utf8');
        fileContents.push(`
    <file path="${escapeXml(fsPath)}">
      <content><![CDATA[
${content}
      ]]></content>
    </file>`);
      }
    } catch (err) {
      console.error(`Error processing file ${fsPath}:`, err);
    }
  }

  return `<project>\n  ${fileContents.join('\n')}\n</project>`;
}

export function activate(context: vscode.ExtensionContext) {
  const folders = vscode.workspace.workspaceFolders || [];
  const treeProvider = new ExportTreeProvider(folders, context);
  
  // Initialize gitignore state
  const initialGitignoreState = context.workspaceState.get<boolean>('useGitignore') || false;
  vscode.commands.executeCommand(
    'setContext',
    'ai-code-exporter.gitignoreEnabled',
    initialGitignoreState
  );
  
  // Register the tree data provider
  const treeView = vscode.window.createTreeView('myExportTree', {
    treeDataProvider: treeProvider,
    canSelectMany: false
  });

  // Register the checkbox toggle command
  context.subscriptions.push(
    vscode.commands.registerCommand('myExportTree.toggleCheckbox', async (item: MyTreeItem) => {
      console.log('Toggle command called for:', item.fsPath);
      await treeProvider.toggleCheckbox(item);
    })
  );

  // Handle checkbox changes from the tree view
  context.subscriptions.push(
    treeView.onDidChangeCheckboxState(async (e) => {
      // Process all items in a single batch to prevent multiple refreshes
      const items = Array.from(e.items);
      const nonDirectoryItems = items.filter(([item]) => !(item as MyTreeItem).isDirectory);
      
      if (nonDirectoryItems.length > 0) {
        // Disable refresh temporarily to prevent intermediate updates
        const tempRefresh = treeProvider.refresh.bind(treeProvider);
        treeProvider.refresh = () => {};

        try {
          // Process all file selections first
          for (const [item] of nonDirectoryItems) {
            const treeItem = item as MyTreeItem;
            await treeProvider.toggleCheckbox(treeItem);
          }

          // Then update parent states once at the end
          const firstItem = nonDirectoryItems[0][0] as MyTreeItem;
          let currentPath = path.dirname(firstItem.fsPath);
          
          // Process parent updates sequentially
          while (currentPath !== treeProvider.workspaceFolders[0].uri.fsPath) {
            const parentItem = treeProvider.itemCache.get(currentPath);
            if (parentItem) {
              await treeProvider.updateFolderCheckState(parentItem);
            }
            currentPath = path.dirname(currentPath);
          }
        } finally {
          // Restore refresh function and do a single refresh
          treeProvider.refresh = tempRefresh;
          treeProvider.refresh();
        }
      }
    })
  );

  // Register the .gitignore toggle commands
  const toggleGitignore = async (newState: boolean) => {
    await treeProvider.setUseGitignore(newState);
    await vscode.commands.executeCommand(
      'setContext',
      'ai-code-exporter.gitignoreEnabled',
      newState
    );
    vscode.window.showInformationMessage(
      `${newState ? 'Enabled' : 'Disabled'} .gitignore support (${newState ? 'hiding' : 'showing'} ignored files)`
    );
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('myExportTree.toggleGitignoreOn', async () => {
      await toggleGitignore(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('myExportTree.toggleGitignoreOff', async () => {
      await toggleGitignore(false);
    })
  );

  // Register the export checked files command
  context.subscriptions.push(
    vscode.commands.registerCommand('myExportTree.exportCheckedToXML', async () => {
      const checkedPaths = treeProvider.getCheckedPaths();
      console.log('Exporting checked paths:', checkedPaths);
      
      if (!checkedPaths.length) {
        vscode.window.showInformationMessage('No items selected.');
        return;
      }

      const xmlResult = generateXmlContent(checkedPaths);

      const saveUri = await vscode.window.showSaveDialog({
        filters: { 'XML Files': ['xml'] },
        defaultUri: vscode.Uri.file('export.xml')
      });
      if (saveUri) {
        fs.writeFileSync(saveUri.fsPath, xmlResult, 'utf8');
        vscode.window.showInformationMessage(
          `Exported ${checkedPaths.length} items to ${saveUri.fsPath}`
        );
      }
    })
  );

  // Register the copy to clipboard command
  context.subscriptions.push(
    vscode.commands.registerCommand('myExportTree.copyCheckedToClipboard', async () => {
      const checkedPaths = treeProvider.getCheckedPaths();
      console.log('Copying checked paths:', checkedPaths);
      
      if (!checkedPaths.length) {
        vscode.window.showInformationMessage('No items selected.');
          return;
        }

      const xmlResult = generateXmlContent(checkedPaths);
      await vscode.env.clipboard.writeText(xmlResult);
      vscode.window.showInformationMessage(
        `Copied ${checkedPaths.length} items to clipboard as XML`
      );
    })
  );

  // Register the clear selections command
  context.subscriptions.push(
    vscode.commands.registerCommand('myExportTree.clearSelections', async () => {
      await treeProvider.clearSelections();
      vscode.window.showInformationMessage('Cleared all selections');
    })
  );
}

export function deactivate() {}

/**
 * A helper function to escape special XML characters.
 */
function escapeXml(unsafe: string) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
