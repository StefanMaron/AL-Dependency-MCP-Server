import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';
import { Readable } from 'stream';

/**
 * Cross-platform ZIP extractor for AL symbol packages
 * Uses PowerShell Expand-Archive on Windows, unzip on Unix systems
 */
export class ZipFallbackExtractor {
  /**
   * Extract SymbolReference.json from AL symbol package using platform-specific tools
   */
  async extractSymbolReference(symbolPackagePath: string): Promise<Readable> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'al-symbols-'));
    
    try {
      // AL packages have a 40-byte header that prevents standard ZIP extraction
      // Create a stripped version for extraction
      const strippedZipPath = await this.stripALPackageHeader(symbolPackagePath, tempDir);
      
      // Use command line unzip to extract the file from the stripped package
      await this.runUnzip(strippedZipPath, tempDir);
      
      // Read the extracted SymbolReference.json
      const symbolsPath = path.join(tempDir, 'SymbolReference.json');
      await fs.access(symbolsPath); // Verify file exists
      
      // Create a readable stream from the file
      const fileStream = require('fs').createReadStream(symbolsPath);
      
      // Create a transform stream to strip UTF-8 BOM if present
      const { Transform } = require('stream');
      let bomStripped = false;
      
      const stream = new Transform({
        transform(chunk: any, encoding: any, callback: any) {
          if (!bomStripped) {
            // Check for UTF-8 BOM (0xEF, 0xBB, 0xBF) and strip it
            if (chunk.length >= 3 && 
                chunk[0] === 0xEF && 
                chunk[1] === 0xBB && 
                chunk[2] === 0xBF) {
              chunk = chunk.slice(3);
            }
            bomStripped = true;
          }
          callback(null, chunk);
        }
      });
      
      fileStream.pipe(stream);
      
      // Clean up temp directory after stream is closed
      stream.on('close', async () => {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch (error) {
          console.warn(`Failed to cleanup temp directory ${tempDir}:`, error);
        }
      });
      
      return stream;
    } catch (error) {
      // Clean up temp directory on error
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Strip the AL package header to create a valid ZIP file
   * AL packages have a 40-byte NAVX header before the ZIP content
   */
  private async stripALPackageHeader(alPackagePath: string, tempDir: string): Promise<string> {
    const strippedPath = path.join(tempDir, `${path.basename(alPackagePath, '.app')}_stripped.zip`);
    
    // Read the original file
    const originalBuffer = await fs.readFile(alPackagePath);
    
    // Check if this is an AL package with NAVX header
    if (this.hasALPackageHeader(originalBuffer)) {
      // Strip the 40-byte AL header to reveal the ZIP content
      const strippedBuffer = originalBuffer.subarray(40);
      await fs.writeFile(strippedPath, strippedBuffer);
    } else {
      // Not an AL package or already stripped, use as-is
      await fs.writeFile(strippedPath, originalBuffer);
    }
    
    return strippedPath;
  }

  /**
   * Check if buffer contains AL package NAVX header
   */
  private hasALPackageHeader(buffer: Buffer): boolean {
    if (buffer.length < 44) return false;
    
    // Check for NAVX signature at start (bytes 0-3)
    const hasStartSignature = buffer[0] === 0x4E && buffer[1] === 0x41 && 
                              buffer[2] === 0x56 && buffer[3] === 0x58; // "NAVX"
    
    // Check for NAVX signature at byte 36-39  
    const hasEndSignature = buffer[36] === 0x4E && buffer[37] === 0x41 && 
                            buffer[38] === 0x56 && buffer[39] === 0x58; // "NAVX"
    
    // Check for ZIP signature at byte 40 (PK)
    const hasZipSignature = buffer[40] === 0x50 && buffer[41] === 0x4B; // "PK"
    
    return hasStartSignature && hasEndSignature && hasZipSignature;
  }

  /**
   * Run platform-specific unzip command to extract ZIP file
   */
  private async runUnzip(zipPath: string, extractDir: string): Promise<void> {
    const platform = os.platform();
    
    if (platform === 'win32') {
      return this.runWindowsUnzip(zipPath, extractDir);
    } else {
      return this.runUnixUnzip(zipPath, extractDir);
    }
  }

  /**
   * Extract ZIP file using PowerShell on Windows
   */
  private async runWindowsUnzip(zipPath: string, extractDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Since we've stripped the AL header, this is now a proper ZIP file
      const psCommand = `Expand-Archive -Path "${zipPath}" -DestinationPath "${extractDir}" -Force`;
      
      const unzipProcess = spawn('powershell', ['-Command', psCommand], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';
      
      unzipProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      unzipProcess.on('close', async (code) => {
        if (code === 0) {
          try {
            // Check if SymbolReference.json was actually extracted
            await fs.access(path.join(extractDir, 'SymbolReference.json'));
            resolve();
          } catch {
            reject(new Error(`PowerShell extraction completed but SymbolReference.json not found: ${stderr}`));
          }
        } else {
          reject(new Error(`PowerShell extraction failed with code ${code}: ${stderr}`));
        }
      });

      unzipProcess.on('error', (error) => {
        reject(new Error(`Failed to run PowerShell command: ${error.message}`));
      });
    });
  }

  /**
   * Extract ZIP file using unzip command on Unix systems
   */
  private async runUnixUnzip(zipPath: string, extractDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Since we've stripped the AL header, this is now a proper ZIP file
      const unzipProcess = spawn('unzip', ['-o', '-q', zipPath], {
        cwd: extractDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';
      
      unzipProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      unzipProcess.on('close', async (code) => {
        if (code === 0) {
          try {
            // Check if SymbolReference.json was actually extracted
            await fs.access(path.join(extractDir, 'SymbolReference.json'));
            resolve();
          } catch {
            reject(new Error(`Unzip completed but SymbolReference.json not found: ${stderr}`));
          }
        } else {
          reject(new Error(`Unzip failed with code ${code}: ${stderr}`));
        }
      });

      unzipProcess.on('error', (error) => {
        reject(new Error(`Failed to run unzip command: ${error.message}`));
      });
    });
  }

  /**
   * Check if platform-specific unzip command is available
   */
  async isUnzipAvailable(): Promise<boolean> {
    const platform = os.platform();
    
    if (platform === 'win32') {
      return this.isPowerShellAvailable();
    } else {
      return this.isUnixUnzipAvailable();
    }
  }

  /**
   * Check if PowerShell is available on Windows
   */
  private async isPowerShellAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const testProcess = spawn('powershell', ['-Command', 'Get-Command Expand-Archive'], { stdio: 'pipe' });
      
      testProcess.on('close', (code) => {
        resolve(code === 0);
      });
      
      testProcess.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Check if unzip command is available on Unix systems
   */
  private async isUnixUnzipAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const testProcess = spawn('unzip', ['-h'], { stdio: 'pipe' });
      
      testProcess.on('close', (code) => {
        resolve(code === 0);
      });
      
      testProcess.on('error', () => {
        resolve(false);
      });
    });
  }
}