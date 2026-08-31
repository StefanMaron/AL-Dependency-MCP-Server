import { decodeStable, normalizePath, buildSourceZipEntries, matchSourceEntry } from '../../src/parser/source-matcher';

describe('source-matcher', () => {
  describe('decodeStable', () => {
    it('decodes a single-encoded value', () => {
      expect(decodeStable('System%20Interfaces')).toBe('System Interfaces');
    });

    it('decodes a double-encoded value (the %2520 zip-entry case)', () => {
      expect(decodeStable('System%2520Interfaces')).toBe('System Interfaces');
    });

    it('leaves an already-decoded value unchanged', () => {
      expect(decodeStable('System Interfaces')).toBe('System Interfaces');
    });

    it('does not throw on a malformed percent-sequence', () => {
      expect(() => decodeStable('100%off')).not.toThrow();
    });
  });

  describe('normalizePath', () => {
    it('lowercases, normalizes slashes, and decodes', () => {
      expect(normalizePath('Src\\Foo%20Bar\\Baz.Table.al')).toBe('src/foo bar/baz.table.al');
    });

    it('strips a leading ./', () => {
      expect(normalizePath('./Foo.Table.al')).toBe('foo.table.al');
    });
  });

  describe('matchSourceEntry', () => {
    it('matches exactly when the ref already includes the full path', () => {
      const entries = buildSourceZipEntries(['src/LastUsedChart.Table.al']);
      const result = matchSourceEntry(entries, 'src/LastUsedChart.Table.al');
      expect(result).toBe('src/LastUsedChart.Table.al');
    });

    it('matches via suffix when the ref is missing the src/ prefix', () => {
      const entries = buildSourceZipEntries(['src/LastUsedChart.Table.al']);
      const result = matchSourceEntry(entries, 'LastUsedChart.Table.al');
      expect(result).toBe('src/LastUsedChart.Table.al');
    });

    it('matches via suffix through nested folders', () => {
      const entries = buildSourceZipEntries(['src/Agent/Setup/SetupPart/AgentSetupBuffer.Table.al']);
      const result = matchSourceEntry(entries, 'Agent/Setup/SetupPart/AgentSetupBuffer.Table.al');
      expect(result).toBe('src/Agent/Setup/SetupPart/AgentSetupBuffer.Table.al');
    });

    it('matches despite the double-encoding mismatch on folders with spaces', () => {
      const entries = buildSourceZipEntries(['src/System%2520Interfaces/IUnknown.Interface.al']);
      const result = matchSourceEntry(entries, 'System%20Interfaces/IUnknown.Interface.al');
      expect(result).toBe('src/System%2520Interfaces/IUnknown.Interface.al');
    });

    it('returns null when nothing matches', () => {
      const entries = buildSourceZipEntries(['src/Foo.Table.al']);
      const result = matchSourceEntry(entries, 'Bar.Table.al');
      expect(result).toBeNull();
    });

    it('disambiguates a basename collision by the longest matching trailing path', () => {
      const entries = buildSourceZipEntries([
        'src/Sales/Item.Table.al',
        'src/Purchase/SubFolder/Item.Table.al'
      ]);
      // No suffix match exists for either entry - falls through to the basename tier,
      // which prefers the entry with more matching trailing path segments.
      const result = matchSourceEntry(entries, 'Other/SubFolder/Item.Table.al');
      expect(result).toBe('src/Purchase/SubFolder/Item.Table.al');
    });
  });
});
