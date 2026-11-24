(function (root) {
  'use strict';

  const dateFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  let currentRequest = 0;

  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }

  function callForm(task, owner, access, today, request) {
    const details = document.createElement('details');
    details.append(element('summary', 'Record call'));
    const form = document.createElement('form');
    form.innerHTML = `
      <p><label>Contact outcome <select name="outcome">
        <option value="live">Live conversation</option><option value="voicemail">Voicemail</option>
        <option value="unanswered">No answer</option><option value="email">Email</option>
        <option value="text">Text</option><option value="client-concern">Client concern</option>
      </select></label></p>
      <fieldset><legend>Topics discussed</legend></fieldset>
      <p><label><input type="checkbox" name="asked"> Asked for a past-client referral</label></p>
      <p><label>Referral response <select name="response">
        <option value="">Select a response</option><option value="none">No referral</option>
        <option value="declined">Declined</option><option value="named">Named referral</option>
      </select></label></p>
      <p><label>CRM reference <input name="crmRef" maxlength="80"></label></p>
      <p><label>Conversation notes <textarea name="notes" required maxlength="4000"></textarea></label></p>
      <p><label>Next steps <textarea name="nextSteps" maxlength="4000"></textarea></label></p>
      <p><label>Follow-up date <input type="date" name="followUp"></label></p>
      <button class="btn" type="submit" value="attempt">Save attempt</button>
      <button class="btn" type="submit" value="complete">Complete call</button>
      <p role="status"></p>`;
    const {requiredTopics, pcrCompletionErrors} = root.ctPostClosingRules;
    for (const topic of requiredTopics[task.milestone]) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'topics';
      checkbox.value = topic;
      label.append(checkbox, ' ' + topic.replaceAll('-', ' '));
      form.querySelector('fieldset').append(label, document.createElement('br'));
    }
    details.append(form);
    const status = form.querySelector('[role=status]');
    let savedRequest;
    form.onsubmit = async event => {
      event.preventDefault();
      if (request !== currentRequest) return;
      const complete = event.submitter?.value === 'complete';
      const data = new FormData(form);
      const evidence = {
        outcome: data.get('outcome'), topics: data.getAll('topics'), asked: data.has('asked'),
        response: data.get('response'), crmRef: data.get('crmRef').trim(),
        notes: data.get('notes').trim(), nextSteps: data.get('nextSteps').trim(),
        followUp: data.get('followUp'),
      };
      const errors = complete ? pcrCompletionErrors(task.milestone, evidence)
        : !evidence.notes || !evidence.followUp || evidence.followUp < today
          ? ['Enter notes and a follow-up date for this attempt.'] : [];
      if (errors.length) {
        status.textContent = errors.join(' ');
        return;
      }
      const change = JSON.stringify({complete, evidence});
      const buttons = [...form.querySelectorAll('button')];
      buttons.forEach(button => { button.disabled = true; });
      status.textContent = 'Saving…';
      try {
        if (savedRequest?.change !== change) savedRequest = {change, id: crypto.randomUUID()};
        await access.recordPostClosingCall({
          p_request_id: savedRequest.id, p_loan_key: task.loan_key,
          p_milestone: task.milestone, p_complete: complete, p_evidence: evidence,
        });
        if (request === currentRequest) await showPostClosingWorklist(owner);
      } catch {
        status.textContent = 'Call couldn’t be saved. Review your entry and try again.';
      } finally {
        buttons.forEach(button => { button.disabled = false; });
      }
    };
    return details;
  }

  async function showPostClosingWorklist(owner) {
    const panel = document.getElementById('lp-post-closing');
    if (!panel) return;
    const request = ++currentRequest;
    const status = panel.querySelector(':scope > [role=status]');
    const list = panel.querySelector('ul');
    list.replaceChildren();

    const access = root.ctTeamAccess;
    if (!access?.loadPostClosingTasks) {
      status.textContent = 'Post-closing calls are unavailable until team access is connected.';
      return;
    }

    status.textContent = 'Loading post-closing calls…';
    try {
      // The team-access adapter must authorize each request independently of the name picker.
      const tasks = await access.loadPostClosingTasks(owner);
      if (request !== currentRequest) return;
      if (!Array.isArray(tasks) || tasks.some(task =>
        ![30, 60, 90].includes(task.milestone) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(task.original_due_on) ||
        typeof task.loan_key !== 'string')) {
        throw new Error('Invalid post-closing task response');
      }

      const today = dateFormat.format(new Date());
      const open = tasks.filter(task => !task.completed_at);
      const due = open.filter(task => task.original_due_on <= today).length;
      status.textContent = tasks.length === 0 ? 'No assigned post-closing calls.'
        : !open.length ? 'All assigned post-closing calls are complete.'
        : due + ' due or overdue · ' + (open.length - due) + ' upcoming';
      for (const task of [...tasks].sort((a, b) => a.original_due_on.localeCompare(b.original_due_on))) {
        const state = task.completed_at ? 'Complete' : task.original_due_on < today ? 'Overdue'
          : task.original_due_on === today ? 'Due today' : 'Upcoming';
        const item = element('li', task.milestone + '-day call · ' + task.original_due_on +
          ' · ' + state + ' · ' + (task.label || task.loan_key));
        if (task.attempt_count > 0) {
          const attempts = task.attempt_count + (task.attempt_count === 1 ? ' attempt' : ' attempts');
          const concern = task.latest_outcome === 'client-concern' ? ' · Client concern' : '';
          const followUp = task.follow_up_on && !task.completed_at ? ' · Follow up ' + task.follow_up_on : '';
          item.append(element('p', attempts + concern + followUp));
        }
        if (!task.completed_at && typeof access.recordPostClosingCall === 'function') {
          item.append(callForm(task, owner, access, today, request));
        }
        list.append(item);
      }
    } catch {
      if (request === currentRequest) status.textContent = 'Post-closing calls couldn’t load. Try refreshing.';
    }
  }

  root.ctShowPostClosingWorklist = showPostClosingWorklist;
})(globalThis);
