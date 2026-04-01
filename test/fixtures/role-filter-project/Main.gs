function fetchTeamMembers() {
  var token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  var response = UrlFetchApp.fetch(API_BASE_URL + '/teams/' + TEAM_ID + '/members', {
    method: 'GET',
    headers: { 'Authorization': token },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('API request failed: ' + response.getResponseCode());
  }

  return JSON.parse(response.getContentText());
}

function filterActiveMembers(data) {
  var allMembers = data.members || [];
  var active = allMembers.filter(function(m) { return m.role !== 'observer'; });

  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName('Results');
  if (!sheet) {
    sheet = ss.insertSheet('Results');
  }

  sheet.getRange(1, 1, 1, 3).setValues([['Name', 'Email', 'Role']]);

  for (var i = 0; i < active.length; i++) {
    sheet.getRange(i + 2, 1, 1, 3).setValues([[
      active[i].name, active[i].email, active[i].role
    ]]);
  }

  return {
    totalMembers: allMembers.length,
    activeMembers: active.length,
    excludedCount: allMembers.length - active.length
  };
}

function processTeam() {
  var data = fetchTeamMembers();
  return filterActiveMembers(data);
}
