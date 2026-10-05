// Central source of "today" for the application.
//
// Compliance logic (complianceEngine.js, normalization.js) never reads the
// system clock: it receives `asOfDate` (YYYY-MM-DD) as an argument. Only the
// UI layer calls getRuntimeAsOfDate() to obtain that argument.
//
// Day rule: a calendar day is the day in REPORTING_TIME_ZONE, not the device
// time zone. The same instant therefore gives the same As Of Date on every
// device. A certificate is valid THROUGH its Expiry_Date (inclusive); it is
// EXPIRED from 00:00 of the next calendar day in REPORTING_TIME_ZONE.
import { REPORTING_TIME_ZONE } from './constants.js';

// Format an instant as YYYY-MM-DD in the given IANA time zone.
export function toReportingDateStr(instant, timeZone = REPORTING_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const get = (type) => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Today's As Of Date for real (non-demo) use. `now` is injectable for tests.
export function getRuntimeAsOfDate(now = new Date()) {
  return toReportingDateStr(now);
}
