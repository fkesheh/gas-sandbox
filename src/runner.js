/**
 * GASRunner — loads .gs files into a shared VM context and executes functions.
 *
 * All .gs files are concatenated into a single script (matching GAS's flat namespace)
 * and evaluated once. Function declarations are hoisted onto the VM context so they
 * can be called individually. const/let variables remain script-scoped but are visible
 * to all functions via closure — exactly like Google Apps Script's V8 runtime.
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { Spreadsheet } = require('./spreadsheet');
const { createGlobals } = require('./globals');

class GASRunner {
  constructor(options = {}) {
    this._options = options;
    this._spreadsheet = new Spreadsheet();
    this._context = null;
    this._loaded = false;
  }

  loadData(jsonPathOrObject) {
    const data = typeof jsonPathOrObject === 'string'
      ? JSON.parse(fs.readFileSync(jsonPathOrObject, 'utf-8'))
      : jsonPathOrObject;
    this._spreadsheet.loadFromJSON(data);
    return this;
  }

  loadProject(projectDir) {
    const gsFiles = fs.readdirSync(projectDir)
      .filter(f => f.endsWith('.gs'))
      .sort()
      .map(f => path.join(projectDir, f));

    if (gsFiles.length === 0) {
      throw new Error(`No .gs files found in ${projectDir}`);
    }

    const globals = createGlobals(this._spreadsheet, this._options);

    this._context = vm.createContext({
      ...globals,
      console,
      SharedArrayBuffer,
      Atomics,
      Int32Array
    });

    // Concatenate all .gs files into one script (GAS flat namespace)
    const fullScript = gsFiles.map(filePath => {
      const code = fs.readFileSync(filePath, 'utf-8');
      return `// === ${path.basename(filePath)} ===\n${code}\n`;
    }).join('\n');

    vm.runInContext(fullScript, this._context, { filename: 'project.gs' });
    this._loaded = true;

    const functions = this.listFunctions();
    console.log(`[LOADED] ${gsFiles.length} files, ${functions.length} functions`);
    return this;
  }

  run(functionName, ...args) {
    if (!this._loaded) throw new Error('No project loaded. Call loadProject() first.');

    const fn = this._context[functionName];
    if (typeof fn !== 'function') {
      const available = this.listFunctions().join(', ');
      throw new Error(`Function "${functionName}" not found. Available: ${available}`);
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[RUN] ${functionName}`);
    console.log(`${'─'.repeat(60)}`);

    const start = Date.now();
    const result = fn(...args);
    const elapsed = Date.now() - start;

    console.log(`${'─'.repeat(60)}`);
    console.log(`[DONE] ${functionName} (${elapsed}ms)`);
    return result;
  }

  listFunctions() {
    if (!this._context) return [];
    return Object.keys(this._context)
      .filter(k => typeof this._context[k] === 'function')
      .sort();
  }

  getSpreadsheet() {
    return this._spreadsheet;
  }

  exportData(jsonPath) {
    const data = this._spreadsheet.toJSON();
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    console.log(`[EXPORT] Saved to ${jsonPath}`);
    return data;
  }

  getSheetData(sheetName) {
    const sheet = this._spreadsheet.getSheetByName(sheetName);
    if (!sheet) return null;
    return sheet._data;
  }
}

module.exports = { GASRunner };
