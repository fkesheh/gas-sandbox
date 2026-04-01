import { execFileSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';
import { Spreadsheet } from './spreadsheet.js';

export interface GASRunnerOptions {
  httpMode?: 'mock' | 'live' | 'capture';
  mockResponses?: Record<string, MockResponse>;
  capturedResponses?: Map<string, CapturedResponse>;
  skipSleep?: boolean;
  envPath?: string;
  projectDir?: string;
}

export interface CapturedResponse {
  statusCode: number;
  body: unknown;
  method: string;
  url: string;
  timestamp: string;
}

export interface MockResponse {
  statusCode?: number;
  body?: unknown;
}

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  contentType?: string;
  payload?: string;
  muteHttpExceptions?: boolean;
}

export interface GASGlobals {
  SpreadsheetApp: {
    getActive: () => Spreadsheet;
    getActiveSpreadsheet: () => Spreadsheet;
    getUi: () => { alert: (title: string, message: string) => void; Button: { OK: string }; ButtonSet: { OK: string } };
  };
  UrlFetchApp: {
    fetch: (url: string, options?: FetchOptions) => HttpResponse;
  };
  PropertiesService: {
    getScriptProperties: () => {
      getProperty: (key: string) => string | null;
      setProperty: (key: string, value: string) => void;
      getProperties: () => Record<string, string | undefined>;
    };
  };
  ScriptApp: {
    getProjectTriggers: () => never[];
    deleteTrigger: () => void;
    newTrigger: () => TriggerBuilder;
    WeekDay: Record<string, string>;
  };
  Utilities: {
    sleep: (ms: number) => void;
  };
}

export function createGlobals(spreadsheet: Spreadsheet, options: GASRunnerOptions = {}): GASGlobals {
  const baseDir = options.envPath
    ? path.dirname(options.envPath)
    : (options.projectDir || process.cwd());
  dotenv.config({ path: options.envPath || path.join(baseDir, '.env') });
  dotenv.config({ path: path.join(baseDir, '.env.local'), override: true });

  const SpreadsheetApp: GASGlobals['SpreadsheetApp'] = {
    getActive: () => spreadsheet,
    getActiveSpreadsheet: () => spreadsheet,
    getUi: () => ({
      alert: (title: string, message: string) => console.log(`[UI] ${title}: ${message}`),
      Button: { OK: 'OK' },
      ButtonSet: { OK: 'OK' }
    })
  };

  const UrlFetchApp: GASGlobals['UrlFetchApp'] = {
    fetch: (url: string, fetchOptions?: FetchOptions) => {
      if (options.httpMode === 'mock') {
        return mockFetch(url, fetchOptions, options.mockResponses || {});
      }
      const response = liveFetch(url, fetchOptions);
      if (options.httpMode === 'capture' && options.capturedResponses) {
        let body: unknown;
        try {
          body = JSON.parse(response.getContentText());
        } catch {
          body = response.getContentText();
        }
        options.capturedResponses.set(url, {
          statusCode: response.getResponseCode(),
          body,
          method: (fetchOptions?.method || 'GET').toUpperCase(),
          url,
          timestamp: new Date().toISOString(),
        });
        console.log(`[CAPTURE] ${(fetchOptions?.method || 'GET').toUpperCase()} ${url} → ${response.getResponseCode()}`);
      }
      return response;
    }
  };

  const PropertiesService: GASGlobals['PropertiesService'] = {
    getScriptProperties: () => ({
      getProperty: (key: string) => process.env[key] || null,
      setProperty: (key: string, value: string) => { process.env[key] = value; },
      getProperties: () => ({ ...process.env }) as Record<string, string | undefined>
    })
  };

  const ScriptApp: GASGlobals['ScriptApp'] = {
    getProjectTriggers: () => [],
    deleteTrigger: () => {},
    newTrigger: () => new TriggerBuilder(),
    WeekDay: {
      SUNDAY: 'SUNDAY', MONDAY: 'MONDAY', TUESDAY: 'TUESDAY',
      WEDNESDAY: 'WEDNESDAY', THURSDAY: 'THURSDAY', FRIDAY: 'FRIDAY',
      SATURDAY: 'SATURDAY'
    }
  };

  const Utilities: GASGlobals['Utilities'] = {
    sleep: (ms: number) => {
      if (options.skipSleep) return;
      const sab = new SharedArrayBuffer(4);
      Atomics.wait(new Int32Array(sab), 0, 0, ms);
    }
  };

  return { SpreadsheetApp, UrlFetchApp, PropertiesService, ScriptApp, Utilities };
}

class TriggerBuilder {
  timeBased(): TriggerBuilder { return this; }
  everyDays(_days?: number): TriggerBuilder { return this; }
  atHour(_hour?: number): TriggerBuilder { return this; }
  onWeekDay(_day?: string): TriggerBuilder { return this; }
  create(): TriggerBuilder { return this; }
}

export class HttpResponse {
  private _statusCode: number;
  private _body: string;

  constructor(statusCode: number, body: string) {
    this._statusCode = statusCode;
    this._body = body;
  }

  getResponseCode(): number { return this._statusCode; }
  getContentText(): string { return this._body; }
}

function liveFetch(url: string, options: FetchOptions = {}): HttpResponse {
  const method = (options.method || 'GET').toUpperCase();
  const args: string[] = ['-s', '-S', '-w', '\n__STATUS__%{http_code}', '-X', method];

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
    const result = execFileSync('curl', args, { encoding: 'utf-8', timeout: 30000, maxBuffer: 50 * 1024 * 1024 });
    const statusMatch = result.match(/\n__STATUS__(\d+)$/);
    const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 200;
    const body = result.replace(/\n__STATUS__\d+$/, '');
    return new HttpResponse(statusCode, body);
  } catch (error) {
    if (options.muteHttpExceptions) {
      return new HttpResponse(500, (error as Error).message);
    }
    throw new Error(`HTTP request failed: ${(error as Error).message}`);
  }
}

function mockFetch(url: string, options: FetchOptions = {}, mocks: Record<string, MockResponse>): HttpResponse {
  for (const [pattern, response] of Object.entries(mocks)) {
    if (url.includes(pattern) || url === pattern) {
      const body = typeof response.body === 'object'
        ? JSON.stringify(response.body)
        : (response.body as string) || '';
      return new HttpResponse(response.statusCode || 200, body);
    }
  }
  console.warn(`[MOCK] No mock for: ${options.method || 'GET'} ${url}`);
  return new HttpResponse(404, '{"error":"no mock configured"}');
}
