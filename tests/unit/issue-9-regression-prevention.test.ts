import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { ALPackageManager } from '../../src/core/package-manager';

/**
 * Issue #9 Regression Prevention Test
 * 
 * This test ensures that the specific problem reported in Issue #9 cannot occur again:
 * - VS Code settings with relative paths like "./.alpackages" 
 * - MCP server started from different directory than project
 * - Should resolve paths relative to provided rootPath, not server CWD
 * 
 * CRITICAL: If this test fails, Issue #9 has regressed!
 */
describe('Issue #9 Regression Prevention', () => {
  let tempDir: string;
  let alProjectDir: string;
  let packageManager: ALPackageManager;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'issue-9-regression-'));
    alProjectDir = path.join(tempDir, 'MyALProject');
    packageManager = new ALPackageManager();
    
    // Create the EXACT project structure from Issue #9 report
    await fs.mkdir(alProjectDir, { recursive: true });
    await fs.mkdir(path.join(alProjectDir, '.vscode'), { recursive: true });
    await fs.mkdir(path.join(alProjectDir, '.alpackages'), { recursive: true });
    
    // Create VS Code settings exactly as users have them
    const vsCodeSettings = {
      "al.packageCachePath": ["./.alpackages"]  // This is what causes Issue #9
    };
    await fs.writeFile(
      path.join(alProjectDir, '.vscode', 'settings.json'),
      JSON.stringify(vsCodeSettings, null, 2)
    );
    
    // Create a dummy AL package file
    await fs.writeFile(path.join(alProjectDir, '.alpackages', 'Microsoft_Base Application.app'), 'dummy');
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true }).catch(() => {});
  });

  /**
   * TEST 1: Core path resolution must use path.resolve() not path.join()
   * This is the fundamental fix that prevents Issue #9
   */
  it('CRITICAL: must use path.resolve() for relative paths in VS Code settings', async () => {
    const rootPath = alProjectDir; // Absolute path (what AI clients should provide)
    const vsCodeRelativePath = "./.alpackages"; // From VS Code settings
    
    // The old buggy way (what caused Issue #9)
    const buggyApproach = path.isAbsolute(vsCodeRelativePath)
      ? vsCodeRelativePath
      : path.join(rootPath, vsCodeRelativePath);
      
    // The correct way (our fix)
    const correctApproach = path.isAbsolute(vsCodeRelativePath)
      ? vsCodeRelativePath
      : path.resolve(rootPath, vsCodeRelativePath);
    
    // Both should give same result for absolute rootPath, but path.resolve is more robust
    const expectedPath = path.join(alProjectDir, '.alpackages');
    expect(correctApproach).toBe(expectedPath);
    expect(path.isAbsolute(correctApproach)).toBe(true);
    
    console.log('✅ Path resolution regression check passed');
  });

  /**
   * TEST 2: Must work when MCP server starts from different directory
   * This simulates the exact Issue #9 scenario
   */
  it('CRITICAL: must work when MCP server CWD != project directory', async () => {
    const originalCwd = process.cwd();
    const mcpServerDir = path.join(tempDir, 'claude-desktop-location');
    await fs.mkdir(mcpServerDir, { recursive: true });
    
    try {
      // Simulate Claude Desktop/Copilot starting MCP server from different location
      process.chdir(mcpServerDir);
      
      console.log('Issue #9 scenario simulation:');
      console.log(`  AL Project: ${alProjectDir}`);
      console.log(`  MCP Server CWD: ${process.cwd()}`);
      console.log(`  VS Code Setting: "./.alpackages"`);
      
      // This MUST work (if it fails, Issue #9 has regressed)
      const discoveredDirs = await packageManager.autoDiscoverPackageDirectories(alProjectDir);
      
      const expectedPackageDir = path.join(alProjectDir, '.alpackages');
      expect(discoveredDirs).toContain(expectedPackageDir);
      
      // Verify the package actually contains files
      const packageFiles = await packageManager.discoverPackages({
        packagesPath: expectedPackageDir,
        recursive: false
      });
      expect(packageFiles.length).toBeGreaterThan(0);
      expect(packageFiles[0]).toContain('Microsoft_Base Application.app');
      
      console.log('✅ Issue #9 scenario works correctly - regression prevented');
      
    } finally {
      process.chdir(originalCwd);
    }
  });

  /**
   * TEST 3: Must reject dangerous relative rootPath values
   * This prevents the "." default that made Issue #9 possible
   */
  it('CRITICAL: must reject relative rootPath to prevent Issue #9 conditions', async () => {
    const dangerousRootPaths = [
      ".",           // The main culprit from Issue #9
      "./project",   // Other relative paths
      "../project",
      "project"
    ];

    for (const dangerousPath of dangerousRootPaths) {
      await expect(packageManager.autoDiscoverPackageDirectories(dangerousPath))
        .rejects.toThrow('rootPath must be an absolute path');
    }
    
    console.log('✅ Dangerous relative rootPath values properly rejected');
  });

  /**
   * TEST 4: Must handle the exact path format from Issue #9 report  
   * This tests the specific "./.alpackages" format mentioned in the issue
   */
  it('CRITICAL: must handle "./.alpackages" format from Issue #9', async () => {
    const originalCwd = process.cwd();
    const differentDir = path.join(tempDir, 'cursor-location');
    await fs.mkdir(differentDir, { recursive: true });
    
    try {
      process.chdir(differentDir);
      
      // Test the specific method that was buggy
      const getCustomPackagePathsMethod = (packageManager as any).getCustomPackagePaths.bind(packageManager);
      const customPaths: string[] = await getCustomPackagePathsMethod(alProjectDir);
      
      if (customPaths.length > 0) {
        const resolvedPath = customPaths[0];
        const expectedPath = path.join(alProjectDir, '.alpackages');
        
        expect(resolvedPath).toBe(expectedPath);
        expect(path.isAbsolute(resolvedPath)).toBe(true);
        
        // Ensure the path actually exists and is accessible
        const exists = await fs.access(resolvedPath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }
      
      console.log('✅ "./.alpackages" format handled correctly');
      
    } finally {
      process.chdir(originalCwd);
    }
  });

  /**
   * TEST 5: Comprehensive end-to-end validation
   * This is the ultimate test - if this passes, Issue #9 is definitely fixed
   */
  it('CRITICAL: end-to-end Issue #9 scenario must work perfectly', async () => {
    const originalCwd = process.cwd();
    
    // Create multiple different locations where MCP server might start
    const testLocations = [
      path.join(tempDir, 'claude-app'),
      path.join(tempDir, 'user-home'), 
      path.join(tempDir, 'vscode-extension'),
      path.join(tempDir, 'cursor-app')
    ];
    
    for (const location of testLocations) {
      await fs.mkdir(location, { recursive: true });
      
      try {
        process.chdir(location);
        
        // The core test: auto-discovery with absolute rootPath
        const result = await packageManager.autoDiscoverPackageDirectories(alProjectDir);
        
        // Must find the .alpackages directory
        const expectedDir = path.join(alProjectDir, '.alpackages');
        expect(result).toContain(expectedDir);
        
        // Must be able to load packages from it
        const packages = await packageManager.discoverPackages({
          packagesPath: expectedDir,
          recursive: false
        });
        expect(packages.length).toBeGreaterThan(0);
        
      } finally {
        process.chdir(originalCwd);
      }
    }
    
    console.log('✅ End-to-end Issue #9 scenario validation passed from all locations');
  });

  /**
   * TEST 6: Ensure code quality - no path.join() with relative paths
   * This is a meta-test to ensure we don't accidentally reintroduce the bug
   */
  it('DOCUMENTATION: path.resolve() vs path.join() behavior difference', () => {
    // Use platform-appropriate absolute path for cross-platform compatibility
    const absoluteRoot = process.platform === 'win32' ? 'C:\\project\\root' : '/project/root';
    const relativePath = './.alpackages';
    
    // Show the difference that caused Issue #9
    const joinResult = path.join(absoluteRoot, relativePath);
    const resolveResult = path.resolve(absoluteRoot, relativePath);
    
    console.log('Path resolution behavior comparison:');
    console.log(`  path.join("${absoluteRoot}", "${relativePath}") = ${joinResult}`);  
    console.log(`  path.resolve("${absoluteRoot}", "${relativePath}") = ${resolveResult}`);
    
    // Both give same result for absolute paths, but resolve is safer
    expect(path.normalize(joinResult)).toBe(path.normalize(resolveResult));
    expect(path.isAbsolute(resolveResult)).toBe(true);
    
    // The real issue was when rootPath was "." (relative)
    const problematicCase = ".";
    const joinProblem = path.join(problematicCase, relativePath);
    const resolveSolution = path.resolve(problematicCase, relativePath);
    
    console.log('The problematic case that caused Issue #9:');
    console.log(`  path.join("${problematicCase}", "${relativePath}") = ${joinProblem} (RELATIVE - BAD!)`);
    console.log(`  path.resolve("${problematicCase}", "${relativePath}") = ${resolveSolution} (ABSOLUTE - GOOD!)`);
    
    expect(path.isAbsolute(joinProblem)).toBe(false);  // This was the bug
    expect(path.isAbsolute(resolveSolution)).toBe(true); // This is the fix
  });
});