(function (root) {
  'use strict';

  const columns = ['Loan Number', 'Loan Officer', 'Closed Date', 'Last Finished Milestone'];

  const lpColumn = 'Loan Team Member Name - Loan Partner 2';
  const lpNames = new Map([
    ['gavin dill', 'Gavin'], ['gavin', 'Gavin'],
    ['karen de la riva', 'Karen'], ['karen', 'Karen'],
    ['osgood mcmahon', 'Osgood'], ['osgood', 'Osgood'],
    ['jordan johnston', 'Jordan'], ['jordan', 'Jordan'],
    ['said saleh', 'Said'], ['said', 'Said'],
    ['isaak', 'Isaak'],
  ]);

  function selectFundedSheet(workbook) {
    return workbook.Sheets.Data || workbook.Sheets.Table || workbook.Sheets[workbook.SheetNames[0]];
  }

  function closedDay(value) {
    const pad = number => String(number).padStart(2, '0');
    let day = value instanceof Date && Number.isFinite(value.getTime())
      ? [value.getFullYear(), pad(value.getMonth() + 1), pad(value.getDate())].join('-')
      : String(value ?? '').trim();
    const usDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(day);
    if (usDate) day = [usDate[3], pad(usDate[1]), pad(usDate[2])].join('-');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
    const parsed = new Date(day + 'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : '';
  }

  function validateFundedRows(rows, today) {
    if (!rows.length) throw new Error('The worksheet has no loan rows.');
    const missing = columns.filter(column => !Object.hasOwn(rows[0], column));
    if (missing.length) throw new Error('Missing Encompass columns: ' + missing.join(', '));

    const loans = new Map();
    const conflicts = new Set();
    const ownership = new Map();
    const review = [];
    let nonFunded = 0;
    for (const [index, row] of rows.entries()) {
      if (!/^Daniel\s+Sa$/i.test(String(row['Loan Officer']).trim())) continue;
      if (!/^Funding$/i.test(String(row['Last Finished Milestone']).trim())) {
        nonFunded++;
        continue;
      }

      const loan = String(row['Loan Number'] ?? '').trim();
      const closed = closedDay(row['Closed Date']);
      if (!loan || !closed || closed > today) {
        review.push({row: index + 2, reason: !loan ? 'Missing loan number' : 'Invalid closing date'});
        continue;
      }

      const existing = loans.get(loan);
      if (existing && existing.closed !== closed && !conflicts.has(loan)) {
        conflicts.add(loan);
        review.push({row: index + 2, reason: 'Conflicting closing dates'});
      }
      if (!existing) loans.set(loan, {loan, closed, owner: null});

      const name = String(row[lpColumn] ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (!name) continue;
      const owner = lpNames.get(name) ?? null;
      const identity = owner ?? name;
      const prior = ownership.get(loan);
      if (!prior) {
        ownership.set(loan, {identity});
        loans.get(loan).owner = owner;
      } else if (prior.identity !== identity && !prior.conflict) {
        prior.conflict = true;
        loans.get(loan).owner = null;
        review.push({row: index + 2, reason: 'Conflicting LP2 assignments'});
      }
    }
    const eligible = [...loans.values()].filter(record => !conflicts.has(record.loan));
    return {eligible, review, nonFunded};
  }

  const api = {selectFundedSheet, validateFundedRows};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ctEncompassFunded = api;
})(globalThis);
