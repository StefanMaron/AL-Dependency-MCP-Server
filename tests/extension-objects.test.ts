import * as path from 'path';
import * as fs from 'fs';
import { StreamingSymbolParser } from '../src/parser/streaming-parser';
import { OptimizedSymbolDatabase } from '../src/core/symbol-database';
import { ALObject, ALTable, ALEnum, ALReport } from '../src/types/al-types';

/**
 * Extension Objects Test Suite
 *
 * Tests that the AL MCP Server correctly parses and indexes extension objects
 * (TableExtension, PageExtension, EnumExtensionType, ReportExtension) from
 * compiled .app fixture files.
 *
 * Fixture apps are compiled on demand by the Jest globalSetup script
 * (tests/fixtures/compile-fixtures.ts). If the AL CLI is not available,
 * these tests are skipped gracefully.
 *
 * Fixture apps:
 *   - Base app: TestPublisher_Base Test App_1.0.0.0.app
 *       Contains: Table "Test Item" (70000), Page "Test Item Card" (70000),
 *       Codeunit "Test Item Mgmt" (70000), Enum "Test Status" (70000),
 *       Report "Test Item List" (70000)
 *
 *   - Extension app: TestPublisher_Extension Test App_1.0.0.0.app
 *       Contains: TableExtension "Test Item Ext" (70000) extending "Test Item",
 *       PageExtension "Test Item Card Ext" (70000) extending "Test Item Card",
 *       EnumExtensionType "Test Status Ext" (70000) extending "Test Status",
 *       ReportExtension "Test Item List Ext" (70000) extending "Test Item List"
 *
 * NOTE: In the compiled SymbolReference.json, extension arrays use these keys:
 *   - TableExtensions
 *   - PageExtensions
 *   - EnumExtensionTypes (NOT EnumExtensions -- this is the actual compiler output)
 *   - ReportExtensions
 *   - PermissionSetExtensions
 *
 * Extension objects have a TargetObject property (or Target for ReportExtensions)
 * that identifies the base object being extended.
 */

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures', 'compiled');
const BASE_APP_PATH = path.join(FIXTURES_DIR, 'TestPublisher_Base Test App_1.0.0.0.app');
const EXT_APP_PATH = path.join(FIXTURES_DIR, 'TestPublisher_Extension Test App_1.0.0.0.app');

// Skip entire file if compiled fixtures are not available (AL CLI missing)
const fixturesAvailable = fs.existsSync(BASE_APP_PATH) && fs.existsSync(EXT_APP_PATH);
const describeOrSkip = fixturesAvailable ? describe : describe.skip;

