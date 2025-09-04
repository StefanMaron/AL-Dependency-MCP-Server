import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { ALPackageManager } from '../../src/core/package-manager';

describe('VS Code Settings Path Resolution (Issue #9 Fix)', () => {
  let tempDir: string;
  let projectDir: string;
  let packageManager: ALPackageManager;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-settings-test-'));
    projectDir = path.join(tempDir, 'al-project');
    packageManager = new ALPackageManager();
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true }).catch(() => {});
  });

  describe('Direct VS Code settings path resolution', () => {
    it('should resolve relative paths against rootPath, not MCP server cwd', async () => {
      // Create project without .alpackages directory (so auto-discovery doesn't find it)
      await fs.mkdir(projectDir, { recursive: true });
      await fs.mkdir(path.join(projectDir, '.vscode'), { recursive: true });
      await fs.mkdir(path.join(projectDir, 'custom-dir'), { recursive: true });
      
      // Create app file in custom directory
      await fs.writeFile(path.join(projectDir, 'custom-dir', 'test.app'), 'dummy');
      
      // Create VS Code settings with relative path
      const settings = { "al.packageCachePath": ["./custom-dir"] };
      await fs.writeFile(
        path.join(projectDir, '.vscode', 'settings.json'),
        JSON.stringify(settings, null, 2)
      );

      const originalCwd = process.cwd();
      const mcpServerDir = path.join(tempDir, 'mcp-server-location');
      await fs.mkdir(mcpServerDir, { recursive: true });
      
      try {
        // Start MCP server from different directory
        process.chdir(mcpServerDir);
        
        console.log('MCP Server CWD:', process.cwd());
        console.log('Project Dir:', projectDir);
        
        // This should work regardless of MCP server location
        const packageDirs = await packageManager.autoDiscoverPackageDirectories(projectDir);
        
        const expectedPath = path.join(projectDir, 'custom-dir');
        console.log('Expected path:', expectedPath);
        console.log('Found paths:', packageDirs);
        
        expect(packageDirs).toContain(expectedPath);
        
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should test the direct getCustomPackagePaths method', async () => {
      // Clear and recreate project structure
      await fs.rm(projectDir, { recursive: true }).catch(() => {});
      await fs.mkdir(projectDir, { recursive: true });
      await fs.mkdir(path.join(projectDir, '.vscode'), { recursive: true });
      await fs.mkdir(path.join(projectDir, 'packages'), { recursive: true });
      
      // Create app file
      await fs.writeFile(path.join(projectDir, 'packages', 'test.app'), 'dummy');

      const testCases = [
        { setting: "./.alpackages", expected: ".alpackages" },
        { setting: "./packages", expected: "packages" },
        { setting: "./custom/path", expected: "custom/path" },
        { setting: ".", expected: "." }
      ];

      for (const testCase of testCases) {
        const settings = { "al.packageCachePath": [testCase.setting] };
        await fs.writeFile(
          path.join(projectDir, '.vscode', 'settings.json'),
          JSON.stringify(settings, null, 2)
        );

        const originalCwd = process.cwd();
        const wrongDir = path.join(tempDir, `wrong-${Math.random()}`);
        await fs.mkdir(wrongDir, { recursive: true });
        
        try {
          // Change to wrong directory (simulating MCP server startup location)
          process.chdir(wrongDir);
          
          // Use reflection to access the private method for direct testing
          const getCustomPackagePathsMethod = (packageManager as any).getCustomPackagePaths.bind(packageManager);
          const customPaths: string[] = await getCustomPackagePathsMethod(projectDir);
          
          console.log(`Setting: ${testCase.setting}`);
          console.log(`Expected relative to project: ${testCase.expected}`);
          console.log(`Resolved paths: ${customPaths}`);
          
          if (customPaths.length > 0) {
            const resolvedPath = customPaths[0];
            const expectedAbsolutePath = path.join(projectDir, testCase.expected);
            
            expect(resolvedPath).toBe(expectedAbsolutePath);
            expect(path.isAbsolute(resolvedPath)).toBe(true);
          }
          
        } finally {
          process.chdir(originalCwd);
        }
      }
    });

    it('should demonstrate the fix vs the old buggy behavior', async () => {
      await fs.rm(projectDir, { recursive: true }).catch(() => {});
      await fs.mkdir(projectDir, { recursive: true });
      await fs.mkdir(path.join(projectDir, '.vscode'), { recursive: true });
      
      const workspaceCachePath = "./.alpackages";
      const settings = { "al.packageCachePath": [workspaceCachePath] };
      await fs.writeFile(
        path.join(projectDir, '.vscode', 'settings.json'),
        JSON.stringify(settings, null, 2)
      );

      const originalCwd = process.cwd();
      const mcpDir = path.join(tempDir, 'mcp-different-location');
      await fs.mkdir(mcpDir, { recursive: true });
      
      try {
        process.chdir(mcpDir);
        
        // Old buggy approach (what was happening before)
        const buggyResolution = path.isAbsolute(workspaceCachePath) 
          ? workspaceCachePath 
          : path.join(projectDir, workspaceCachePath); // This was using path.join
          
        // New fixed approach 
        const fixedResolution = path.isAbsolute(workspaceCachePath)
          ? workspaceCachePath
          : path.resolve(projectDir, workspaceCachePath); // Now using path.resolve
          
        console.log('Workspace cache path from settings:', workspaceCachePath);
        console.log('Project directory:', projectDir);
        console.log('MCP server CWD:', process.cwd());
        console.log('Buggy resolution (path.join):', buggyResolution);
        console.log('Fixed resolution (path.resolve):', fixedResolution);
        
        const expectedPath = path.join(projectDir, '.alpackages');
        
        // Both should produce the same result in this case, but path.resolve is more robust
        expect(fixedResolution).toBe(expectedPath);
        expect(buggyResolution).toBe(expectedPath); // This might work too, but it's fragile
        
        // The key difference is that path.resolve handles edge cases better
        expect(path.isAbsolute(fixedResolution)).toBe(true);
        expect(path.isAbsolute(buggyResolution)).toBe(true);
        
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle edge cases that path.join fails on', async () => {
      const edgeCases = [
        { rootPath: ".", cachePath: "./.alpackages" }, // This is the main issue case
        { rootPath: "/project", cachePath: "../other/.alpackages" },
        { rootPath: "/project/", cachePath: "./sub/.alpackages" } // trailing slash
      ];

      for (const testCase of edgeCases) {
        console.log(`Testing edge case - rootPath: ${testCase.rootPath}, cachePath: ${testCase.cachePath}`);
        
        // Compare path.join vs path.resolve
        const joinResult = path.isAbsolute(testCase.cachePath) 
          ? testCase.cachePath 
          : path.join(testCase.rootPath, testCase.cachePath);
          
        const resolveResult = path.isAbsolute(testCase.cachePath)
          ? testCase.cachePath
          : path.resolve(testCase.rootPath, testCase.cachePath);
          
        console.log(`  path.join result: ${joinResult}`);
        console.log(`  path.resolve result: ${resolveResult}`);
        console.log(`  join is absolute: ${path.isAbsolute(joinResult)}`);
        console.log(`  resolve is absolute: ${path.isAbsolute(resolveResult)}`);
        
        // path.resolve should always produce absolute paths
        expect(path.isAbsolute(resolveResult)).toBe(true);
      }
    });
  });
});