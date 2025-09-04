import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('Issue #9 - Relative path resolution bug reproduction', () => {
  let tempDir: string;
  let testProjectDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'issue-9-test-'));
    testProjectDir = path.join(tempDir, 'test-project');
    await fs.mkdir(testProjectDir, { recursive: true });
    await fs.mkdir(path.join(testProjectDir, '.vscode'), { recursive: true });
    await fs.mkdir(path.join(testProjectDir, '.alpackages'), { recursive: true });

    // Create test .app file
    await fs.writeFile(path.join(testProjectDir, '.alpackages', 'test.app'), 'dummy');

    // Create VS Code settings with relative path
    const settings = { "al.packageCachePath": ["./.alpackages"] };
    await fs.writeFile(
      path.join(testProjectDir, '.vscode', 'settings.json'),
      JSON.stringify(settings, null, 2)
    );
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true }).catch(() => {});
  });

  describe('Reproducing the exact bug scenario', () => {
    it('should demonstrate the current buggy behavior', async () => {
      const originalCwd = process.cwd();
      
      try {
        // Simulate Copilot/user calling al_auto_discover from the project directory
        process.chdir(testProjectDir);
        
        // This is what happens in the current buggy code:
        const rootPath = "."; // This is what gets passed to autoDiscoverPackageDirectories
        const workspaceCachePath = "./.alpackages"; // This comes from VS Code settings
        
        // Current buggy resolution from package-manager.ts line 330-332
        const buggyResolution = path.isAbsolute(workspaceCachePath) 
          ? workspaceCachePath 
          : path.join(rootPath, workspaceCachePath);
        
        // What we should get (absolute path to .alpackages)
        const expectedPath = path.join(testProjectDir, '.alpackages');
        
        // Show the problem
        console.log('Test project dir:', testProjectDir);
        console.log('Root path (what gets passed):', rootPath);
        console.log('Workspace cache path (from settings):', workspaceCachePath);
        console.log('Buggy resolution result:', buggyResolution);
        console.log('Expected result:', expectedPath);
        
        // The buggy result is relative, not absolute
        expect(path.isAbsolute(buggyResolution)).toBe(false);
        expect(buggyResolution).toBe('.alpackages'); // Just the relative path
        
        // When this gets passed to fs.access(), it will fail or look in wrong place
        const resolvedBuggyPath = path.resolve(buggyResolution);
        expect(resolvedBuggyPath).toBe(expectedPath); // This works because resolve fixes it
        
        // But the real issue is in package discovery logic where the relative path fails validation
        
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should demonstrate the correct fix', async () => {
      const originalCwd = process.cwd();
      
      try {
        process.chdir(testProjectDir);
        
        const rootPath = ".";
        const workspaceCachePath = "./.alpackages";
        
        // Fixed approach 1: Normalize rootPath first
        const normalizedRootPath = path.resolve(rootPath); // Convert "." to absolute path
        const correctResolution1 = path.isAbsolute(workspaceCachePath)
          ? workspaceCachePath
          : path.resolve(normalizedRootPath, workspaceCachePath);
        
        // Fixed approach 2: Always use resolve instead of join
        const correctResolution2 = path.isAbsolute(workspaceCachePath)
          ? workspaceCachePath
          : path.resolve(rootPath, workspaceCachePath);
        
        const expectedPath = path.join(testProjectDir, '.alpackages');
        
        // Both fixes should work
        expect(correctResolution1).toBe(expectedPath);
        expect(correctResolution2).toBe(expectedPath);
        
        // Both results should be absolute
        expect(path.isAbsolute(correctResolution1)).toBe(true);
        expect(path.isAbsolute(correctResolution2)).toBe(true);
        
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should verify the .alpackages directory actually exists and is accessible', async () => {
      const expectedPath = path.join(testProjectDir, '.alpackages');
      
      // Verify the directory exists
      const stat = await fs.stat(expectedPath);
      expect(stat.isDirectory()).toBe(true);
      
      // Verify it contains our test file
      const files = await fs.readdir(expectedPath);
      expect(files).toContain('test.app');
    });
  });

  describe('Testing the package manager auto-discovery', () => {
    it('should show how the bug manifests in package discovery', async () => {
      // This demonstrates how the bug actually causes problems
      const originalCwd = process.cwd();
      
      try {
        process.chdir(testProjectDir);
        
        const rootPath = ".";
        const workspaceCachePath = "./.alpackages";
        
        // Simulate reading VS Code settings (this part works)
        const settingsContent = await fs.readFile(path.join('.vscode', 'settings.json'), 'utf8');
        const settings = JSON.parse(settingsContent);
        const cachePathFromSettings = settings['al.packageCachePath'][0];
        
        expect(cachePathFromSettings).toBe('./.alpackages');
        
        // Now simulate the buggy path resolution
        const buggyPath = path.join(rootPath, cachePathFromSettings);
        console.log('Buggy path:', buggyPath);
        
        // This is what causes the issue - the path is relative
        expect(path.isAbsolute(buggyPath)).toBe(false);
        
        // When the code tries to fs.access(buggyPath), it might succeed or fail
        // depending on the current working directory
        try {
          await fs.access(buggyPath);
          console.log('✓ fs.access succeeded with buggy path (because we are in the right directory)');
        } catch (error) {
          console.log('✗ fs.access failed with buggy path:', error);
        }
        
        // The correct path always works
        const correctPath = path.resolve(rootPath, cachePathFromSettings);
        expect(path.isAbsolute(correctPath)).toBe(true);
        
        await fs.access(correctPath); // Should not throw
        console.log('✓ fs.access succeeded with correct path');
        
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});