import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { MyTreeItem, ExportTreeProvider } from '../extension';

// Mock file system for testing
class MockFileSystem {
	private files: Map<string, string | null> = new Map(); // null represents directory
	private workspaceRoot: string;

	constructor(fileTree: string[], workspaceRoot: string | vscode.Uri) {
		this.workspaceRoot = this.normalizePath(workspaceRoot);
		// Add the workspace root directory
		this.files.set(this.workspaceRoot, null);
		
		fileTree.forEach(path => {
			const normalizedPath = this.normalizePath(path);
			if (normalizedPath.endsWith('/')) {
				// It's a directory
				this.files.set(normalizedPath.slice(0, -1), null);
			} else {
				// It's a file
				this.files.set(normalizedPath, 'mock content');
			}
		});

		// Log the files for debugging
		console.log('Mock file system initialized with:', Array.from(this.files.keys()));
	}

	private normalizePath(p: string | fs.PathLike | vscode.Uri): string {
		let pathStr = '';
		if (p instanceof vscode.Uri) {
			pathStr = p.fsPath;
		} else if (typeof p === 'object' && p !== null) {
			if ('fsPath' in p) {
				pathStr = (p as { fsPath: string }).fsPath;
			} else if ('path' in p) {
				pathStr = (p as { path: string }).path;
			} else {
				pathStr = p.toString();
			}
		} else {
			pathStr = p.toString();
		}
		// Replace backslashes with forward slashes
		pathStr = pathStr.replace(/\\/g, '/');
		// Handle vscode.Uri.file paths
		if (pathStr.startsWith('file:///')) {
			pathStr = pathStr.slice('file:///'.length);
		}
		// Remove trailing slash
		if (pathStr.endsWith('/')) {
			pathStr = pathStr.slice(0, -1);
		}
		return pathStr;
	}

	private resolveWorkspacePath(p: fs.PathLike | vscode.Uri): string {
		const normalized = this.normalizePath(p);
		console.log('Resolving workspace path:', p instanceof vscode.Uri ? p.fsPath : p.toString());
		console.log('Normalized:', normalized);
		console.log('Workspace root:', this.workspaceRoot);

		// Special case for workspace root
		if (normalized === this.workspaceRoot || normalized === '/mock/workspace') {
			return this.workspaceRoot;
		}

		// Handle paths that are already absolute
		if (normalized.startsWith('/mock/workspace/')) {
			return normalized;
		}

		// Handle paths that are relative to the workspace root
		if (normalized.startsWith('/')) {
			return normalized;
		}

		// Handle Windows-style paths
		if (normalized.includes('\\mock\\workspace')) {
			return normalized.replace(/\\/g, '/');
		}

		return this.normalizePath(path.join(this.workspaceRoot, normalized));
	}

	async stat(path: fs.PathLike | vscode.Uri): Promise<fs.Stats> {
		const normalizedPath = this.resolveWorkspacePath(path);
		console.log('Attempting to stat path:', path instanceof vscode.Uri ? path.fsPath : path.toString());
		console.log('Normalized path:', normalizedPath);
		
		// Special case for workspace root
		if (normalizedPath === this.workspaceRoot) {
			return {
				isDirectory: () => true,
				isFile: () => false,
				size: 0,
				atimeMs: Date.now(),
				mtimeMs: Date.now(),
				ctimeMs: Date.now(),
				birthtimeMs: Date.now(),
				atime: new Date(),
				mtime: new Date(),
				ctime: new Date(),
				birthtime: new Date()
			} as fs.Stats;
		}

		const isDirectory = this.files.get(normalizedPath) === null || 
			Array.from(this.files.keys()).some(p => 
				p.startsWith(normalizedPath + '/') && p !== normalizedPath
			);

		if (!this.files.has(normalizedPath) && !isDirectory) {
			console.error(`Error accessing ${normalizedPath}: File not found`);
			console.log('Available paths:', Array.from(this.files.keys()));
			throw new Error('ENOENT: no such file or directory');
		}

		return {
			isDirectory: () => isDirectory,
			isFile: () => !isDirectory,
			size: 0,
			atimeMs: Date.now(),
			mtimeMs: Date.now(),
			ctimeMs: Date.now(),
			birthtimeMs: Date.now(),
			atime: new Date(),
			mtime: new Date(),
			ctime: new Date(),
			birthtime: new Date()
		} as fs.Stats;
	}

