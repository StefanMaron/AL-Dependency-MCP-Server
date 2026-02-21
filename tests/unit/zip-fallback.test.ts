import { ZipFallbackExtractor } from '../../src/parser/zip-fallback';
import * as yauzl from 'yauzl';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Build a minimal valid ZIP archive in-memory containing a single file.
 * Returns a Buffer of pure ZIP data (no NAVX header, no trailing signature).
 */
function buildMinimalZip(fileName: string, content: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Use yauzl's counterpart (yazl) pattern: build ZIP by hand
    // For simplicity, build the binary structure directly.
    const fileNameBuf = Buffer.from(fileName, 'utf8');
    const contentBuf = Buffer.from(content, 'utf8');

    // Local file header (30 + fileName.length bytes)
    const localHeader = Buffer.alloc(30 + fileNameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);   // Local file header signature
    localHeader.writeUInt16LE(20, 4);            // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0, 6);             // General purpose bit flag
    localHeader.writeUInt16LE(0, 8);             // Compression method: stored
    localHeader.writeUInt16LE(0, 10);            // Last mod file time
    localHeader.writeUInt16LE(0, 12);            // Last mod file date
    // CRC-32 - compute simple CRC
    const crc = crc32(contentBuf);
    localHeader.writeInt32LE(crc, 14);           // CRC-32
    localHeader.writeUInt32LE(contentBuf.length, 18); // Compressed size
    localHeader.writeUInt32LE(contentBuf.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(fileNameBuf.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28);            // Extra field length
    fileNameBuf.copy(localHeader, 30);

    // File data
    const fileData = contentBuf;

    // Central directory header (46 + fileName.length bytes)
    const centralDirOffset = localHeader.length + fileData.length;
    const centralHeader = Buffer.alloc(46 + fileNameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);  // Central directory header signature
    centralHeader.writeUInt16LE(20, 4);           // Version made by
    centralHeader.writeUInt16LE(20, 6);           // Version needed to extract
    centralHeader.writeUInt16LE(0, 8);            // General purpose bit flag
    centralHeader.writeUInt16LE(0, 10);           // Compression method: stored
    centralHeader.writeUInt16LE(0, 12);           // Last mod file time
    centralHeader.writeUInt16LE(0, 14);           // Last mod file date
    centralHeader.writeInt32LE(crc, 16);          // CRC-32
    centralHeader.writeUInt32LE(contentBuf.length, 20); // Compressed size
    centralHeader.writeUInt32LE(contentBuf.length, 24); // Uncompressed size
    centralHeader.writeUInt16LE(fileNameBuf.length, 28); // File name length
    centralHeader.writeUInt16LE(0, 30);           // Extra field length
    centralHeader.writeUInt16LE(0, 32);           // File comment length
    centralHeader.writeUInt16LE(0, 34);           // Disk number start
    centralHeader.writeUInt16LE(0, 36);           // Internal file attributes
    centralHeader.writeUInt32LE(0, 38);           // External file attributes
    centralHeader.writeUInt32LE(0, 42);           // Relative offset of local header
    fileNameBuf.copy(centralHeader, 46);

    // End of Central Directory record (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);            // EOCD signature
    eocd.writeUInt16LE(0, 4);                     // Disk number
    eocd.writeUInt16LE(0, 6);                     // Disk with central directory
    eocd.writeUInt16LE(1, 8);                     // Number of entries on this disk
    eocd.writeUInt16LE(1, 10);                    // Total number of entries
    eocd.writeUInt32LE(centralHeader.length, 12); // Size of central directory
    eocd.writeUInt32LE(centralDirOffset, 16);     // Offset of start of central directory
    eocd.writeUInt16LE(0, 20);                    // Comment length

    resolve(Buffer.concat([localHeader, fileData, centralHeader, eocd]));
  });
}

/**
 * Simple CRC-32 implementation for test fixtures.
 */
function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) | 0; // return as signed 32-bit
}

/**
 * Build a 40-byte NAVX header (the standard prefix for .app files).
 */
function buildNavxHeader(): Buffer {
  const header = Buffer.alloc(40);
  // NAVX magic bytes at the start (4E 41 56 58 = "NAVX")
  header.write('NAVX', 0, 'ascii');
  // Rest is metadata — fill with zeros for testing
  return header;
}

/**
 * Build a fake trailing signature block similar to signed BC packages.
 * Ends with NXSB magic bytes as described in issue #20.
 */
function buildTrailingSignature(size: number = 10240): Buffer {
  const sig = Buffer.alloc(size);
  // Fill with random-ish data to simulate a digital signature
  for (let i = 0; i < size; i++) {
    sig[i] = (i * 7 + 13) & 0xFF;
  }
  // NXSB magic at the end (4 bytes)
  sig.write('NXSB', size - 4, 'ascii');
  return sig;
}

