# MySmart Calendar Card

A Home Assistant Lovelace card that merges events from multiple calendar entities. It includes a rich agenda inspired by the MySmart card family, an e-ink friendly minimal list, and inline event creation/editing for calendars that support it.

## Installation

### HACS

1. Open HACS in Home Assistant.
2. Click the three dots in the upper right corner and choose **Custom repositories**.
3. Paste `https://github.com/agoberg85/mysmart-calendar-card` into the repository field, select **Dashboard** as the type, and click **Add**.
4. Search for **MySmart Calendar Card** in HACS, open it, and click **Download**.
5. Reload your browser when HACS asks you to.

On Home Assistant 2026.11 and later, the built-in Marketplace replaces HACS. Go to **Settings > Marketplace**, choose **Add from link**, and paste the same URL. You need a connected GitHub account for this.

### Manual

1. Download `mysmart-calendar-card.js` from the [latest release](https://github.com/agoberg85/mysmart-calendar-card/releases/latest) and copy it to `config/www/`.
2. Go to **Settings > Dashboards**, open the three dots menu, and choose **Resources**.
3. Add `/local/mysmart-calendar-card.js` as a **JavaScript module**.
4. Reload your browser.

## Example

```yaml
type: custom:mysmart-calendar-card
title: Calendar
entities:
  - calendar.family
  - calendar.work
design: agenda
limit_mode: events
max_events: 8
show_add_event_button: false
show_end_time: false
minimal_date_format: relative
language: nb-NO
font_family: "'Space Grotesk', sans-serif"
next_event_background: "linear-gradient(135deg, #ef8bc4, #f5c2c8)"
next_event_text_color: "#21151e"
```

Use `design: minimal` for a simple title-left/date-right list. `minimal_text_size` accepts a CSS size such as `18px` or `1.1rem`.

Set `show_add_event_button: false` to hide the add button, which is useful for read-only and e-ink dashboards. If `show_title` is also false, the entire header is removed.

Minimal mode supports `minimal_date_format: absolute` (`27. juli · 15:00`) or `relative` (`I dag 15:00`, `Neste uke`, `Om 2 uker`). Times always use a 24-hour clock. Set `show_end_time: false` for a single start time, and use `language: nb-NO` to force Norwegian labels independently of the Home Assistant language.

The default `font_family` is `'Space Grotesk', sans-serif`, applied directly to the card host so it does not depend on theme inheritance. The font still needs to be loaded by the Home Assistant frontend or theme.

## Design modes

The existing e-ink layouts keep their original configuration values for backward compatibility:

- `design: minimal` — **E-ink – List view**
- `design: month` — **E-ink – Month view**

Use `design: responsive_month` for the month layout with responsive `rem`/`em` typography and theme-aware color. Its accent and day colors can be customized with `responsive_month_accent`, `responsive_month_day_background`, and `responsive_month_day_text_color`.
The accent controls event-badge fill. `month_event_day_text_color` controls badge numbers, `month_selected_background` controls the selected-day border, and the `month_today_*` options control the filled current day in both responsive modes.

Use `design: combined` for the responsive month and agenda in one card. It opens in agenda view by default, and the button beside the add-event button toggles between the two views.

## E-ink month mode

Month mode fetches the complete displayed month, merges all configured calendars, and shows events for the selected day above the grid.

```yaml
design: month
show_day_date: true
month_show_event_list: true
month_show_navigation: true
month_show_event_count: true
month_show_day_numbers: true
month_week_start: monday
month_event_day_background: "#111111"
month_event_day_text_color: "#ffffff"
month_empty_day_background: "#ffffff"
month_empty_day_border: "1px solid #b8b8b8"
month_empty_day_text_color: "#111111"
month_selected_background: "#ff6b1a"
month_today_background: "#111111"
month_today_text_color: "#ffffff"
month_day_size: "min(100%, 140px)"
month_grid_gap: "4px"
month_text_size: "clamp(18px, 1.6vw, 30px)"
month_badge_size: "28%"
month_badge_text_size: "0.72em"
month_event_border: "2px solid #000000"
```

Set `show_day_date: false` to hide the oversized selected date, month, year, and weekday header. Day numbers and the selected-day event list can be hidden independently.

For very high-resolution displays, use `month_day_size: "calc(100% - 2px)"` with `month_grid_gap: "2px"` to let circles nearly fill each grid column. `month_text_size` controls the month navigation, event list, weekday headings, and numbers as one responsive scale.

Set `month_show_navigation: false` to remove the month name and arrow controls. Event days use a top-left badge; set `month_show_event_count: false` to render it as a plain notification dot.

Badge diameter is relative to each day circle, so it grows with `month_day_size`. Today is calculated using Home Assistant's configured timezone rather than the display device's browser timezone.

## Calendar write support

The plus button is shown when at least one configured calendar advertises event creation support. Clicking an event opens the inline editor when that event has a UID and its calendar supports updates. Delete is shown only when deletion is supported. These features depend on the calendar integration, not only on this card.

All-day end dates in the form are inclusive for humans and converted to the exclusive end date expected by Home Assistant.
