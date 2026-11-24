'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { selectFundedSheet, validateFundedRows } = require('../assets/encompass-funded.js');

const row = (number, date, milestone = 'Funding') => ({
  'Loan Number': number,
  'Closed Date': date,
  'Last Finished Milestone': milestone,
  'Loan Officer': 'Daniel Sa',
  'Loan Processor': 'Gavin',
});

test('uses one authoritative worksheet even when the workbook contains a copy', () => {
  const Data = {};
  const Table = {};
  assert.equal(selectFundedSheet({Sheets:{Table, Data}, SheetNames:['Table', 'Data']}), Data);
});

test('validates funded rows and holds conflicting dates for review', () => {
  const result = validateFundedRows([
    row('001', new Date(2026, 10, 1)),
    row('001', '11/01/2026'),
    row('002', '11/02/2026'),
    row('002', '11/03/2026'),
    row('003', '11/03/2026', 'Approval'),
    row('004', '2026-02-30'),
    row('005', '2026-12-01'),
  ], '2026-11-24');
  assert.deepEqual(result.eligible.map(({loan, closed}) => [loan, closed]), [['001', '2026-11-01']]);
  assert.equal(result.eligible[0].owner, null);
  assert.equal(result.nonFunded, 1);
  assert.equal(result.review.length, 3);
});

test('requires funding evidence and a supported export layout', () => {
  assert.throws(() => validateFundedRows([{'Loan Number': '001'}], '2026-11-24'), /Last Finished Milestone/);
});
