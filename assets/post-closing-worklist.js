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

  async function showPostClosingWorklist(owner) {
    const panel = document.getElementById('lp-post-closing');
    if (!panel) return;
    const request = ++currentRequest;
    const status = panel.querySelector('[role=status]');
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
        list.append(element('li', task.milestone + '-day call · ' + task.original_due_on +
          ' · ' + state + ' · ' + (task.label || task.loan_key)));
      }
    } catch {
      if (request === currentRequest) status.textContent = 'Post-closing calls couldn’t load. Try refreshing.';
    }
  }

  root.ctShowPostClosingWorklist = showPostClosingWorklist;
})(globalThis);
