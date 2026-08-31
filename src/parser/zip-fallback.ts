import * as path from 'path';
import { promises as fs } from 'fs';
import { Readable } from 'stream';
import * as yauzl from 'yauzl';

export interface ExtractedManifest {
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

export interface PackageInspection {
  manifest: ExtractedManifest;
  hasSourceCode: boolean;
  sourceEntries: string[]; // raw (stored, possibly over-encoded) .al entry names
  symbolReferenceJson: string;
}

/**
 * Pure Node.js ZIP extractor for AL symbol packages
 * Uses yauzl library - 10x faster than PowerShell, no temp files needed
 */
export class ZipFallbackExtractor {
  /**
   * Read the ZIP portion of an AL package (.app), stripping the 40-byte NAVX
   * header and any trailing NXSB signature data from signed packages.
   */
  private async readZipBuffer(appPath: string): Promise<Buffer> {
    const buffer = await fs.readFile(appPath);

    const zipStart = this.findZipStart(buffer);
    if (zipStart === -1) {
      throw new Error('Not a valid AL package - ZIP signature not found');
    }

    const zipEnd = this.findZipEnd(buffer);
    return buffer.slice(zipStart, zipEnd);
  }

  private openZip(zipBuffer: Buffer): Promise<yauzl.ZipFile> {
    return new Promise((resolve, reject) => {
      yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
        if (err) return reject(err);
        resolve(zipfile!);
      });
    });
  }

  /**
   * Read an open entry's content as text, stripping a UTF-8 BOM if present.
   */
  private readEntryText(zipfile: yauzl.ZipFile, entry: yauzl.Entry): Promise<string> {
    return new Promise((resolve, reject) => {
      zipfile.openReadStream(entry, (err, readStream) => {
        if (err) return reject(err);

        const chunks: Buffer[] = [];
        readStream!.on('data', (chunk) => chunks.push(chunk));
        readStream!.on('end', () => {
          let content = Buffer.concat(chunks);
          if (content.length >= 3 && content[0] === 0xEF && content[1] === 0xBB && content[2] === 0xBF) {
            content = content.slice(3);
          }
          resolve(content.toString('utf8'));
        });
        readStream!.on('error', reject);
      });
    });
  }

  /**
   * List all entry file names stored in an AL package's ZIP.
   */
  async listEntries(appPath: string): Promise<string[]> {
    const zipBuffer = await this.readZipBuffer(appPath);
    const zipfile = await this.openZip(zipBuffer);

    return new Promise((resolve, reject) => {
      const entries: string[] = [];

      zipfile.readEntry();
      zipfile.on('entry', (entry: yauzl.Entry) => {
        entries.push(entry.fileName);
        zipfile.readEntry();
      });
      zipfile.on('error', reject);
      zipfile.on('end', () => resolve(entries));
    });
  }

  /**
   * Extract a single entry's text content by its exact (raw, stored) entry name.
   */
  async extractEntry(appPath: string, rawEntryName: string): Promise<string> {
    const zipBuffer = await this.readZipBuffer(appPath);
    const zipfile = await this.openZip(zipBuffer);

    return new Promise((resolve, reject) => {
      let settled = false;

      zipfile.readEntry();
      zipfile.on('entry', (entry: yauzl.Entry) => {
        if (settled) return;

        if (entry.fileName === rawEntryName) {
          settled = true;
          this.readEntryText(zipfile, entry).then(resolve, reject);
          return;
        }

        zipfile.readEntry();
      });
      zipfile.on('error', reject);
      zipfile.on('end', () => {
        if (!settled) {
          reject(new Error(`Entry not found in package: ${rawEntryName}`));
        }
      });
    });
  }

  /**
   * Single consolidated read of a package: manifest + source-availability flag +
   * the raw .al entry list + the SymbolReference.json text. This is the only
   * full-buffer ZIP open needed in the package-load path.
   */
  async inspectPackage(appPath: string): Promise<PackageInspection> {
    const zipBuffer = await this.readZipBuffer(appPath);
    const zipfile = await this.openZip(zipBuffer);

    return new Promise((resolve, reject) => {
      const sourceEntries: string[] = [];
      let manifestXml: string | undefined;
      let symbolReferenceJson: string | undefined;
      let settled = false;

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      zipfile.readEntry();
      zipfile.on('entry', (entry: yauzl.Entry) => {
        if (settled) return;

        if (entry.fileName === 'NavxManifest.xml') {
          this.readEntryText(zipfile, entry)
            .then((text) => { manifestXml = text; zipfile.readEntry(); })
            .catch(fail);
          return;
        }

        if (entry.fileName === 'SymbolReference.json') {
          this.readEntryText(zipfile, entry)
            .then((text) => { symbolReferenceJson = text; zipfile.readEntry(); })
            .catch(fail);
          return;
        }

        if (entry.fileName.toLowerCase().endsWith('.al')) {
          sourceEntries.push(entry.fileName);
        }

        zipfile.readEntry();
      });

      zipfile.on('error', fail);
      zipfile.on('end', () => {
        if (settled) return;

        if (manifestXml === undefined) {
          fail(new Error('NavxManifest.xml not found in package'));
          return;
        }

        if (symbolReferenceJson === undefined) {
          fail(new Error('SymbolReference.json not found in package'));
          return;
        }

        try {
          const manifest = this.parseNavxManifest(manifestXml);
          settled = true;
          resolve({
            manifest,
            hasSourceCode: sourceEntries.length > 0,
            sourceEntries,
            symbolReferenceJson
          });
        } catch (parseError) {
          fail(parseError as Error);
        }
      });
    });
  }

  /**
   * Extract SymbolReference.json from AL symbol package using yauzl
   */
  async extractSymbolReference(symbolPackagePath: string): Promise<Readable> {
    // AL packages have a 40-byte NAVX header - skip it and read ZIP directly
    const buffer = await fs.readFile(symbolPackagePath);
    
    // Find ZIP signature (PK header at byte 40)
    const zipStart = this.findZipStart(buffer);
    if (zipStart === -1) {
      throw new Error('Not a valid AL package - ZIP signature not found');
    }

    // Extract just the ZIP portion, excluding any trailing NXSB signature data
    const zipEnd = this.findZipEnd(buffer);
    const zipBuffer = buffer.slice(zipStart, zipEnd);
    
    // Open ZIP from buffer using yauzl
    return new Promise((resolve, reject) => {
      yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
        if (err) return reject(err);
        
        zipfile.readEntry();
        zipfile.on('entry', (entry: yauzl.Entry) => {
          if (entry.fileName === 'SymbolReference.json') {
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) return reject(err);
              
              // Strip UTF-8 BOM if present
              const { Transform } = require('stream');
              let bomStripped = false;
              
              const stream = new Transform({
                transform(chunk: any, encoding: any, callback: any) {
                  if (!bomStripped) {
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
              
              readStream!.pipe(stream);
              resolve(stream);
            });
          } else {
            zipfile.readEntry();
          }
        });
        
        zipfile.on('error', reject);
        zipfile.on('end', () => {
          reject(new Error('SymbolReference.json not found in package'));
        });
      });
    });
  }

  /**
   * Extract manifest information from AL package (.app file)
   * Parses NavxManifest.xml from the ZIP archive
   */
  async extractManifest(alPackagePath: string): Promise<ExtractedManifest> {
    const buffer = await fs.readFile(alPackagePath);
    const zipStart = this.findZipStart(buffer);

    if (zipStart === -1) {
      throw new Error('Not a valid AL package - ZIP signature not found');
    }

    // Exclude any trailing NXSB signature data from signed packages
    const zipEnd = this.findZipEnd(buffer);
    const zipBuffer = buffer.slice(zipStart, zipEnd);
    
    return new Promise((resolve, reject) => {
      yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
        if (err) return reject(err);
        
        zipfile.readEntry();
        zipfile.on('entry', (entry: yauzl.Entry) => {
          if (entry.fileName === 'NavxManifest.xml') {
            zipfile.openReadStream(entry, async (err, readStream) => {
              if (err) return reject(err);
              
              // Read entire manifest
              const chunks: Buffer[] = [];
              readStream!.on('data', (chunk) => chunks.push(chunk));
              readStream!.on('end', () => {
                const manifestContent = Buffer.concat(chunks).toString('utf8');
                try {
                  const manifest = this.parseNavxManifest(manifestContent);
                  resolve(manifest);
                } catch (parseError) {
                  reject(parseError);
                }
              });
              readStream!.on('error', reject);
            });
          } else {
            zipfile.readEntry();
          }
        });
        
        zipfile.on('error', reject);
        zipfile.on('end', () => {
          reject(new Error('NavxManifest.xml not found in package'));
        });
      });
    });
  }

  /**
   * Parse NavxManifest.xml content to extract package info
   */
  private parseNavxManifest(xmlContent: string): ExtractedManifest {
    // Simple XML parsing without external dependencies
    const getTagValue = (tag: string): string => {
      const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i');
      const match = xmlContent.match(regex);
      return match ? match[1].trim() : '';
    };

    const getAttrValue = (tag: string, attr: string): string => {
      const regex = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i');
      const match = xmlContent.match(regex);
      return match ? match[1].trim() : '';
    };

    // Extract App element attributes
    const id = getAttrValue('App', 'Id') || getTagValue('Id');
    const name = getAttrValue('App', 'Name') || getTagValue('Name');
    const publisher = getAttrValue('App', 'Publisher') || getTagValue('Publisher');
    const version = getAttrValue('App', 'Version') || getTagValue('Version');

    // Extract dependencies
    const dependencies: ExtractedManifest['dependencies'] = [];
    const depRegex = /<Dependency[^>]*Id="([^"]*)"[^>]*Name="([^"]*)"[^>]*Publisher="([^"]*)"[^>]*(?:MinVersion|Version)="([^"]*)"/gi;
    let depMatch;
    while ((depMatch = depRegex.exec(xmlContent)) !== null) {
      dependencies.push({
        id: depMatch[1],
        name: depMatch[2],
        publisher: depMatch[3],
        version: depMatch[4]
      });
    }

    // Also try alternative dependency format
    const depRegex2 = /<Dependency[^>]*>/gi;
    const depMatches = xmlContent.match(depRegex2) || [];
    for (const depTag of depMatches) {
      const id = getAttrValue('Dependency', 'Id');
      const name = getAttrValue('Dependency', 'Name');
      const publisher = getAttrValue('Dependency', 'Publisher');
      const version = getAttrValue('Dependency', 'Version') || getAttrValue('Dependency', 'MinVersion');
      
      if (id && name && !dependencies.find(d => d.id === id)) {
        dependencies.push({ id, name, publisher, version });
      }
    }

    return {
      id,
      name,
      publisher,
      version,
      dependencies: dependencies.length > 0 ? dependencies : undefined
    };
  }

  /**
   * Find ZIP signature in AL package buffer
   * AL packages have 40-byte NAVX header followed by ZIP data
   */
  private findZipStart(buffer: Buffer): number {
    // Look for ZIP signature: PK (0x50 0x4B)
    for (let i = 0; i < Math.min(buffer.length, 100); i++) {
      if (buffer[i] === 0x50 && buffer[i + 1] === 0x4B) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Find the true end of the ZIP data in the buffer.
   * Signed AL packages have an NXSB trailer (~10KB) after the ZIP data
   * that causes yauzl to reject the buffer with "Invalid comment length".
   * This method scans backwards for the EOCD record and calculates the
   * actual ZIP end position, excluding any trailing signature data.
   */
  private findZipEnd(buffer: Buffer): number {
    // EOCD signature: PK\x05\x06 (0x50 0x4B 0x05 0x06)
    // Scan backwards from end to zipStart to handle any amount of trailing data
    const zipStart = this.findZipStart(buffer);
    const searchStart = zipStart >= 0 ? zipStart : 0;

    for (let i = buffer.length - 22; i >= searchStart; i--) {
      if (buffer[i] === 0x50 && buffer[i + 1] === 0x4B &&
          buffer[i + 2] === 0x05 && buffer[i + 3] === 0x06) {
        // Found EOCD - read comment length at offset 20 (2 bytes, little-endian)
        const commentLength = buffer.readUInt16LE(i + 20);
        return i + 22 + commentLength;
      }
    }

    // No EOCD found - return full buffer length as fallback
    return buffer.length;
  }

  /**
   * Check if yauzl is available
   */
  async isUnzipAvailable(): Promise<boolean> {
    return true; // yauzl is always available as npm dependency
  }
}
