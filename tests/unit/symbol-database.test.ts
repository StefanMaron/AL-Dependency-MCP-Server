import { OptimizedSymbolDatabase } from '../../src/core/symbol-database';
import { ALObject, ALTable, ALField } from '../../src/types/al-types';

describe('OptimizedSymbolDatabase', () => {
  let database: OptimizedSymbolDatabase;

  beforeEach(() => {
    database = new OptimizedSymbolDatabase();
  });

  describe('addObject', () => {
    it('should add an object to the database', () => {
      const table: ALTable = {
        Id: 18,
        Name: 'Customer',
        Type: 'Table',
        Properties: [],
        Fields: [
          {
            Id: 1,
            Name: 'No.',
            TypeDefinition: { Name: 'Code', Length: 20 },
            Properties: []
          },
          {
            Id: 2,
            Name: 'Name',
            TypeDefinition: { Name: 'Text', Length: 100 },
            Properties: []
          }
        ]
      };

      database.addObject(table, 'Base Application');

      const retrieved = database.getObjectById('Table:18');
      expect(retrieved).toBeDefined();
      expect(retrieved?.Name).toBe('Customer');
      expect(retrieved?.PackageName).toBe('Base Application');
    });

    it('should index fields for table objects', () => {
      const table: ALTable = {
        Id: 18,
        Name: 'Customer',
        Type: 'Table',
        Properties: [],
        Fields: [
          {
            Id: 1,
            Name: 'No.',
            TypeDefinition: { Name: 'Code', Length: 20 },
            Properties: []
          }
        ]
      };

      database.addObject(table, 'Base Application');

      const fields = database.getTableFields('Customer');
      expect(fields).toHaveLength(1);
      expect(fields[0].Name).toBe('No.');
    });
  });

  describe('searchObjects', () => {
    beforeEach(() => {
      // Add test data
      const objects: ALObject[] = [
        {
          Id: 18,
          Name: 'Customer',
          Type: 'Table',
          Properties: []
        },
        {
          Id: 19,
          Name: 'Cust. Ledger Entry',
          Type: 'Table',
          Properties: []
        },
        {
          Id: 21,
          Name: 'Customer Card',
          Type: 'Page',
          Properties: []
        },
        {
          Id: 50000,
          Name: 'My Customer Extension',
          Type: 'Table',
          Properties: []
        }
      ];

      objects.forEach(obj => {
        database.addObject(obj, obj.Id < 50000 ? 'Base Application' : 'My Extension');
      });
    });

    it('should find objects by exact name match', () => {
      const results = database.searchObjects('Customer');
      expect(results.length).toBeGreaterThanOrEqual(1);
      const exactMatch = results.find(r => r.Name === 'Customer');
      expect(exactMatch).toBeDefined();
    });

    it('should find objects by partial name match', () => {
      const results = database.searchObjects('Cust');
      expect(results.length).toBeGreaterThanOrEqual(2);
      const names = results.map(r => r.Name);
      expect(names).toContain('Customer');
      expect(names).toContain('Cust. Ledger Entry');
    });

    it('should find objects with wildcard patterns', () => {
      const results = database.searchObjects('Customer*');
      expect(results.length).toBeGreaterThanOrEqual(2);
      const names = results.map(r => r.Name);
      expect(names).toContain('Customer');
      expect(names).toContain('Customer Card');
    });

    it('should filter by object type', () => {
      const results = database.searchObjects('Customer', 'Table');
      const tableResults = results.filter(r => r.Type === 'Table');
      expect(tableResults.length).toBe(results.length);
    });

    it('should filter by package name', () => {
      const results = database.searchObjects('Customer', undefined, 'Base Application');
      const baseAppResults = results.filter(r => r.PackageName === 'Base Application');
      expect(baseAppResults.length).toBe(results.length);
    });

    it('should handle case insensitive search', () => {
      const lowerResults = database.searchObjects('customer');
      const upperResults = database.searchObjects('CUSTOMER');
      expect(lowerResults).toEqual(upperResults);
    });
  });

  describe('getObjectsByType', () => {
    beforeEach(() => {
      const objects: ALObject[] = [
        { Id: 18, Name: 'Customer', Type: 'Table', Properties: [] },
        { Id: 19, Name: 'Vendor', Type: 'Table', Properties: [] },
        { Id: 21, Name: 'Customer Card', Type: 'Page', Properties: [] },
        { Id: 22, Name: 'Vendor Card', Type: 'Page', Properties: [] }
      ];

      objects.forEach(obj => database.addObject(obj, 'Base Application'));
    });

    it('should return all objects of specified type', () => {
      const tables = database.getObjectsByType('Table');
      expect(tables).toHaveLength(2);
      expect(tables.every(t => t.Type === 'Table')).toBe(true);

      const pages = database.getObjectsByType('Page');
      expect(pages).toHaveLength(2);
      expect(pages.every(p => p.Type === 'Page')).toBe(true);
    });

    it('should return empty array for unknown type', () => {
      const results = database.getObjectsByType('UnknownType');
      expect(results).toHaveLength(0);
    });
  });

  describe('findReferences', () => {
    beforeEach(() => {
      // Add table with extension
      const baseTable: ALObject = {
        Id: 18,
        Name: 'Customer',
        Type: 'Table',
        Properties: []
      };

      const extTable: ALObject = {
        Id: 50000,
        Name: 'Customer Extension',
        Type: 'TableExtension',
        Properties: [
          { Name: 'Extends', Value: 'Customer' }
        ]
      };

      const customerPage: ALObject = {
        Id: 21,
        Name: 'Customer Card',
        Type: 'Page',
        Properties: [
          { Name: 'SourceTable', Value: 'Customer' }
        ]
      };

      database.addObject(baseTable, 'Base Application');
      database.addObject(extTable, 'My Extension');
      database.addObject(customerPage, 'Base Application');
    });

    it('should find extension references', () => {
      const references = database.findReferences('Customer', 'extends');
      expect(references).toHaveLength(1);
      expect(references[0].sourceName).toBe('Customer Extension');
      expect(references[0].referenceType).toBe('extends');
    });

    it('should find all references when no type specified', () => {
      const references = database.findReferences('Customer');
      expect(references.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics', () => {
      const objects: ALObject[] = [
        { Id: 18, Name: 'Customer', Type: 'Table', Properties: [] },
        { Id: 19, Name: 'Vendor', Type: 'Table', Properties: [] },
        { Id: 21, Name: 'Customer Card', Type: 'Page', Properties: [] }
      ];

      objects.forEach(obj => database.addObject(obj, 'Base Application'));

      const stats = database.getStatistics();
      expect(stats.totalObjects).toBe(3);
      expect(stats.objectsByType.get('Table')).toBe(2);
      expect(stats.objectsByType.get('Page')).toBe(1);
      expect(stats.packages).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      const table: ALObject = {
        Id: 18,
        Name: 'Customer',
        Type: 'Table',
        Properties: []
      };

      database.addObject(table, 'Base Application');
      expect(database.getStatistics().totalObjects).toBe(1);

      database.clear();
      expect(database.getStatistics().totalObjects).toBe(0);
      expect(database.getObjectById('Table:18')).toBeUndefined();
    });
  });
});