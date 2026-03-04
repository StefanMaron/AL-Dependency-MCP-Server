import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { ZipFallbackExtractor } from '../../src/parser/zip-fallback';

/**
 * Build a minimal valid ZIP buffer containing a single uncompressed file.
 * Constructs the ZIP manually: local file header + data + central directory + EOCD.
 */
function buildZipBuffer(fileName: string, content: string): Buffer {
  const fileNameBuf = Buffer.from(fileName, 'utf8');
  const fileData = Buffer.from(content, 'utf8');

  // CRC-32 using Node.js zlib
  const zlib = require('zlib');
  const crc = zlib.crc32(fileData);

  // Local file header (30 bytes + filename)
  const lfh = Buffer.alloc(30 + fileNameBuf.length);
  lfh.writeUInt32LE(0x04034b50, 0);        // Local file header signature
  lfh.writeUInt16LE(20, 4);                 // Version needed (2.0)
  lfh.writeUInt16LE(0, 6);                  // General purpose flags
  lfh.writeUInt16LE(0, 8);                  // Compression: stored (no compression)
  lfh.writeUInt16LE(0, 10);                 // Last mod time
  lfh.writeUInt16LE(0, 12);                 // Last mod date
  lfh.writeUInt32LE(crc, 14);              // CRC-32
  lfh.writeUInt32LE(fileData.length, 18);  // Compressed size
  lfh.writeUInt32LE(fileData.length, 22);  // Uncompressed size
  lfh.writeUInt16LE(fileNameBuf.length, 26); // Filename length
  lfh.writeUInt16LE(0, 28);                 // Extra field length
  fileNameBuf.copy(lfh, 30);

  // Central directory file header (46 bytes + filename)
  const cdOffset = lfh.length + fileData.length;
  const cd = Buffer.alloc(46 + fileNameBuf.length);
  cd.writeUInt32LE(0x02014b50, 0);          // Central directory signature
  cd.writeUInt16LE(20, 4);                   // Version made by
  cd.writeUInt16LE(20, 6);                   // Version needed
  cd.writeUInt16LE(0, 8);                    // General purpose flags
  cd.writeUInt16LE(0, 10);                   // Compression: stored
  cd.writeUInt16LE(0, 12);                   // Last mod time
  cd.writeUInt16LE(0, 14);                   // Last mod date
  cd.writeUInt32LE(crc, 16);                // CRC-32
  cd.writeUInt32LE(fileData.length, 20);    // Compressed size
  cd.writeUInt32LE(fileData.length, 24);    // Uncompressed size
  cd.writeUInt16LE(fileNameBuf.length, 28); // Filename length
  cd.writeUInt16LE(0, 30);                   // Extra field length
  cd.writeUInt16LE(0, 32);                   // File comment length
  cd.writeUInt16LE(0, 34);                   // Disk number start
  cd.writeUInt16LE(0, 36);                   // Internal file attributes
  cd.writeUInt32LE(0, 38);                   // External file attributes
  cd.writeUInt32LE(0, 42);                   // Relative offset of local header
  fileNameBuf.copy(cd, 46);

  // EOCD (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);        // EOCD signature
  eocd.writeUInt16LE(0, 4);                  // Disk number
  eocd.writeUInt16LE(0, 6);                  // Disk with central directory
  eocd.writeUInt16LE(1, 8);                  // Entries on this disk
  eocd.writeUInt16LE(1, 10);                 // Total entries
  eocd.writeUInt32LE(cd.length, 12);         // Central directory size
  eocd.writeUInt32LE(lfh.length + fileData.length, 16); // CD offset
  eocd.writeUInt16LE(0, 20);                 // Comment length

  return Buffer.concat([lfh, fileData, cd, eocd]);
}

/**
 * Build a 40-byte NAVX header matching real AL packages.
 */
function buildNavxHeader(): Buffer {
  const header = Buffer.alloc(40);
  header.write('NAVX', 0, 'ascii');
  header.writeUInt32LE(40, 4);
  header.writeUInt32LE(2, 8);
  header.write('NAVX', 36, 'ascii');
  return header;
}

/**
 * Build an NXSB trailer of the specified size.
 * Real signed packages have ~10KB trailers ending with 'NXSB' magic.
 */
function buildNxsbTrailer(size: number): Buffer {
  const trailer = Buffer.alloc(size);
  for (let i = 0; i < size - 4; i++) {
    trailer[i] = (i * 7 + 13) & 0xFF;
  }
  trailer.write('NXSB', size - 4, 'ascii');
  return trailer;
}

