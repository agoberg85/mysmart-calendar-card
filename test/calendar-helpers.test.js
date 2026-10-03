import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKeyInTimeZone, draftToEvent, eventsOnDate, monthGridDates, normalizeEvent, relativeDateDescriptor, visibleEvents } from '../src/calendar-helpers.js';

test('normalizes REST calendar date shapes', () => {
  const event = normalizeEvent({
    summary: 'Holiday',
    start: { date: '2026-07-19' },
    end: { date: '2026-07-20' },
  }, 'calendar.family');
  assert.equal(event.start, '2026-07-19');
  assert.equal(event.calendar, 'calendar.family');
});

test('all-day form uses an exclusive API end date', () => {
  const event = draftToEvent({
    summary: 'Holiday', description: '', location: '', allDay: true,
    startDate: '2026-07-19', endDate: '2026-07-19', startTime: '', endTime: '',
  });
  assert.equal(event.dtend, '2026-07-20');
});

test('event mode merges, sorts, and limits events', () => {
  const events = [
    { start: '2026-07-21T10:00:00Z' },
    { start: '2026-07-19T10:00:00Z' },
    { start: '2026-07-20T10:00:00Z' },
  ];
  const result = visibleEvents(events, { limit_mode: 'events', max_events: 2 });
  assert.deepEqual(result.map((event) => event.start.slice(8, 10)), ['19', '20']);
});

test('formats compact Norwegian relative dates by calendar week', () => {
  const now = new Date(2026, 6, 19, 12);
  assert.deepEqual(relativeDateDescriptor(new Date(2026, 6, 19), now, 'nb-NO'), { label: 'I dag', includeTime: true });
  assert.deepEqual(relativeDateDescriptor(new Date(2026, 6, 20), now, 'nb-NO'), { label: 'I morgen', includeTime: true });
  assert.deepEqual(relativeDateDescriptor(new Date(2026, 6, 21), now, 'nb-NO'), { label: 'Neste uke', includeTime: false });
  assert.deepEqual(relativeDateDescriptor(new Date(2026, 6, 27), now, 'nb-NO'), { label: 'Om 2 uker', includeTime: false });
});

test('builds a locale-aware month grid', () => {
  const mondayFirst = monthGridDates(2025, 11, 'monday');
  assert.equal(mondayFirst[0], '2025-12-01');
  assert.equal(mondayFirst.at(-1), '2025-12-31');

  const sundayFirst = monthGridDates(2025, 11, 'sunday');
  assert.equal(sundayFirst[0], null);
  assert.equal(sundayFirst[1], '2025-12-01');
});

test('finds timed and all-day events on a selected date', () => {
  const events = [
    { start: '2025-12-28', end: '2025-12-29', summary: 'All day' },
    { start: '2025-12-28T15:00:00+01:00', end: '2025-12-28T16:00:00+01:00', summary: 'Timed' },
    { start: '2025-12-29', end: '2025-12-30', summary: 'Tomorrow' },
  ];
  assert.deepEqual(eventsOnDate(events, '2025-12-28').map((event) => event.summary), ['All day', 'Timed']);
});


test('uses the Home Assistant timezone for the current date', () => {
  const instant = new Date('2026-07-19T22:30:00Z');
  assert.equal(dateKeyInTimeZone(instant, 'Europe/Oslo'), '2026-07-20');
  assert.equal(dateKeyInTimeZone(instant, 'America/New_York'), '2026-07-19');
});