// ---------------------------------------------------------------------------
// 1. Parser Tests
// ---------------------------------------------------------------------------
describeOrSkip('StreamingSymbolParser - Extension Objects', () => {
  let parser: StreamingSymbolParser;

  beforeEach(() => {
    parser = new StreamingSymbolParser();
  });

  // ---- Base app baseline ----

  describe('Base app parsing (baseline)', () => {
    it('should parse the base app and find 5 regular objects', async () => {
      const objects = await parser.parseSymbolPackage(BASE_APP_PATH, 'Base Test App');

      expect(objects.length).toBe(5);

      const types = objects.map(o => o.Type).sort();
      expect(types).toEqual(['Codeunit', 'Enum', 'Page', 'Report', 'Table']);
    });

    it('should parse Table "Test Item" with 4 fields', async () => {
      const objects = await parser.parseSymbolPackage(BASE_APP_PATH, 'Base Test App');
      const table = objects.find(o => o.Type === 'Table' && o.Name === 'Test Item') as ALTable | undefined;

      expect(table).toBeDefined();
      expect(table!.Id).toBe(70000);
      expect(table!.Fields).toBeDefined();
      expect(table!.Fields!.length).toBe(4);

      const fieldNames = table!.Fields!.map(f => f.Name).sort();
      expect(fieldNames).toEqual(['Blocked', 'Description', 'No.', 'Unit Price']);
    });

    it('should parse Enum "Test Status" with 3 values', async () => {
      const objects = await parser.parseSymbolPackage(BASE_APP_PATH, 'Base Test App');
      const enumObj = objects.find(o => o.Type === 'Enum' && o.Name === 'Test Status') as ALEnum | undefined;

      expect(enumObj).toBeDefined();
      expect(enumObj!.Id).toBe(70000);
      expect(enumObj!.Values).toBeDefined();
      expect(enumObj!.Values!.length).toBe(3);

      const valueNames = enumObj!.Values!.map(v => v.Name).sort();
      expect(valueNames).toEqual(['Active', 'Closed', 'New']);
    });

    it('should parse Report "Test Item List" with dataset columns', async () => {
      const objects = await parser.parseSymbolPackage(BASE_APP_PATH, 'Base Test App');
      const report = objects.find(o => o.Type === 'Report' && o.Name === 'Test Item List') as ALReport | undefined;

      expect(report).toBeDefined();
      expect(report!.Id).toBe(70000);
      expect(report!.Dataset).toBeDefined();
      expect(report!.Dataset!.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---- Extension app parsing ----

  describe('Extension app parsing', () => {
    it('should parse the extension app and find extension objects', async () => {
      const objects = await parser.parseSymbolPackage(EXT_APP_PATH, 'Extension Test App');

      expect(objects.length).toBe(4);
    });

    it('should parse TableExtension "Test Item Ext" with correct metadata', async () => {
      const objects = await parser.parseSymbolPackage(EXT_APP_PATH, 'Extension Test App');
      const tableExt = objects.find(
        o => o.Type === 'TableExtension' && o.Name === 'Test Item Ext'
      );

      expect(tableExt).toBeDefined();
      expect(tableExt!.Id).toBe(70000);
      expect(tableExt!.Type).toBe('TableExtension');
    });

    it('should parse TableExtension fields (Custom Category, Priority, Extended Status)', async () => {
      const objects = await parser.parseSymbolPackage(EXT_APP_PATH, 'Extension Test App');
      const tableExt = objects.find(
        o => o.Type === 'TableExtension' && o.Name === 'Test Item Ext'
      ) as (ALObject & { Fields?: any[] }) | undefined;

      expect(tableExt).toBeDefined();

      // After parsing, the table extension should have 3 fields
      expect(tableExt!.Fields).toBeDefined();
      expect(tableExt!.Fields!.length).toBe(3);

      const fieldNames = tableExt!.Fields!.map((f: any) => f.Name).sort();
      expect(fieldNames).toEqual(['Custom Category', 'Extended Status', 'Priority']);
    });

    it('should parse PageExtension "Test Item Card Ext" with correct metadata', async () => {
      const objects = await parser.parseSymbolPackage(EXT_APP_PATH, 'Extension Test App');
      const pageExt = objects.find(
        o => o.Type === 'PageExtension' && o.Name === 'Test Item Card Ext'
      );

      expect(pageExt).toBeDefined();
      expect(pageExt!.Id).toBe(70000);
      expect(pageExt!.Type).toBe('PageExtension');
    });

    it('should parse EnumExtensionType "Test Status Ext" with correct metadata', async () => {
      const objects = await parser.parseSymbolPackage(EXT_APP_PATH, 'Extension Test App');
      const enumExt = objects.find(
        o => o.Type === 'EnumExtensionType' && o.Name === 'Test Status Ext'
      );

      expect(enumExt).toBeDefined();
      expect(enumExt!.Id).toBe(70000);
      expect(enumExt!.Type).toBe('EnumExtensionType');
    });

    it('should parse EnumExtensionType values (Pending Review, Archived)', async () => {
      const objects = await parser.parseSymbolPackage(EXT_APP_PATH, 'Extension Test App');
      const enumExt = objects.find(
        o => o.Type === 'EnumExtensionType' && o.Name === 'Test Status Ext'
      ) as (ALObject & { Values?: any[] }) | undefined;

      expect(enumExt).toBeDefined();
      expect(enumExt!.Values).toBeDefined();
      expect(enumExt!.Values!.length).toBe(2);

      const valueNames = enumExt!.Values!.map((v: any) => v.Name).sort();
      expect(valueNames).toEqual(['Archived', 'Pending Review']);
    });

    it('should parse ReportExtension "Test Item List Ext" with correct metadata', async () => {
      const objects = await parser.parseSymbolPackage(EXT_APP_PATH, 'Extension Test App');
      const reportExt = objects.find(
        o => o.Type === 'ReportExtension' && o.Name === 'Test Item List Ext'
      );

      expect(reportExt).toBeDefined();
      expect(reportExt!.Id).toBe(70000);
      expect(reportExt!.Type).toBe('ReportExtension');
    });

    it('should set the Extends property from TargetObject for table/page/enum extensions', async () => {
      const objects = await parser.parseSymbolPackage(EXT_APP_PATH, 'Extension Test App');

      // TableExtension should record that it extends "Test Item"
      const tableExt = objects.find(o => o.Type === 'TableExtension');
      expect(tableExt).toBeDefined();
      const tableExtends = tableExt!.Properties?.find(p => p.Name === 'Extends');
      expect(tableExtends).toBeDefined();
      expect(tableExtends!.Value).toBe('Test Item');

      // PageExtension should record that it extends "Test Item Card"
      const pageExt = objects.find(o => o.Type === 'PageExtension');
      expect(pageExt).toBeDefined();
      const pageExtends = pageExt!.Properties?.find(p => p.Name === 'Extends');
      expect(pageExtends).toBeDefined();
      expect(pageExtends!.Value).toBe('Test Item Card');

      // EnumExtensionType should record that it extends "Test Status"
      const enumExt = objects.find(o => o.Type === 'EnumExtensionType');
      expect(enumExt).toBeDefined();
      const enumExtends = enumExt!.Properties?.find(p => p.Name === 'Extends');
      expect(enumExtends).toBeDefined();
      expect(enumExtends!.Value).toBe('Test Status');
    });

    it('should set the Extends property from Target for report extensions', async () => {
      const objects = await parser.parseSymbolPackage(EXT_APP_PATH, 'Extension Test App');

      // ReportExtension should record that it extends "Test Item List"
      const reportExt = objects.find(o => o.Type === 'ReportExtension');
      expect(reportExt).toBeDefined();
      const reportExtends = reportExt!.Properties?.find(p => p.Name === 'Extends');
      expect(reportExtends).toBeDefined();
      expect(reportExtends!.Value).toBe('Test Item List');
    });

    it('should assign PackageName to all parsed extension objects', async () => {
      const objects = await parser.parseSymbolPackage(EXT_APP_PATH, 'Extension Test App');

      expect(objects.length).toBeGreaterThan(0);
      for (const obj of objects) {
        expect(obj.PackageName).toBe('Extension Test App');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Database Indexing Tests
// ---------------------------------------------------------------------------
describe('OptimizedSymbolDatabase - Extension Object Indexing', () => {
  let database: OptimizedSymbolDatabase;

  beforeEach(() => {
    database = new OptimizedSymbolDatabase();
  });

  describe('Manual addObject for extension types', () => {
    it('should index a TableExtension object and retrieve it by type', () => {
      const tableExt: ALObject = {
        Id: 70000,
        Name: 'Test Item Ext',
        Type: 'TableExtension',
        Properties: [{ Name: 'Extends', Value: 'Test Item' }],
      };

      database.addObject(tableExt, 'Extension Test App');

      const results = database.getObjectsByType('TableExtension');
      expect(results).toHaveLength(1);
      expect(results[0].Name).toBe('Test Item Ext');
    });

    it('should index a PageExtension object and retrieve it by name', () => {
      const pageExt: ALObject = {
        Id: 70000,
        Name: 'Test Item Card Ext',
        Type: 'PageExtension',
        Properties: [{ Name: 'Extends', Value: 'Test Item Card' }],
      };

      database.addObject(pageExt, 'Extension Test App');

      const results = database.getObjectsByName('Test Item Card Ext');
      expect(results).toHaveLength(1);
      expect(results[0].Type).toBe('PageExtension');
    });

    it('should index an EnumExtensionType object and retrieve it by ID', () => {
      const enumExt: ALObject = {
        Id: 70000,
        Name: 'Test Status Ext',
        Type: 'EnumExtensionType',
        Properties: [{ Name: 'Extends', Value: 'Test Status' }],
      };

      database.addObject(enumExt, 'Extension Test App');

      const result = database.getObjectById('EnumExtensionType:70000');
      expect(result).toBeDefined();
      expect(result!.Name).toBe('Test Status Ext');
    });

    it('should index a ReportExtension object and retrieve it by search', () => {
      const reportExt: ALObject = {
        Id: 70000,
        Name: 'Test Item List Ext',
        Type: 'ReportExtension',
        Properties: [{ Name: 'Extends', Value: 'Test Item List' }],
      };

      database.addObject(reportExt, 'Extension Test App');

      const results = database.searchObjects('Test Item List Ext');
      expect(results).toHaveLength(1);
      expect(results[0].Type).toBe('ReportExtension');
    });

    it('should track extension-to-base relationship via Extends property', () => {
      const baseTable: ALObject = {
        Id: 70000,
        Name: 'Test Item',
        Type: 'Table',
        Properties: [],
      };
      const tableExt: ALObject = {
        Id: 70000,
        Name: 'Test Item Ext',
        Type: 'TableExtension',
        Properties: [{ Name: 'Extends', Value: 'Test Item' }],
      };

      database.addObject(baseTable, 'Base Test App');
      database.addObject(tableExt, 'Extension Test App');

      const extensions = database.getExtensions('Test Item');
      expect(extensions).toHaveLength(1);
      expect(extensions[0].Name).toBe('Test Item Ext');
      expect(extensions[0].Type).toBe('TableExtension');
    });

    it('should return extensions via findReferences with referenceType "extends"', () => {
      const baseTable: ALObject = {
        Id: 70000,
        Name: 'Test Item',
        Type: 'Table',
        Properties: [],
      };
      const tableExt: ALObject = {
        Id: 70000,
        Name: 'Test Item Ext',
        Type: 'TableExtension',
        Properties: [{ Name: 'Extends', Value: 'Test Item' }],
      };

      database.addObject(baseTable, 'Base Test App');
      database.addObject(tableExt, 'Extension Test App');

      const refs = database.findReferences('Test Item', 'extends');
      expect(refs).toHaveLength(1);
      expect(refs[0].sourceName).toBe('Test Item Ext');
      expect(refs[0].sourceType).toBe('TableExtension');
      expect(refs[0].referenceType).toBe('extends');
    });

    it('should index TableExtension fields via getTableFields', () => {
      // The database currently indexes fields only for Type === 'Table'.
      // For extension fields to be accessible through getTableFields,
      // the indexing logic needs to handle TableExtension as well.
      const tableExt: ALObject & { Fields?: any[] } = {
        Id: 70000,
        Name: 'Test Item Ext',
        Type: 'TableExtension',
        Properties: [{ Name: 'Extends', Value: 'Test Item' }],
        Fields: [
          { Id: 70000, Name: 'Custom Category', TypeDefinition: { Name: 'Text', Length: 50 }, Properties: [] },
          { Id: 70001, Name: 'Priority', TypeDefinition: { Name: 'Integer' }, Properties: [] },
          { Id: 70002, Name: 'Extended Status', TypeDefinition: { Name: 'Enum' }, Properties: [] },
        ],
      };

      database.addObject(tableExt as ALObject, 'Extension Test App');

      const fields = database.getTableFields('Test Item Ext');
      expect(fields).toHaveLength(3);
      expect(fields.map(f => f.Name).sort()).toEqual([
        'Custom Category',
        'Extended Status',
        'Priority',
      ]);
    });

    it('should include extension types in statistics', () => {
      const objects: ALObject[] = [
        { Id: 70000, Name: 'Test Item', Type: 'Table', Properties: [] },
        { Id: 70000, Name: 'Test Item Ext', Type: 'TableExtension', Properties: [{ Name: 'Extends', Value: 'Test Item' }] },
        { Id: 70000, Name: 'Test Item Card Ext', Type: 'PageExtension', Properties: [{ Name: 'Extends', Value: 'Test Item Card' }] },
        { Id: 70000, Name: 'Test Status Ext', Type: 'EnumExtensionType', Properties: [{ Name: 'Extends', Value: 'Test Status' }] },
        { Id: 70000, Name: 'Test Item List Ext', Type: 'ReportExtension', Properties: [{ Name: 'Extends', Value: 'Test Item List' }] },
      ];

      objects.forEach(o => database.addObject(o, 'Test'));

      const stats = database.getStatistics();
      expect(stats.totalObjects).toBe(5);
      expect(stats.objectsByType.get('Table')).toBe(1);
      expect(stats.objectsByType.get('TableExtension')).toBe(1);
      expect(stats.objectsByType.get('PageExtension')).toBe(1);
      expect(stats.objectsByType.get('EnumExtensionType')).toBe(1);
      expect(stats.objectsByType.get('ReportExtension')).toBe(1);
    });

    it('should allow filtering search results by extension type', () => {
      const objects: ALObject[] = [
        { Id: 70000, Name: 'Test Item', Type: 'Table', Properties: [] },
        { Id: 70000, Name: 'Test Item Ext', Type: 'TableExtension', Properties: [{ Name: 'Extends', Value: 'Test Item' }] },
      ];

      objects.forEach(o => database.addObject(o, 'Test'));

      const allResults = database.searchObjects('Test Item');
      expect(allResults.length).toBe(2);

      const extensionsOnly = database.searchObjects('Test Item', 'TableExtension');
      expect(extensionsOnly.length).toBe(1);
      expect(extensionsOnly[0].Type).toBe('TableExtension');

      const tablesOnly = database.searchObjects('Test Item', 'Table');
      expect(tablesOnly.length).toBe(1);
      expect(tablesOnly[0].Type).toBe('Table');
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Integration Tests - Full Pipeline (Parser -> Database)
// ---------------------------------------------------------------------------
describeOrSkip('Integration - Extension Objects End-to-End', () => {
  let parser: StreamingSymbolParser;
  let database: OptimizedSymbolDatabase;

  beforeAll(async () => {
    parser = new StreamingSymbolParser();
    database = new OptimizedSymbolDatabase();

    // Load both packages into the database
    const baseObjects = await parser.parseSymbolPackage(BASE_APP_PATH, 'Base Test App');
    baseObjects.forEach(obj => database.addObject(obj, 'Base Test App'));

    const extObjects = await parser.parseSymbolPackage(EXT_APP_PATH, 'Extension Test App');
    extObjects.forEach(obj => database.addObject(obj, 'Extension Test App'));

    database.buildOptimizedIndices();
  });

  describe('Total object count', () => {
    it('should include both base and extension objects in the total count', () => {
      const stats = database.getStatistics();

      // Base app: 5 objects (Table, Page, Codeunit, Enum, Report)
      // Extension app: 4 extensions (TableExtension, PageExtension,
      //   EnumExtensionType, ReportExtension)
      expect(stats.totalObjects).toBe(9);
    });
  });

  describe('Extension-to-base relationships', () => {
    it('should find TableExtension via getExtensions("Test Item")', () => {
      const extensions = database.getExtensions('Test Item');

      expect(extensions.length).toBeGreaterThanOrEqual(1);

      const tableExt = extensions.find(e => e.Type === 'TableExtension');
      expect(tableExt).toBeDefined();
      expect(tableExt!.Name).toBe('Test Item Ext');
    });

    it('should find PageExtension via getExtensions("Test Item Card")', () => {
      const extensions = database.getExtensions('Test Item Card');

      expect(extensions.length).toBeGreaterThanOrEqual(1);

      const pageExt = extensions.find(e => e.Type === 'PageExtension');
      expect(pageExt).toBeDefined();
      expect(pageExt!.Name).toBe('Test Item Card Ext');
    });

    it('should find EnumExtensionType via getExtensions("Test Status")', () => {
      const extensions = database.getExtensions('Test Status');

      expect(extensions.length).toBeGreaterThanOrEqual(1);

      const enumExt = extensions.find(e => e.Type === 'EnumExtensionType');
      expect(enumExt).toBeDefined();
      expect(enumExt!.Name).toBe('Test Status Ext');
    });

    it('should find ReportExtension via getExtensions("Test Item List")', () => {
      const extensions = database.getExtensions('Test Item List');

      expect(extensions.length).toBeGreaterThanOrEqual(1);

      const reportExt = extensions.find(e => e.Type === 'ReportExtension');
      expect(reportExt).toBeDefined();
      expect(reportExt!.Name).toBe('Test Item List Ext');
    });
  });

  describe('Type-based queries across both packages', () => {
    it('should list all TableExtension objects', () => {
      const tableExts = database.getObjectsByType('TableExtension');
      expect(tableExts.length).toBeGreaterThanOrEqual(1);
      expect(tableExts.some(o => o.Name === 'Test Item Ext')).toBe(true);
    });

    it('should list all PageExtension objects', () => {
      const pageExts = database.getObjectsByType('PageExtension');
      expect(pageExts.length).toBeGreaterThanOrEqual(1);
      expect(pageExts.some(o => o.Name === 'Test Item Card Ext')).toBe(true);
    });

    it('should list all EnumExtensionType objects', () => {
      const enumExts = database.getObjectsByType('EnumExtensionType');
      expect(enumExts.length).toBeGreaterThanOrEqual(1);
      expect(enumExts.some(o => o.Name === 'Test Status Ext')).toBe(true);
    });

    it('should list all ReportExtension objects', () => {
      const reportExts = database.getObjectsByType('ReportExtension');
      expect(reportExts.length).toBeGreaterThanOrEqual(1);
      expect(reportExts.some(o => o.Name === 'Test Item List Ext')).toBe(true);
    });
  });

  describe('Statistics include extension types', () => {
    it('should report extension type counts in objectsByType', () => {
      const stats = database.getStatistics();

      expect(stats.objectsByType.get('TableExtension')).toBe(1);
      expect(stats.objectsByType.get('PageExtension')).toBe(1);
      expect(stats.objectsByType.get('EnumExtensionType')).toBe(1);
      expect(stats.objectsByType.get('ReportExtension')).toBe(1);

      // Base types should still be present
      expect(stats.objectsByType.get('Table')).toBe(1);
      expect(stats.objectsByType.get('Page')).toBe(1);
      expect(stats.objectsByType.get('Codeunit')).toBe(1);
      expect(stats.objectsByType.get('Enum')).toBe(1);
      expect(stats.objectsByType.get('Report')).toBe(1);
    });

    it('should report 2 packages', () => {
      const stats = database.getStatistics();
      expect(stats.packages).toBe(2);
    });
  });

  describe('Package summary', () => {
    it('should show correct object counts per package', () => {
      const summary = database.getPackageSummary();

      expect(summary.get('Base Test App')).toBe(5);
      expect(summary.get('Extension Test App')).toBe(4);
    });
  });

  describe('Cross-package search', () => {
    it('should find both base and extension objects when searching by name pattern', () => {
      const results = database.searchObjects('Test Item*');

      // Should find: "Test Item", "Test Item Card", "Test Item Mgmt",
      //              "Test Item Ext", "Test Item Card Ext",
      //              "Test Item List", "Test Item List Ext"
      const names = results.map(r => r.Name).sort();
      expect(names).toContain('Test Item');
      expect(names).toContain('Test Item Ext');
      expect(names).toContain('Test Item Card Ext');
      expect(names).toContain('Test Item List Ext');
    });

    it('should filter extension objects by package name', () => {
      const extOnly = database.searchObjects('*', undefined, 'Extension Test App');

      expect(extOnly.length).toBe(4);
      for (const obj of extOnly) {
        expect(obj.PackageName).toBe('Extension Test App');
      }
    });
  });

  describe('findReferences integration', () => {
    it('should find "extends" references from extension to base for "Test Item"', () => {
      const refs = database.findReferences('Test Item', 'extends');

      expect(refs.length).toBeGreaterThanOrEqual(1);
      const tableExtRef = refs.find(r => r.sourceName === 'Test Item Ext');
      expect(tableExtRef).toBeDefined();
      expect(tableExtRef!.referenceType).toBe('extends');
    });

    it('should find all reference types for "Test Item" (extends + source_table + others)', () => {
      const allRefs = database.findReferences('Test Item');

      // TableExtension "extends" is expected; source_table uses ID not name in compiled symbols
      expect(allRefs.length).toBeGreaterThanOrEqual(1);

      const refTypes = allRefs.map(r => r.referenceType);
      expect(refTypes).toContain('extends');
    });
  });
});
