import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { ALPackageManager } from '../../src/core/package-manager';

describe('Issue #9 Complete Fix - End-to-End Validation', () => {
  let tempDir: string;
  let projectDir: string;
  let packageManager: ALPackageManager;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'issue-9-complete-test-'));
    projectDir = path.join(tempDir, 'my-al-project');
    packageManager = new ALPackageManager();
    
    // Create realistic AL project structure
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, '.vscode'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.alpackages'), { recursive: true });
    
    // Create VS Code settings with relative path (like reported in issue)
    const settings = { "al.packageCachePath": ["./.alpackages"] };
    await fs.writeFile(
      path.join(projectDir, '.vscode', 'settings.json'),
      JSON.stringify(settings, null, 2)
    );
    
    // Create dummy app file
    await fs.writeFile(path.join(projectDir, '.alpackages', 'BaseApp.app'), 'dummy content');
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true }).catch(() => {});
  });

  describe('Fixed behavior - should work from any MCP server location', () => {
    it('should discover packages correctly when MCP server starts from different directory', async () => {
      const originalCwd = process.cwd();
      const mcpServerLocation = path.join(tempDir, 'mcp-server-different-location');
      await fs.mkdir(mcpServerLocation, { recursive: true });
      
      try {
        // Simulate MCP server starting from different location (like Claude Desktop)
        process.chdir(mcpServerLocation);
        
        console.log('MCP Server started from:', process.cwd());
        console.log('AL Project is at:', projectDir);
        
        // This should now work correctly with absolute rootPath
        const packageDirs = await packageManager.autoDiscoverPackageDirectories(projectDir);
        
        // Should find the .alpackages directory
        const expectedPath = path.join(projectDir, '.alpackages');
        expect(packageDirs).toContain(expectedPath);
        
        // Should actually contain the app file
        const appFiles = await packageManager.discoverPackages({
          packagesPath: expectedPath,
          recursive: false
        });
        expect(appFiles.length).toBeGreaterThan(0);
        expect(appFiles[0]).toContain('BaseApp.app');
        
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should work with relative paths in VS Code settings', async () => {
      // Test various relative path formats that users might have
      const testCases = [
        "./.alpackages",
        "./packages", 
        "packages",
        "../shared-packages"
      ];

      for (const relativePath of testCases) {
        // Create directory structure for this test
        const testProjectDir = path.join(tempDir, `test-${Math.random()}`);
        await fs.mkdir(testProjectDir, { recursive: true });
        await fs.mkdir(path.join(testProjectDir, '.vscode'), { recursive: true });
        
        // Create the target directory based on relative path
        const targetDir = path.resolve(testProjectDir, relativePath);
        await fs.mkdir(targetDir, { recursive: true }).catch(() => {}); // May already exist for parent paths
        await fs.writeFile(path.join(targetDir, 'test.app'), 'content');
        
        // Create VS Code settings
        const settings = { "al.packageCachePath": [relativePath] };
        await fs.writeFile(
          path.join(testProjectDir, '.vscode', 'settings.json'),
          JSON.stringify(settings, null, 2)
        );

        const originalCwd = process.cwd();
        const randomMcpLocation = path.join(tempDir, `mcp-${Math.random()}`);
        await fs.mkdir(randomMcpLocation, { recursive: true });
        
        try {
          process.chdir(randomMcpLocation);
          
          // Should resolve relative paths correctly against the provided rootPath
          const packageDirs = await packageManager.autoDiscoverPackageDirectories(testProjectDir);
          
          console.log(`Testing relative path: ${relativePath}`);
          console.log(`Expected resolved path: ${targetDir}`);
          console.log(`Found directories: ${packageDirs}`);
          
          // If the directory exists and has app files, it should be found
          const exists = await fs.access(targetDir).then(() => true).catch(() => false);
          if (exists) {
            expect(packageDirs).toContain(targetDir);
          }
          
        } finally {
          process.chdir(originalCwd);
        }
      }
    });
  });

  describe('Validation - should reject invalid rootPath values', () => {
    it('should reject empty rootPath', async () => {
      await expect(packageManager.autoDiscoverPackageDirectories(''))
        .rejects.toThrow('rootPath is required and cannot be empty');
    });

    it('should reject null/undefined rootPath', async () => {
      await expect(packageManager.autoDiscoverPackageDirectories(null as any))
        .rejects.toThrow('rootPath is required and cannot be empty');
    });

    it('should reject relative rootPath values', async () => {
      const relativePaths = ['.', './project', '../project', 'project'];
      
      for (const relativePath of relativePaths) {
        await expect(packageManager.autoDiscoverPackageDirectories(relativePath))
          .rejects.toThrow('rootPath must be an absolute path');
      }
    });

    it('should accept valid absolute rootPath values', async () => {
      const validPaths = [
        projectDir,
        '/valid/absolute/path',
        ...(process.platform === 'win32' ? ['C:\\valid\\absolute\\path'] : [])
      ];
      
      for (const validPath of validPaths) {
        if (validPath === projectDir) {
          // This should work (project exists)
          await expect(packageManager.autoDiscoverPackageDirectories(validPath))
            .resolves.toBeDefined();
        } else {
          // These might fail due to non-existent paths, but should not fail validation
          try {
            await packageManager.autoDiscoverPackageDirectories(validPath);
          } catch (error: any) {
            // Should not be a validation error
            expect(error.message).not.toContain('rootPath must be an absolute path');
            expect(error.message).not.toContain('rootPath is required');
          }
        }
      }
    });
  });

  describe('Regression prevention - should not use old buggy behavior', () => {
    it('should not resolve paths relative to MCP server working directory', async () => {
      // Create a trap: put .alpackages in MCP server directory (wrong location)
      const wrongMcpLocation = path.join(tempDir, 'wrong-mcp-location');
      await fs.mkdir(wrongMcpLocation, { recursive: true });
      await fs.mkdir(path.join(wrongMcpLocation, '.alpackages'), { recursive: true });
      await fs.writeFile(path.join(wrongMcpLocation, '.alpackages', 'wrong.app'), 'wrong');
      
      const originalCwd = process.cwd();
      
      try {
        process.chdir(wrongMcpLocation);
        
        // With absolute rootPath, should find correct location, not MCP server location
        const packageDirs = await packageManager.autoDiscoverPackageDirectories(projectDir);
        
        const wrongPath = path.join(wrongMcpLocation, '.alpackages');
        const correctPath = path.join(projectDir, '.alpackages');
        
        expect(packageDirs).toContain(correctPath);
        expect(packageDirs).not.toContain(wrongPath);
        
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should demonstrate the fix handles the exact reported scenario', async () => {
      // Recreate exact scenario from Issue #9
      const userProjectDir = path.join(tempDir, 'user-al-project');
      await fs.mkdir(userProjectDir, { recursive: true });
      await fs.mkdir(path.join(userProjectDir, '.vscode'), { recursive: true });
      await fs.mkdir(path.join(userProjectDir, '.alpackages'), { recursive: true });
      
      // User's VS Code settings with relative path (exactly as reported)
      const settings = { "al.packageCachePath": ["./.alpackages"] };
      await fs.writeFile(
        path.join(userProjectDir, '.vscode', 'settings.json'),
        JSON.stringify(settings, null, 2)
      );
      
      // Create app file
      await fs.writeFile(path.join(userProjectDir, '.alpackages', 'BaseApplication.app'), 'content');
      
      const originalCwd = process.cwd();
      const coderLocationDir = path.join(tempDir, 'copilot-claude-cursor-location');
      await fs.mkdir(coderLocationDir, { recursive: true });
      
      try {
        // Simulate AI client starting MCP server from their location
        process.chdir(coderLocationDir);
        
        console.log('Simulating Issue #9 scenario:');
        console.log('  User project dir:', userProjectDir);
        console.log('  AI client MCP server started from:', process.cwd());
        console.log('  VS Code setting: "./.alpackages"');
        
        // With the fix, providing absolute rootPath should work
        const packageDirs = await packageManager.autoDiscoverPackageDirectories(userProjectDir);
        
        const expectedPath = path.join(userProjectDir, '.alpackages');
        expect(packageDirs).toContain(expectedPath);
        
        console.log('  ✅ Successfully found packages at:', expectedPath);
        
        // Verify it contains the app file
        const appFiles = await packageManager.discoverPackages({
          packagesPath: expectedPath,
          recursive: false
        });
        expect(appFiles.length).toBeGreaterThan(0);
        expect(appFiles[0]).toContain('BaseApplication.app');
        
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Error messages - should provide helpful guidance', () => {
    it('should provide helpful error for missing rootPath', async () => {
      try {
        await packageManager.autoDiscoverPackageDirectories('');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('rootPath is required');
        expect(error.message).toContain('absolute path to your AL project directory');
      }
    });

    it('should provide helpful error for relative rootPath', async () => {
      try {
        await packageManager.autoDiscoverPackageDirectories('./project');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('rootPath must be an absolute path');
        expect(error.message).toContain('"/path/to/your/al-project"');
        expect(error.message).toContain('"C:\\path\\to\\your\\al-project"');
      }
    });
  });
});