'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { milestonesForLoan } = require('../assets/post-closing.js');

test('schedule uses calendar days and independent IDs across reimports', () => {
  const loan = { hash: '1234567890abcdefabcd', closed: '2028-02-01' };
  const result = milestonesForLoan(loan);
  assert.deepEqual(result.map(task => task.due), ['2028-03-02', '2028-04-01', '2028-05-01']);
  assert.equal(new Set(result.map(task => task.key)).size, 3);
  assert.deepEqual(milestonesForLoan(loan), result);
  assert.deepEqual(milestonesForLoan({...loan, closed: '2028-02-02'}).map(task => task.key), result.map(task => task.key));
});

test('invalid funded identities and dates are rejected', () => {
  assert.throws(() => milestonesForLoan({hash: 'missing', closed: '2028-02-01'}), /identity/);
  assert.throws(() => milestonesForLoan({hash: '1234567890abcdefabcd', closed: '2027-02-29'}), /date/);
});

test('PCR completion requires live contact, each milestone topic and written evidence', () => {
  const { pcrCompletionErrors, requiredTopics } = require('../assets/post-closing.js');
  const evidence = {
    outcome: 'live',
    topics: [...requiredTopics[60]],
    asked: true,
    response: 'none',
    notes: 'Confirmed first payment and servicing.',
    nextSteps: 'Send the servicing contact details.',
  };
  assert.deepEqual(pcrCompletionErrors(60, evidence), []);
  assert.match(pcrCompletionErrors(60, {...evidence, outcome: 'voicemail'}).join(' '), /live/);
  assert.match(pcrCompletionErrors(60, {...evidence, topics: []}).join(' '), /topics/);
  assert.match(pcrCompletionErrors(60, {...evidence, notes: '  '}).join(' '), /notes/);
  assert.match(pcrCompletionErrors(60, {...evidence, nextSteps: ''}).join(' '), /next steps/);
  assert.match(pcrCompletionErrors(60, {...evidence, asked: false}).join(' '), /referral request/);
  assert.match(pcrCompletionErrors(60, {...evidence, response: 'self'}).join(' '), /response/);
  assert.match(pcrCompletionErrors(60, {...evidence, response: 'named', crmRef: ' '}).join(' '), /CRM reference/);
  assert.deepEqual(pcrCompletionErrors(60, {...evidence, response: 'named', crmRef: 'CRM-001'}), []);
});
