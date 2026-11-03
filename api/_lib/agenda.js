const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function agendaError(status, code, message) {
  return Object.assign(new Error(message), { status, code, safeToExpose: true });
}

function isMeetingTitle(title) {
  const match = typeof title === 'string' && title.match(DATE_PATTERN);
  if (!match) return false;
  const [, day, month, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return parsed.getFullYear() === Number(year) && parsed.getMonth() === Number(month) - 1 && parsed.getDate() === Number(day);
}

async function listMeetings(sheetsClient, spreadsheetId) {
  if (!spreadsheetId) throw agendaError(503, 'AGENDA_CONFIG_MISSING', 'Agenda source is not configured.');
  const { data } = await sheetsClient.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  return (data.sheets || [])
    .map((sheet) => sheet?.properties?.title)
    .filter(isMeetingTitle)
    .sort((a, b) => {
      const [ad, am, ay] = a.split('/').map(Number);
      const [bd, bm, by] = b.split('/').map(Number);
      return Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
    })
    .map((date) => ({ date, title: date }));
}

function normalized(value) { return String(value || '').toLowerCase().replace(/[^a-z]/g, ''); }
function nextWeek(date) {
  const [day, month, year] = date.split('/').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 7));
  return `${String(next.getUTCDate()).padStart(2, '0')}/${String(next.getUTCMonth() + 1).padStart(2, '0')}/${next.getUTCFullYear()}`;
}
function normalizeSheetDate(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}/${match[3]}` : '';
}
function columnName(index) {
  let value = index + 1;
  let name = '';
  while (value > 0) { value--; name = String.fromCharCode(65 + value % 26) + name; value = Math.floor(value / 26); }
  return name;
}

async function readMeeting(sheetsClient, spreadsheetId, date) {
  if (!isMeetingTitle(date)) throw agendaError(400, 'INVALID_MEETING_DATE', 'Choose a valid meeting date.');
  if (!spreadsheetId) throw agendaError(503, 'AGENDA_CONFIG_MISSING', 'Agenda source is not configured.');
  const getRange = range => sheetsClient.spreadsheets.values.batchGet({ spreadsheetId, ranges: [range], valueRenderOption: 'FORMATTED_VALUE' });
  const [meetingResult, teamsResult] = await Promise.allSettled([getRange(`'${date}'!P1:AR66`), getRange("'Chairing Teams 26/27'!B2:E100")]);
  if (meetingResult.status === 'rejected') throw meetingResult.reason;
  const rows = meetingResult.value.data.valueRanges?.[0]?.values || [];
  if (!rows.length) throw agendaError(422, 'AGENDA_DATA_MISSING', 'The selected meeting sheet has no data.');
  const teams = teamsResult.status === 'fulfilled' ? teamsResult.value.data.valueRanges?.[0]?.values || [] : [];
  const warnings = [];
  const optional = (value, description) => {
    const text = String(value || '').trim();
    if (!text || /^#|^\?+$/.test(text)) { warnings.push(description); return ''; }
    return text;
  };
  const findHeader = (row, name) => {
    const matches = (row || []).map((value, index) => normalized(value) === normalized(name) ? index : -1).filter(index => index >= 0);
    if (matches.length !== 1) { warnings.push(`Column ${name} is unavailable or ambiguous.`); return -1; }
    return matches[0];
  };
  const attendanceHeaders = rows[2] || [];
  const groups = [['members', 'Members'], ['new members', 'New-Members'], ['externals', 'External-Members'], ['parachutes', 'Parachutes']];
  const attendeesByCategory = {};
  const attendanceCounts = {};
  for (const [key, label] of groups) {
    const index = findHeader(attendanceHeaders, label);
    if (index < 0 || normalized(attendanceHeaders[index + 1]) !== 'presences') {
      warnings.push(`Presence data for ${label} is unavailable.`); attendeesByCategory[key] = []; attendanceCounts[key] = null; continue;
    }
    let incomplete = false;
    attendeesByCategory[key] = rows.slice(3, 61).flatMap((row, offset) => {
      if (String(row[index + 1] || '').trim() !== 'Present') return [];
      const cell = `${columnName(index + 15)}${offset + 4}`;
      const name = optional(row[index], `The ${label} name in cell ${cell} is missing, but the person is marked present.`);
      if (!name) { incomplete = true; return []; }
      return [name];
    });
    attendanceCounts[key] = incomplete ? null : attendeesByCategory[key].length;
  }
  const chairColumn = findHeader(rows[1], 'Chairing Team');
  const chairingTeam = {};
  for (const [key, label, rowIndex] of [['mainChair', 'Main Chair', 2], ['speakers', 'Speakers', 4], ['minutes', 'Minutes', 6]]) {
    chairingTeam[key] = chairColumn >= 0 && normalized(rows[rowIndex]?.[chairColumn]) === normalized(label)
      ? optional(rows[rowIndex + 1]?.[chairColumn], `Current chairing team field ${label} is missing.`)
      : (warnings.push(`Current chairing team field ${label} is unavailable.`), '');
  }
  const teamHeaders = teams[0] || [];
  const teamColumns = { date: findHeader(teamHeaders, 'Date (day/month/year)'), mainChair: findHeader(teamHeaders, 'Main Chair'), minutes: findHeader(teamHeaders, 'Minutes'), speakers: findHeader(teamHeaders, 'Speakers') };
  const targetDate = nextWeek(date);
  const matchingTeams = teamColumns.date < 0 ? [] : teams.slice(1).filter(row => normalizeSheetDate(row[teamColumns.date]) === targetDate);
  if (matchingTeams.length !== 1) warnings.push(`The chairing team for ${targetDate} is unavailable or ambiguous.`);
  const nextChairingTeam = {};
  for (const key of ['mainChair', 'minutes', 'speakers']) nextChairingTeam[key] = matchingTeams.length === 1 && teamColumns[key] >= 0 ? optional(matchingTeams[0][teamColumns[key]], `The chairing team for ${targetDate} is incomplete.`) : '';
  const headers = rows[1] || [];
  const columns = { title: findHeader(headers, 'Topic'), speaker: findHeader(headers, 'Speaker'), type: findHeader(headers, 'Type (P/D/V)'), start: findHeader(headers, 'Real Start'), end: findHeader(headers, 'Real End') };
  const topicRows = columns.title < 0 ? [] : rows.slice(4, 66).filter(row => String(row[columns.title] || '').trim());
  if (!topicRows.length) warnings.push('No agenda topics were available.');
  const topics = topicRows.map(row => {
    const title = optional(row[columns.title], 'An agenda topic has an invalid title.');
    const speaker = optional(row[columns.speaker], 'An agenda topic is missing a speaker.');
    let type = optional(row[columns.type], 'An agenda topic is missing its intervention type.');
    if (type && !/^[PDV](?:\s*\/\s*[PDV])*$/i.test(type)) { warnings.push('An agenda topic has an invalid intervention type.'); type = ''; }
    return { title, speaker, type: type.toUpperCase().replace(/\s+/g, '') };
  }).filter(topic => topic.title);
  let start = optional(topicRows[0]?.[columns.start], 'The meeting start time is missing.');
  let end = optional(topicRows[topicRows.length - 1]?.[columns.end], 'The meeting end time is missing.');
  const timePattern = /^(?:[01]?\d|2[0-3]):[0-5]\d(?::\s*)?(?:\s*[AP]M)?$/i;
  if (start && !timePattern.test(start)) { warnings.push('The meeting start time is invalid.'); start = ''; }
  if (end && !timePattern.test(end)) { warnings.push('The meeting end time is invalid.'); end = ''; }
  return { date, start, end, attendeesByCategory, attendanceCounts, chairingTeam, nextChairingTeam, topics, warnings: [...new Set(warnings)] };
}

module.exports = { isMeetingTitle, listMeetings, readMeeting };
