import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { Spreadsheet } from './spreadsheet.js';
import { createGlobals, type GASRunnerOptions, type CapturedResponse } from './globals.js';
import { DataMasker, type MaskOptions } from './masking.js';
import type { SpreadsheetJSON } from './spreadsheet.js';
import type { SheetData } from './spreadsheet.js';

export class GASRunner {
  private _options: GASRunnerOptions;
  private _spreadsheet: Spreadsheet;
  private _context: vm.Context | null;
  private _loaded: boolean;

  constructor(options: GASRunnerOptions = {}) {
    this._options = options;
    this._spreadsheet = new Spreadsheet();
    this._context = null;
    this._loaded = false;
    if (this._options.httpMode === 'capture') {
      this._options.capturedResponses = new Map();
    }
  }

  loadData(jsonPathOrObject: string | SpreadsheetJSON): GASRunner {
    const data: SpreadsheetJSON = typeof jsonPathOrObject === 'string'
      ? JSON.parse(fs.readFileSync(jsonPathOrObject, 'utf-8'))
      : jsonPathOrObject;
    this._spreadsheet.loadFromJSON(data);
    return this;
  }

  loadProject(projectDir: string): GASRunner {
    const gsFiles = fs.readdirSync(projectDir)
      .filter((f: string) => f.endsWith('.gs'))
      .sort()
      .map((f: string) => path.join(projectDir, f));

    if (gsFiles.length === 0) {
      throw new Error(`No .gs files found in ${projectDir}`);
    }

    const globals = createGlobals(this._spreadsheet, { ...this._options, projectDir });

    this._context = vm.createContext({
      ...globals,
      console,
      SharedArrayBuffer,
      Atomics,
      Int32Array
    });

    const fullScript = gsFiles.map((filePath: string) => {
      const code = fs.readFileSync(filePath, 'utf-8');
      return `// === ${path.basename(filePath)} ===\n${code}\n`;
    }).join('\n');

    vm.runInContext(fullScript, this._context, { filename: 'project.gs' });
    this._loaded = true;

    const functions = this.listFunctions();
    console.log(`[LOADED] ${gsFiles.length} files, ${functions.length} functions`);
    return this;
  }

  run(functionName: string, ...args: unknown[]): unknown {
    if (!this._loaded) throw new Error('No project loaded. Call loadProject() first.');

    const fn = this._context![functionName];
    if (typeof fn !== 'function') {
      const available = this.listFunctions().join(', ');
      throw new Error(`Function "${functionName}" not found. Available: ${available}`);
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[RUN] ${functionName}`);
    console.log(`${'─'.repeat(60)}`);

    const start = Date.now();
    const result: unknown = fn(...args);
    const elapsed = Date.now() - start;

    console.log(`${'─'.repeat(60)}`);
    console.log(`[DONE] ${functionName} (${elapsed}ms)`);
    return result;
  }

  listFunctions(): string[] {
    if (!this._context) return [];
    const builtins = new Set(['SharedArrayBuffer', 'Int32Array', 'Atomics']);
    return Object.keys(this._context)
      .filter((k: string) => typeof this._context![k] === 'function' && !builtins.has(k))
      .sort();
  }

  getSpreadsheet(): Spreadsheet {
    return this._spreadsheet;
  }

  exportData(jsonPath: string): SpreadsheetJSON {
    const data = this._spreadsheet.toJSON();
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    console.log(`[EXPORT] Saved to ${jsonPath}`);
    return data;
  }

  exportXlsx(filePath: string): void {
    const wb = XLSX.utils.book_new();
    for (const sheet of this._spreadsheet.getSheets()) {
      const ws = XLSX.utils.aoa_to_sheet(sheet._data);
      XLSX.utils.book_append_sheet(wb, ws, sheet.getName());
    }
    XLSX.writeFile(wb, filePath);
    console.log(`[EXPORT] Saved XLSX to ${filePath}`);
  }

  getSheetData(sheetName: string): SheetData | null {
    const sheet = this._spreadsheet.getSheetByName(sheetName);
    if (!sheet) return null;
    return sheet._data;
  }

  getCapturedResponses(): Map<string, CapturedResponse> {
    return this._options.capturedResponses || new Map();
  }

  exportMocks(filePath: string, maskOptions?: MaskOptions): void {
    const captured = this.getCapturedResponses();
    if (captured.size === 0) {
      console.log('[EXPORT] No HTTP responses were captured');
      return;
    }

    const mocks: Record<string, { statusCode: number; body: unknown }> = {};
    for (const [url, response] of captured) {
      mocks[url] = {
        statusCode: response.statusCode,
        body: response.body,
      };
    }

    let output = mocks;
    if (maskOptions && (maskOptions.emails || maskOptions.ids || maskOptions.fields?.length || maskOptions.patterns?.length)) {
      const masker = new DataMasker(maskOptions);
      output = masker.maskMockFile(mocks);
      const mappings = masker.getMappings();
      const emailCount = Object.keys(mappings.emails).length;
      const idCount = Object.keys(mappings.ids).length;
      if (emailCount > 0 || idCount > 0) {
        console.log(`[MASK] Replaced ${emailCount} emails, ${idCount} IDs`);
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(output, null, 2));
    console.log(`[EXPORT] Saved ${captured.size} captured responses to ${filePath}`);
  }
}