const MANIFEST_XML = `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/navx/2015/manifest">
  <App Id="test-id-1234" Name="Test App" Publisher="TestPublisher" Version="1.0.0.0" />
</Package>`;

const SYMBOL_JSON = `{"AppId":"test-id-1234","Name":"Test App","Publisher":"TestPublisher","Version":"1.0.0.0","Tables":[]}`;

describe('ZipFallbackExtractor - signed package handling', () => {
  let extractor: ZipFallbackExtractor;
  let tmpDir: string;

  beforeAll(() => {
    extractor = new ZipFallbackExtractor();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-fallback-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeTempApp(name: string, buffer: Buffer): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  function buildUnsignedApp(zipContent: { name: string; content: string }): Buffer {
    const navx = buildNavxHeader();
    const zip = buildZipBuffer(zipContent.name, zipContent.content);
    return Buffer.concat([navx, zip]);
  }

  function buildSignedApp(zipContent: { name: string; content: string }, trailerSize: number): Buffer {
    const navx = buildNavxHeader();
    const zip = buildZipBuffer(zipContent.name, zipContent.content);
    const trailer = buildNxsbTrailer(trailerSize);
    return Buffer.concat([navx, zip, trailer]);
  }

  describe('extractManifest', () => {
    it('should extract manifest from unsigned .app', async () => {
      const appBuffer = buildUnsignedApp({ name: 'NavxManifest.xml', content: MANIFEST_XML });
      const appPath = writeTempApp('unsigned.app', appBuffer);

      const manifest = await extractor.extractManifest(appPath);
      expect(manifest.id).toBe('test-id-1234');
      expect(manifest.name).toBe('Test App');
      expect(manifest.publisher).toBe('TestPublisher');
      expect(manifest.version).toBe('1.0.0.0');
    });

    it('should extract manifest from signed .app with NXSB trailer', async () => {
      const appBuffer = buildSignedApp({ name: 'NavxManifest.xml', content: MANIFEST_XML }, 104);
      const appPath = writeTempApp('signed-small.app', appBuffer);

      const manifest = await extractor.extractManifest(appPath);
      expect(manifest.id).toBe('test-id-1234');
      expect(manifest.name).toBe('Test App');
      expect(manifest.publisher).toBe('TestPublisher');
    });

    it('should extract manifest from signed .app with large trailer (10KB+)', async () => {
      const appBuffer = buildSignedApp({ name: 'NavxManifest.xml', content: MANIFEST_XML }, 10241);
      const appPath = writeTempApp('signed-large.app', appBuffer);

      const manifest = await extractor.extractManifest(appPath);
      expect(manifest.id).toBe('test-id-1234');
      expect(manifest.name).toBe('Test App');
    });

    it('should reject file with no ZIP signature', async () => {
      const garbage = Buffer.alloc(200, 0x42);
      const appPath = writeTempApp('garbage.app', garbage);

      await expect(extractor.extractManifest(appPath)).rejects.toThrow('ZIP signature not found');
    });
  });

  describe('extractSymbolReference', () => {
    it('should extract SymbolReference.json from unsigned .app', async () => {
      const appBuffer = buildUnsignedApp({ name: 'SymbolReference.json', content: SYMBOL_JSON });
      const appPath = writeTempApp('unsigned-sym.app', appBuffer);

      const stream = await extractor.extractSymbolReference(appPath);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      expect(json.AppId).toBe('test-id-1234');
      expect(json.Name).toBe('Test App');
    });

    it('should extract SymbolReference.json from signed .app with NXSB trailer', async () => {
      const appBuffer = buildSignedApp({ name: 'SymbolReference.json', content: SYMBOL_JSON }, 104);
      const appPath = writeTempApp('signed-sym.app', appBuffer);

      const stream = await extractor.extractSymbolReference(appPath);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      expect(json.AppId).toBe('test-id-1234');
    });

    it('should extract SymbolReference.json from signed .app with large trailer (10KB+)', async () => {
      const appBuffer = buildSignedApp({ name: 'SymbolReference.json', content: SYMBOL_JSON }, 10241);
      const appPath = writeTempApp('signed-sym-large.app', appBuffer);

      const stream = await extractor.extractSymbolReference(appPath);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      expect(json.AppId).toBe('test-id-1234');
    });

    it('should reject file with no ZIP signature', async () => {
      const garbage = Buffer.alloc(200, 0x42);
      const appPath = writeTempApp('garbage-sym.app', garbage);

      await expect(extractor.extractSymbolReference(appPath)).rejects.toThrow('ZIP signature not found');
    });
  });
});