	async readdir(dirPath: fs.PathLike | vscode.Uri): Promise<fs.Dirent[]> {
		const normalizedPath = this.resolveWorkspacePath(dirPath);
		console.log('Attempting to readdir:', dirPath);
		console.log('Normalized path:', normalizedPath);
		
		const entries: fs.Dirent[] = [];
		
		// Check if directory exists
		const isDirectory = this.files.get(normalizedPath) === null || 
			Array.from(this.files.keys()).some(p => 
				p.startsWith(normalizedPath + '/') && p !== normalizedPath
			);

		if (!isDirectory) {
			console.error(`Error accessing ${normalizedPath}: Not a directory`);
			console.log('Available paths:', Array.from(this.files.keys()));
			throw new Error('ENOTDIR: not a directory');
		}
		
		for (const [path] of this.files) {
			if (path.startsWith(normalizedPath + '/') || path === normalizedPath) {
				const relativePath = path.slice(normalizedPath.length + 1).split('/')[0];
				if (relativePath) {
					const fullPath = normalizedPath + '/' + relativePath;
					const isDir = this.files.get(fullPath) === null || 
						Array.from(this.files.keys()).some(p => 
							p.startsWith(fullPath + '/') && p !== fullPath
						);

					// Only add if we haven't added this entry yet
					if (!entries.some(e => e.name === relativePath)) {
						entries.push({
							name: relativePath,
							isDirectory: () => isDir,
							isFile: () => !isDir,
							isSymbolicLink: () => false,
							isBlockDevice: () => false,
							isCharacterDevice: () => false,
							isFIFO: () => false,
							isSocket: () => false
						} as fs.Dirent);
					}
				}
			}
		}
		return entries;
	}
}

class MockPath implements path.PlatformPath {
	sep: '/' | '\\' = '/';
	delimiter: ':' | ';' = ':';
	win32: path.PlatformPath = this;
	posix: path.PlatformPath = this;

	join(...paths: string[]): string {
		// Handle URI paths
		if (paths[0] && paths[0].startsWith('file:///')) {
			paths[0] = paths[0].slice('file:///'.length);
		}
		return paths.join('/').replace(/\\/g, '/');
	}

	basename(p: string, ext?: string): string {
		const base = p.split('/').pop() || '';
		if (ext && base.endsWith(ext)) {
			return base.slice(0, -ext.length);
		}
		return base;
	}

	dirname(p: string): string {
		return p.split('/').slice(0, -1).join('/') || '/';
	}

	relative(from: string, to: string): string {
		const fromParts = from.split('/');
		const toParts = to.split('/');
		const length = Math.min(fromParts.length, toParts.length);
		let samePartsLength = length;
		for (let i = 0; i < length; i++) {
			if (fromParts[i] !== toParts[i]) {
				samePartsLength = i;
				break;
			}
		}
		const outputParts = [];
		for (let i = samePartsLength; i < fromParts.length; i++) {
			outputParts.push('..');
		}
		outputParts.push(...toParts.slice(samePartsLength));
		return outputParts.join('/');
	}

	normalize(p: string): string {
		return p.replace(/\\/g, '/');
	}

	isAbsolute(p: string): boolean {
		return p.startsWith('/');
	}

	resolve(...pathSegments: string[]): string {
		let resolvedPath = '';
		for (let i = pathSegments.length - 1; i >= 0; i--) {
			const segment = pathSegments[i];
			if (!resolvedPath) {
				resolvedPath = segment;
			} else if (this.isAbsolute(segment)) {
				resolvedPath = segment;
				break;
			} else {
				resolvedPath = this.join(segment, resolvedPath);
			}
		}
		return this.normalize(resolvedPath);
	}

	parse(p: string): path.ParsedPath {
		const normalized = this.normalize(p);
		const parts = normalized.split('/');
		const base = parts[parts.length - 1] || '';
		const extIndex = base.lastIndexOf('.');
		return {
			root: normalized.startsWith('/') ? '/' : '',
			dir: parts.slice(0, -1).join('/'),
			base,
			ext: extIndex >= 0 ? base.slice(extIndex) : '',
			name: extIndex >= 0 ? base.slice(0, extIndex) : base
		};
	}

	format(pathObject: path.FormatInputPathObject): string {
		const dir = pathObject.dir || pathObject.root || '';
		const base = pathObject.base || ((pathObject.name || '') + (pathObject.ext || ''));
		return dir ? this.join(dir, base) : base;
	}

	extname(p: string): string {
		const base = this.basename(p);
		const i = base.lastIndexOf('.');
		return i < 0 ? '' : base.slice(i);
	}

