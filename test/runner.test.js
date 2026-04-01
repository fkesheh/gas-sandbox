const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { GASRunner } = require('../src/runner');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

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
    // JSON round-trip needed: VM context objects have different prototypes
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

  it('free-owner exclusion works with cursor-admin-sheet project', () => {
    // getFreeOwnerIds() checks for this token before calling the API
    process.env.CURSOR_ADMIN_TOKEN = 'Bearer test-token';

    const runner = new GASRunner({
      httpMode: 'mock',
      skipSleep: true,
      mockResponses: {
        'api.cursor.com/teams/members': {
          statusCode: 200,
          body: {
            teamMembers: [
              { id: 'user-1', email: 'alice@test.com', role: 'member' },
              { id: 'user-2', email: 'bob@test.com', role: 'member' },
              { id: 'free-1', email: 'admin@test.com', role: 'free-owner' }
            ]
          }
        }
      }
    });

    // Raw data: 3 users, 2 days. free-1 is a free-owner.
    runner.loadData({
      sheets: {
        'Raw Data': {
          data: [
            ['Date', 'User ID', 'Email', 'Is Active',
             'Total Lines Added', 'Total Lines Deleted',
             'Accepted Lines Added', 'Accepted Lines Deleted',
             'Total Applies', 'Total Accepts', 'Total Rejects',
             'Total Tabs Shown', 'Total Tabs Accepted',
             'Composer Requests', 'Chat Requests', 'Agent Requests',
             'CMDK Usages', 'Subscription Included Reqs', 'API Key Reqs',
             'Usage Based Reqs', 'Bugbot Usages', 'Most Used Model',
             'Apply Most Used Extension', 'Tab Most Used Extension',
             'Client Version', 'Last Updated', 'Import Count'],
            ['2025-05-05', 'user-1', 'alice@test.com', true,
             100, 50, 80, 40, 5, 3, 1, 20, 15, 10, 5, 3, 2, 50, 0, 0, 1, 'gpt-4', '', '', '0.1', '', 1],
            ['2025-05-05', 'user-2', 'bob@test.com', true,
             200, 100, 150, 75, 10, 8, 2, 40, 30, 20, 10, 6, 4, 100, 0, 0, 0, 'gpt-4', '', '', '0.1', '', 1],
            ['2025-05-05', 'free-1', 'admin@test.com', true,
             10, 5, 8, 4, 1, 1, 0, 5, 3, 2, 1, 0, 0, 10, 0, 0, 0, 'gpt-4', '', '', '0.1', '', 1],
          ]
        }
      }
    });

    const projectDir = path.resolve(__dirname, '..', '..', 'cursor-admin-sheet');
    runner.loadProject(projectDir);

    // Run WBR aggregation
    const rawData = runner.run('getRawData');
    const wbrData = runner.run('aggregateWBRData', rawData, 'weekly');

    // JSON round-trip to normalize cross-VM objects
    const metrics = JSON.parse(JSON.stringify(wbrData.metrics));

    // totalUsers should be 2 (excluding free-owner), NOT 3
    assert.equal(metrics['Cursor Licensed Users'][0], 2,
      'Free-owner should be excluded from licensed users');

    // activeUsers should also be 2 (free-owner was active but excluded)
    assert.equal(metrics['Cursor Active Users'][0], 2,
      'Free-owner should be excluded from active users');

    // bugbotActiveUsers: only user-1 used bugbot (1 usage), free-1 had 0
    assert.equal(metrics['Cursor Bugbot Active Users'][0], 1,
      'Only paid users with bugbot usage should count');

    delete process.env.CURSOR_ADMIN_TOKEN;
  });
});
