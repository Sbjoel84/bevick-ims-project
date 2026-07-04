// Self-contained date-preset helper for the transaction ledgers.
// Built fresh rather than editing ReportModal.jsx/Reports.jsx's existing
// today/week/month/year/custom presets (shared by other pages, and missing
// yesterday/lastWeek/lastMonth which the ledgers explicitly need).

export const RANGE_PRESETS = [
  { id: 'today',     label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'thisWeek',  label: 'This Week' },
  { id: 'lastWeek',  label: 'Last Week' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'lastMonth', label: 'Last Month' },
  { id: 'thisYear',  label: 'This Year' },
  { id: 'custom',    label: 'Custom Range' },
];

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d)   { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function mondayOf(d) {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - (day === 0 ? 6 : day - 1));
  return startOfDay(x);
}

// Returns { start: Date, end: Date, label: string } for a given preset id.
// `customStart`/`customEnd` are 'YYYY-MM-DD' strings, only used for 'custom'.
export function getDateRange(presetId, customStart, customEnd) {
  const now = new Date();

  switch (presetId) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now), label: 'Today' };
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y), label: 'Yesterday' };
    }
    case 'thisWeek': {
      const start = mondayOf(now);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return { start, end: endOfDay(end), label: 'This Week' };
    }
    case 'lastWeek': {
      const thisMonday = mondayOf(now);
      const start = new Date(thisMonday); start.setDate(thisMonday.getDate() - 7);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return { start, end: endOfDay(end), label: 'Last Week' };
    }
    case 'thisMonth':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
        label: 'This Month',
      };
    case 'lastMonth':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)),
        label: 'Last Month',
      };
    case 'thisQuarter': {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return {
        start: new Date(now.getFullYear(), qStartMonth, 1),
        end: endOfDay(new Date(now.getFullYear(), qStartMonth + 3, 0)),
        label: 'This Quarter',
      };
    }
    case 'thisYear':
      return {
        start: new Date(now.getFullYear(), 0, 1),
        end: endOfDay(new Date(now.getFullYear(), 11, 31)),
        label: 'This Year',
      };
    case 'custom':
      return {
        start: customStart ? startOfDay(new Date(customStart + 'T00:00:00')) : new Date(0),
        end: customEnd ? endOfDay(new Date(customEnd + 'T00:00:00')) : endOfDay(now),
        label: customStart || customEnd ? `${customStart || '…'} to ${customEnd || '…'}` : 'Custom Range',
      };
    default:
      return { start: startOfDay(now), end: endOfDay(now), label: 'Today' };
  }
}