	toNamespacedPath(p: string): string {
		return p;
	}
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	// Helper function to normalize path separators
	function normalizePath(p: string): string {
		return p.replace(/\\/g, '/').replace(/^file:\/\/\//, '');
	}

	test('should initialize mock file tree from testdir.txt', async () => {
		// Create mock workspace folder
		const mockWorkspaceUri = vscode.Uri.file('/mock/workspace');
		const mockWorkspaceFolder: vscode.WorkspaceFolder = {
			uri: mockWorkspaceUri,
			name: 'test',
			index: 0
		};

		// Create test directory structure
		const testDirs = [
			'/mock/workspace/',
			'/mock/workspace/src/',
			'/mock/workspace/src/api/',
			'/mock/workspace/src/components/',
			'/mock/workspace/src/utils/'
		];

		const testFiles = [
			'/mock/workspace/src/index.ts',
			'/mock/workspace/src/api/users.ts',
			'/mock/workspace/src/components/Button.tsx',
			'/mock/workspace/src/utils/helpers.ts'
		];

		// Create mock file system with test structure
		const mockFs = new MockFileSystem([...testDirs, ...testFiles], mockWorkspaceUri);
		const mockPath = new MockPath();

		const mockContext = {
			workspaceState: {
				get: () => undefined,
				update: async () => undefined
			},
			subscriptions: []
		} as any as vscode.ExtensionContext;

		// Create provider with mock workspace and mock path module
		const provider = new ExportTreeProvider([mockWorkspaceFolder], mockContext, mockPath);

		// Override file system operations with mocks
		const originalReaddir = fs.promises.readdir;
		const originalStat = fs.promises.stat;

		fs.promises.readdir = (async (path: fs.PathLike, options?: { withFileTypes?: boolean } | undefined) => {
			const result = await mockFs.readdir(path);
			if (options?.withFileTypes) {
				return result;
			}
			return result.map(dirent => dirent.name);
		}) as typeof fs.promises.readdir;

		fs.promises.stat = (async (path: fs.PathLike, options?: fs.StatOptions | undefined) => {
			const result = await mockFs.stat(path);
			if (options?.bigint) {
				const bigIntStats = {
					dev: BigInt(0),
					ino: BigInt(0),
					mode: BigInt(0),
					nlink: BigInt(1),
					uid: BigInt(0),
					gid: BigInt(0),
					rdev: BigInt(0),
					size: BigInt(0),
					blksize: BigInt(4096),
					blocks: BigInt(0),
					atimeMs: BigInt(result.atimeMs),
					mtimeMs: BigInt(result.mtimeMs),
					ctimeMs: BigInt(result.ctimeMs),
					birthtimeMs: BigInt(result.birthtimeMs),
					atimeNs: BigInt(result.atimeMs * 1_000_000),
					mtimeNs: BigInt(result.mtimeMs * 1_000_000),
					ctimeNs: BigInt(result.ctimeMs * 1_000_000),
					birthtimeNs: BigInt(result.birthtimeMs * 1_000_000),
					isFile: result.isFile,
					isDirectory: result.isDirectory,
					isBlockDevice: result.isBlockDevice,
					isCharacterDevice: result.isCharacterDevice,
					isSymbolicLink: result.isSymbolicLink,
					isFIFO: result.isFIFO,
					isSocket: result.isSocket,
					atime: result.atime,
					mtime: result.mtime,
					ctime: result.ctime,
					birthtime: result.birthtime
				};
				return bigIntStats as fs.BigIntStats;
			}
			return result;
		}) as typeof fs.promises.stat;

		try {
			// Get root children
			const rootChildren = await provider.getChildren();
			assert.strictEqual(rootChildren.length, 1, 'Should have one root workspace folder');

			// Get workspace root
			const workspaceRoot = rootChildren[0];
			assert.strictEqual(
				normalizePath(workspaceRoot.fsPath),
				normalizePath(mockWorkspaceUri.fsPath),
				'Root should be workspace directory'
			);
			assert.strictEqual(workspaceRoot.label, 'test');
			assert.strictEqual(workspaceRoot.isDirectory, true);

			// Get workspace children
			const workspaceChildren = await provider.getChildren(workspaceRoot);
			assert.ok(workspaceChildren.length > 0, 'workspace directory should have children');

			// Find src directory
			const srcItem = workspaceChildren.find(child => child.label === 'src' && child.isDirectory);
			assert.ok(srcItem, 'src directory should exist');

			// Get src children
			const srcChildren = await provider.getChildren(srcItem!);
			assert.ok(srcChildren.length > 0, 'src directory should have children');

			// Verify some expected directories exist
			const hasApi = srcChildren.some(child => 
				child.label === 'api' && child.isDirectory
			);
			const hasComponents = srcChildren.some(child => 
				child.label === 'components' && child.isDirectory
			);

			assert.ok(hasApi, 'src should contain api directory');
			assert.ok(hasComponents, 'src should contain components directory');

			// Test file item properties
			const fileItems = srcChildren.filter(item => !item.isDirectory);
			fileItems.forEach(item => {
				assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
				assert.ok(item.command, 'File items should have a command');
				assert.strictEqual(item.checkboxState, vscode.TreeItemCheckboxState.Unchecked);
			});

		} finally {
			// Restore original functions
			fs.promises.readdir = originalReaddir;
			fs.promises.stat = originalStat;
		}
	});
});
