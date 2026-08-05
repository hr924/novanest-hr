// Shared leave-balance / loss-of-pay math, used by both the leave routes
// (for balance lookups) and the payslip routes (to auto-calculate LOP days
// when a payslip is generated). Kept in one place so the two never drift.
//
// Policy: every employee gets 12 Casual + 12 Sick = 24 paid leave days per
// calendar year. Only "Casual" and "Sick" leave types count toward this
// pool — other leave types (Personal, Bereavement, Other) are outside this
// entitlement and never generate LOP here. Public holidays that fall inside
// an approved leave date range are not counted as leave days at all.

const PAID_LEAVE_TYPES = ['Casual', 'Sick'];
const ANNUAL_ENTITLEMENT = { Casual: 12, Sick: 12 };
const ANNUAL_ENTITLEMENT_TOTAL = ANNUAL_ENTITLEMENT.Casual + ANNUAL_ENTITLEMENT.Sick; // 24

// Same manager+HR merge logic as leave.js's withOverallStatus — duplicated
// here (rather than imported) to avoid a circular require between routes.
function overallStatus(request) {
  if (request.managerStatus === 'rejected' || request.hrStatus === 'rejected') return 'rejected';
  if (request.hrStatus === 'approved') return 'approved';
  if (request.managerStatus === 'approved') return 'pending-hr';
  return 'pending-manager';
}

function holidaySet(db) {
  return new Set((db.holidays || []).map(h => h.date));
}

// Every calendar date from start to end (inclusive), as 'YYYY-MM-DD' strings.
function expandDateRange(startDate, endDate) {
  const dates = [];
  let cur = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  if (isNaN(cur) || isNaN(end) || cur > end) return dates;
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// All individual paid-leave dates (Casual/Sick, approved, holidays excluded)
// an employee has for a given calendar year, deduped and sorted ascending.
// Each entry also carries which request/type it came from for reporting.
function paidLeaveDatesForYear(db, employeeId, year) {
  const holidays = holidaySet(db);
  const perDate = new Map(); // date -> { date, type }
  (db.leave || [])
    .filter(r => r.employeeId === employeeId && PAID_LEAVE_TYPES.includes(r.type) && overallStatus(r) === 'approved')
    .forEach((r) => {
      expandDateRange(r.startDate, r.endDate).forEach((d) => {
        if (!d.startsWith(String(year))) return;
        if (holidays.has(d)) return; // public holidays are never counted as leave
        if (!perDate.has(d)) perDate.set(d, { date: d, type: r.type });
      });
    });
  return Array.from(perDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Year-to-date usage summary for the balance widgets (Leave Calendar, the
// employee's own Leave page, etc). "asOf" optionally caps how far into the
// year to count (defaults to the whole year).
function computeYearUsage(db, employeeId, year, asOfDate) {
  let days = paidLeaveDatesForYear(db, employeeId, year);
  if (asOfDate) days = days.filter(d => d.date <= asOfDate);

  const casualUsed = days.filter(d => d.type === 'Casual').length;
  const sickUsed = days.filter(d => d.type === 'Sick').length;
  const totalUsed = days.length;
  const lopDays = Math.max(0, totalUsed - ANNUAL_ENTITLEMENT_TOTAL);

  return {
    year,
    casualUsed, casualEntitlement: ANNUAL_ENTITLEMENT.Casual,
    sickUsed, sickEntitlement: ANNUAL_ENTITLEMENT.Sick,
    totalUsed, totalEntitlement: ANNUAL_ENTITLEMENT_TOTAL,
    remaining: Math.max(0, ANNUAL_ENTITLEMENT_TOTAL - totalUsed),
    lopDaysYtd: lopDays
  };
}

// How many of an employee's paid leave dates in a given 'YYYY-MM' month are
// beyond their annual entitlement — i.e. should be treated as Loss of Pay
// on that month's payslip. Walks the whole year's paid-leave dates in order
// so the 24-day allowance is spent chronologically, then reports how many
// of the dates that landed *in this specific month* were past the cutoff.
function computeMonthLop(db, employeeId, month) {
  const year = Number(String(month).split('-')[0]);
  const days = paidLeaveDatesForYear(db, employeeId, year);

  let lopDaysThisMonth = 0;
  let paidDaysThisMonth = 0;
  days.forEach((d, idx) => {
    const isLop = idx >= ANNUAL_ENTITLEMENT_TOTAL; // 0-indexed: the 25th date onward is LOP
    if (d.date.startsWith(month)) {
      if (isLop) lopDaysThisMonth += 1; else paidDaysThisMonth += 1;
    }
  });

  const casualUsedYtd = days.filter(d => d.type === 'Casual' && d.date <= `${month}-31`).length;
  const sickUsedYtd = days.filter(d => d.type === 'Sick' && d.date <= `${month}-31`).length;

  return { lopDays: lopDaysThisMonth, paidLeaveDaysThisMonth: paidDaysThisMonth, casualUsedYtd, sickUsedYtd };
}

module.exports = {
  PAID_LEAVE_TYPES, ANNUAL_ENTITLEMENT, ANNUAL_ENTITLEMENT_TOTAL,
  overallStatus, holidaySet, expandDateRange,
  paidLeaveDatesForYear, computeYearUsage, computeMonthLop
};
