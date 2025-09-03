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
  private installationInProgress = false;
  
  /**
   * Check if AL CLI is available and try to install it if not
   */
  async ensureALAvailable(): Promise<InstallationResult> {
    // Prevent concurrent installations
    if (this.installationInProgress) {
      return {
        success: false,
        message: 'Another installation is already in progress',
        requiresManualInstall: false
      };
    }
    try {
      // First check if AL is already available
      const existingPath = await this.findExistingAL();
      if (existingPath) {
        try {
          const version = await this.getALVersion(existingPath);
          return {
            success: true,
            alPath: existingPath,
            message: `AL CLI found at ${existingPath} (${version})`
          };
        } catch (versionError) {
          // AL exists but version check failed - still consider it usable
          console.warn(`Version check failed for AL at ${existingPath}: ${versionError}`);
          return {
            success: true,
            alPath: existingPath,
            message: `AL CLI found at ${existingPath} (version check failed but AL is available)`
          };
        }
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
      this.installationInProgress = true;
      
      try {
        const installResult = await this.installALCli();
        if (installResult.success) {
          // Wait a moment for the installation to settle
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const newPath = await this.findExistingAL();
          if (newPath) {
            return {
              success: true,
              alPath: newPath,
              message: `AL CLI successfully auto-installed at ${newPath}`
            };
          } else {
            return {
              success: false,
              message: 'Installation succeeded but AL CLI not found afterwards. May need manual PATH configuration.',
              requiresManualInstall: true
            };
          }
        } else {
          return {
            success: false,
            message: `Auto-installation failed: ${installResult.message}`,
            requiresManualInstall: true
          };
        }
      } finally {
        this.installationInProgress = false;
      }
    } catch (error) {
      this.installationInProgress = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Auto-installation error: ${errorMessage}`,
        requiresManualInstall: true
      };
    }
  }

  /**
   * Find existing AL CLI installation
   */
  private async findExistingAL(): Promise<string | null> {
    const platform = os.platform();
    
    // Check for custom AL CLI path in environment variable
    const customPath = process.env.AL_CLI_PATH;
    if (customPath) {
      try {
        await fs.access(customPath);
        const available = await this.testALCommand(customPath);
        if (available) return customPath;
      } catch (error) {
        console.warn(`Custom AL CLI path ${customPath} is not accessible: ${error}`);
      }
    }
    
    const commonPaths = [
      // Try standard PATH first
      'AL',
      
      // User dotnet tools (handle different home directory env vars)
      path.join(this.getHomeDirectory(), '.dotnet', 'tools', platform === 'win32' ? 'AL.exe' : 'AL'),
      
      // Global dotnet tools (Windows)
      ...(platform === 'win32' ? [
        path.join('C:', 'Program Files', 'dotnet', 'tools', 'AL.exe'),
        path.join(this.getHomeDirectory(), '.dotnet', 'tools', 'AL.exe'),
        path.join('C:', 'Program Files (x86)', 'dotnet', 'tools', 'AL.exe')
      ] : []),
      
      // Global dotnet tools (Unix)
      ...(platform !== 'win32' ? [
        '/usr/local/share/dotnet/tools/AL',
        '/usr/share/dotnet/tools/AL',
        '/opt/dotnet/tools/AL'
      ] : [])
    ];

    for (const alPath of commonPaths) {
      try {
        if (alPath === 'AL') {
          // Test if AL is in PATH
          const available = await this.testALCommand(alPath);
          if (available) return alPath;
        } else {
          // Test if file exists and is accessible
          await fs.access(alPath, fs.constants.F_OK | fs.constants.X_OK);
          const available = await this.testALCommand(alPath);
          if (available) return alPath;
        }
      } catch (error) {
        // Continue to next path - log detailed errors in debug mode
        if (process.env.DEBUG) {
          console.debug(`Path ${alPath} not available: ${error}`);
        }
      }
    }

    return null;
  }
  
  /**
   * Get the home directory, handling different environment variables across platforms
   */
  private getHomeDirectory(): string {
    const platform = os.platform();
    
    if (platform === 'win32') {
      return process.env.USERPROFILE || process.env.HOMEPATH || os.homedir();
    } else {
      return process.env.HOME || os.homedir();
    }
  }

  /**
   * Test if AL command works
   */
  private async testALCommand(alPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn(alPath, ['--version'], { stdio: 'pipe' });
      let resolved = false;
      let timeoutId: NodeJS.Timeout | null = null;
      
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (!process.killed) {
          process.kill('SIGTERM');
          // Force kill after 1 second if process doesn't respond to SIGTERM
          setTimeout(() => {
            if (!process.killed) {
              process.kill('SIGKILL');
            }
          }, 1000);
        }
      };
      
      const resolveOnce = (result: boolean) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };
      
      let hasOutput = false;
      process.stdout?.on('data', (_data) => { 
        hasOutput = true; 
      });
      process.stderr?.on('data', (_data) => { 
        hasOutput = true; 
      });
      
      process.on('close', (_code) => {
        // AL CLI might output to stderr and return non-zero code, but still be working
        // Accept if we got any output that looks like version info
        resolveOnce(hasOutput);
      });
      
      process.on('error', (_err) => {
        resolveOnce(false);
      });

      // Timeout after 5 seconds with proper cleanup
      timeoutId = setTimeout(() => {
        resolveOnce(false);
      }, 5000);
    });
  }

  /**
   * Get AL CLI version
   */
  private async getALVersion(alPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(alPath, ['--version'], { stdio: 'pipe' });
      let resolved = false;
      let timeoutId: NodeJS.Timeout | null = null;
      
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (!process.killed) {
          process.kill('SIGTERM');
          // Force kill after 1 second if process doesn't respond to SIGTERM
          setTimeout(() => {
            if (!process.killed) {
              process.kill('SIGKILL');
            }
          }, 1000);
        }
      };
      
      const resolveOnce = (result: string) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };
      
      const rejectOnce = (error: Error) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        reject(error);
      };
      
      let output = '';
      process.stdout?.on('data', (data) => { output += data.toString(); });
      process.stderr?.on('data', (data) => { output += data.toString(); });
      
      process.on('close', (_code) => {
        // Accept any output that contains version information
        if (output.trim().length > 0) {
          resolveOnce(output.trim());
        } else {
          rejectOnce(new Error('Failed to get version - no output'));
        }
      });
      
      process.on('error', (error) => {
        rejectOnce(error);
      });
      
      // Timeout after 10 seconds with proper cleanup
      timeoutId = setTimeout(() => {
        rejectOnce(new Error('Version check timed out after 10 seconds'));
      }, 10000);
    });
  }

  /**
   * Check if .NET is available
   */
  private async checkDotnetAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn('dotnet', ['--version'], { stdio: 'pipe' });
      let resolved = false;
      let timeoutId: NodeJS.Timeout | null = null;
      
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (!process.killed) {
          process.kill('SIGTERM');
          // Force kill after 1 second if process doesn't respond to SIGTERM
          setTimeout(() => {
            if (!process.killed) {
              process.kill('SIGKILL');
            }
          }, 1000);
        }
      };
      
      const resolveOnce = (result: boolean) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };
      
      process.on('close', (code) => {
        resolveOnce(code === 0);
      });
      
      process.on('error', () => {
        resolveOnce(false);
      });

      // Timeout after 3 seconds with proper cleanup
      timeoutId = setTimeout(() => {
        resolveOnce(false);
      }, 3000);
    });
  }

  /**
   * Get OS-specific AL CLI package name
   */
  private getALPackageName(): string {
    const platform = os.platform();
    switch (platform) {
      case 'win32':
        return 'Microsoft.Dynamics.BusinessCentral.Development.Tools';
      case 'linux':
        return 'Microsoft.Dynamics.BusinessCentral.Development.Tools.Linux';
      case 'darwin':
        return 'Microsoft.Dynamics.BusinessCentral.Development.Tools.Osx';
      default:
        return 'Microsoft.Dynamics.BusinessCentral.Development.Tools';
    }
  }

  /**
   * Install AL CLI using dotnet tool install
   */
  private async installALCli(): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      console.log('Installing AL CLI using dotnet tool...');
      
      const packageName = this.getALPackageName();
      const process = spawn('dotnet', [
        'tool', 'install', '--global', packageName, '--prerelease'
      ], { stdio: 'pipe' });
      
      let resolved = false;
      let timeoutId: NodeJS.Timeout | null = null;
      
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (!process.killed) {
          process.kill('SIGTERM');
          // Force kill after 1 second if process doesn't respond to SIGTERM
          setTimeout(() => {
            if (!process.killed) {
              process.kill('SIGKILL');
            }
          }, 1000);
        }
      };
      
      const resolveOnce = (result: { success: boolean; message: string }) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };
      
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
          resolveOnce({
            success: true,
            message: 'AL CLI installed successfully'
          });
        } else {
          resolveOnce({
            success: false,
            message: `Installation failed with exit code ${code}: ${errorOutput || output}`
          });
        }
      });
      
      process.on('error', (error) => {
        resolveOnce({
          success: false,
          message: `Installation process error: ${error.message}`
        });
      });

      // Timeout after 2 minutes with proper cleanup
      timeoutId = setTimeout(() => {
        resolveOnce({
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
      '2. Install AL CLI (choose based on your OS):',
      '   Windows: dotnet tool install Microsoft.Dynamics.BusinessCentral.Development.Tools --interactive --prerelease --global',
      '   Linux:   dotnet tool install Microsoft.Dynamics.BusinessCentral.Development.Tools.Linux --interactive --prerelease --global',
      '   macOS:   dotnet tool install Microsoft.Dynamics.BusinessCentral.Development.Tools.Osx --interactive --prerelease --global',
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