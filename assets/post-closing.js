(function (root) {
  'use strict';

  const milestones = [30, 60, 90];

  function addCalendarDays(date, days) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Invalid closing date');
    }
    const calendarDay = new Date(date + 'T00:00:00Z');
    if (!Number.isFinite(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== date) {
      throw new Error('Invalid closing date');
    }
    calendarDay.setUTCDate(calendarDay.getUTCDate() + days);
    return calendarDay.toISOString().slice(0, 10);
  }

  function milestonesForLoan({ hash, closed }) {
    if (typeof hash !== 'string' || !/^(?:[a-f0-9]{20}|fnv[a-f0-9]+)$/.test(hash)) {
      throw new Error('Invalid funded loan identity');
    }
    return milestones.map(milestone => ({
      key: hash + ':' + milestone,
      hash,
      milestone,
      due: addCalendarDays(closed, milestone),
    }));
  }

  const requiredTopics = Object.freeze({
    30: Object.freeze(['settling-in', 'mortgage-statement', 'first-payment-and-servicing', 'questions-and-concerns', 'offer-of-assistance']),
    60: Object.freeze(['settling-in', 'servicing-transfer-and-payment', 'mortgage-questions', 'approved-rate-drop-pledge', 'offer-of-assistance']),
    90: Object.freeze(['homeowner-experience', 'homeowner-needs', 'financing-questions', 'future-assistance', 'offer-of-assistance']),
  });

  function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function pcrCompletionErrors(milestone, evidence) {
    if (!milestones.includes(milestone)) return ['An eligible milestone is required.'];
    const errors = [];
    if (evidence.outcome !== 'live') errors.push('A live client conversation is required.');
    if (!Array.isArray(evidence.topics) || !requiredTopics[milestone].every(topic => evidence.topics.includes(topic))) {
      errors.push('Discuss all required milestone topics.');
    }
    if (evidence.asked !== true) errors.push('Document the referral request.');
    if (!['none', 'named', 'declined'].includes(evidence.response)) errors.push('Document the client response.');
    if (!hasText(evidence.notes)) errors.push('Enter conversation notes.');
    if (!hasText(evidence.nextSteps)) errors.push('Document next steps.');
    if (evidence.response === 'named' && (!hasText(evidence.crmRef) || !/^[A-Za-z0-9_-]{6,80}$/.test(evidence.crmRef.trim()))) {
      errors.push('Enter a valid CRM reference for the named referral.');
    }
    return errors;
  }

  const rules = { milestonesForLoan, pcrCompletionErrors, requiredTopics };
  if (typeof module !== 'undefined' && module.exports) module.exports = rules;
  else root.ctPostClosingRules = rules;
})(globalThis);
