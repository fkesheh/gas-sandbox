export type CellValue = string | number | boolean | null;
export type RowData = CellValue[];
export type SheetData = RowData[];
export interface SheetJSON {
  data: SheetData;
}
export interface SpreadsheetJSON {
  sheets: Record<string, SheetJSON>;
}

export class Range {
  private _sheet: Sheet;
  private _row: number;
  private _col: number;
  private _numRows: number;
  private _numCols: number;

  constructor(sheet: Sheet, row: number, col: number, numRows: number, numCols: number) {
    this._sheet = sheet;
    this._row = row;
    this._col = col;
    this._numRows = numRows;
    this._numCols = numCols;
  }

  getValue(): CellValue {
    const r = this._row - 1;
    const c = this._col - 1;
    const data = this._sheet._data;
    if (r < data.length && c < data[r].length) {
      return data[r][c];
    }
    return '';
  }

  getValues(): CellValue[][] {
    const result: CellValue[][] = [];
    for (let r = 0; r < this._numRows; r++) {
      const row: CellValue[] = [];
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

  setValue(value: CellValue): Range {
    this._ensureSize(this._row, this._col);
    this._sheet._data[this._row - 1][this._col - 1] = value;
    return this;
  }

  setValues(values: CellValue[][]): Range {
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

  clear(): Range {
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

  private _ensureSize(row: number, col: number): void {
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

  setFontWeight(_weight?: string): Range { return this; }
  setBackground(_color?: string): Range { return this; }
  setFontColor(_color?: string): Range { return this; }
  setNumberFormat(_format?: string): Range { return this; }
  setFontSize(_size?: number): Range { return this; }
}

export class Sheet {
  _name: string;
  _data: CellValue[][];
  private _frozenRows: number;
  private _frozenColumns: number;
  private _sheetId: number;

  constructor(name: string) {
    this._name = name;
    this._data = [];
    this._frozenRows = 0;
    this._frozenColumns = 0;
    this._sheetId = Math.floor(Math.random() * 1000000);
  }

  getName(): string { return this._name; }
  getSheetId(): number { return this._sheetId; }
  setName(name: string): Sheet { this._name = name; return this; }

  getRange(row: number, col: number, numRows?: number, numCols?: number): Range {
    return new Range(this, row, col, numRows || 1, numCols || 1);
  }

  getLastRow(): number {
    for (let r = this._data.length - 1; r >= 0; r--) {
      if (this._data[r].some(cell => cell !== '' && cell !== null && cell !== undefined)) {
        return r + 1;
      }
    }
    return 0;
  }

  getLastColumn(): number {
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

  getMaxRows(): number {
    return Math.max(this._data.length, 1000);
  }

  getMaxColumns(): number {
    let max = 0;
    for (const row of this._data) {
      max = Math.max(max, row.length);
    }
    return Math.max(max, 26);
  }

  setFrozenRows(n: number): Sheet { this._frozenRows = n; return this; }
  setFrozenColumns(n: number): Sheet { this._frozenColumns = n; return this; }
  autoResizeColumns(_startCol?: number, _numCols?: number): Sheet { return this; }
  setColumnWidth(_col?: number, _width?: number): Sheet { return this; }
}

export class Spreadsheet {
  private _sheets: Map<string, Sheet>;
  private _activeSheet: Sheet | null;

  constructor() {
    this._sheets = new Map();
    this._activeSheet = null;
  }

  getSheetByName(name: string): Sheet | null {
    return this._sheets.get(name) || null;
  }

  insertSheet(name: string): Sheet {
    const sheet = new Sheet(name);
    this._sheets.set(name, sheet);
    if (!this._activeSheet) this._activeSheet = sheet;
    return sheet;
  }

  getSheets(): Sheet[] {
    return Array.from(this._sheets.values());
  }

  getActiveSheet(): Sheet | null {
    return this._activeSheet || this.getSheets()[0] || null;
  }

  toast(message: string, title?: string): void {
    console.log(`[TOAST] ${title || 'Info'}: ${message}`);
  }

  loadFromJSON(data: SpreadsheetJSON): void {
    if (!data.sheets) return;
    for (const [name, sheetData] of Object.entries(data.sheets)) {
      const sheet = this.insertSheet(name);
      if (sheetData.data) {
        sheet._data = sheetData.data.map(row => [...row]);
      }
    }
  }

  toJSON(): SpreadsheetJSON {
    const result: SpreadsheetJSON = { sheets: {} };
    for (const [name, sheet] of this._sheets) {
      result.sheets[name] = { data: sheet._data };
    }
    return result;
  }
}
