import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { ZipFallbackExtractor } from '../src/parser/zip-fallback';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'compiled');
const FIXTURE_APP = path.join(FIXTURE_DIR, 'TestPublisher_Base Test App_1.0.0.0.app');

const fixtureExists = fs.existsSync(FIXTURE_APP);
const describeOrSkip = fixtureExists ? describe : describe.skip;

/**
 * Integration tests using compiled test fixture .app files.
 * Appends a synthetic NXSB trailer to the fixture to simulate a signed package,
 * then verifies both extraction methods produce identical results.
 */
describeOrSkip('Signed .app integration tests (compiled fixtures)', () => {
  let extractor: ZipFallbackExtractor;
  let tmpDir: string;
  let signedAppPath: string;

  beforeAll(() => {
    extractor = new ZipFallbackExtractor();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signed-app-test-'));

    // Create a signed version by appending an NXSB trailer
    const originalBuffer = fs.readFileSync(FIXTURE_APP);
    const trailer = Buffer.alloc(10241);
    for (let i = 0; i < trailer.length - 4; i++) {
      trailer[i] = (i * 7 + 13) & 0xFF;
    }
    trailer.write('NXSB', trailer.length - 4, 'ascii');

    const signedBuffer = Buffer.concat([originalBuffer, trailer]);
    signedAppPath = path.join(tmpDir, 'signed.app');
    fs.writeFileSync(signedAppPath, signedBuffer);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should extract identical manifest from unsigned and signed fixture', async () => {
    const unsignedManifest = await extractor.extractManifest(FIXTURE_APP);
    const signedManifest = await extractor.extractManifest(signedAppPath);

    expect(signedManifest).toEqual(unsignedManifest);
  });

  it('should extract identical SymbolReference.json from unsigned and signed fixture', async () => {
    const readStream = async (appPath: string): Promise<string> => {
      const stream = await extractor.extractSymbolReference(appPath);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString('utf8');
    };

    const unsignedJson = await readStream(FIXTURE_APP);
    const signedJson = await readStream(signedAppPath);

    expect(JSON.parse(signedJson)).toEqual(JSON.parse(unsignedJson));
  });
});
