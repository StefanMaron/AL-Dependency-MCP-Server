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

/**
 * Pure Node.js ZIP extractor for AL symbol packages
 * Uses yauzl library - 10x faster than PowerShell, no temp files needed
 */
export class ZipFallbackExtractor {
  /**
   * Extract SymbolReference.json from AL symbol package using yauzl
   */
  async extractSymbolReference(symbolPackagePath: string): Promise<Readable> {
    // AL packages have a 40-byte NAVX header and signed packages have
    // trailing signature bytes - extract just the ZIP portion
    const buffer = await fs.readFile(symbolPackagePath);
    const zipBuffer = this.getZipBuffer(buffer);
    
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
    const zipBuffer = this.getZipBuffer(buffer);
    
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
   * Extract the ZIP portion from an AL package buffer, stripping the NAVX
   * header and any trailing signature bytes (signed packages).
   * Returns just the ZIP data that yauzl can parse cleanly.
   */
  private getZipBuffer(buffer: Buffer): Buffer {
    const zipStart = this.findZipStart(buffer);
    if (zipStart === -1) {
      throw new Error('Not a valid AL package - ZIP signature not found');
    }

    const zipEnd = this.findZipEnd(buffer, zipStart);
    if (zipEnd !== -1) {
      return buffer.slice(zipStart, zipEnd);
    }
    // Fallback: no EOCD found, return everything from zipStart (original behavior)
    return buffer.slice(zipStart);
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
   * Find the end of ZIP data by locating the End of Central Directory (EOCD) record.
   * Signed AL packages have trailing signature bytes (ending with NXSB magic)
   * after the ZIP data. yauzl rejects these extra bytes, so we must trim them.
   *
   * EOCD record structure (22 bytes minimum):
   *   Signature: 0x50 0x4B 0x05 0x06 (4 bytes)
   *   ... fixed fields ...          (16 bytes)
   *   Comment length:               (2 bytes at offset 20)
   *   Comment:                      (variable)
   *
   * Returns the byte offset (relative to start of buffer) where ZIP data ends,
   * or -1 if EOCD is not found.
   */
  private findZipEnd(buffer: Buffer, zipStart: number): number {
    // EOCD signature: PK\x05\x06
    // Scan backward from the end of the buffer to find it.
    // The EOCD is at least 22 bytes, and the comment can be up to 65535 bytes,
    // so we need to scan at most 22 + 65535 = 65557 bytes from the end.
    const maxScan = Math.min(buffer.length - zipStart, 65557);
    const scanStart = buffer.length - 4;
    const scanEnd = buffer.length - maxScan;

    for (let i = scanStart; i >= scanEnd && i >= zipStart; i--) {
      if (buffer[i] === 0x50 && buffer[i + 1] === 0x4B &&
          buffer[i + 2] === 0x05 && buffer[i + 3] === 0x06) {
        // Found EOCD - read comment length (2 bytes, little-endian, at offset 20)
        const commentLength = buffer.readUInt16LE(i + 20);
        // ZIP data ends right after the EOCD record + comment
        return i + 22 + commentLength;
      }
    }
    return -1;
  }

  /**
   * Check if yauzl is available
   */
  async isUnzipAvailable(): Promise<boolean> {
    return true; // yauzl is always available as npm dependency
  }
}
