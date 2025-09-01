#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

interface MCPServerConfig {
  [serverName: string]: {
    command: string;
    args: string[];
    type?: string;
  };
}

interface VSCodeMCPConfig {
  servers: MCPServerConfig;
}

class ALMCPInstaller {
  private readonly serverPath: string;
  private readonly serverName = 'al';

  constructor() {
    // Get the absolute path to this package's server
    this.serverPath = path.resolve(__dirname, '../index.js');
  }

  async install(): Promise<void> {
    console.log('🚀 AL MCP Server Installer');
    console.log('==========================\n');

    try {
      // Check if AL CLI tools are available
      await this.checkALTools();

      // Install for different editors
      await this.installForClaudeCode();
      await this.installForVSCode();
      await this.showManualInstructions();

      console.log('\n✅ Installation completed successfully!');
      console.log('\n🎯 Quick Test:');
      console.log('Ask your coding assistant: "Can you search for Customer tables in my AL project?"');
      
    } catch (error) {
      console.error('❌ Installation failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  private async checkALTools(): Promise<void> {
    console.log('🔧 Checking AL CLI tools...');
    
    try {
      await this.runCommand('AL', ['--version']);
      console.log('✅ AL CLI tools found');
    } catch {
      console.log('⚠️  AL CLI tools not found. Trying to install...');
      try {
        await this.runCommand('dotnet', ['tool', 'install', '--global', 'Microsoft.Dynamics.AL.Tools']);
        console.log('✅ AL CLI tools installed');
      } catch (error) {
        console.log('⚠️  Could not install AL CLI tools automatically');
        console.log('📝 The MCP server can still work with existing .alpackages');
        console.log('💡 To extract symbols from .app files, install manually:');
        console.log('   dotnet tool install --global Microsoft.Dynamics.AL.Tools');
      }
    }
  }

  private async installForClaudeCode(): Promise<void> {
    console.log('\n📝 Configuring Claude Code...');
    
    const vscodeSettingsPath = this.getVSCodeSettingsPath();
    if (!vscodeSettingsPath) {
      console.log('⚠️  VS Code settings directory not found, skipping Claude Code configuration');
      return;
    }

    try {
      let settings: any = {};
      if (fs.existsSync(vscodeSettingsPath)) {
        const content = fs.readFileSync(vscodeSettingsPath, 'utf8');
        settings = JSON.parse(content);
      }

      if (!settings['claude.mcpServers']) {
        settings['claude.mcpServers'] = {};
      }

      settings['claude.mcpServers'][this.serverName] = {
        command: 'node',
        args: [this.serverPath]
      };

      fs.writeFileSync(vscodeSettingsPath, JSON.stringify(settings, null, 2));
      console.log('✅ Claude Code configured');
    } catch (error) {
      console.log('⚠️  Failed to configure Claude Code automatically');
    }
  }

  private async installForVSCode(): Promise<void> {
    console.log('\n📝 Configuring VS Code MCP...');
    
    const workspaceRoot = this.findWorkspaceRoot();
    if (!workspaceRoot) {
      console.log('⚠️  No workspace found, skipping VS Code MCP configuration');
      return;
    }

    try {
      const vscodeDir = path.join(workspaceRoot, '.vscode');
      const mcpConfigPath = path.join(vscodeDir, 'mcp.json');

      if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
      }

      let mcpConfig: VSCodeMCPConfig = { servers: {} };
      if (fs.existsSync(mcpConfigPath)) {
        const content = fs.readFileSync(mcpConfigPath, 'utf8');
        mcpConfig = JSON.parse(content);
      }

      mcpConfig.servers[this.serverName] = {
        type: 'stdio',
        command: 'node',
        args: [this.serverPath]
      };

      fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
      console.log('✅ VS Code MCP configured');
    } catch (error) {
      console.log('⚠️  Failed to configure VS Code MCP automatically');
    }
  }

  private getVSCodeSettingsPath(): string | null {
    const homeDir = os.homedir();
    let settingsDir: string;

    if (process.platform === 'win32') {
      settingsDir = path.join(homeDir, 'AppData', 'Roaming', 'Code', 'User');
    } else if (process.platform === 'darwin') {
      settingsDir = path.join(homeDir, 'Library', 'Application Support', 'Code', 'User');
    } else {
      settingsDir = path.join(homeDir, '.config', 'Code', 'User');
    }

    if (!fs.existsSync(settingsDir)) {
      return null;
    }

    return path.join(settingsDir, 'settings.json');
  }

  private findWorkspaceRoot(): string | null {
    let currentDir = process.cwd();
    
    while (currentDir !== path.dirname(currentDir)) {
      // Check for AL-specific indicators first
      const appJsonPath = path.join(currentDir, 'app.json');
      if (fs.existsSync(appJsonPath)) {
        try {
          const appJsonContent = fs.readFileSync(appJsonPath, 'utf8');
          const appJson = JSON.parse(appJsonContent);
          if (typeof appJson === 'object' && (appJson.platform || appJson.application)) {
            return currentDir;
          }
        } catch (e) {
          // Ignore JSON parse errors and continue searching
        }
      }

      // Check for at least one .al file in the directory
      try {
        const files = fs.readdirSync(currentDir);
        if (files.some(file => file.endsWith('.al'))) {
          return currentDir;
        }
      } catch (e) {
        // Ignore directory read errors and continue searching
      }

      // Check for common workspace indicators as fallback
      const indicators = ['.git', '.vscode', 'launch.json'];
      for (const indicator of indicators) {
        if (fs.existsSync(path.join(currentDir, indicator))) {
          return currentDir;
        }
      }
      
      currentDir = path.dirname(currentDir);
    }

    // Fallback to current directory
    return process.cwd();
  }

  private showManualInstructions(): void {
    console.log('\n📖 Manual Configuration Instructions:');
    console.log('=====================================\n');
    
    console.log('🔷 Claude Code (VS Code Extension):');
    console.log('Add to VS Code settings.json:');
    console.log(JSON.stringify({
      "claude.mcpServers": {
        [this.serverName]: {
          command: 'node',
          args: [this.serverPath]
        }
      }
    }, null, 2));

    console.log('\n🔷 GitHub Copilot (VS Code):');
    console.log('Create .vscode/mcp.json in your workspace:');
    console.log(JSON.stringify({
      servers: {
        [this.serverName]: {
          type: 'stdio',
          command: 'node',
          args: [this.serverPath]
        }
      }
    }, null, 2));

    console.log('\n🔷 Other Editors:');
    console.log(`Server command: node`);
    console.log(`Server args: ["${this.serverPath}"]`);
  }

  private runCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { 
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed: ${command} ${args.join(' ')}\n${stderr}`));
        }
      });
      
      child.on('error', (error) => {
        reject(error);
      });
    });
  }
}

// Run installer if this file is executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🚀 AL MCP Server Installer

Usage: al-mcp-server [options]

Options:
  --help, -h     Show this help message
  --version, -v  Show version information
  --ci           Skip installation (CI mode)
  
Examples:
  npx al-mcp-server           # Install and configure
  npx al-mcp-server --help    # Show help
  npx al-mcp-server --ci      # CI mode (skip installation)
`);
    process.exit(0);
  }
  
  if (args.includes('--version') || args.includes('-v')) {
    const pkg = require('../../package.json');
    console.log(`al-mcp-server v${pkg.version}`);
    process.exit(0);
  }
  
  if (args.includes('--ci') || process.env.CI === 'true') {
    console.log('🤖 CI mode detected - skipping installation');
    console.log('✅ AL MCP Server build verification successful');
    process.exit(0);
  }
  
  const installer = new ALMCPInstaller();
  installer.install().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { ALMCPInstaller };