import { LitElement, html, css, nothing } from 'lit';
import {
  CalendarFeature,
  dateKeyInTimeZone,
  draftToEvent,
  eventKey,
  eventToDraft,
  eventTimestamp,
  eventsOnDate,
  isDateOnly,
  monthGridDates,
  normalizeEvent,
  relativeDateDescriptor,
  visibleEvents,
} from './calendar-helpers.js';

const DEFAULT_CONFIG = Object.freeze({
  title: '',
  show_title: true,
  design: 'agenda',
  limit_mode: 'events',
  max_events: 8,
  days_to_show: 30,
  next_event_background: 'linear-gradient(135deg, #ef8fc6 0%, #f5c2c9 100%)',
  next_event_text_color: '#261821',
  event_background: 'color-mix(in srgb, var(--card-background-color, #242424) 82%, white 18%)',
  card_background: '',
  minimal_text_size: '16px',
  show_description: true,
  show_location: true,
  show_calendar: false,
  show_add_event_button: true,
  show_end_time: true,
  minimal_date_format: 'absolute',
  language: '',
  font_family: "'Space Grotesk', sans-serif",
  show_day_date: true,
  month_show_event_list: true,
  month_show_navigation: true,
  month_show_event_count: true,
  month_show_day_numbers: true,
  month_week_start: 'monday',
  month_event_day_background: '#111111',
  month_event_day_text_color: '#ffffff',
  month_empty_day_background: '#ffffff',
  month_empty_day_border: '1px solid #b8b8b8',
  month_empty_day_text_color: '#111111',
  month_selected_background: '#ff6b1a',
  month_today_background: '#111111',
  month_today_text_color: '#ffffff',
  month_day_size: 'min(100%, 140px)',
  month_grid_gap: '4px',
  month_text_size: 'clamp(18px, 1.6vw, 30px)',
  month_badge_size: '28%',
  month_badge_text_size: '0.72em',
  month_event_border: '2px solid #000000',
  responsive_month_accent: 'var(--primary-color, #5b8def)',
  responsive_month_day_background: 'color-mix(in srgb, var(--card-background-color, #242424) 88%, var(--primary-color, #5b8def) 12%)',
  responsive_month_day_text_color: 'var(--primary-text-color, #ffffff)',
});

const NB_TEXT = Object.freeze({
  editEvent: 'Rediger hendelse',
  newEvent: 'Ny hendelse',
  calendar: 'Kalender',
  title: 'Tittel',
  description: 'Beskrivelse',
  location: 'Sted',
  allDay: 'Hele dagen',
  startDate: 'Startdato',
  startTime: 'Starttid',
  endDate: 'Sluttdato',
  endTime: 'Sluttid',
  delete: 'Slett',
  cancel: 'Avbryt',
  save: 'Lagre',
  add: 'Legg til',
  saving: 'Lagrer…',
  deletePrompt: 'Slett',
  showAgenda: 'Vis agendavisning',
  showMonth: 'Vis månedsvisning',
  addEvent: 'Legg til hendelse',
});

const NB_ERRORS = Object.freeze({
  'Title is required.': 'Tittel er påkrevd.',
  'Start and end dates are required.': 'Start- og sluttdato er påkrevd.',
  'End date must not be before start date.': 'Sluttdato kan ikke være før startdato.',
  'Start and end times are required.': 'Start- og sluttid er påkrevd.',
  'Enter valid dates and times.': 'Oppgi gyldige datoer og klokkeslett.',
  'End must be after start.': 'Sluttidspunktet må være etter starttidspunktet.',
  'This calendar does not support editing this event.': 'Denne kalenderen støtter ikke redigering av hendelsen.',
  'The selected calendar does not support adding events.': 'Den valgte kalenderen støtter ikke oppretting av hendelser.',
});

const pad = (value) => String(value).padStart(2, '0');
const localDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const localTime = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const createDraft = (calendar = '') => {
  const start = new Date();
  start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    calendar,
    summary: '',
    description: '',
    location: '',
    allDay: false,
    startDate: localDate(start),
    startTime: localTime(start),
    endDate: localDate(end),
    endTime: localTime(end),
  };
};

class MySmartCalendarCard extends LitElement {
  static properties = {
    hass: {},
    config: {},
    _events: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _panelMode: { state: true },
    _editingKey: { state: true },
    _draft: { state: true },
    _saving: { state: true },
    _displayMonthKey: { state: true },
    _selectedDate: { state: true },
    _activeView: { state: true },
  };

  constructor() {
    super();
    this._events = [];
    this._loading = false;
    this._error = '';
    this._panelMode = '';
    this._editingKey = '';
    this._draft = createDraft();
    this._saving = false;
    this._requestId = 0;
    this._fetchFingerprint = '';
    this._refreshTimer = undefined;
    this._todayInitialized = false;
    const today = new Date();
    this._displayMonthKey = localDate(new Date(today.getFullYear(), today.getMonth(), 1)).slice(0, 7);
    this._selectedDate = localDate(today);
    this._activeView = 'agenda';
  }

  setConfig(config) {
    const previousDesign = this.config?.design;
    const entities = Array.isArray(config.entities)
      ? config.entities.filter(Boolean)
      : (config.entity ? [config.entity] : []);
    if (!entities.length) throw new Error('You need to define at least one calendar entity');
    this.config = { ...DEFAULT_CONFIG, ...config, entities };
    if (this.config.design === 'combined' && previousDesign !== 'combined') this._activeView = 'agenda';
  }