describe('ZipFallbackExtractor - signed package handling (issue #20)', () => {
  let extractor: ZipFallbackExtractor;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = path.join(__dirname, '..', 'fixtures', 'tmp-zip-test');
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    extractor = new ZipFallbackExtractor();
  });

  describe('unsigned packages (no trailing signature)', () => {
    it('should extract NavxManifest.xml from unsigned package', async () => {
      const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<Package><App Id="test-id-123" Name="Test App" Publisher="TestPub" Version="1.0.0.0" /></Package>`;

      const zipData = await buildMinimalZip('NavxManifest.xml', manifestXml);
      const navxHeader = buildNavxHeader();
      const packageBuffer = Buffer.concat([navxHeader, zipData]);

      const appPath = path.join(tmpDir, 'unsigned.app');
      await fs.writeFile(appPath, packageBuffer);

      const manifest = await extractor.extractManifest(appPath);
      expect(manifest.id).toBe('test-id-123');
      expect(manifest.name).toBe('Test App');
      expect(manifest.publisher).toBe('TestPub');
      expect(manifest.version).toBe('1.0.0.0');
    });
  });

  describe('signed packages (with trailing signature bytes)', () => {
    it('should extract NavxManifest.xml from signed package', async () => {
      const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<Package><App Id="signed-id-456" Name="Signed App" Publisher="Microsoft" Version="27.0.0.0" /></Package>`;

      const zipData = await buildMinimalZip('NavxManifest.xml', manifestXml);
      const navxHeader = buildNavxHeader();
      const trailingSig = buildTrailingSignature(10240); // ~10KB trailing signature
      const packageBuffer = Buffer.concat([navxHeader, zipData, trailingSig]);

      const appPath = path.join(tmpDir, 'signed.app');
      await fs.writeFile(appPath, packageBuffer);

      // This would fail before the fix with:
      // "Invalid comment length. Expected: XXXXX. Found: 0."
      const manifest = await extractor.extractManifest(appPath);
      expect(manifest.id).toBe('signed-id-456');
      expect(manifest.name).toBe('Signed App');
      expect(manifest.publisher).toBe('Microsoft');
      expect(manifest.version).toBe('27.0.0.0');
    });

    it('should extract SymbolReference.json from signed package', async () => {
      const symbolJson = JSON.stringify({
        Namespaces: [],
        Tables: [{ Id: 18, Name: 'Customer' }]
      });

      const zipData = await buildMinimalZip('SymbolReference.json', symbolJson);
      const navxHeader = buildNavxHeader();
      const trailingSig = buildTrailingSignature(8192);
      const packageBuffer = Buffer.concat([navxHeader, zipData, trailingSig]);

      const appPath = path.join(tmpDir, 'signed-symbols.app');
      await fs.writeFile(appPath, packageBuffer);

      const stream = await extractor.extractSymbolReference(appPath);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const content = Buffer.concat(chunks).toString('utf8');
      const parsed = JSON.parse(content);
      expect(parsed.Tables).toBeDefined();
      expect(parsed.Tables[0].Name).toBe('Customer');
    });

    it('should handle large trailing signatures (50KB+)', async () => {
      const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<Package><App Id="big-sig" Name="Big Sig App" Publisher="Microsoft" Version="1.0.0.0" /></Package>`;

      const zipData = await buildMinimalZip('NavxManifest.xml', manifestXml);
      const navxHeader = buildNavxHeader();
      const trailingSig = buildTrailingSignature(51200); // 50KB
      const packageBuffer = Buffer.concat([navxHeader, zipData, trailingSig]);

      const appPath = path.join(tmpDir, 'big-signed.app');
      await fs.writeFile(appPath, packageBuffer);

      const manifest = await extractor.extractManifest(appPath);
      expect(manifest.id).toBe('big-sig');
    });
  });

  describe('edge cases', () => {
    it('should reject buffer without ZIP signature', async () => {
      const garbage = Buffer.alloc(100, 0x42);
      const appPath = path.join(tmpDir, 'garbage.app');
      await fs.writeFile(appPath, garbage);

      await expect(extractor.extractManifest(appPath))
        .rejects.toThrow('ZIP signature not found');
    });

    it('should handle package with no NAVX header (ZIP starts at offset 0)', async () => {
      const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<Package><App Id="no-header" Name="No Header" Publisher="Test" Version="1.0.0.0" /></Package>`;

      const zipData = await buildMinimalZip('NavxManifest.xml', manifestXml);
      // No NAVX header — ZIP starts immediately (PK signature at byte 0)
      const appPath = path.join(tmpDir, 'no-header.app');
      await fs.writeFile(appPath, zipData);

      const manifest = await extractor.extractManifest(appPath);
      expect(manifest.id).toBe('no-header');
    });
  });
});
