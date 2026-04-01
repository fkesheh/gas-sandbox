# gas-sandbox

Run Google Apps Script projects locally with a sandboxed spreadsheet environment, mock HTTP services, and XLSX export.

## Features

- **Sandbox execution** — Run `.gs` functions in an isolated Node.js VM with full `SpreadsheetApp`, `UrlFetchApp`, `PropertiesService`, `ScriptApp`, and `Utilities` shims.
- **Mock HTTP responses** — Define canned responses for `UrlFetchApp.fetch()` calls so your scripts never hit real endpoints during testing.
- **HTTP capture** — Record live API responses and export them as mock files with built-in PII masking.
- **JSON / XLSX export** — Export the in-memory spreadsheet to JSON or `.xlsx` files.
- **.env support** — Loads `.env` and `.env.local` files so `PropertiesService` returns your local config values.
- **Test helpers** — `createTestRunner`, `buildSheetData`, `assertSheet`, and more for writing tests against your GAS project.

## Install

```bash
npm install gas-sandbox
```

Or run directly:

```bash
npx gas-sandbox -p ./my-gas-project -r main
```

## Quick Start

```typescript
import { GASRunner } from 'gas-sandbox';

const runner = new GASRunner({
  httpMode: 'mock',
  skipSleep: true,
  mockResponses: {
    'api.example.com/data': { statusCode: 200, body: { items: [1, 2, 3] } }
  }
});

runner.loadProject('./my-gas-project');
runner.run('processData');
runner.exportXlsx('output.xlsx');
```

## CLI

```
gas-sandbox --project <dir> --run <function> [options]
```

| Flag | Short | Description |
|------|-------|-------------|
| `--project <dir>` | `-p` | Directory containing `.gs` files (required) |
| `--run <function>` | `-r` | Function to execute |
| `--data <file>` | `-d` | Load spreadsheet data from JSON |
| `--output <file>` | `-o` | Export spreadsheet data after execution (JSON) |
| `--output-xlsx <file>` | | Export spreadsheet data after execution (XLSX) |
| `--env <file>` | `-e` | Path to `.env` file (default: project dir) |
| `--mock` | | Use mock HTTP — no real API calls |
| `--mock-file <file>` | | Load mock responses from JSON file |
| `--capture-mocks <file>` | | Capture live HTTP responses to a mock file |
| `--mask-emails` | | Mask email addresses in captured data |
| `--mask-ids` | | Mask UUIDs and hex IDs in captured data |
| `--mask-fields <list>` | | Comma-separated field names to mask |
| `--mask-pattern <regex>` | | Regex pattern to replace with `[MASKED]` |
| `--skip-sleep` | | Skip `Utilities.sleep()` calls |
| `--list` | | List available functions and exit |
| `--help` | `-h` | Show help |

### Examples

```bash
# List all functions in a project
gas-sandbox -p ./my-gas-project --list

# Run with mock HTTP and export to XLSX
gas-sandbox -p ./my-gas-project -r processData --mock-file mocks.json --output-xlsx report.xlsx

# Run live and export JSON + XLSX
gas-sandbox -p ./my-gas-project -r fetchReport --skip-sleep -o data.json --output-xlsx report.xlsx

# Capture live responses with PII masking
gas-sandbox -p ./my-gas-project -r fetchData --capture-mocks mocks.json --mask-emails --mask-fields name,userId
```

## Programmatic API

### `GASRunner`

```typescript
import { GASRunner } from 'gas-sandbox';
```

#### Constructor Options

```typescript
interface GASRunnerOptions {
  httpMode?: 'mock' | 'live' | 'capture';
  skipSleep?: boolean;
  mockResponses?: Record<string, MockResponse>;
  envPath?: string;
  projectDir?: string;
}
```

#### Methods

| Method | Description |
|--------|-------------|
| `loadProject(dir: string)` | Load all `.gs` files from the given directory |
| `loadData(pathOrObj: string \| SpreadsheetJSON)` | Load spreadsheet data from JSON file or object |
| `run(fn: string, ...args)` | Execute a top-level GAS function by name |
| `listFunctions(): string[]` | List all available function names |
| `getSpreadsheet(): Spreadsheet` | Access the in-memory spreadsheet |
| `getSheetData(name: string)` | Get raw 2D array of a sheet's data |
| `exportData(path: string)` | Write spreadsheet state to a JSON file |
| `exportXlsx(path: string)` | Write spreadsheet state to an `.xlsx` file |
| `exportMocks(path: string, mask?: MaskOptions)` | Export captured HTTP responses (capture mode) |
| `getCapturedResponses()` | Get the Map of captured HTTP responses |

#### Types

```typescript
interface MockResponse {
  statusCode?: number;
  body?: unknown;
}

interface SpreadsheetJSON {
  sheets: Record<string, { data: CellValue[][] }>;
}
```

## Mock HTTP

### Inline mock responses

```typescript
const runner = new GASRunner({
  httpMode: 'mock',
  mockResponses: {
    'api.example.com/users': {
      statusCode: 200,
      body: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
    }
  }
});
```

URL matching is substring-based — `'api.example.com/users'` matches any URL containing that string.

### Mock file (JSON)

Create a `mocks.json`:

```json
{
  "api.example.com/users": {
    "statusCode": 200,
    "body": [{ "id": 1, "name": "Alice" }]
  }
}
```

```bash
gas-sandbox -p ./my-gas-project -r fetchUsers --mock-file mocks.json
```

