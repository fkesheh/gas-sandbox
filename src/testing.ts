import { GASRunner } from './runner.js';
import { Sheet } from './spreadsheet.js';
import type { GASRunnerOptions } from './globals.js';
import type { CellValue, SpreadsheetJSON } from './spreadsheet.js';

export interface TestRunnerOptions extends GASRunnerOptions {
  projectDir: string;
  data?: SpreadsheetJSON;
  env?: Record<string, string>;
}

/**
 * Create a GASRunner pre-configured for testing (mock HTTP, skip sleep).
 * Loads data and project in one call.
 */
export function createTestRunner(options: TestRunnerOptions): GASRunner {
  const runnerOptions: GASRunnerOptions = {
    httpMode: 'mock',
    skipSleep: true,
    mockResponses: {},
    ...options,
  };

  // Set env vars if provided
  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      process.env[key] = value;
    }
  }

  const runner = new GASRunner(runnerOptions);

  if (options.data) {
    runner.loadData(options.data);
  }

  runner.loadProject(options.projectDir);
  return runner;
}

/**
 * Clean up env vars that were set during testing.
 */
export function cleanupTestEnv(keys: string[]): void {
  for (const key of keys) {
    delete process.env[key];
  }
}

/**
 * Assert that a sheet exists and return it. Throws if missing.
 */
export function assertSheet(runner: GASRunner, sheetName: string): Sheet {
  const sheet = runner.getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    const available = runner.getSpreadsheet().getSheets().map(s => s.getName()).join(', ');
    throw new Error(`Sheet "${sheetName}" not found. Available: ${available}`);
  }
  return sheet;
}

/**
 * Assert a cell value equals expected. Uses strict equality.
 * Row and col are 1-indexed (matching GAS convention).
 */
export function assertCell(
  runner: GASRunner,
  sheetName: string,
  row: number,
  col: number,
  expected: CellValue
): void {
  const sheet = assertSheet(runner, sheetName);
  const actual = sheet.getRange(row, col).getValue();
  if (actual !== expected) {
    throw new Error(
      `Cell ${sheetName}!R${row}C${col}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

/**
 * Get the number of data rows in a sheet (excluding header row).
 */
export function getDataRowCount(runner: GASRunner, sheetName: string): number {
  const sheet = assertSheet(runner, sheetName);
  return Math.max(0, sheet.getLastRow() - 1);
}

/**
 * Read a sheet as an array of record objects using the first row as headers.
 */
export function getSheetAsRecords(
  runner: GASRunner,
  sheetName: string
): Record<string, CellValue>[] {
  const sheet = assertSheet(runner, sheetName);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow <= 1 || lastCol === 0) return [];

  const allData = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = allData[0].map(h => String(h));

  return allData.slice(1).map(row => {
    const record: Record<string, CellValue> = {};
    headers.forEach((header, i) => {
      record[header] = row[i];
    });
    return record;
  });
}

/**
 * Build a SpreadsheetJSON object from a convenient format.
 *
 * Example:
 *   buildSheetData({
 *     'Raw Data': {
 *       headers: ['Date', 'User ID', 'Email'],
 *       rows: [
 *         ['2025-01-01', 'u1', 'alice@test.com'],
 *         ['2025-01-01', 'u2', 'bob@test.com'],
 *       ]
 *     }
 *   })
 */
export function buildSheetData(
  sheets: Record<string, { headers: CellValue[]; rows: CellValue[][] }>
): SpreadsheetJSON {
  const result: SpreadsheetJSON = { sheets: {} };

  for (const [name, { headers, rows }] of Object.entries(sheets)) {
    result.sheets[name] = {
      data: [headers, ...rows],
    };
  }

  return result;
}

/**
 * Run a function and return the result, normalized via JSON round-trip
 * to handle cross-VM prototype differences.
 */
export function runAndNormalize<T = unknown>(
  runner: GASRunner,
  functionName: string,
  ...args: unknown[]
): T {
  const result = runner.run(functionName, ...args);
  return JSON.parse(JSON.stringify(result)) as T;
}
