# Changelog

## [0.2.0] - 2026-04-01

### Added
- TypeScript migration — full codebase rewritten from JS to TS with strict types
- XLSX export via `exportXlsx()` method
- HTTP capture mode (`httpMode: 'capture'`) to record external API calls during execution
- Data masking support for captured HTTP responses (emails, IDs, custom fields/patterns)
- Per-file code coverage for `.gs` files using c8
- `test:coverage` npm script for HTML + text coverage reports
- `exportMocks()` method to save captured HTTP responses as mock fixtures

### Changed
- `.gs` files are now loaded individually via `vm.runInContext` (instead of concatenated) to enable per-file coverage reporting
- Top-level `const`/`let` declarations in `.gs` files are converted to `var` to preserve GAS flat-namespace semantics across files

## [0.1.0] - 2026-03-31

### Added
- Initial release — run Google Apps Script projects locally with sandboxed spreadsheet
- `GASRunner` class with `loadProject()`, `loadData()`, `run()`, `listFunctions()`
- Mock implementations for `SpreadsheetApp`, `Logger`, `Utilities`, `UrlFetchApp`
- JSON data import/export for spreadsheet state
- CLI tool (`gas-sandbox`) for command-line execution
