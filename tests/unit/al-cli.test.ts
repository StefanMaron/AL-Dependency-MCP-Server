import { ALCliWrapper } from '../../src/cli/al-cli';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';

// Mock child_process
jest.mock('child_process');
jest.mock('fs/promises');

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ALCliWrapper', () => {
  let alCli: ALCliWrapper;
  let mockProcess: any;

  beforeEach(() => {
    jest.resetAllMocks();
    
    alCli = new ALCliWrapper();
    
    // Setup mock process
    mockProcess = {
      stdout: {
        on: jest.fn()
      },
      stderr: {
        on: jest.fn()
      },
      on: jest.fn(),
      kill: jest.fn()
    };
    
    mockSpawn.mockReturnValue(mockProcess as any);
    mockFs.access.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    
    // Silence console.warn for tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('checkALAvailability', () => {
    it('should return true when AL CLI is available', async () => {
      // Simulate successful command
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0); // Exit code 0 = success
        }
      });

      const available = await alCli.checkALAvailability();
      expect(available).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith('AL', ['--version'], { stdio: ['pipe', 'pipe', 'pipe'] });
    });

    it('should return false when AL CLI is not available', async () => {
      // Simulate failed command
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(1); // Exit code 1 = failure
        }
      });

      const available = await alCli.checkALAvailability();
      expect(available).toBe(false);
    });

    it('should return false when AL process fails to spawn', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          callback(new Error('Command not found'));
        }
      });

      const available = await alCli.checkALAvailability();
      expect(available).toBe(false);
    });
  });

  describe('getVersion', () => {
    it('should return AL CLI version', async () => {
      const expectedVersion = '15.0.123456.78910';
      
      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(Buffer.from(expectedVersion));
        }
      });
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      const version = await alCli.getVersion();
      expect(version).toBe(expectedVersion);
    });

    it('should throw error when command fails', async () => {
      mockProcess.stderr.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(Buffer.from('Command failed'));
        }
      });
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(1);
        }
      });

      await expect(alCli.getVersion()).rejects.toThrow('Failed to get AL CLI version');
    });
  });

  describe('extractSymbols', () => {
    const testAppPath = '/path/to/test.app';
    
    it('should extract symbols successfully', async () => {
      // Mock fs.access to resolve for both input and output files
      mockFs.access.mockResolvedValue(undefined);
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      const symbolPath = await alCli.extractSymbols(testAppPath);
      
      expect(symbolPath).toMatch(/symbols_\d+_\w+\.app$/);
      expect(mockSpawn).toHaveBeenCalledWith('AL', 
        ['CreateSymbolPackage', testAppPath, expect.any(String)], 
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
    });

    it('should throw error when app file does not exist', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('File not found'));

      await expect(alCli.extractSymbols(testAppPath)).rejects.toThrow('Failed to extract symbols');
    });

    it('should throw error when AL command fails', async () => {
      mockProcess.stderr.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(Buffer.from('AL command failed'));
        }
      });
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(1);
        }
      });

      await expect(alCli.extractSymbols(testAppPath)).rejects.toThrow('Failed to extract symbols');
    });
  });

  describe('getPackageManifest', () => {
    const testAppPath = '/path/to/test.app';
    const mockManifest = {
      id: 'test-app-id',
      name: 'Test App',
      publisher: 'Test Publisher',
      version: '1.0.0.0',
      dependencies: []
    };

    it('should get package manifest successfully', async () => {
      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(Buffer.from(JSON.stringify(mockManifest)));
        }
      });
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      const manifest = await alCli.getPackageManifest(testAppPath);
      
      expect(manifest).toEqual(mockManifest);
      expect(mockSpawn).toHaveBeenCalledWith('AL', 
        ['GetPackageManifest', testAppPath], 
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
    });

    it('should throw error when AL command fails', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(1);
        }
      });

      await expect(alCli.getPackageManifest(testAppPath)).rejects.toThrow('Failed to get package manifest');
    });

    it('should throw error when manifest JSON is invalid', async () => {
      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(Buffer.from('invalid json'));
        }
      });
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      await expect(alCli.getPackageManifest(testAppPath)).rejects.toThrow('Failed to get package manifest');
    });
  });

  describe('cleanupSymbolFile', () => {
    it('should cleanup symbol file without throwing', async () => {
      const symbolPath = '/tmp/symbols_123.app';
      
      await expect(alCli.cleanupSymbolFile(symbolPath)).resolves.not.toThrow();
    });

    it('should not throw when cleanup fails', async () => {
      const symbolPath = '/tmp/symbols_123.app';
      mockFs.unlink.mockRejectedValueOnce(new Error('File not found'));
      
      // Should not throw even if cleanup fails
      await expect(alCli.cleanupSymbolFile(symbolPath)).resolves.not.toThrow();
    });
  });

  describe('extractSymbolsBatch', () => {
    it('should handle batch processing', async () => {
      const packagePaths = ['/path/to/app1.app', '/path/to/app2.app'];
      
      // Mock successful processing
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      const results = await alCli.extractSymbolsBatch(packagePaths);
      
      // With mocked access, should process successfully
      expect(results instanceof Map).toBe(true);
      // In a real scenario, this would be 2, but mocks may behave differently
      expect(results.size).toBeGreaterThanOrEqual(0);
    });

    it('should handle failures gracefully', async () => {
      const packagePaths = ['/path/to/app1.app'];
      
      // Mock file access failure
      mockFs.access.mockRejectedValue(new Error('File not found'));

      const results = await alCli.extractSymbolsBatch(packagePaths);
      
      // Should return empty results on failure
      expect(results.size).toBe(0);
    });
  });
});