  static getStubConfig() {
    return { entities: ['calendar.home'] };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entities', required: true, selector: { entity: { domain: 'calendar', multiple: true } } },
        { name: 'title', selector: { text: {} } },
        { name: 'show_title', selector: { boolean: {} } },
        {
          name: 'design', selector: { select: { mode: 'dropdown', options: [
            { value: 'agenda', label: 'Agenda cards' },
            { value: 'minimal', label: 'E-ink – List view' },
            { value: 'month', label: 'E-ink – Month view' },
            { value: 'responsive_month', label: 'Responsive month view' },
            { value: 'combined', label: 'Month + agenda (toggle)' },
          ] } },
        },
        {
          name: 'limit_mode', selector: { select: { mode: 'dropdown', options: [
            { value: 'events', label: 'Number of events' },
            { value: 'days', label: 'Days to look ahead' },
          ] } },
        },
        { name: 'max_events', selector: { number: { min: 1, max: 100, mode: 'box' } } },
        { name: 'days_to_show', selector: { number: { min: 1, max: 365, mode: 'box' } } },
        { name: 'next_event_background', selector: { text: {} } },
        { name: 'next_event_text_color', selector: { text: {} } },
        { name: 'event_background', selector: { text: {} } },
        { name: 'card_background', selector: { text: {} } },
        { name: 'minimal_text_size', selector: { text: {} } },
        { name: 'font_family', selector: { text: {} } },
        { name: 'show_description', selector: { boolean: {} } },
        { name: 'show_location', selector: { boolean: {} } },
        { name: 'show_calendar', selector: { boolean: {} } },
        { name: 'show_add_event_button', selector: { boolean: {} } },
        { name: 'show_end_time', selector: { boolean: {} } },
        {
          name: 'minimal_date_format', selector: { select: { mode: 'dropdown', options: [
            { value: 'absolute', label: 'Absolute (27. juli · 15:00)' },
            { value: 'relative', label: 'Relative (I dag, Neste uke)' },
          ] } },
        },
        {
          name: 'language', selector: { select: { mode: 'dropdown', options: [
            { value: '', label: 'Auto (Home Assistant)' },
            { value: 'nb-NO', label: 'Norsk' },
            { value: 'en', label: 'English' },
          ] } },
        },
        { name: 'show_day_date', selector: { boolean: {} } },
        { name: 'month_show_event_list', selector: { boolean: {} } },
        { name: 'month_show_navigation', selector: { boolean: {} } },
        { name: 'month_show_event_count', selector: { boolean: {} } },
        { name: 'month_show_day_numbers', selector: { boolean: {} } },
        {
          name: 'month_week_start', selector: { select: { mode: 'dropdown', options: [
            { value: 'monday', label: 'Monday' },
            { value: 'sunday', label: 'Sunday' },
          ] } },
        },
        { name: 'month_event_day_background', selector: { text: {} } },
        { name: 'month_event_day_text_color', selector: { text: {} } },
        { name: 'month_empty_day_background', selector: { text: {} } },
        { name: 'month_empty_day_border', selector: { text: {} } },
        { name: 'month_empty_day_text_color', selector: { text: {} } },
        { name: 'month_selected_background', selector: { text: {} } },
        { name: 'month_today_background', selector: { text: {} } },
        { name: 'month_today_text_color', selector: { text: {} } },
        { name: 'month_day_size', selector: { text: {} } },
        { name: 'month_grid_gap', selector: { text: {} } },
        { name: 'month_text_size', selector: { text: {} } },
        { name: 'month_badge_size', selector: { text: {} } },
        { name: 'month_badge_text_size', selector: { text: {} } },
        { name: 'month_event_border', selector: { text: {} } },
        { name: 'responsive_month_accent', selector: { text: {} } },
        { name: 'responsive_month_day_background', selector: { text: {} } },
        { name: 'responsive_month_day_text_color', selector: { text: {} } },
      ],
      computeHelper: (schema) => ({
        max_events: 'Used when the limit mode is Number of events.',
        days_to_show: 'Used when the limit mode is Days to look ahead.',
        next_event_background: 'Any CSS color or gradient for the first event.',
        next_event_text_color: 'Any CSS color for text in the first event.',
        event_background: 'Any CSS color for the remaining agenda rows.',
        card_background: 'Optional outer card background.',
        minimal_text_size: 'CSS size used by minimal mode, for example 18px or 1.1rem.',
        font_family: 'CSS font-family used throughout the card, for example \'Space Grotesk\', sans-serif.',
      }[schema.name]),
    };
  }

  static async getConfigElement() {
    return document.createElement('mysmart-calendar-card-editor');
  }

  connectedCallback() {
    super.connectedCallback();
    this._refreshTimer = window.setInterval(() => this._loadEvents(true), 5 * 60 * 1000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.clearInterval(this._refreshTimer);
  }

  updated(changed) {
    super.updated(changed);
    if (!this.hass || !this.config || (!changed.has('hass') && !changed.has('config'))) return;
    if (!this._todayInitialized) {
      const todayKey = this._todayDateKey();
      this._displayMonthKey = todayKey.slice(0, 7);
      this._selectedDate = todayKey;
      this._todayInitialized = true;
    }
    const stateFingerprint = this.config.entities.map((id) => {
      const state = this.hass.states[id];
      return `${id}:${state?.last_updated || 'missing'}`;
    }).join(',');
    const fingerprint = `${stateFingerprint}|${this.config.design}|${this._activeView}|${this.config.limit_mode}|${this.config.days_to_show}|${this._displayMonthKey}`;
    if (fingerprint !== this._fetchFingerprint) {
      this._fetchFingerprint = fingerprint;
      this._loadEvents();
    }
  }

  getCardSize() {
    if (this._isMonthView()) return 9;
    return Math.max(2, Math.ceil((visibleEvents(this._events, this.config || DEFAULT_CONFIG).length + 1) * 1.25));
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: 6, min_rows: 2 };
  }
  _todayDateKey() {
    try {
      return dateKeyInTimeZone(new Date(), this.hass?.config?.time_zone);
    } catch (_error) {
      return localDate(new Date());
    }
  }

  _language() {
    const language = this.config?.language || this.hass?.locale?.language || this.hass?.language || navigator.language || 'en';
    return /^(no|nb)(-|$)/i.test(language) ? 'nb-NO' : language;
  }

  _t(key, fallback) {
    return /^(nb|nn|no)(-|$)/i.test(this._language()) ? (NB_TEXT[key] || fallback) : fallback;
  }

  _errorMessage(error) {
    const message = error?.message || String(error);
    return /^(nb|nn|no)(-|$)/i.test(this._language()) ? (NB_ERRORS[message] || message) : message;
  }

  _calendarName(entityId) {
    return this.hass?.states?.[entityId]?.attributes?.friendly_name || entityId.replace(/^calendar\./, '').replaceAll('_', ' ');
  }

  _features(entityId) {
    return Number(this.hass?.states?.[entityId]?.attributes?.supported_features || 0);
  }

  _supports(entityId, feature) {
    return Boolean(this._features(entityId) & feature);
  }

  _writableCalendars(feature = CalendarFeature.CREATE) {
    return this.config.entities.filter((entityId) => this._supports(entityId, feature));
  }

  _displayMonthDate() {
    return new Date(`${this._displayMonthKey}-01T00:00:00`);
  }

  _isMonthView() {
    return this.config?.design === 'month'
      || this.config?.design === 'responsive_month'
      || (this.config?.design === 'combined' && this._activeView === 'month');
  }

  _toggleView() {
    this._activeView = this._activeView === 'month' ? 'agenda' : 'month';
    this._events = [];
    this._fetchFingerprint = '';
    this._closePanel();
    this._loadEvents(true);
  }

  _changeMonth(offset) {
    const current = this._displayMonthDate();
    const next = new Date(current.getFullYear(), current.getMonth() + offset, 1);
    this._displayMonthKey = localDate(next).slice(0, 7);
    const todayKey = this._todayDateKey();
    this._selectedDate = todayKey.startsWith(this._displayMonthKey) ? todayKey : `${this._displayMonthKey}-01`;
    this._fetchFingerprint = '';
    this._closePanel();
    this._loadEvents(true);
  }

  _selectDate(dateKey) {
    this._selectedDate = dateKey;
    this._closePanel();
  }

  async _loadEvents(force = false) {
    if (!this.hass || !this.config || (this._loading && !force)) return;
    const requestId = ++this._requestId;
    this._loading = true;
    this._error = '';
    let start;
    let end;
    if (this._isMonthView()) {
      const [year, month] = this._displayMonthKey.split('-').map(Number);
      start = new Date(year, month - 1, 1);
      end = new Date(year, month, 1);
    } else {
      start = new Date();
      const days = this.config.limit_mode === 'days' ? Math.max(1, Number(this.config.days_to_show) || 30) : 365;
      end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    }
    const query = `?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
    const results = await Promise.allSettled(this.config.entities.map(async (calendar) => {
      const response = await this.hass.callApi('GET', `calendars/${calendar}${query}`);
      return (Array.isArray(response) ? response : []).map((event) => normalizeEvent(event, calendar));
    }));
    if (requestId !== this._requestId) return;
    const failed = [];
    const merged = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') merged.push(...result.value);
      else failed.push(this._calendarName(this.config.entities[index]));
    });
    this._events = merged
      .filter((event) => event.start && event.end && eventTimestamp(event) < end.getTime())
      .sort((a, b) => eventTimestamp(a) - eventTimestamp(b));
    if (failed.length) this._error = `Could not load: ${failed.join(', ')}`;
    this._loading = false;
  }

  _openAdd() {
    if (this._panelMode === 'add') return this._closePanel();
    const calendars = this._writableCalendars();
    this._draft = createDraft(calendars[0] || this.config.entities[0]);
    this._panelMode = 'add';
    this._editingKey = '';
    this._error = '';
  }

  _openEdit(event) {
    const key = eventKey(event);
    if (this._panelMode === 'edit' && this._editingKey === key) return this._closePanel();
    this._draft = eventToDraft(event);
    this._panelMode = 'edit';
    this._editingKey = key;
    this._error = '';
  }

  _closePanel() {
    this._panelMode = '';
    this._editingKey = '';
    this._saving = false;
  }

  _setDraft(key, value) {
    this._draft = { ...this._draft, [key]: value };
  }

  async _saveEvent(event = undefined) {
    if (this._saving) return;
    try {
      this._saving = true;
      this._error = '';
      const payload = draftToEvent(this._draft);
      if (event) {
        if (!event.uid || !this._supports(event.calendar, CalendarFeature.UPDATE)) {
          throw new Error('This calendar does not support editing this event.');
        }
        if (event.rrule) payload.rrule = event.rrule;
        await this.hass.callWS({
          type: 'calendar/event/update',
          entity_id: event.calendar,
          uid: event.uid,
          ...(event.recurrence_id ? { recurrence_id: event.recurrence_id, recurrence_range: '' } : {}),
          event: payload,
        });
      } else {
        if (!this._supports(this._draft.calendar, CalendarFeature.CREATE)) {
          throw new Error('The selected calendar does not support adding events.');
        }
        await this.hass.callWS({
          type: 'calendar/event/create',
          entity_id: this._draft.calendar,
          event: payload,
        });
      }
      this._closePanel();
      window.setTimeout(() => this._loadEvents(true), 600);
    } catch (error) {
      this._error = this._errorMessage(error);
      this._saving = false;
    }
  }

  async _deleteEvent(event) {
    if (!event.uid || !this._supports(event.calendar, CalendarFeature.DELETE) || this._saving) return;
    if (!window.confirm(`${this._t('deletePrompt', 'Delete')} “${event.summary}”?`)) return;
    try {
      this._saving = true;
      await this.hass.callWS({
        type: 'calendar/event/delete',
        entity_id: event.calendar,
        uid: event.uid,
        ...(event.recurrence_id ? { recurrence_id: event.recurrence_id, recurrence_range: '' } : {}),
      });
      this._closePanel();
      window.setTimeout(() => this._loadEvents(true), 600);
    } catch (error) {
      this._error = this._errorMessage(error);
      this._saving = false;
    }
  }

  _dateParts(event) {
    const date = isDateOnly(event.start) ? new Date(`${event.start}T00:00:00`) : new Date(event.start);
    const dateLabel = new Intl.DateTimeFormat(this._language(), { day: 'numeric', month: 'short' })
      .format(date)
      .replace(/\.$/, '');
    return {
      weekday: new Intl.DateTimeFormat(this._language(), { weekday: 'long' }).format(date),
      date: dateLabel,
    };
  }

  _eventDateKey(event) {
    if (isDateOnly(event.start)) return event.start;
    try {
      return dateKeyInTimeZone(new Date(event.start), this.hass?.config?.time_zone);
    } catch (_error) {
      return localDate(new Date(event.start));
    }
  }

  _timeLabel(event, compact = false) {
    if (isDateOnly(event.start)) return /^(nb|nn|no)(-|$)/i.test(this._language()) ? 'Hele dagen' : 'All day';
    const formatter = new Intl.DateTimeFormat(this._language(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const start = new Date(event.start);
    const end = new Date(event.end);
    const sameDay = localDate(start) === localDate(end);
    if (this.config.show_end_time === false) return formatter.format(start);
    if (compact && !sameDay) return `${formatter.format(start)}–${new Intl.DateTimeFormat(this._language(), { day: 'numeric', month: 'short' }).format(end)}`;
    return `${formatter.format(start)}–${formatter.format(end)}`;
  }

  _minimalDate(event) {
    const date = isDateOnly(event.start) ? new Date(`${event.start}T00:00:00`) : new Date(event.start);
    const allDay = /^(nb|nn|no)(-|$)/i.test(this._language()) ? 'Hele dagen' : 'All day';
    if (this.config.minimal_date_format === 'relative') {
      const relative = relativeDateDescriptor(date, new Date(), this._language());
      if (isDateOnly(event.start) || !relative.includeTime) return relative.label;
      return `${relative.label} ${this._timeLabel(event, true)}`;
    }
    const day = new Intl.DateTimeFormat(this._language(), { day: 'numeric', month: 'long' }).format(date);
    return isDateOnly(event.start) ? `${day} · ${allDay}` : `${day} · ${this._timeLabel(event, true)}`;
  }

  _renderAgendaEvent(event, index) {
    const parts = this._dateParts(event);
    const editable = event.uid && this._supports(event.calendar, CalendarFeature.UPDATE);
    const selected = this._panelMode === 'edit' && this._editingKey === eventKey(event);
    const isFirst = index === 0;
    const highlight = isFirst && this._eventDateKey(event) === this._todayDateKey();
    return html`
      <div class="event-wrap">
        <button
          type="button"
          class="agenda-event ${isFirst ? 'first' : ''} ${highlight ? 'next' : ''} ${editable ? 'editable' : ''}"
          aria-expanded=${selected ? 'true' : 'false'}
          @click=${editable ? () => this._openEdit(event) : nothing}
        >
          <span class="event-date">
            <span class="weekday">${parts.weekday}</span>
            <span class="date">${parts.date}</span>
          </span>
          <span class="event-copy">
            <span class="event-time">${this._timeLabel(event)}</span>
            <span class="event-title">${event.summary}</span>
            ${this.config.show_description && event.description ? html`<span class="event-description">${event.description}</span>` : nothing}
            ${this.config.show_location && event.location ? html`<span class="event-meta"><ha-icon icon="mdi:map-marker-outline"></ha-icon>${event.location}</span>` : nothing}
            ${this.config.show_calendar ? html`<span class="event-meta"><ha-icon icon="mdi:calendar-outline"></ha-icon>${this._calendarName(event.calendar)}</span>` : nothing}
          </span>
        </button>
        ${selected ? this._renderForm(event) : nothing}
      </div>
    `;
  }

  _renderMinimalEvent(event) {
    const editable = event.uid && this._supports(event.calendar, CalendarFeature.UPDATE);
    const selected = this._panelMode === 'edit' && this._editingKey === eventKey(event);
    return html`
      <div class="event-wrap minimal-wrap">
        <button
          type="button"
          class="minimal-event ${editable ? 'editable' : ''}"
          aria-expanded=${selected ? 'true' : 'false'}
          @click=${editable ? () => this._openEdit(event) : nothing}
        >
          <span class="minimal-title">${event.summary}</span>
          <span class="minimal-date">${this._minimalDate(event)}</span>
        </button>
        ${selected ? this._renderForm(event) : nothing}
      </div>
    `;
  }

  _monthWeekdayLabels() {
    const monday = new Date(2026, 0, 5);
    const offset = this.config.month_week_start === 'sunday' ? -1 : 0;
    return Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(this._language(), {
      weekday: 'narrow',
    }).format(new Date(2026, 0, 5 + offset + index)));
  }

  _renderMonthEvent(event) {
    const editable = event.uid && this._supports(event.calendar, CalendarFeature.UPDATE);
    const selected = this._panelMode === 'edit' && this._editingKey === eventKey(event);
    return html`
      <div class="month-event-wrap">
        <button
          type="button"
          class="month-event ${editable ? 'editable' : ''}"
          @click=${editable ? () => this._openEdit(event) : nothing}
        >
          <span class="month-event-title">${event.summary}</span>
          <span class="month-event-time">${this._timeLabel(event)}</span>
        </button>
        ${selected ? this._renderForm(event) : nothing}
      </div>
    `;
  }

  _renderMonth() {
    const monthDate = this._displayMonthDate();
    const selectedDate = new Date(`${this._selectedDate}T00:00:00`);
    const selectedEvents = eventsOnDate(this._events, this._selectedDate)
      .sort((a, b) => eventTimestamp(a) - eventTimestamp(b));
    const dates = monthGridDates(
      monthDate.getFullYear(),
      monthDate.getMonth(),
      this.config.month_week_start,
    );
    const todayKey = this._todayDateKey();
    const monthName = new Intl.DateTimeFormat(this._language(), { month: 'long' }).format(monthDate);
    const selectedMonth = new Intl.DateTimeFormat(this._language(), { month: 'long' }).format(selectedDate);
    const selectedWeekday = new Intl.DateTimeFormat(this._language(), { weekday: 'long' }).format(selectedDate);

    return html`
      <section class="month-view">
        ${this.config.show_day_date !== false ? html`
          <div class="month-date-header">
            <div class="month-big-day">${selectedDate.getDate()}</div>
            <div class="month-date-copy">
              <span class="month-name">${selectedMonth}</span>
              <span class="month-year">${selectedDate.getFullYear()}</span>
            </div>
            <div class="month-weekday">${selectedWeekday}</div>
          </div>
        ` : nothing}

        ${this.config.month_show_navigation !== false ? html`
          <div class="month-nav">
            <button type="button" aria-label="Previous month" @click=${() => this._changeMonth(-1)}><ha-icon icon="mdi:chevron-left"></ha-icon></button>
            <span class="month-nav-label">${monthName} ${monthDate.getFullYear()}</span>
            <button type="button" aria-label="Next month" @click=${() => this._changeMonth(1)}><ha-icon icon="mdi:chevron-right"></ha-icon></button>
          </div>
        ` : nothing}
        <div class="month-weekdays">
          ${this._monthWeekdayLabels().map((label) => html`<span>${label}</span>`)}
        </div>
        <div class="month-grid">
          ${dates.map((dateKey) => {
            if (!dateKey) return html`<span class="month-blank"></span>`;
            const dayEvents = eventsOnDate(this._events, dateKey);
            const hasEvents = dayEvents.length > 0;
            const selected = dateKey === this._selectedDate;
            const today = dateKey === todayKey;
            const day = Number(dateKey.slice(-2));
            return html`
              <button
                type="button"
                class="month-day ${selected ? 'selected' : ''} ${today ? 'today' : ''}"
                aria-label=${new Intl.DateTimeFormat(this._language(), { dateStyle: 'full' }).format(new Date(`${dateKey}T00:00:00`))}
                aria-pressed=${selected ? 'true' : 'false'}
                @click=${() => this._selectDate(dateKey)}
              >
                ${this.config.month_show_day_numbers !== false ? day : nothing}
                ${hasEvents ? html`<span class="month-event-badge ${this.config.month_show_event_count === false ? 'dot-only' : ''}">${this.config.month_show_event_count !== false ? dayEvents.length : nothing}</span>` : nothing}
              </button>
            `;
          })}
        </div>

        ${this.config.month_show_event_list !== false ? html`
          <div class="month-events">
            ${selectedEvents.length
              ? selectedEvents.map((event) => this._renderMonthEvent(event))
              : html`<div class="month-no-events">${/^(nb|nn|no)/i.test(this._language()) ? 'Ingen planer, finn på noe gøy' : 'No events'}</div>`}
          </div>
        ` : nothing}
      </section>
    `;
  }


  _renderField(label, key, type = 'text') {
    return html`
      <label class="field">
        <span>${label}</span>
        <input type=${type} .value=${this._draft[key] || ''} @input=${(ev) => this._setDraft(key, ev.target.value)} />
      </label>
    `;
  }

  _renderForm(event = undefined) {
    const isEdit = Boolean(event);
    const addCalendars = this._writableCalendars();
    const canDelete = isEdit && event.uid && this._supports(event.calendar, CalendarFeature.DELETE);
    return html`
      <section class="event-form" @click=${(ev) => ev.stopPropagation()}>
        <div class="form-heading">${isEdit ? this._t('editEvent', 'Edit event') : this._t('newEvent', 'New event')}</div>
        ${!isEdit ? html`
          <label class="field full">
            <span>${this._t('calendar', 'Calendar')}</span>
            <select .value=${this._draft.calendar} @change=${(ev) => this._setDraft('calendar', ev.target.value)}>
              ${addCalendars.map((calendar) => html`<option value=${calendar}>${this._calendarName(calendar)}</option>`)}
            </select>
          </label>
        ` : html`<div class="calendar-label"><ha-icon icon="mdi:calendar-outline"></ha-icon>${this._calendarName(event.calendar)}</div>`}
        ${this._renderField(this._t('title', 'Title'), 'summary')}
        <label class="field full">
          <span>${this._t('description', 'Description')}</span>
          <textarea rows="3" .value=${this._draft.description} @input=${(ev) => this._setDraft('description', ev.target.value)}></textarea>
        </label>
        ${this._renderField(this._t('location', 'Location'), 'location')}
        <label class="all-day">
          <input type="checkbox" .checked=${this._draft.allDay} @change=${(ev) => this._setDraft('allDay', ev.target.checked)} />
          <span>${this._t('allDay', 'All day')}</span>
        </label>
        <div class="date-grid">
          ${this._renderField(this._t('startDate', 'Start date'), 'startDate', 'date')}
          ${this._draft.allDay ? nothing : this._renderField(this._t('startTime', 'Start time'), 'startTime', 'time')}
          ${this._renderField(this._t('endDate', 'End date'), 'endDate', 'date')}
          ${this._draft.allDay ? nothing : this._renderField(this._t('endTime', 'End time'), 'endTime', 'time')}
        </div>
        <div class="form-actions">
          ${canDelete ? html`<button type="button" class="form-button delete" ?disabled=${this._saving} @click=${() => this._deleteEvent(event)}>${this._t('delete', 'Delete')}</button>` : nothing}
          <span class="action-spacer"></span>
          <button type="button" class="form-button cancel" ?disabled=${this._saving} @click=${() => this._closePanel()}>${this._t('cancel', 'Cancel')}</button>
          <button type="button" class="form-button save" ?disabled=${this._saving} @click=${() => this._saveEvent(event)}>${this._saving ? this._t('saving', 'Saving…') : (isEdit ? this._t('save', 'Save') : this._t('add', 'Add'))}</button>
        </div>
      </section>
    `;
  }

  render() {
    if (!this.hass || !this.config) return html``;
    const missing = this.config.entities.filter((id) => !this.hass.states[id]);
    const isMonth = this._isMonthView();
    const isCombined = this.config.design === 'combined';
    const contentDesign = isMonth
      ? (this.config.design === 'month' ? 'month' : 'responsive-month')
      : (this.config.design === 'minimal' ? 'minimal' : 'agenda');
    const events = isMonth ? this._events : visibleEvents(this._events, this.config);
    const canCreate = this._writableCalendars().length > 0;
    const showAddButton = this.config.show_add_event_button !== false && canCreate;
    const style = [
      `--calendar-next-bg:${this.config.next_event_background}`,
      `--calendar-next-text:${this.config.next_event_text_color}`,
      `--calendar-event-bg:${this.config.event_background}`,
      `--calendar-minimal-size:${this.config.minimal_text_size}`,
      `--calendar-font-family:${this.config.font_family}`,
      `--month-event-bg:${this.config.month_event_day_background}`,
      `--month-event-text:${this.config.month_event_day_text_color}`,
      `--month-empty-bg:${this.config.month_empty_day_background}`,
      `--month-empty-border:${this.config.month_empty_day_border}`,
      `--month-empty-text:${this.config.month_empty_day_text_color}`,
      `--month-selected-bg:${this.config.month_selected_background}`,
      `--month-today-bg:${this.config.month_today_background}`,
      `--month-today-text:${this.config.month_today_text_color}`,
      `--month-day-size:${this.config.month_day_size}`,
      `--month-grid-gap:${this.config.month_grid_gap}`,
      `--month-text-size:${this.config.month_text_size}`,
      `--month-badge-size:${this.config.month_badge_size}`,
      `--month-badge-text-size:${this.config.month_badge_text_size}`,
      `--month-event-border:${this.config.month_event_border}`,
      `--responsive-month-accent:${this.config.responsive_month_accent}`,
      `--responsive-month-day-bg:${this.config.responsive_month_day_background}`,
      `--responsive-month-day-text:${this.config.responsive_month_day_text_color}`,
      this.config.card_background ? `background:${this.config.card_background}` : '',
    ].filter(Boolean).join(';');

    return html`
      <ha-card style=${style}>
        ${(this.config.show_title !== false || showAddButton || isCombined) ? html`
          <header class="card-header">
            ${this.config.show_title !== false ? html`<span>${this.config.title || 'Calendar'}</span>` : html`<span></span>`}
            <span class="header-actions">
              ${isCombined ? html`
                <ha-icon-button class="view-button" label=${isMonth ? this._t('showAgenda', 'Show agenda view') : this._t('showMonth', 'Show month view')} @click=${() => this._toggleView()}>
                  <ha-icon icon=${isMonth ? 'mdi:view-list' : 'mdi:calendar-month-outline'}></ha-icon>
                </ha-icon-button>
              ` : nothing}
              ${showAddButton ? html`
                <ha-icon-button class="add-button" label=${this._t('addEvent', 'Add event')} @click=${() => this._openAdd()}>
                  <ha-icon icon=${this._panelMode === 'add' ? 'mdi:close' : 'mdi:plus'}></ha-icon>
                </ha-icon-button>
              ` : nothing}
            </span>
          </header>
        ` : nothing}
        <div class="content ${contentDesign} ${isCombined ? 'combined' : ''}">
          ${this._error ? html`<div class="message error" @click=${() => { this._error = ''; }}>${this._error}</div>` : nothing}
          ${missing.length ? html`<div class="message error">Entity not found: ${missing.join(', ')}</div>` : nothing}
          ${this._panelMode === 'add' ? this._renderForm() : nothing}
          ${this._loading && !this._events.length ? html`` : nothing}
          ${!isMonth && !this._loading && !events.length ? html`<div class="message">No upcoming events</div>` : nothing}
          ${isMonth
            ? this._renderMonth()
            : (this.config.design === 'minimal'
              ? events.map((event) => this._renderMinimalEvent(event))
              : events.map((event, index) => this._renderAgendaEvent(event, index)))}
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    :host {
      display: block;
      font-family: var(--calendar-font-family, 'Space Grotesk', sans-serif);
      --calendar-text: var(--primary-text-color, #fff);
      --calendar-muted: var(--secondary-text-color, rgba(255, 255, 255, 0.7));
      --calendar-field-bg: var(--ha-color-form-background, var(--secondary-background-color, #303030));
    }
    ha-card { overflow: hidden; box-sizing: border-box; }
    .card-header { min-height: 48px; padding: 8px 8px 4px 20px; display: flex; align-items: center; justify-content: space-between; color: var(--calendar-text); font-size: 18px; font-weight: 500; box-sizing: border-box; }
    .header-actions { display: flex; align-items: center; }
    .add-button, .view-button { color: var(--calendar-muted); }
    .content { display: grid; gap: 10px; padding: 12px; }
    .card-header + .content { padding-top: 4px; }
    .event-wrap { min-width: 0; }
    button { font: inherit; }
    .agenda-event, .minimal-event { width: 100%; border: 0; color: var(--calendar-text); cursor: default; text-align: left; box-sizing: border-box; }
    .agenda-event.editable, .minimal-event.editable { cursor: pointer; }
    .agenda-event { display: grid; grid-template-columns: 102px minmax(0, 1fr); align-items: center; gap: 14px; min-height: 90px; padding: 16px 24px; border-radius: 30px; background: var(--calendar-event-bg); }
    .agenda-event.first { grid-template-columns: 118px minmax(0, 1fr); min-height: 102px; }
    .agenda-event.next { background: var(--calendar-next-bg); color: var(--calendar-next-text); }
    .event-date, .event-copy { display: flex; flex-direction: column; min-width: 0; }
    .weekday { font-size: 14px; line-height: 1.2; font-weight: 500; opacity: 0.7; text-transform: capitalize; }
    .date { font-size: 2em; line-height: 1.15; font-weight: 300; margin-top: 3px; }
    .first .date { font-size: 34px; }
    .event-time { font-size: 16px; line-height: 1.2; font-weight: 500; }
    .first .event-time { font-size: 20px; font-weight: 500; }
    .event-title { font-size: 14px; line-height: 1.3; font-weight: 500; margin-top: 7px; overflow-wrap: anywhere; }
    .event-description { font-size: 12px; line-height: 1.35; opacity: 0.78; margin-top: 4px; white-space: pre-line; overflow-wrap: anywhere; }
    .event-meta { display: flex; align-items: center; gap: 4px; margin-top: 5px; font-size: 11px; line-height: 1.3; opacity: 0.72; overflow-wrap: anywhere; }
    .event-meta ha-icon, .calendar-label ha-icon { --mdc-icon-size: 14px; flex: 0 0 auto; }
    .minimal { gap: 0; padding: 16px 0 0 0!important; }
    .minimal-event { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; background: transparent; font-size: var(--calendar-minimal-size); padding-bottom:12px; border-bottom: 2px solid rgb(123, 123, 123); margin-bottom: 12px; }
    .minimal-wrap:last-child .minimal-event { border-bottom: 0; }
    .minimal-title { min-width: 0; font-weight: 300; font-size: 26px; line-height: 26px; text-overflow: ellipsis; white-space: nowrap; }
    .minimal-date { flex: 0 0 auto; text-align: right; font-size: 26px; font-weight:500; white-space: nowrap; }
    .month { gap: 0; padding: 12px 18px 20px; }
    .month-view { display: grid; gap: 1em; min-width: 0; color: var(--calendar-text); font-size: var(--month-text-size); }
    .month-date-header { display: grid; grid-template-columns: auto 1fr auto; align-items: end; column-gap: 18px; }
    .month-big-day { font-size: clamp(72px, 24vw, 112px); font-weight: 300; line-height: 0.82; letter-spacing: -0.065em; }
    .month-date-copy { display: flex; flex-direction: column; padding-bottom: 2px; }
    .month-name { font-size: 1.05em; line-height: 1.1; text-transform: uppercase; }
    .month-year { color: var(--calendar-muted); font-size: 1.15em; font-weight: 300; line-height: 1.1; }
    .month-weekday { padding-bottom: 2px; font-size: 1.1em; line-height: 1.1; text-transform: capitalize; }
    .month-events { display: grid; gap: 0; border-top: var(--month-event-border); }
    .month-event-wrap { min-width: 0; }
    .month-event { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; width: 100%; min-height: 36px; padding: 8px 2px; border: 0; background: transparent; color: inherit; text-align: left; }
    .month-event.editable { cursor: pointer; }
    .month-event-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 300; font-size: 36px }
    .month-event-time { flex: 0 0 auto; font-size: 36px; font-weight:300; white-space: nowrap; }
    .month-no-events { display: flex; align-items: baseline; padding: 8px 2px; box-sizing: border-box; color: inherit; font-size: 36px; font-weight: 300; }
    .month-nav { display: grid; grid-template-columns: 2.2em 1fr 2.2em; align-items: center; }
    .month-nav button { display: grid; place-items: center; width: 2.2em; height: 2.2em; padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
    .month-nav button ha-icon { --mdc-icon-size: 1.3em; }
    .month-nav-label { text-align: center; font-size: 14px; font-weight: 500; text-transform: capitalize; }
    .month-weekdays, .month-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--month-grid-gap); }
    .month-weekdays { text-align: center; font-size: 26px; font-weight: 500; text-transform: uppercase; }
    .month-grid { align-items: center; row-gap: var(--month-grid-gap); }
    .month-blank { min-width: 0; min-height: 0; }
    .month-day { position: relative; display: grid; place-items: center; width: var(--month-day-size); max-width: 100%; aspect-ratio: 1; justify-self: center; padding: 0; border: var(--month-empty-border); border-radius: 50%; box-sizing: border-box; background: var(--month-empty-bg); color: var(--month-empty-text); overflow: visible; cursor: pointer; font-size: 14px; font-weight: 500; }
    .month-day.today { border-color: var(--month-today-bg); background: var(--month-today-bg); color: var(--month-today-text); }
    .month-day.selected { border: 3px solid var(--month-selected-bg); }
    .month-event-badge { position: absolute; top: -4%; left: -4%; display: grid; place-items: center; min-width: var(--month-badge-size); height: var(--month-badge-size); padding: 0 0.18em; border-radius: 999px; box-sizing: border-box; background: var(--month-event-bg); color: var(--month-event-text); font-size: 14px; font-weight: 500; line-height: 1; }
    .month-event-badge.dot-only { top: -1%; left: -1%; width: 16%; min-width: 16%; height: 16%; padding: 0; border-width: 1px; }

    .responsive-month {
      container-type: inline-size;
      gap: 0;
      padding: 0.75rem 1.125rem 1.25rem;
      --month-event-bg: var(--responsive-month-accent);
      --month-empty-bg: var(--responsive-month-day-bg);
      --month-empty-border: 0.0625rem solid color-mix(in srgb, var(--responsive-month-accent) 32%, transparent);
      --month-empty-text: var(--responsive-month-day-text);
      --month-day-size: 100%;
      --month-grid-gap: 0.25rem;
      --month-event-border: 0.125rem solid color-mix(in srgb, var(--responsive-month-accent) 55%, transparent);
    }
    .responsive-month .month-view { font-size: clamp(0.875rem, 3.4cqi, 1.25rem); }
    .responsive-month .month-date-header { grid-template-columns: auto 1fr; column-gap: 1em; }
    .responsive-month .month-big-day { font-size: 4.5em; }
    .responsive-month .month-date-copy { padding-bottom: 0.125rem; }
    .responsive-month .month-weekday { display: none; }
    .responsive-month .month-event { gap: 1rem; min-height: 2.25rem; padding: 0.5rem 0.125rem; }
    .responsive-month .month-event-title,
    .responsive-month .month-event-time { font-size: 16px; font-weight: 500; }
    .responsive-month .month-no-events { padding: 0.5rem 0.125rem; font-size: 1.2em; }
    .responsive-month .month-weekdays { font-size: 14px; font-weight: 500; opacity: 0.7 }
    .responsive-month .month-day.selected { border-width: 0.25rem; }
    .responsive-month .month-event-badge { border-width: 0; }
    .responsive-month .month-event-badge.dot-only { border-width: 0; }

    .message { padding: 18px 14px; color: var(--calendar-muted); text-align: center; }
    .message.error { padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--error-color, #db4437) 20%, transparent); color: var(--error-color, #db4437); cursor: pointer; }
    .event-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 10px 0 4px; padding: 16px; border-radius: 20px; background: var(--calendar-event-bg); color: var(--calendar-text); animation: reveal 180ms ease-out; box-sizing: border-box; }
    .form-heading { grid-column: 1 / -1; font-size: 18px; font-weight: 600; }
    .calendar-label { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; color: var(--calendar-muted); font-size: 12px; }
    .field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
    .field.full, .event-form > .field:not(.date-grid .field) { grid-column: 1 / -1; }
    .field > span { color: var(--calendar-muted); font-size: 12px; }
    .field input, .field textarea, .field select { width: 100%; min-height: 46px; padding: 11px 12px; border: 1px solid var(--divider-color, rgba(255,255,255,.15)); border-radius: 12px; outline: none; box-sizing: border-box; background: var(--calendar-field-bg); color: var(--calendar-text); font: inherit; color-scheme: light dark; }
    .field textarea { resize: vertical; }
    .field input:focus, .field textarea:focus, .field select:focus { border-color: var(--primary-color); }
    .all-day { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
    .all-day input { width: 18px; height: 18px; accent-color: var(--primary-color); }
    .date-grid { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form-actions { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; margin-top: 4px; }
    .action-spacer { flex: 1; }
    .form-button { border: 0; border-radius: 18px; padding: 9px 16px; cursor: pointer; background: transparent; color: var(--calendar-text); }
    .form-button.save { background: var(--primary-color); color: var(--text-primary-color, #fff); font-weight: 600; }
    .form-button.delete { color: var(--error-color, #db4437); }
    .form-button:disabled { opacity: 0.55; cursor: wait; }
    @keyframes reveal { from { opacity: 0; transform: translateY(-5px); } }
    @media (max-width: 420px) {
      .agenda-event { grid-template-columns: 92px minmax(0, 1fr); padding: 14px; border-radius: 24px; }
      .agenda-event.first { grid-template-columns: 108px minmax(0, 1fr); }
      .minimal-event { gap: 12px; }
      .date-grid { grid-template-columns: 1fr; }
    }
  `;
}

if (!customElements.get('mysmart-calendar-card')) {
  customElements.define('mysmart-calendar-card', MySmartCalendarCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'mysmart-calendar-card',
  name: 'MySmart Calendar Card',
  preview: true,
  description: 'A merged multi-calendar agenda with e-ink, responsive month, and combined views.',
});

class MySmartCalendarCardEditor extends LitElement {
  static properties = { hass: {}, _config: { state: true } };

  setConfig(config) {
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  render() {
    if (!this.hass || !this._config) return html``;
    const schema = MySmartCalendarCard.getConfigForm().schema;
    const data = { ...this._config };
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${schema}
        .computeLabel=${(item) => ({
          entities: 'Calendars', title: 'Title', show_title: 'Show title', design: 'Design',
          limit_mode: 'Limit by', max_events: 'Maximum events', days_to_show: 'Days to look ahead',
          next_event_background: 'Next event background', next_event_text_color: 'Next event text color',
          event_background: 'Other event background', card_background: 'Card background',
          minimal_text_size: 'Minimal text size', show_description: 'Show description',
          font_family: 'Font family',
          show_location: 'Show location', show_calendar: 'Show calendar name',
          show_add_event_button: 'Show add event button',
          show_end_time: 'Show end time', minimal_date_format: 'Minimal date format',
          language: 'Language',
          show_day_date: 'Show large day/date',
          month_show_event_list: 'Show selected-day events',
          month_show_navigation: 'Show month navigation',
          month_show_event_count: 'Show event count in badge',
          month_show_day_numbers: 'Show day numbers',
          month_week_start: 'Week starts on',
          month_event_day_background: 'Event badge background', month_event_day_text_color: 'Event badge text',
          month_empty_day_background: 'Day background', month_empty_day_border: 'Day border',
          month_empty_day_text_color: 'Day text', month_selected_background: 'Selected day border color',
          month_today_background: 'Today background', month_today_text_color: 'Today text',
          month_day_size: 'Month circle size',
          month_grid_gap: 'Month grid gap',
          month_text_size: 'Month text size',
          month_badge_size: 'Event badge size',
          month_event_border: 'Event separator border',
          month_badge_text_size: 'Event badge text size',
          responsive_month_accent: 'Responsive month accent',
          responsive_month_day_background: 'Responsive day background',
          responsive_month_day_text_color: 'Responsive day text',
        }[item.name] || item.name)}
        .computeHelper=${(item) => MySmartCalendarCard.getConfigForm().computeHelper(item)}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  _valueChanged(event) {
    const config = event.detail?.value;
    if (!config) return;
    this._config = { ...config };
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config }, bubbles: true, composed: true,
    }));
  }

  static styles = css`:host { display: block; }`;
}

if (!customElements.get('mysmart-calendar-card-editor')) {
  customElements.define('mysmart-calendar-card-editor', MySmartCalendarCardEditor);
}
