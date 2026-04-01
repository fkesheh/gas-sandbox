#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { GASRunner } = require('../src/runner');

const args = process.argv.slice(2);
const opts = {};
let i = 0;

while (i < args.length) {
  switch (args[i]) {
    case '--project': case '-p': opts.project = path.resolve(args[++i]); break;
    case '--run': case '-r': opts.run = args[++i]; break;
    case '--data': case '-d': opts.data = path.resolve(args[++i]); break;
    case '--output': case '-o': opts.output = path.resolve(args[++i]); break;
    case '--env': case '-e': opts.envPath = path.resolve(args[++i]); break;
    case '--mock': opts.httpMode = 'mock'; break;
    case '--mock-file': opts.mockFile = path.resolve(args[++i]); break;
    case '--skip-sleep': opts.skipSleep = true; break;
    case '--list': opts.list = true; break;
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

try {
  const runner = new GASRunner(opts);

  if (opts.data) runner.loadData(opts.data);

  runner.loadProject(opts.project);

  if (opts.list) {
    console.log('\nAvailable functions:');
    runner.listFunctions().forEach(fn => console.log(`  ${fn}`));
    process.exit(0);
  }

  if (!opts.run) {
    console.error('Error: --run is required (or use --list)');
    process.exit(1);
  }

  runner.run(opts.run);

  if (opts.output) runner.exportData(opts.output);

} catch (error) {
  console.error(`\nFatal: ${error.message}`);
  if (process.env.DEBUG) console.error(error.stack);
  process.exit(1);
}

function printHelp() {
  console.log(`
gas-sandbox — Run Google Apps Script projects locally

Usage:
  gas-sandbox --project <dir> --run <function> [options]

Options:
  -p, --project <dir>    Directory containing .gs files (required)
  -r, --run <function>   Function to execute
  -d, --data <file>      Load spreadsheet data from JSON
  -o, --output <file>    Export spreadsheet data after execution
  -e, --env <file>       Path to .env file (default: ./.env)
  --mock                 Use mock HTTP (no real API calls)
  --mock-file <file>     Load mock responses from JSON
  --skip-sleep           Skip Utilities.sleep() calls
  --list                 List available functions
  -h, --help             Show this help

Environment:
  Script properties are read from .env (e.g., CURSOR_ADMIN_TOKEN).

Examples:
  gas-sandbox -p ../cursor-admin-sheet --list
  gas-sandbox -p ../cursor-admin-sheet -r updateAllSummaries -d data/raw.json -o data/out.json
  gas-sandbox -p ../cursor-admin-sheet -r fetchAndUpdateCursorData --skip-sleep
  gas-sandbox -p ../cursor-admin-sheet -r updateAllSummaries --mock-file mocks.json
`);
}
