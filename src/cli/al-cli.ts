import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';

export interface ALAppManifest {
  id: string;
  name: string;
  publisher: string;
  version: string;
  dependencies?: {
    id: string;
    name: string;
    publisher: string;
    version: string;
  }[];
}

export class ALCliWrapper {
  private alCommand: string = 'AL';

  constructor(alPath?: string) {
    if (alPath) {
      this.alCommand = alPath;
    } else if (process.env.AL_CLI_PATH) {
      this.alCommand = process.env.AL_CLI_PATH;
    } else {
      this.alCommand = 'AL'; // Default to PATH resolution
    }
  }

  /**
   * Set the AL command path (useful after auto-installation)
   */
  setALCommand(alPath: string): void {
    this.alCommand = alPath;
  }

  /**
   * Extract symbols from an AL package (.app file)
   * This creates a symbol package containing SymbolReference.json
   */
  async extractSymbols(appPath: string): Promise<string> {
    try {
      // Verify the app file exists
      await fs.access(appPath);

      // Create temporary symbol package path
      const symbolPath = path.join(
        os.tmpdir(), 
        `symbols_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.app`
      );

      // Run: AL CreateSymbolPackage input.app symbols.app
      await this.executeALCommand('CreateSymbolPackage', [appPath, symbolPath]);

      // Verify the symbol package was created
      await fs.access(symbolPath);

      return symbolPath;
    } catch (error) {
      throw new Error(`Failed to extract symbols from ${appPath}: ${error}`);
    }
  }

  /**
   * Get package manifest information from an AL package
   */
  async getPackageManifest(appPath: string): Promise<ALAppManifest> {
    try {
      // Run: AL GetPackageManifest input.app
      const manifestJson = await this.executeALCommand('GetPackageManifest', [appPath]);
      const manifest = JSON.parse(manifestJson) as ALAppManifest;
      
      return manifest;
    } catch (error) {
      throw new Error(`Failed to get package manifest from ${appPath}: ${error}`);
    }
  }

  /**
   * Check if AL CLI is available
   */
  async checkALAvailability(): Promise<boolean> {
    try {
      await this.executeALCommand('--version', []);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get AL CLI version
   */
  async getVersion(): Promise<string> {
    try {
      const version = await this.executeALCommand('--version', []);
      return version.trim();
    } catch (error) {
      throw new Error(`Failed to get AL CLI version: ${error}`);
    }
  }

  /**
   * Execute AL command with proper error handling
   */
  private executeALCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const fullArgs = [command, ...args];
      const process = spawn(this.alCommand, fullArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`AL command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to spawn AL process: ${error.message}`));
      });

      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error('AL command timed out'));
      }, 60000); // 60 second timeout

      process.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Clean up temporary symbol files
   */
  async cleanupSymbolFile(symbolPath: string): Promise<void> {
    try {
      await fs.unlink(symbolPath);
    } catch (error) {
      // Ignore cleanup errors
      console.warn(`Failed to cleanup symbol file ${symbolPath}:`, error);
    }
  }

  /**
   * Batch extract symbols from multiple packages
   */
  async extractSymbolsBatch(appPaths: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const errors: string[] = [];

    // Process packages in parallel with limited concurrency
    const maxConcurrency = Math.min(4, appPaths.length);
    const semaphore = new Array(maxConcurrency).fill(null);
    
    const processPackage = async (appPath: string): Promise<void> => {
      try {
        const symbolPath = await this.extractSymbols(appPath);
        results.set(appPath, symbolPath);
      } catch (error) {
        errors.push(`${appPath}: ${error}`);
      }
    };

    // Process packages with controlled concurrency
    for (let i = 0; i < appPaths.length; i += maxConcurrency) {
      const batch = appPaths.slice(i, i + maxConcurrency);
      await Promise.all(batch.map(processPackage));
    }

    if (errors.length > 0) {
      console.warn('Some packages failed to process:', errors);
    }

    return results;
  }
}