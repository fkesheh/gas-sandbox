import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import XLSX from 'xlsx';
import { GASRunner } from '../src/runner.js';

const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures');

describe('GASRunner', () => {
  it('loads .gs files and lists functions', () => {
    const runner = new GASRunner({ httpMode: 'mock', skipSleep: true, mockResponses: {} });
    runner.loadData({
      sheets: { 'Raw Data': { data: [['Date', 'User ID']] } }
    });
    runner.loadProject(path.join(FIXTURES_DIR, 'sample-project'));

    const functions = runner.listFunctions();
    assert.ok(functions.includes('greet'), `Expected "greet" in: ${functions}`);
    assert.ok(functions.includes('addNumbers'), `Expected "addNumbers" in: ${functions}`);
  });

  it('executes a simple function and returns result', () => {
    const runner = new GASRunner({ httpMode: 'mock', skipSleep: true, mockResponses: {} });
    runner.loadProject(path.join(FIXTURES_DIR, 'sample-project'));

    const result = runner.run('addNumbers', 3, 7);
    assert.equal(result, 10);
  });

  it('functions can access const from another file via shared scope', () => {
    const runner = new GASRunner({ httpMode: 'mock', skipSleep: true, mockResponses: {} });
    runner.loadProject(path.join(FIXTURES_DIR, 'sample-project'));

    const result = runner.run('getAppName');
    assert.equal(result, 'SampleApp');
  });

  it('sheet read/write round-trips correctly', () => {
    const runner = new GASRunner({ httpMode: 'mock', skipSleep: true, mockResponses: {} });
    runner.loadData({
      sheets: {
        'Raw Data': {
          data: [
            ['Date', 'User ID', 'Email', 'Is Active'],
            ['2025-01-01', 'u1', 'alice@test.com', true],
            ['2025-01-01', 'u2', 'bob@test.com', false]
          ]
        }
      }
    });
    runner.loadProject(path.join(FIXTURES_DIR, 'sample-project'));

    runner.run('writeToSheet');

    const sheet = runner.getSpreadsheet().getSheetByName('Output');
    assert.ok(sheet, 'Output sheet should exist');
    assert.equal(sheet._data[0][0], 'Result');
    assert.equal(sheet._data[1][0], 42);
  });

  it('UrlFetchApp mock returns configured responses', () => {
    const runner = new GASRunner({
      httpMode: 'mock',
      skipSleep: true,
      mockResponses: {
        'api.example.com/data': {
          statusCode: 200,
          body: { items: [1, 2, 3] }
        }
      }
    });
    runner.loadProject(path.join(FIXTURES_DIR, 'sample-project'));

    const result = runner.run('fetchData');
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { items: [1, 2, 3] });
  });

  it('PropertiesService reads from process.env', () => {
    process.env.TEST_PROP = 'hello-from-env';
    const runner = new GASRunner({ httpMode: 'mock', skipSleep: true, mockResponses: {} });
    runner.loadProject(path.join(FIXTURES_DIR, 'sample-project'));

    const result = runner.run('readProperty', 'TEST_PROP');
    assert.equal(result, 'hello-from-env');
    delete process.env.TEST_PROP;
  });

  it('exportData produces valid JSON with sheet data', () => {
    const runner = new GASRunner({ httpMode: 'mock', skipSleep: true, mockResponses: {} });
    runner.loadData({
      sheets: { 'Sheet1': { data: [['a', 'b'], [1, 2]] } }
    });
    runner.loadProject(path.join(FIXTURES_DIR, 'sample-project'));

    const exported = runner.getSpreadsheet().toJSON();
    assert.deepEqual(exported.sheets['Sheet1'].data, [['a', 'b'], [1, 2]]);
  });

  it('throws on unknown function', () => {
    const runner = new GASRunner({ httpMode: 'mock', skipSleep: true, mockResponses: {} });
    runner.loadProject(path.join(FIXTURES_DIR, 'sample-project'));

    assert.throws(() => runner.run('nonExistent'), /not found/);
  });

  it('role-based filtering excludes observer users', () => {
    process.env.API_TOKEN = 'Bearer test-token';

    const runner = new GASRunner({
      httpMode: 'mock',
      skipSleep: true,
      mockResponses: {
        'api.acmecorp.com/teams/team-001/members': {
          statusCode: 200,
          body: {
            members: [
              { name: 'Alice', email: 'alice@acmecorp.com', role: 'admin' },
              { name: 'Bob', email: 'bob@acmecorp.com', role: 'member' },
              { name: 'Charlie', email: 'charlie@acmecorp.com', role: 'observer' },
              { name: 'Diana', email: 'diana@acmecorp.com', role: 'member' }
            ]
          }
        }
      }
    });

    runner.loadProject(path.join(FIXTURES_DIR, 'role-filter-project'));
    const result = JSON.parse(JSON.stringify(runner.run('processTeam')));

    assert.equal(result.totalMembers, 4);
    assert.equal(result.activeMembers, 3);
    assert.equal(result.excludedCount, 1);

    const sheet = runner.getSpreadsheet().getSheetByName('Results');
    assert.ok(sheet, 'Results sheet should exist');
    assert.equal(sheet._data[0][0], 'Name');
    assert.equal(sheet._data.length, 4); // header + 3 active members

    delete process.env.API_TOKEN;
  });

  it('exportXlsx creates valid XLSX file', async () => {
    const runner = new GASRunner({ httpMode: 'mock', skipSleep: true, mockResponses: {} });
    runner.loadData({
      sheets: {
        'Sales': { data: [['Product', 'Revenue'], ['Widget', 1000], ['Gadget', 2500]] },
        'Inventory': { data: [['Item', 'Qty'], ['Widget', 50]] }
      }
    });
    runner.loadProject(path.join(FIXTURES_DIR, 'sample-project'));

    const tmpPath = path.join(import.meta.dirname, '..', 'tmp-test-export.xlsx');

    try {
      runner.exportXlsx(tmpPath);

      const wb = XLSX.readFile(tmpPath);

      assert.ok(wb.SheetNames.includes('Sales'), 'Should have Sales sheet');
      assert.ok(wb.SheetNames.includes('Inventory'), 'Should have Inventory sheet');

      const salesData = XLSX.utils.sheet_to_json(wb.Sheets['Sales'], { header: 1 });
      assert.deepEqual(salesData[0], ['Product', 'Revenue']);
      assert.deepEqual(salesData[1], ['Widget', 1000]);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  });
});
