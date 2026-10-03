export const CalendarFeature = Object.freeze({
  CREATE: 1,
  DELETE: 2,
  UPDATE: 4,
});

export const dateKeyInTimeZone = (date, timeZone) => {
  if (!timeZone) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};


export const isDateOnly = (value = '') => /^\d{4}-\d{2}-\d{2}$/.test(value);

export const addDaysToDate = (value, amount) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
};

export const eventTimestamp = (event) => {
  if (isDateOnly(event.start)) {
    const [year, month, day] = event.start.split('-').map(Number);
    return new Date(year, month - 1, day).getTime();
  }
  return new Date(event.start).getTime();
};

export const normalizeApiDate = (value) => {
  if (typeof value === 'string') return value;
  if (value?.dateTime) return value.dateTime;
  if (value?.date) return value.date;
  return '';
};

export const normalizeEvent = (event, calendar) => ({
  calendar,
  summary: event.summary || 'Untitled event',
  description: event.description || '',
  location: event.location || '',
  start: normalizeApiDate(event.start),
  end: normalizeApiDate(event.end),
  uid: event.uid || '',
  recurrence_id: event.recurrence_id || '',
  rrule: event.rrule || '',
});

export const eventKey = (event) => [
  event.calendar,
  event.uid || event.summary,
  event.recurrence_id || event.start,
].join('|');

export const visibleEvents = (events, config) => {
  const sorted = [...events].sort((a, b) => eventTimestamp(a) - eventTimestamp(b));
  if (config.limit_mode === 'days') return sorted;
  return sorted.slice(0, Math.max(1, Number(config.max_events) || 8));
};

const calendarDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const monthGridDates = (year, month, weekStart = 'monday') => {
  const first = new Date(year, month, 1);
  const weekStartsOn = weekStart === 'sunday' ? 0 : 1;
  const leading = (first.getDay() - weekStartsOn + 7) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const dates = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= count; day += 1) {
    dates.push(calendarDateKey(new Date(year, month, day)));
  }
  return dates;
};

const calendarTimestamp = (value) => new Date(isDateOnly(value) ? `${value}T00:00:00` : value).getTime();

export const eventsOnDate = (events, dateKey) => {
  const start = new Date(`${dateKey}T00:00:00`);
  const dayStart = start.getTime();
  const next = new Date(start);
  next.setDate(next.getDate() + 1);
  const dayEnd = next.getTime();
  return events.filter((event) => {
    const eventStart = calendarTimestamp(event.start);
    const eventEnd = calendarTimestamp(event.end);
    return eventStart < dayEnd && eventEnd > dayStart;
  });
};

const dayNumber = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;

export const relativeDateDescriptor = (date, now, locale = 'en') => {
  const days = dayNumber(date) - dayNumber(now);
  const norwegian = /^(nb|nn|no)(-|$)/i.test(locale);
  if (days <= 0) return { label: norwegian ? 'I dag' : 'Today', includeTime: true };
  if (days === 1) return { label: norwegian ? 'I morgen' : 'Tomorrow', includeTime: true };

  const mondayIndex = (value) => (value.getDay() + 6) % 7;
  const targetWeek = dayNumber(date) - mondayIndex(date);
  const currentWeek = dayNumber(now) - mondayIndex(now);
  const weeks = Math.round((targetWeek - currentWeek) / 7);
  if (weeks === 0) {
    return {
      label: new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date),
      includeTime: true,
    };
  }
  if (weeks === 1) return { label: norwegian ? 'Neste uke' : 'Next week', includeTime: false };
  return {
    label: norwegian ? `Om ${weeks} uker` : `In ${weeks} weeks`,
    includeTime: false,
  };
};

export const eventToDraft = (event) => {
  const allDay = isDateOnly(event.start);
  if (allDay) {
    return {
      calendar: event.calendar,
      summary: event.summary,
      description: event.description,
      location: event.location,
      allDay: true,
      startDate: event.start,
      startTime: '09:00',
      endDate: addDaysToDate(event.end, -1),
      endTime: '10:00',
    };
  }

  const start = new Date(event.start);
  const end = new Date(event.end);
  const localParts = (date) => ({
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
  });
  const startParts = localParts(start);
  const endParts = localParts(end);
  return {
    calendar: event.calendar,
    summary: event.summary,
    description: event.description,
    location: event.location,
    allDay: false,
    startDate: startParts.date,
    startTime: startParts.time,
    endDate: endParts.date,
    endTime: endParts.time,
  };
};

export const draftToEvent = (draft) => {
  if (!draft.summary.trim()) throw new Error('Title is required.');
  if (!draft.startDate || !draft.endDate) throw new Error('Start and end dates are required.');

  let dtstart;
  let dtend;
  if (draft.allDay) {
    dtstart = draft.startDate;
    dtend = addDaysToDate(draft.endDate, 1);
    if (dtend <= dtstart) throw new Error('End date must not be before start date.');
  } else {
    if (!draft.startTime || !draft.endTime) throw new Error('Start and end times are required.');
    const start = new Date(`${draft.startDate}T${draft.startTime}`);
    const end = new Date(`${draft.endDate}T${draft.endTime}`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error('Enter valid dates and times.');
    if (end <= start) throw new Error('End must be after start.');
    dtstart = start.toISOString();
    dtend = end.toISOString();
  }

  return {
    summary: draft.summary.trim(),
    dtstart,
    dtend,
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.location.trim() ? { location: draft.location.trim() } : {}),
  };
};
