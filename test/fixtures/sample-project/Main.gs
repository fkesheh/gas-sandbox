function greet() {
  return 'Hello from GAS Sandbox!';
}

function addNumbers(a, b) {
  return a + b;
}

function getAppName() {
  return APP_NAME;
}

function writeToSheet() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName('Output');
  if (!sheet) {
    sheet = ss.insertSheet('Output');
  }
  sheet.getRange(1, 1).setValue('Result');
  sheet.getRange(2, 1).setValue(42);
}

function fetchData() {
  var response = UrlFetchApp.fetch('https://api.example.com/data', {
    method: 'GET',
    muteHttpExceptions: true
  });
  return JSON.parse(response.getContentText());
}

function readProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}
