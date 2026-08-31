import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { ZipFallbackExtractor } from '../../src/parser/zip-fallback';

/** CRC-32 lookup table (compatible with Node 18 which lacks zlib.crc32) */
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[i] = c;
}

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Build a minimal valid multi-entry ZIP buffer (uncompressed/stored entries only).
 */
function buildMultiEntryZipBuffer(files: { name: string; content: string }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const fileNameBuf = Buffer.from(file.name, 'utf8');
    const fileData = Buffer.from(file.content, 'utf8');
    const crc = crc32(fileData);

    const lfh = Buffer.alloc(30 + fileNameBuf.length);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(0, 8);
    lfh.writeUInt16LE(0, 10);
    lfh.writeUInt16LE(0, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(fileData.length, 18);
    lfh.writeUInt32LE(fileData.length, 22);
    lfh.writeUInt16LE(fileNameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);
    fileNameBuf.copy(lfh, 30);

    localParts.push(lfh, fileData);

    const cd = Buffer.alloc(46 + fileNameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(fileData.length, 20);
    cd.writeUInt32LE(fileData.length, 24);
    cd.writeUInt16LE(fileNameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    fileNameBuf.copy(cd, 46);

    centralParts.push(cd);
    offset += lfh.length + fileData.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const centralDirectoryOffset = offset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function buildNavxHeader(): Buffer {
  const header = Buffer.alloc(40);
  header.write('NAVX', 0, 'ascii');
  header.writeUInt32LE(40, 4);
  header.writeUInt32LE(2, 8);
  header.write('NAVX', 36, 'ascii');
  return header;
}

const MANIFEST_XML = `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/navx/2015/manifest">
  <App Id="test-id-5678" Name="Source Test App" Publisher="TestPublisher" Version="1.0.0.0" />
</Package>`;

const SYMBOL_JSON = `{"AppId":"test-id-5678","Name":"Source Test App","Publisher":"TestPublisher","Version":"1.0.0.0","Tables":[]}`;

describe('ZipFallbackExtractor - source retrieval', () => {
  let extractor: ZipFallbackExtractor;
  let tmpDir: string;
  let sourceBearingAppPath: string;
  let symbolOnlyAppPath: string;

  beforeAll(() => {
    extractor = new ZipFallbackExtractor();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-fallback-source-test-'));

    const sourceBearingZip = buildMultiEntryZipBuffer([
      { name: 'NavxManifest.xml', content: MANIFEST_XML },
      { name: 'SymbolReference.json', content: SYMBOL_JSON },
      { name: 'src/Foo.Table.al', content: 'table 50100 Foo\n{\n}\n' },
      { name: 'src/Sub/Bar.Codeunit.al', content: 'codeunit 50101 Bar\n{\n}\n' }
    ]);
    sourceBearingAppPath = path.join(tmpDir, 'source-bearing.app');
    fs.writeFileSync(sourceBearingAppPath, Buffer.concat([buildNavxHeader(), sourceBearingZip]));

    const symbolOnlyZip = buildMultiEntryZipBuffer([
      { name: 'NavxManifest.xml', content: MANIFEST_XML },
      { name: 'SymbolReference.json', content: SYMBOL_JSON }
    ]);
    symbolOnlyAppPath = path.join(tmpDir, 'symbol-only.app');
    fs.writeFileSync(symbolOnlyAppPath, Buffer.concat([buildNavxHeader(), symbolOnlyZip]));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('listEntries', () => {
    it('lists all entry names including nested source files', async () => {
      const entries = await extractor.listEntries(sourceBearingAppPath);
      expect(entries).toEqual(expect.arrayContaining([
        'NavxManifest.xml',
        'SymbolReference.json',
        'src/Foo.Table.al',
        'src/Sub/Bar.Codeunit.al'
      ]));
    });
  });

  describe('extractEntry', () => {
    it('extracts a specific entry by its raw name', async () => {
      const content = await extractor.extractEntry(sourceBearingAppPath, 'src/Foo.Table.al');
      expect(content).toBe('table 50100 Foo\n{\n}\n');
    });

    it('rejects when the entry does not exist', async () => {
      await expect(extractor.extractEntry(sourceBearingAppPath, 'src/DoesNotExist.al')).rejects.toThrow(/not found/i);
    });
  });

  describe('inspectPackage', () => {
    it('reports hasSourceCode=true and lists .al entries for a source-bearing package', async () => {
      const result = await extractor.inspectPackage(sourceBearingAppPath);

      expect(result.manifest.name).toBe('Source Test App');
      expect(result.hasSourceCode).toBe(true);
      expect(result.sourceEntries).toEqual(expect.arrayContaining(['src/Foo.Table.al', 'src/Sub/Bar.Codeunit.al']));
      expect(JSON.parse(result.symbolReferenceJson).Name).toBe('Source Test App');
    });

    it('reports hasSourceCode=false for a symbol-only package', async () => {
      const result = await extractor.inspectPackage(symbolOnlyAppPath);

      expect(result.hasSourceCode).toBe(false);
      expect(result.sourceEntries).toEqual([]);
    });
  });
});
