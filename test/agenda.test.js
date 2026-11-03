const test = require('node:test');
const assert = require('node:assert/strict');
const { listMeetings, readMeeting } = require('../api/_lib/agenda');

test('lists only valid date-named sheets with the most recent first', async () => {
  const sheets = { spreadsheets: { get: async () => ({ data: { sheets: [
    { properties: { title: 'TEMPLATE.' } }, { properties: { title: '02/11/2026' } },
    { properties: { title: '31/02/2026' } }, { properties: { title: '26/10/2026' } },
  ] } }) } };
  assert.deepEqual(await listMeetings(sheets, 'source'), [
    { date: '02/11/2026', title: '02/11/2026' }, { date: '26/10/2026', title: '26/10/2026' },
  ]);
});

function fixture() {
  const rows = Array.from({ length: 8 }, () => Array(29).fill(''));
  Object.assign(rows[1], { 12: 'Chairing Team', 20: 'Real Start', 21: 'Real End', 25: 'Topic', 26: 'Speaker', 27: 'Type (P/D/V)' });
  Object.assign(rows[2], { 0: 'Members', 1: 'Presences', 5: 'New-Members', 6: 'Presences', 7: 'External-Members', 8: 'Presences', 9: 'Parachutes', 10: 'Presences', 12: 'Main Chair' });
  Object.assign(rows[3], { 0: 'Ana', 1: 'Present', 5: 'Ben', 6: 'Present', 12: 'Chair' });
  Object.assign(rows[4], { 12: 'Speakers', 20: '8:08: PM', 21: '8:15: PM', 25: 'First topic', 26: 'Speaker', 27: 'P/D' });
  Object.assign(rows[5], { 9: 'Guest', 10: 'Present', 12: 'Speaker', 20: '8:15: PM', 21: '8:32: PM', 25: 'Second topic', 26: 'Other', 27: 'V' });
  rows[6][12] = 'Minutes'; rows[7][12] = 'Note taker';
  const teams = [['Date\n(day/month/year)', 'Main Chair', 'Minutes', 'Speakers'], ['02/11/2026', 'Next chair', 'Next minutes', 'Next speaker']];
  return { rows, teams, sheets: { spreadsheets: { values: { batchGet: async ({ ranges }) => ({ data: { valueRanges: [{ values: ranges[0].includes('Chairing Teams') ? teams : rows }] } }) } } } };
}

test('reads the current layout and finds the team seven days later', async () => {
  const { sheets } = fixture();
  const meeting = await readMeeting(sheets, 'source', '26/10/2026');
  assert.equal(meeting.start, '8:08: PM');
  assert.equal(meeting.end, '8:32: PM');
  assert.deepEqual(meeting.attendeesByCategory, { members: ['Ana'], 'new members': ['Ben'], externals: [], parachutes: ['Guest'] });
  assert.deepEqual(meeting.nextChairingTeam, { mainChair: 'Next chair', minutes: 'Next minutes', speakers: 'Next speaker' });
  assert.deepEqual(meeting.topics.map(t => t.title), ['First topic', 'Second topic']);
});

test('keeps available fields and reports missing data for manual completion', async () => {
  const f = fixture();
  await assert.rejects(readMeeting(f.sheets, 'source', '31/02/2026'), { status: 400 });
  f.teams.pop();
  const partial = await readMeeting(f.sheets, 'source', '26/10/2026');
  assert.equal(partial.nextChairingTeam.mainChair, '');
  assert.ok(partial.warnings.some(x => x.includes('02/11/2026')));
  const g = fixture(); g.rows[2][9] = 'Unknown';
  assert.ok((await readMeeting(g.sheets, 'source', '26/10/2026')).warnings.length);
  const h = fixture(); h.rows[5][21] = '';
  assert.equal((await readMeeting(h.sheets, 'source', '26/10/2026')).end, '');
  const i = fixture(); i.rows[4][27] = 'unknown';
  assert.equal((await readMeeting(i.sheets, 'source', '26/10/2026')).topics[0].type, '');
  const j = fixture(); j.rows[3][0] = '';
  assert.equal((await readMeeting(j.sheets, 'source', '26/10/2026')).attendanceCounts.members, null);
});
