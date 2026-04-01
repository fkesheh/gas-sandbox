#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import { GASRunner } from './runner.js';
import type { MockResponse } from './globals.js';
import type { MaskOptions } from './masking.js';

interface CLIOptions {
  project?: string;
  run?: string;
  data?: string;
  output?: string;
  outputXlsx?: string;
  envPath?: string;
  httpMode?: 'mock' | 'capture';
  mockFile?: string;
  mockResponses?: Record<string, MockResponse>;
  captureMocks?: string;
  maskEmails?: boolean;
  maskIds?: boolean;
  maskFields?: string[];
  maskPattern?: string;
  skipSleep?: boolean;
  list?: boolean;
}

const args = process.argv.slice(2);
const opts: CLIOptions = {};
let i = 0;

while (i < args.length) {
  switch (args[i]) {
    case '--project': case '-p': opts.project = path.resolve(args[++i]); break;
    case '--run': case '-r': opts.run = args[++i]; break;
    case '--data': case '-d': opts.data = path.resolve(args[++i]); break;
    case '--output': case '-o': opts.output = path.resolve(args[++i]); break;
    case '--output-xlsx': opts.outputXlsx = path.resolve(args[++i]); break;
    case '--env': case '-e': opts.envPath = path.resolve(args[++i]); break;
    case '--mock': opts.httpMode = 'mock'; break;
    case '--mock-file': opts.mockFile = path.resolve(args[++i]); break;
    case '--skip-sleep': opts.skipSleep = true; break;
    case '--list': opts.list = true; break;
    case '--capture-mocks': opts.captureMocks = path.resolve(args[++i]); break;
    case '--mask-emails': opts.maskEmails = true; break;
    case '--mask-ids': opts.maskIds = true; break;
    case '--mask-fields': opts.maskFields = args[++i].split(','); break;
    case '--mask-pattern': opts.maskPattern = args[++i]; break;
    case '--help': case '-h': printHelp(); process.exit(0);
    default:
      console.error(`Unknown option: ${args[i]}`);
      printHelp();
      process.exit(1);
  }
  i++;
}

if (!opts.project) {
  console.error('Error: --project is required');
  printHelp();
  process.exit(1);
}

if (opts.mockFile) {
  opts.httpMode = 'mock';
  opts.mockResponses = JSON.parse(fs.readFileSync(opts.mockFile, 'utf-8'));
}

if (opts.captureMocks) {
  (opts as Record<string, unknown>).httpMode = 'capture';
}

try {
  const runner = new GASRunner(opts);

  if (opts.data) runner.loadData(opts.data);

  runner.loadProject(opts.project);

  if (opts.list) {
    console.log('\nAvailable functions:');
    runner.listFunctions().forEach((fn: string) => console.log(`  ${fn}`));
    process.exit(0);
  }

  if (!opts.run) {
    console.error('Error: --run is required (or use --list)');
    process.exit(1);
  }

  runner.run(opts.run);

  if (opts.output) runner.exportData(opts.output);
  if (opts.outputXlsx) runner.exportXlsx(opts.outputXlsx);

  if (opts.captureMocks) {
    const maskOptions: MaskOptions = {};
    if (opts.maskEmails) maskOptions.emails = true;
    if (opts.maskIds) maskOptions.ids = true;
    if (opts.maskFields) maskOptions.fields = opts.maskFields;
    if (opts.maskPattern) maskOptions.patterns = [{ regex: new RegExp(opts.maskPattern, 'g'), replacement: '[MASKED]' }];
    runner.exportMocks(opts.captureMocks, maskOptions);
  }

} catch (error) {
  console.error(`\nFatal: ${(error as Error).message}`);
  if (process.env.DEBUG) console.error((error as Error).stack);
  process.exit(1);
}

function printHelp(): void {
  console.log(`
gas-sandbox — Run Google Apps Script projects locally

Usage:
  gas-sandbox --project <dir> --run <function> [options]

Options:
  -p, --project <dir>    Directory containing .gs files (required)
  -r, --run <function>   Function to execute
  -d, --data <file>      Load spreadsheet data from JSON
  -o, --output <file>    Export spreadsheet data after execution (JSON)
  --output-xlsx <file>   Export spreadsheet data after execution (XLSX)
  -e, --env <file>       Path to .env file (default: ./.env)
  --mock                 Use mock HTTP (no real API calls)
  --mock-file <file>     Load mock responses from JSON
  --capture-mocks <file> Capture live HTTP responses to a mock file
  --mask-emails          Mask email addresses in captured data
  --mask-ids             Mask UUIDs and hex IDs in captured data
  --mask-fields <list>   Comma-separated field names to mask
  --mask-pattern <regex> Regex pattern to replace with [MASKED]
  --skip-sleep           Skip Utilities.sleep() calls
  --list                 List available functions
  -h, --help             Show this help

Environment:
  Script properties are read from .env / .env.local files.

Examples:
  gas-sandbox -p ./my-gas-project --list
  gas-sandbox -p ./my-gas-project -r myFunction -d data.json -o output.json
  gas-sandbox -p ./my-gas-project -r processData --mock-file mocks.json
  gas-sandbox -p ./my-gas-project -r generateReport --output-xlsx report.xlsx
  gas-sandbox -p ./my-gas-project -r fetchData --capture-mocks mocks.json --mask-emails --mask-ids
`);
}
