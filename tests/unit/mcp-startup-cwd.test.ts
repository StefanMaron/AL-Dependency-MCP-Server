import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';

describe('MCP Server Working Directory Behavior', () => {
  let tempDir: string;
  let projectDir: string;
  let differentDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-cwd-test-'));
    projectDir = path.join(tempDir, 'al-project');
    differentDir = path.join(tempDir, 'different-location');
    
    // Create project structure
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, '.alpackages'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.vscode'), { recursive: true });
    
    // Create different directory (simulates where AI client might be running)
    await fs.mkdir(differentDir, { recursive: true });
    
    // Create VS Code settings with relative path
    const settings = { "al.packageCachePath": ["./.alpackages"] };
    await fs.writeFile(
      path.join(projectDir, '.vscode', 'settings.json'),
      JSON.stringify(settings, null, 2)
    );

    // Create dummy app file
    await fs.writeFile(path.join(projectDir, '.alpackages', 'test.app'), 'dummy content');
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true }).catch(() => {});
  });

  describe('Working directory scenarios', () => {
    it('should show what happens when Node.js starts from project directory', async () => {
      const originalCwd = process.cwd();
      
      try {
        // Simulate starting Node.js from the AL project directory
        process.chdir(projectDir);
        
        const currentCwd = process.cwd();
        console.log('When started from project dir, cwd is:', currentCwd);
        
        // This would work correctly (normalize paths for macOS)
        expect(path.resolve(currentCwd)).toBe(path.resolve(projectDir));
        
        // Relative paths would resolve correctly
        const relativePath = "./.alpackages";
        const resolved = path.resolve(relativePath);
        expect(resolved).toBe(path.join(projectDir, '.alpackages'));
        
        // Check if .alpackages exists from this cwd
        const exists = await fs.access(relativePath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
        
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should show what happens when Node.js starts from different directory', async () => {
      const originalCwd = process.cwd();
      
      try {
        // Simulate AI client starting MCP server from a different directory
        process.chdir(differentDir);
        
        const currentCwd = process.cwd();
        console.log('When started from different dir, cwd is:', currentCwd);
        
        expect(path.resolve(currentCwd)).toBe(path.resolve(differentDir));
        expect(path.resolve(currentCwd)).not.toBe(path.resolve(projectDir));
        
        // Now if the user calls al_auto_discover with rootPath="."
        const rootPath = ".";
        const resolvedRoot = path.resolve(rootPath);
        
        // This would resolve to the wrong directory!
        expect(path.resolve(resolvedRoot)).toBe(path.resolve(differentDir));
        expect(path.resolve(resolvedRoot)).not.toBe(path.resolve(projectDir));
        
        // Relative paths would fail
        const relativePath = "./.alpackages";
        const resolved = path.resolve(relativePath);
        expect(resolved).toBe(path.join(differentDir, '.alpackages')); // Wrong location!
        
        // Check if .alpackages exists from this wrong cwd
        const exists = await fs.access(relativePath).then(() => true).catch(() => false);
        expect(exists).toBe(false); // Would fail!
        
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should demonstrate the solution - never rely on process.cwd() alone', async () => {
      const originalCwd = process.cwd();
      
      try {
        // Even if started from wrong directory
        process.chdir(differentDir);
        
        // If user provides the correct absolute path
        const correctRootPath = projectDir; // User should provide this
        const workspaceCachePath = "./.alpackages";
        
        // This would work correctly regardless of MCP server's cwd
        const correctResolution = path.isAbsolute(workspaceCachePath)
          ? workspaceCachePath
          : path.resolve(correctRootPath, workspaceCachePath);
        
        expect(correctResolution).toBe(path.join(projectDir, '.alpackages'));
        
        // Check if it exists
        const exists = await fs.access(correctResolution).then(() => true).catch(() => false);
        expect(exists).toBe(true);
        
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Simulate MCP server startup scenarios', () => {
    it('should test actual Node.js process started from different directories', (done) => {
      const testScript = `
        console.log("STARTED_FROM:", process.cwd());
        console.log("ARGS:", process.argv.slice(2));
        
        const path = require('path');
        const rootPath = process.argv[2] || '.';
        const resolved = path.resolve(rootPath);
        console.log("RESOLVED_ROOT:", resolved);
        
        // Test if .alpackages exists relative to resolved root
        const fs = require('fs');
        const alpackagesPath = path.join(resolved, '.alpackages');
        fs.access(alpackagesPath, (err) => {
          console.log("ALPACKAGES_EXISTS:", !err);
          console.log("ALPACKAGES_PATH:", alpackagesPath);
          process.exit(0);
        });
      `;

      const scriptPath = path.join(tempDir, 'test-startup.js');
      
      fs.writeFile(scriptPath, testScript)
        .then(() => {
          // Test 1: Start from project directory with rootPath="."
          const child1 = spawn('node', [scriptPath, '.'], { 
            cwd: projectDir,
            stdio: 'pipe'
          });
          
          let output1 = '';
          child1.stdout?.on('data', (data) => output1 += data.toString());
          
          child1.on('close', () => {
            console.log('--- Test 1: Started from project dir with rootPath="." ---');
            console.log(output1);
            
            expect(output1).toMatch(new RegExp(`STARTED_FROM: ${projectDir.replace(/[/\\]/g, '[/\\\\]')}`));
            expect(output1).toMatch(new RegExp(`RESOLVED_ROOT: ${projectDir.replace(/[/\\]/g, '[/\\\\]')}`));
            expect(output1).toContain('ALPACKAGES_EXISTS: true');
            
            // Test 2: Start from different directory with rootPath="."
            const child2 = spawn('node', [scriptPath, '.'], {
              cwd: differentDir,
              stdio: 'pipe'
            });
            
            let output2 = '';
            child2.stdout?.on('data', (data) => output2 += data.toString());
            
            child2.on('close', () => {
              console.log('--- Test 2: Started from different dir with rootPath="." ---');
              console.log(output2);
              
              expect(output2).toMatch(new RegExp(`STARTED_FROM: ${differentDir.replace(/[/\\]/g, '[/\\\\]')}`));
              expect(output2).toMatch(new RegExp(`RESOLVED_ROOT: ${differentDir.replace(/[/\\]/g, '[/\\\\]')}`));
              expect(output2).toContain('ALPACKAGES_EXISTS: false'); // Should fail!
              
              // Test 3: Start from different directory with correct absolute path
              const child3 = spawn('node', [scriptPath, projectDir], {
                cwd: differentDir,
                stdio: 'pipe'
              });
              
              let output3 = '';
              child3.stdout?.on('data', (data) => output3 += data.toString());
              
              child3.on('close', () => {
                console.log('--- Test 3: Started from different dir with correct absolute path ---');
                console.log(output3);
                
                expect(output3).toMatch(new RegExp(`STARTED_FROM: ${differentDir.replace(/[/\\]/g, '[/\\\\]')}`));
                expect(output3).toMatch(new RegExp(`RESOLVED_ROOT: ${projectDir.replace(/[/\\]/g, '[/\\\\]')}`));
                expect(output3).toContain('ALPACKAGES_EXISTS: true'); // Should work!
                
                done();
              });
            });
          });
        })
        .catch(done);
    }, 10000); // 10 second timeout for subprocess tests
  });

  describe('Real-world MCP client scenarios', () => {
    it('should document what we know about different AI clients', () => {
      const scenarios = {
        'Claude Desktop': {
          'likely_startup_cwd': 'User home directory or Claude app directory',
          'risk_level': 'HIGH - probably not in project directory'
        },
        'VS Code Copilot': {
          'likely_startup_cwd': 'VS Code workspace root',
          'risk_level': 'LOW - probably in project directory'
        },
        'Cursor': {
          'likely_startup_cwd': 'Cursor workspace root',
          'risk_level': 'LOW - probably in project directory'  
        },
        'Command line MCP client': {
          'likely_startup_cwd': 'Terminal current directory',
          'risk_level': 'VARIABLE - depends on where user runs it'
        }
      };

      console.log('AI Client MCP Server Startup Scenarios:');
      for (const [client, info] of Object.entries(scenarios)) {
        console.log(`${client}:`);
        console.log(`  Likely startup CWD: ${info.likely_startup_cwd}`);
        console.log(`  Risk level: ${info.risk_level}`);
      }

      // The key insight: We cannot rely on process.cwd() being the project directory
      expect(true).toBe(true); // This test is about documenting the problem
    });

    it('should show the implications for Issue #9', () => {
      const implications = [
        'If MCP server starts from non-project directory, process.cwd() is wrong',
        'Using rootPath="." resolves to wrong directory',
        'Relative paths in VS Code settings fail to resolve correctly',
        'Package discovery fails even when .alpackages exists',
        'The fix must not depend on MCP server startup directory'
      ];

      console.log('Implications for Issue #9:');
      implications.forEach((implication, i) => {
        console.log(`${i + 1}. ${implication}`);
      });

      expect(implications.length).toBeGreaterThan(0);
    });
  });
});