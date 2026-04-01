/**
 * In-memory spreadsheet model that mirrors Google Apps Script's Spreadsheet/Sheet/Range API.
 * Data is stored as 2D arrays (0-indexed internally, 1-indexed in the public API).
 */

class Range {
  constructor(sheet, row, col, numRows, numCols) {
    this._sheet = sheet;
    this._row = row;
    this._col = col;
    this._numRows = numRows;
    this._numCols = numCols;
  }

  getValue() {
    const r = this._row - 1;
    const c = this._col - 1;
    const data = this._sheet._data;
    if (r < data.length && c < data[r].length) {
      return data[r][c];
    }
    return '';
  }

  getValues() {
    const result = [];
    for (let r = 0; r < this._numRows; r++) {
      const row = [];
      for (let c = 0; c < this._numCols; c++) {
        const dataRow = this._row - 1 + r;
        const dataCol = this._col - 1 + c;
        const data = this._sheet._data;
        if (dataRow < data.length && dataCol < data[dataRow].length) {
          row.push(data[dataRow][dataCol]);
        } else {
          row.push('');
        }
      }
      result.push(row);
    }
    return result;
  }

  setValue(value) {
    this._ensureSize(this._row, this._col);
    this._sheet._data[this._row - 1][this._col - 1] = value;
    return this;
  }

  setValues(values) {
    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[r].length; c++) {
        const dataRow = this._row - 1 + r;
        const dataCol = this._col - 1 + c;
        this._ensureSize(dataRow + 1, dataCol + 1);
        this._sheet._data[dataRow][dataCol] = values[r][c];
      }
    }
    return this;
  }

  clear() {
    for (let r = 0; r < this._numRows; r++) {
      for (let c = 0; c < this._numCols; c++) {
        const dataRow = this._row - 1 + r;
        const dataCol = this._col - 1 + c;
        if (dataRow < this._sheet._data.length && dataCol < this._sheet._data[dataRow].length) {
          this._sheet._data[dataRow][dataCol] = '';
        }
      }
    }
    return this;
  }

  _ensureSize(row, col) {
    const data = this._sheet._data;
    while (data.length < row) {
      data.push([]);
    }
    for (let r = 0; r < row; r++) {
      while (data[r].length < col) {
        data[r].push('');
      }
    }
  }

  // Formatting no-ops — chainable
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setNumberFormat() { return this; }
  setFontSize() { return this; }
}

class Sheet {
  constructor(name) {
    this._name = name;
    this._data = [];
    this._frozenRows = 0;
    this._frozenColumns = 0;
    this._sheetId = Math.floor(Math.random() * 1000000);
  }

  getName() { return this._name; }
  getSheetId() { return this._sheetId; }
  setName(name) { this._name = name; return this; }

  getRange(row, col, numRows, numCols) {
    return new Range(this, row, col, numRows || 1, numCols || 1);
  }

  getLastRow() {
    for (let r = this._data.length - 1; r >= 0; r--) {
      if (this._data[r].some(cell => cell !== '' && cell !== null && cell !== undefined)) {
        return r + 1;
      }
    }
    return 0;
  }

  getLastColumn() {
    let maxCol = 0;
    for (let r = 0; r < this._data.length; r++) {
      for (let c = this._data[r].length - 1; c >= 0; c--) {
        if (this._data[r][c] !== '' && this._data[r][c] !== null && this._data[r][c] !== undefined) {
          maxCol = Math.max(maxCol, c + 1);
          break;
        }
      }
    }
    return maxCol;
  }

  getMaxRows() {
    return Math.max(this._data.length, 1000);
  }

  getMaxColumns() {
    let max = 0;
    for (const row of this._data) {
      max = Math.max(max, row.length);
    }
    return Math.max(max, 26);
  }

  setFrozenRows(n) { this._frozenRows = n; return this; }
  setFrozenColumns(n) { this._frozenColumns = n; return this; }
  autoResizeColumns() { return this; }
  setColumnWidth() { return this; }
}

class Spreadsheet {
  constructor() {
    this._sheets = new Map();
    this._activeSheet = null;
  }

  getSheetByName(name) {
    return this._sheets.get(name) || null;
  }

  insertSheet(name) {
    const sheet = new Sheet(name);
    this._sheets.set(name, sheet);
    if (!this._activeSheet) this._activeSheet = sheet;
    return sheet;
  }

  getSheets() {
    return Array.from(this._sheets.values());
  }

  getActiveSheet() {
    return this._activeSheet || this.getSheets()[0] || null;
  }

  toast(message, title) {
    console.log(`[TOAST] ${title || 'Info'}: ${message}`);
  }

  loadFromJSON(data) {
    if (!data.sheets) return;
    for (const [name, sheetData] of Object.entries(data.sheets)) {
      const sheet = this.insertSheet(name);
      if (sheetData.data) {
        sheet._data = sheetData.data.map(row => [...row]);
      }
    }
  }

  toJSON() {
    const result = { sheets: {} };
    for (const [name, sheet] of this._sheets) {
      result.sheets[name] = { data: sheet._data };
    }
    return result;
  }
}

module.exports = { Spreadsheet, Sheet, Range };
