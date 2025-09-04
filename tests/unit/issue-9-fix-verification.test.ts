import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { ALPackageManager } from '../../src/core/package-manager';

describe('Issue #9 Fix Verification - Relative Path Resolution', () => {
  let tempDir: string;
  let projectDir: string;
  let packageManager: ALPackageManager;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'issue-9-fix-test-'));
    projectDir = path.join(tempDir, 'al-project');
    packageManager = new ALPackageManager();
    
    // Create project structure
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, '.vscode'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.alpackages'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'custom-packages'), { recursive: true });
    
    // Create test app files
    await fs.writeFile(path.join(projectDir, '.alpackages', 'test1.app'), 'dummy');
    await fs.writeFile(path.join(projectDir, 'custom-packages', 'test2.app'), 'dummy');
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true }).catch(() => {});
  });

  describe('VS Code settings with relative paths', () => {
    it('should resolve ./.alpackages correctly with absolute rootPath', async () => {
      // Create VS Code settings with relative path
      const settings = { "al.packageCachePath": ["./.alpackages"] };
      await fs.writeFile(
        path.join(projectDir, '.vscode', 'settings.json'),
        JSON.stringify(settings, null, 2)
      );

      // Test from any MCP server working directory (should not matter)
      const originalCwd = process.cwd();
      const randomDir = path.join(tempDir, 'random-mcp-server-location');
      await fs.mkdir(randomDir, { recursive: true });
      
      try {
        process.chdir(randomDir);
        console.log('MCP Server CWD:', process.cwd());
        console.log('Project Dir:', projectDir);
        
        // Use absolute rootPath (what AI client should provide)
        const packageDirs = await packageManager.autoDiscoverPackageDirectories(projectDir);
        
        console.log('Discovered package dirs:', packageDirs);
        
        // Should find the .alpackages directory
        const expectedPath = path.join(projectDir, '.alpackages');
        expect(packageDirs).toContain(expectedPath);
        
        // Verify it actually found the app file
        const appFiles = await packageManager.discoverPackages({
          packagesPath: expectedPath,
          recursive: false
        });
        
        expect(appFiles.length).toBeGreaterThan(0);
        expect(appFiles[0]).toContain('test1.app');
        
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should resolve custom relative paths correctly', async () => {
      // Create VS Code settings with custom relative path
      const settings = { "al.packageCachePath": ["./custom-packages"] };
      await fs.writeFile(
        path.join(projectDir, '.vscode', 'settings.json'),
        JSON.stringify(settings, null, 2)
      );

      const originalCwd = process.cwd();
      const randomDir = path.join(tempDir, 'another-random-location');
      await fs.mkdir(randomDir, { recursive: true });
      
      try {
        process.chdir(randomDir);
        
        const packageDirs = await packageManager.autoDiscoverPackageDirectories(projectDir);
        
        const expectedPath = path.join(projectDir, 'custom-packages');
        expect(packageDirs).toContain(expectedPath);
        
        // Verify it found the app file
        const appFiles = await packageManager.discoverPackages({
          packagesPath: expectedPath,
          recursive: false
        });
        
        expect(appFiles.length).toBeGreaterThan(0);
        expect(appFiles[0]).toContain('test2.app');
        
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle various relative path formats', async () => {
      const testCases = [
        { setting: "./.alpackages", expected: path.join(projectDir, '.alpackages') },
        { setting: "./custom-packages", expected: path.join(projectDir, 'custom-packages') },
        { setting: ".", expected: projectDir },
        { setting: "../al-project/.alpackages", expected: path.join(projectDir, '.alpackages') }
      ];

      for (const testCase of testCases) {
        const settings = { "al.packageCachePath": [testCase.setting] };
        await fs.writeFile(
          path.join(projectDir, '.vscode', 'settings.json'),
          JSON.stringify(settings, null, 2)
        );

        // Test from different MCP server working directory
        const originalCwd = process.cwd();
        const tempCwd = path.join(tempDir, `test-${Math.random()}`);
        await fs.mkdir(tempCwd, { recursive: true });
        
        try {
          process.chdir(tempCwd);
          
          const packageDirs = await packageManager.autoDiscoverPackageDirectories(projectDir);
          
          console.log(`Setting: ${testCase.setting} -> Expected: ${testCase.expected}`);
          console.log(`Found: ${packageDirs}`);
          
          // The resolved path should match expected
          if (await fs.access(testCase.expected).then(() => true).catch(() => false)) {
            expect(packageDirs).toContain(testCase.expected);
          }
          
        } finally {
          process.chdir(originalCwd);
        }
      }
    });

    it('should handle absolute paths in settings without modification', async () => {
      const absolutePath = path.join(projectDir, '.alpackages');
      const settings = { "al.packageCachePath": [absolutePath] };
      
      await fs.writeFile(
        path.join(projectDir, '.vscode', 'settings.json'),
        JSON.stringify(settings, null, 2)
      );

      // Test from different working directory
      const originalCwd = process.cwd();
      const randomDir = path.join(tempDir, 'absolute-test-dir');
      await fs.mkdir(randomDir, { recursive: true });
      
      try {
        process.chdir(randomDir);
        
        const packageDirs = await packageManager.autoDiscoverPackageDirectories(projectDir);
        
        // Should find the absolute path unchanged
        expect(packageDirs).toContain(absolutePath);
        
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Regression test - ensure no old behavior', () => {
    it('should NOT resolve paths relative to MCP server working directory', async () => {
      const settings = { "al.packageCachePath": ["./.alpackages"] };
      await fs.writeFile(
        path.join(projectDir, '.vscode', 'settings.json'),
        JSON.stringify(settings, null, 2)
      );

      // Create .alpackages in MCP server working directory (wrong location)
      const wrongLocation = path.join(tempDir, 'wrong-mcp-location');
      await fs.mkdir(wrongLocation, { recursive: true });
      await fs.mkdir(path.join(wrongLocation, '.alpackages'), { recursive: true });
      await fs.writeFile(path.join(wrongLocation, '.alpackages', 'wrong.app'), 'wrong');
      
      const originalCwd = process.cwd();
      
      try {
        process.chdir(wrongLocation);
        
        // Should NOT find the wrong .alpackages
        const packageDirs = await packageManager.autoDiscoverPackageDirectories(projectDir);
        
        const wrongPath = path.join(wrongLocation, '.alpackages');
        const correctPath = path.join(projectDir, '.alpackages');
        
        console.log('Wrong path (should not be found):', wrongPath);
        console.log('Correct path (should be found):', correctPath);
        console.log('Discovered paths:', packageDirs);
        
        // Should find correct path, not wrong path
        expect(packageDirs).toContain(correctPath);
        expect(packageDirs).not.toContain(wrongPath);
        
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});