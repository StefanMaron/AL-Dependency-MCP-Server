import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('Cross-Platform Path Resolution', () => {
  let tempDir: string;

  beforeAll(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'al-mcp-path-test-'));
  });

  afterAll(async () => {
    // Cleanup temporary directory
    await fs.rm(tempDir, { recursive: true }).catch(() => {});
  });

  describe('process.cwd() behavior', () => {
    it('should return current working directory as absolute path', () => {
      const cwd = process.cwd();
      
      // Should be absolute path
      expect(path.isAbsolute(cwd)).toBe(true);
      
      // Should end with project directory name (handles both local and CI naming)
      expect(cwd).toMatch(/(al-mcp-server|AL-Dependency-MCP-Server)$/);
      
      // Should be accessible
      expect(() => process.chdir(cwd)).not.toThrow();
    });

    it('should handle path operations consistently across platforms', () => {
      const cwd = process.cwd();
      
      // Test basic path operations
      const relativeTest = path.join(cwd, '.', 'test');
      const absoluteTest = path.resolve(cwd, './test');
      
      expect(path.normalize(relativeTest)).toBe(path.join(cwd, 'test'));
      expect(absoluteTest).toBe(path.join(cwd, 'test'));
    });

    it('should resolve relative paths correctly from cwd', () => {
      const cwd = process.cwd();
      
      // Test various relative path formats that might come from VS Code settings
      const testCases = [
        { input: './.alpackages', expected: path.join(cwd, '.alpackages') },
        { input: './src', expected: path.join(cwd, 'src') },
        { input: '.', expected: cwd },
        { input: '../test', expected: path.join(path.dirname(cwd), 'test') }
      ];

      testCases.forEach(({ input, expected }) => {
        const resolved = path.resolve(cwd, input);
        expect(resolved).toBe(expected);
      });
    });
  });

  describe('VS Code settings path resolution', () => {
    let testProjectDir: string;

    beforeEach(async () => {
      // Create test project structure
      testProjectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(testProjectDir, { recursive: true });
      await fs.mkdir(path.join(testProjectDir, '.vscode'), { recursive: true });
      await fs.mkdir(path.join(testProjectDir, '.alpackages'), { recursive: true });
    });

    it('should resolve relative paths from VS Code settings correctly', async () => {
      // Create mock VS Code settings
      const settings = {
        "al.packageCachePath": ["./.alpackages"]
      };
      
      const settingsPath = path.join(testProjectDir, '.vscode', 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

      // Test the path resolution logic that's currently buggy
      const workspaceCachePath = "./.alpackages";
      
      // Current buggy approach using path.join
      const buggyResolution = path.isAbsolute(workspaceCachePath) 
        ? workspaceCachePath 
        : path.join(testProjectDir, workspaceCachePath);
      
      // Correct approach using path.resolve  
      const correctResolution = path.isAbsolute(workspaceCachePath)
        ? workspaceCachePath
        : path.resolve(testProjectDir, workspaceCachePath);

      // Both should resolve to the same absolute path, but let's verify
      const expectedPath = path.join(testProjectDir, '.alpackages');
      
      expect(correctResolution).toBe(expectedPath);
      
      // The buggy approach might work on some platforms but not others
      // Let's test what happens
      expect(path.normalize(buggyResolution)).toBe(expectedPath);
    });

    it('should handle dot "." as root path correctly', async () => {
      // Save current directory
      const originalCwd = process.cwd();
      
      try {
        // Change to test project directory to simulate VS Code/Copilot behavior
        process.chdir(testProjectDir);
        
        // Now test what happens when rootPath is "."
        const rootPath = ".";
        const relativeCachePath = "./.alpackages";
        
        // Current buggy resolution
        const buggyResult = path.isAbsolute(relativeCachePath)
          ? relativeCachePath
          : path.join(rootPath, relativeCachePath);
          
        // Correct resolution - should normalize rootPath first
        const normalizedRootPath = path.resolve(rootPath);
        const correctResult = path.isAbsolute(relativeCachePath)
          ? relativeCachePath
          : path.resolve(normalizedRootPath, relativeCachePath);
          
        // Expected result
        const expectedPath = path.join(testProjectDir, '.alpackages');
        
        expect(correctResult).toBe(expectedPath);
        
        // Show what the buggy version produces
        const buggyNormalized = path.resolve(buggyResult);
        expect(buggyNormalized).toBe(expectedPath); // This might pass due to path.resolve fixing it
        
      } finally {
        // Restore original directory
        process.chdir(originalCwd);
      }
    });
  });

  describe('Platform-specific path behavior', () => {
    it('should handle path separators correctly', () => {
      const testPath = path.join('folder', 'subfolder', 'file.txt');
      
      if (os.platform() === 'win32') {
        expect(testPath).toContain('\\');
      } else {
        expect(testPath).toContain('/');
      }
      
      // path.resolve should always produce valid paths
      const resolved = path.resolve(testPath);
      expect(path.isAbsolute(resolved)).toBe(true);
    });

    it('should handle different drive letters on Windows', () => {
      if (os.platform() === 'win32') {
        const cwd = process.cwd();
        expect(cwd).toMatch(/^[A-Za-z]:\\/);
        
        // Test cross-drive path resolution
        const altDrive = cwd[0] === 'C' ? 'D:' : 'C:';
        const crossDrivePath = path.resolve(altDrive, './test');
        expect(crossDrivePath.startsWith(altDrive)).toBe(true);
      }
    });

    it('should normalize paths consistently', () => {
      const testCases = [
        './test/../test/file.txt',
        'test//file.txt',
        'test/./file.txt',
        'test\\file.txt', // Should work on all platforms
      ];

      testCases.forEach(testCase => {
        const normalized = path.normalize(testCase);
        const resolved = path.resolve(testCase);
        
        // Should not contain .. or . segments after normalization
        expect(normalized).not.toContain('/..');
        expect(normalized).not.toContain('\\..');
        expect(resolved).not.toContain('/..');
        expect(resolved).not.toContain('\\..');
        
        // Resolved should be absolute
        expect(path.isAbsolute(resolved)).toBe(true);
      });
    });
  });

  describe('Edge cases and error conditions', () => {
    it('should handle empty and null paths gracefully', () => {
      expect(() => path.resolve('')).not.toThrow();
      expect(() => path.resolve('.')).not.toThrow();
      
      // Empty string should resolve to cwd
      expect(path.resolve('')).toBe(process.cwd());
      expect(path.resolve('.')).toBe(process.cwd());
    });

    it('should handle very long paths', () => {
      const longPath = 'very/'.repeat(100) + 'long/path';
      
      expect(() => path.resolve(longPath)).not.toThrow();
      expect(() => path.normalize(longPath)).not.toThrow();
      
      const resolved = path.resolve(longPath);
      expect(path.isAbsolute(resolved)).toBe(true);
    });

    it('should handle special characters in paths', () => {
      const specialChars = ['spaces in name', 'name.with.dots', 'name-with-dashes'];
      
      specialChars.forEach(name => {
        const testPath = path.join('test', name);
        expect(() => path.resolve(testPath)).not.toThrow();
        expect(() => path.normalize(testPath)).not.toThrow();
      });
    });
  });
});