## HTTP Capture & Masking

Record live API responses during execution, then replay them offline. Masking options sanitize PII before saving.

### Capture workflow

```bash
# 1. Record real API responses with PII masked
gas-sandbox -p ./my-gas-project -r fetchData \
  --capture-mocks mocks.json \
  --mask-emails --mask-fields name,userId

# 2. Replay offline in tests — no API calls
gas-sandbox -p ./my-gas-project -r fetchData \
  --mock-file mocks.json --skip-sleep
```

### Masking options

| Option | Effect | Example |
|--------|--------|---------|
| `--mask-emails` | `alice@corp.com` → `user-1@example.com` | Deterministic — same email always maps to same fake |
| `--mask-ids` | UUIDs/hex IDs → `id-0001` | Matches UUIDs and 12+ char hex strings |
| `--mask-fields name,userId` | Field values → `name-1`, `userId-1` | Deterministic per-field counters |
| `--mask-pattern <regex>` | Regex matches → `[MASKED]` | Custom pattern replacement |

### Programmatic capture

```typescript
import { GASRunner, DataMasker } from 'gas-sandbox';

const runner = new GASRunner({ httpMode: 'capture', skipSleep: true });
runner.loadProject('./my-gas-project');
runner.run('fetchData');

runner.exportMocks('mocks.json', {
  emails: true,
  fields: ['name', 'userId'],
});
```

## XLSX Export

### CLI

```bash
gas-sandbox -p ./my-gas-project -r generateReport --output-xlsx report.xlsx
```

### Programmatic

```typescript
runner.loadProject('./my-gas-project');
runner.run('buildReport');
runner.exportXlsx('report.xlsx');
```

The exported file contains one worksheet per in-memory sheet, preserving sheet names and cell values.

## Environment

gas-sandbox loads environment variables in this order (later files override earlier ones):

1. System environment variables
2. `.env` in the project directory
3. `.env.local` in the project directory
4. Custom path via `--env <path>` flag

Variables are available through `PropertiesService.getScriptProperties()`:

```javascript
// In your .gs code
var token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
```

## Test Helpers

gas-sandbox exports utilities for writing tests against your GAS project:

```typescript
import {
  createTestRunner,
  buildSheetData,
  assertSheet,
  assertCell,
  getSheetAsRecords,
  runAndNormalize,
  cleanupTestEnv,
} from 'gas-sandbox';
```

| Helper | Description |
|--------|-------------|
| `createTestRunner(opts)` | Create a `GASRunner` with mock/skipSleep defaults, load data and project in one call |
| `buildSheetData(sheets)` | Build `SpreadsheetJSON` from `{ headers, rows }` format |
| `assertSheet(runner, name)` | Assert a sheet exists and return it (throws if missing) |
| `assertCell(runner, sheet, row, col, expected)` | Assert a cell value (1-indexed) |
| `getSheetAsRecords(runner, name)` | Read sheet as array of `{ header: value }` objects |
| `getDataRowCount(runner, name)` | Get row count excluding header |
| `runAndNormalize(runner, fn, ...args)` | Run function + JSON round-trip to normalize cross-VM objects |
| `cleanupTestEnv(keys)` | Delete env vars set during testing |

### Example test

```typescript
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestRunner, buildSheetData, runAndNormalize, cleanupTestEnv } from 'gas-sandbox';

describe('My GAS project', () => {
  afterEach(() => cleanupTestEnv(['API_TOKEN']));

  it('processes data correctly', () => {
    const runner = createTestRunner({
      projectDir: './my-gas-project',
      data: buildSheetData({
        'Raw Data': {
          headers: ['Name', 'Score'],
          rows: [['Alice', 95], ['Bob', 87]],
        }
      }),
      mockResponses: {
        'api.example.com/config': { statusCode: 200, body: { threshold: 90 } }
      },
      env: { API_TOKEN: 'test-token' },
    });

    const result = runAndNormalize(runner, 'processScores');
    assert.equal(result.aboveThreshold, 1);
  });
});
```

## Using in Your GAS Project

1. **Install gas-sandbox**:

   ```bash
   npm init -y && npm install -D gas-sandbox tsx @types/node
   ```

2. **Create `.env.local`** next to your `.gs` files with API keys:

   ```
   API_TOKEN=Bearer your-token-here
   ```

3. **Capture mock data** from a live run:

   ```bash
   npx gas-sandbox -p . -r myFunction --capture-mocks mocks.json --mask-emails --mask-fields name
   ```

4. **Write tests** at `test/my-project.test.ts` using the captured mocks.

5. **Add scripts** to `package.json`:

   ```json
   {
     "scripts": {
       "test": "tsx --test test/*.test.ts",
       "run": "gas-sandbox -p . -r myFunction --skip-sleep",
       "run:export": "gas-sandbox -p . -r myFunction --skip-sleep --output-xlsx report.xlsx",
       "run:mock": "gas-sandbox -p . -r myFunction --mock-file mocks.json --skip-sleep",
       "capture": "gas-sandbox -p . -r myFunction --capture-mocks mocks.json --mask-emails --mask-fields name"
     }
   }
   ```

6. **Run**:

   ```bash
   npm test              # Run tests with mocked data
   npm run run:export    # Live run with XLSX export
   npm run run:mock      # Offline run with captured mocks
   npm run capture       # Re-capture fresh mock data
   ```
