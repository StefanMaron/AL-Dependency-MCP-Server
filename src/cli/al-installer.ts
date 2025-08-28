import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

export interface InstallationResult {
  success: boolean;
  alPath?: string;
  message: string;
  requiresManualInstall?: boolean;
}

export class ALInstaller {
  /**
   * Check if AL CLI is available and try to install it if not
   */
  async ensureALAvailable(): Promise<InstallationResult> {
    // First check if AL is already available
    const existingPath = await this.findExistingAL();
    if (existingPath) {
      const version = await this.getALVersion(existingPath);
      return {
        success: true,
        alPath: existingPath,
        message: `AL CLI found at ${existingPath} (${version})`
      };
    }

    // Check if .NET is available for installation
    const dotnetAvailable = await this.checkDotnetAvailable();
    if (!dotnetAvailable) {
      return {
        success: false,
        message: 'AL CLI not found and .NET runtime is not available for auto-installation',
        requiresManualInstall: true
      };
    }

    // Try to auto-install AL CLI
    try {
      const installResult = await this.installALCli();
      if (installResult.success) {
        const newPath = await this.findExistingAL();
        return {
          success: true,
          alPath: newPath || 'AL',
          message: `AL CLI successfully auto-installed`
        };
      } else {
        return {
          success: false,
          message: `Auto-installation failed: ${installResult.message}`,
          requiresManualInstall: true
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Auto-installation error: ${error}`,
        requiresManualInstall: true
      };
    }
  }

  /**
   * Find existing AL CLI installation
   */
  private async findExistingAL(): Promise<string | null> {
    const platform = os.platform();
    
    const commonPaths = [
      // Try standard PATH first
      'AL',
      
      // User dotnet tools
      path.join(os.homedir(), '.dotnet', 'tools', platform === 'win32' ? 'AL.exe' : 'AL'),
      
      // Global dotnet tools (Windows)
      ...(platform === 'win32' ? [
        path.join('C:', 'Program Files', 'dotnet', 'tools', 'AL.exe'),
        path.join(process.env.USERPROFILE || '', '.dotnet', 'tools', 'AL.exe')
      ] : []),
      
      // Global dotnet tools (Unix)
      ...(platform !== 'win32' ? [
        '/usr/local/share/dotnet/tools/AL',
        '/usr/share/dotnet/tools/AL'
      ] : [])
    ];

    for (const alPath of commonPaths) {
      try {
        if (alPath === 'AL') {
          // Test if AL is in PATH
          const available = await this.testALCommand(alPath);
          if (available) return alPath;
        } else {
          // Test if file exists
          await fs.access(alPath);
          const available = await this.testALCommand(alPath);
          if (available) return alPath;
        }
      } catch {
        // Continue to next path
      }
    }

    return null;
  }

  /**
   * Test if AL command works
   */
  private async testALCommand(alPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn(alPath, ['--version'], { stdio: 'pipe' });
      
      let hasOutput = false;
      process.stdout?.on('data', (data) => { 
        hasOutput = true; 
      });
      process.stderr?.on('data', (data) => { 
        hasOutput = true; 
      });
      
      process.on('close', (code) => {
        // AL CLI might output to stderr and return non-zero code, but still be working
        // Accept if we got any output that looks like version info
        resolve(hasOutput);
      });
      
      process.on('error', (err) => {
        resolve(false);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        process.kill();
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Get AL CLI version
   */
  private async getALVersion(alPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(alPath, ['--version'], { stdio: 'pipe' });
      
      let output = '';
      process.stdout?.on('data', (data) => { output += data.toString(); });
      process.stderr?.on('data', (data) => { output += data.toString(); });
      
      process.on('close', (code) => {
        // Accept any output that contains version information
        if (output.trim().length > 0) {
          resolve(output.trim());
        } else {
          reject(new Error('Failed to get version - no output'));
        }
      });
      
      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Check if .NET is available
   */
  private async checkDotnetAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn('dotnet', ['--version'], { stdio: 'pipe' });
      
      process.on('close', (code) => {
        resolve(code === 0);
      });
      
      process.on('error', () => {
        resolve(false);
      });

      // Timeout after 3 seconds
      setTimeout(() => {
        process.kill();
        resolve(false);
      }, 3000);
    });
  }

  /**
   * Install AL CLI using dotnet tool install
   */
  private async installALCli(): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      console.log('Installing AL CLI using dotnet tool...');
      
      const process = spawn('dotnet', [
        'tool', 'install', '--global', 'Microsoft.Dynamics.AL.Tools'
      ], { stdio: 'pipe' });
      
      let output = '';
      let errorOutput = '';
      
      process.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(`[AL Install] ${text.trim()}`);
      });
      
      process.stderr?.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        console.error(`[AL Install Error] ${text.trim()}`);
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            message: 'AL CLI installed successfully'
          });
        } else {
          resolve({
            success: false,
            message: `Installation failed with exit code ${code}: ${errorOutput || output}`
          });
        }
      });
      
      process.on('error', (error) => {
        resolve({
          success: false,
          message: `Installation process error: ${error.message}`
        });
      });

      // Timeout after 2 minutes
      setTimeout(() => {
        process.kill();
        resolve({
          success: false,
          message: 'Installation timed out after 2 minutes'
        });
      }, 120000);
    });
  }

  /**
   * Get installation instructions for manual install
   */
  getManualInstallInstructions(): string {
    const platform = os.platform();
    
    const instructions = [
      '🔧 Manual AL CLI Installation Required',
      '',
      '1. Install .NET SDK (if not already installed):',
      '   https://dotnet.microsoft.com/download',
      '',
      '2. Install AL CLI:',
      '   dotnet tool install --global Microsoft.Dynamics.AL.Tools',
      '',
      '3. Verify installation:',
      '   AL --version',
      ''
    ];

    if (platform === 'linux') {
      instructions.push(
        'Linux-specific notes:',
        '- You may need to add ~/.dotnet/tools to your PATH',
        '- export PATH="$PATH:~/.dotnet/tools"',
        ''
      );
    } else if (platform === 'darwin') {
      instructions.push(
        'macOS-specific notes:',
        '- You may need to add ~/.dotnet/tools to your PATH',
        '- echo \'export PATH="$PATH:~/.dotnet/tools"\' >> ~/.zshrc',
        ''
      );
    } else if (platform === 'win32') {
      instructions.push(
        'Windows-specific notes:',
        '- Restart your terminal after installation',
        '- AL CLI should be automatically added to PATH',
        ''
      );
    }

    instructions.push(
      'Alternative: Specify custom AL CLI path:',
      '- Set environment variable AL_CLI_PATH=/path/to/AL',
      '- Or pass alPath parameter to ALCliWrapper constructor'
    );

    return instructions.join('\n');
  }
}