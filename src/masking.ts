export interface MaskOptions {
  emails?: boolean;
  ids?: boolean;
  fields?: string[];
  patterns?: Array<{ regex: RegExp; replacement: string }>;
}

/**
 * Deterministic masking — same input always produces same output.
 * Uses an internal map to track replacements.
 */
export class DataMasker {
  private _emailMap: Map<string, string> = new Map();
  private _idMap: Map<string, string> = new Map();
  private _fieldMaps: Map<string, Map<string, string>> = new Map();
  private _emailCounter: number = 0;
  private _idCounter: number = 0;
  private _fieldCounters: Map<string, number> = new Map();
  private _options: MaskOptions;

  constructor(options: MaskOptions) {
    this._options = options;
  }

  /**
   * Mask a complete mock responses object (the format used by --mock-file).
   */
  maskMockFile(mocks: Record<string, { statusCode: number; body: unknown }>): Record<string, { statusCode: number; body: unknown }> {
    const result: Record<string, { statusCode: number; body: unknown }> = {};
    for (const [url, response] of Object.entries(mocks)) {
      const maskedUrl = this._maskString(url);
      result[maskedUrl] = {
        statusCode: response.statusCode,
        body: this._maskValue(response.body),
      };
    }
    return result;
  }

  /**
   * Recursively mask a value (object, array, or string).
   */
  private _maskValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return this._maskString(value);
    }
    if (Array.isArray(value)) {
      return value.map(item => this._maskValue(item));
    }
    if (value !== null && typeof value === 'object') {
      return this._maskObject(value as Record<string, unknown>);
    }
    return value;
  }

  private _maskObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (this._options.fields?.includes(key)) {
        result[key] = typeof value === 'string'
          ? this._getOrCreateFieldValue(key, value)
          : '***';
        continue;
      }
      result[key] = this._maskValue(value);
    }
    return result;
  }

  private _maskString(value: string): string {
    let result = value;

    if (this._options.emails) {
      result = result.replace(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        (match) => this._getOrCreateEmail(match)
      );
    }

    if (this._options.ids) {
      result = result.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        (match) => this._getOrCreateId(match)
      );
      result = result.replace(
        /\b[0-9a-f]{12,}\b/gi,
        (match) => this._getOrCreateId(match)
      );
    }

    if (this._options.patterns) {
      for (const { regex, replacement } of this._options.patterns) {
        result = result.replace(regex, replacement);
      }
    }

    return result;
  }

  private _getOrCreateEmail(original: string): string {
    if (!this._emailMap.has(original)) {
      this._emailCounter++;
      this._emailMap.set(original, `user-${this._emailCounter}@example.com`);
    }
    return this._emailMap.get(original)!;
  }

  private _getOrCreateFieldValue(fieldName: string, original: string): string {
    if (!this._fieldMaps.has(fieldName)) {
      this._fieldMaps.set(fieldName, new Map());
      this._fieldCounters.set(fieldName, 0);
    }
    const fieldMap = this._fieldMaps.get(fieldName)!;
    if (!fieldMap.has(original)) {
      const counter = this._fieldCounters.get(fieldName)! + 1;
      this._fieldCounters.set(fieldName, counter);
      fieldMap.set(original, `${fieldName}-${counter}`);
    }
    return fieldMap.get(original)!;
  }

  private _getOrCreateId(original: string): string {
    if (!this._idMap.has(original)) {
      this._idCounter++;
      this._idMap.set(original, `id-${String(this._idCounter).padStart(4, '0')}`);
    }
    return this._idMap.get(original)!;
  }

  getMappings(): { emails: Record<string, string>; ids: Record<string, string> } {
    return {
      emails: Object.fromEntries(this._emailMap),
      ids: Object.fromEntries(this._idMap),
    };
  }
}
