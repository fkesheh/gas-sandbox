/**
 * Google Apps Script global service shims.
 *
 * Maps GAS services to local equivalents:
 *   SpreadsheetApp  → in-memory Spreadsheet
 *   UrlFetchApp     → curl via execFileSync (synchronous, like GAS)
 *   PropertiesService → .env file via dotenv
 *   ScriptApp       → no-op trigger stubs
 *   Utilities       → sleep via Atomics.wait
 */

const { execFileSync } = require('child_process');
const path = require('path');

function createGlobals(spreadsheet, options = {}) {
  // Load .env into process.env
  require('dotenv').config({ path: options.envPath || path.join(process.cwd(), '.env') });

  const SpreadsheetApp = {
    getActive: () => spreadsheet,
    getActiveSpreadsheet: () => spreadsheet,
    getUi: () => ({
      alert: (title, message) => console.log(`[UI] ${title}: ${message}`),
      Button: { OK: 'OK' },
      ButtonSet: { OK: 'OK' }
    })
  };

  const UrlFetchApp = {
    fetch: (url, fetchOptions) => {
      if (options.httpMode === 'mock') {
        return mockFetch(url, fetchOptions, options.mockResponses || {});
      }
      return liveFetch(url, fetchOptions);
    }
  };

  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key) => process.env[key] || null,
      setProperty: (key, value) => { process.env[key] = value; },
      getProperties: () => ({ ...process.env })
    })
  };

  const ScriptApp = {
    getProjectTriggers: () => [],
    deleteTrigger: () => {},
    newTrigger: () => new TriggerBuilder(),
    WeekDay: {
      SUNDAY: 'SUNDAY', MONDAY: 'MONDAY', TUESDAY: 'TUESDAY',
      WEDNESDAY: 'WEDNESDAY', THURSDAY: 'THURSDAY', FRIDAY: 'FRIDAY',
      SATURDAY: 'SATURDAY'
    }
  };

  const Utilities = {
    sleep: (ms) => {
      if (options.skipSleep) return;
      const sab = new SharedArrayBuffer(4);
      Atomics.wait(new Int32Array(sab), 0, 0, ms);
    }
  };

  return { SpreadsheetApp, UrlFetchApp, PropertiesService, ScriptApp, Utilities };
}

class TriggerBuilder {
  timeBased() { return this; }
  everyDays() { return this; }
  atHour() { return this; }
  onWeekDay() { return this; }
  create() { return this; }
}

class HttpResponse {
  constructor(statusCode, body) {
    this._statusCode = statusCode;
    this._body = body;
  }
  getResponseCode() { return this._statusCode; }
  getContentText() { return this._body; }
}

function liveFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const args = ['-s', '-S', '-w', '\n__STATUS__%{http_code}', '-X', method];

  const headers = options.headers || {};
  for (const [key, value] of Object.entries(headers)) {
    args.push('-H', `${key}: ${value}`);
  }

  if (options.contentType) {
    args.push('-H', `Content-Type: ${options.contentType}`);
  }

  if (options.payload) {
    args.push('--data-raw', options.payload);
  }

  args.push(url);

  try {
    const result = execFileSync('curl', args, { encoding: 'utf-8', timeout: 30000 });
    const statusMatch = result.match(/\n__STATUS__(\d+)$/);
    const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 200;
    const body = result.replace(/\n__STATUS__\d+$/, '');
    return new HttpResponse(statusCode, body);
  } catch (error) {
    if (options.muteHttpExceptions) {
      return new HttpResponse(500, error.message);
    }
    throw new Error(`HTTP request failed: ${error.message}`);
  }
}

function mockFetch(url, options, mocks) {
  for (const [pattern, response] of Object.entries(mocks)) {
    if (url.includes(pattern) || url === pattern) {
      const body = typeof response.body === 'object'
        ? JSON.stringify(response.body)
        : response.body || '';
      return new HttpResponse(response.statusCode || 200, body);
    }
  }
  console.warn(`[MOCK] No mock for: ${options.method || 'GET'} ${url}`);
  return new HttpResponse(404, '{"error":"no mock configured"}');
}

module.exports = { createGlobals, HttpResponse };
