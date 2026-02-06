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
    // AL packages have a 40-byte NAVX header - skip it and read ZIP directly
    const buffer = await fs.readFile(symbolPackagePath);
    
    // Find ZIP signature (PK header at byte 40)
    const zipStart = this.findZipStart(buffer);
    if (zipStart === -1) {
      throw new Error('Not a valid AL package - ZIP signature not found');
    }
    
    // Extract just the ZIP portion
    const zipBuffer = buffer.slice(zipStart);
    
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
    
    const zipBuffer = buffer.slice(zipStart);
    
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
   * Check if yauzl is available
   */
  async isUnzipAvailable(): Promise<boolean> {
    return true; // yauzl is always available as npm dependency
  }
}
