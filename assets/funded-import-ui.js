(function (root) {
  'use strict';

  function installFundedImport(panel, {url, key, hashLoan}) {
    const controls = document.createElement('details');
    controls.innerHTML = `
      <summary>Import post-closing calls</summary>
      <p>Validate a workbook, then sign in with Mack’s team email to import it.</p>
      <form data-email-form>
        <label>Team email <input type="email" autocomplete="email" required></label>
        <button class="btn" type="submit">Send sign-in code</button>
      </form>
      <form data-code-form hidden>
        <label>Email code <input autocomplete="one-time-code" inputmode="numeric" required></label>
        <button class="btn" type="submit">Verify code</button>
      </form>
      <button class="btn" data-import type="button" disabled>Import calls</button>
      <button class="btn" data-sign-out type="button" hidden>End import session</button>
      <p data-status role="status"></p>`;
    panel.append(controls);

    const emailForm = controls.querySelector('[data-email-form]');
    const codeForm = controls.querySelector('[data-code-form]');
    const importButton = controls.querySelector('[data-import]');
    const signOut = controls.querySelector('[data-sign-out]');
    const status = controls.querySelector('[data-status]');
    let email;
    let token;
    let batch;
    let busy = false;

    function update() {
      importButton.disabled = busy || !token || !batch?.loans.length;
      emailForm.hidden = Boolean(token);
      signOut.hidden = !token;
      for (const button of controls.querySelectorAll('form button')) button.disabled = busy;
      signOut.disabled = busy;
    }

    async function request(path, body, accessToken) {
      const response = await fetch(url + path, {
        method: 'POST',
        headers: {
          apikey: key,
          'Content-Type': 'application/json',
          ...(accessToken && {Authorization: 'Bearer ' + accessToken}),
        },
        body: body == null ? undefined : JSON.stringify(body),
      });
      if (response.status === 204) return null;
      const result = await response.json();
      if (!response.ok) {
        if (accessToken && response.status === 401) {
          token = undefined;
          codeForm.hidden = true;
          throw new Error('Session expired. Request another sign-in code.');
        }
        throw new Error(result.message || result.msg || 'The server could not complete the request.');
      }
      return result;
    }

    async function run(action) {
      if (busy) return;
      busy = true;
      update();
      try {
        await action();
      } catch (error) {
        status.textContent = error.message;
      } finally {
        busy = false;
        update();
      }
    }

    emailForm.onsubmit = event => {
      event.preventDefault();
      run(async () => {
        const address = emailForm.querySelector('input').value.trim();
        await request('/auth/v1/otp', {email: address, create_user: false});
        email = address;
        codeForm.hidden = false;
        status.textContent = 'Check your email for the sign-in code.';
      });
    };

    codeForm.onsubmit = event => {
      event.preventDefault();
      run(async () => {
        const field = codeForm.querySelector('input');
        const result = await request('/auth/v1/verify', {email, type: 'email', token: field.value.trim()});
        if (!result.access_token) throw new Error('No sign-in session was returned.');
        token = result.access_token;
        field.value = '';
        codeForm.hidden = true;
        status.textContent = 'Signed in. The server checks Mack’s access when you import.';
      });
    };

    importButton.onclick = () => run(async () => {
      const selected = batch;
      if (!selected || !token) return;
      status.textContent = 'Importing calls…';
      const p_loans = await Promise.all(selected.loans.map(async record => ({
        loan_key: await hashLoan(record.loan),
        closed_on: record.closed,
        owner: record.owner,
      })));
      const result = await request('/rest/v1/rpc/core_lp_import_funded_batch', {
        p_loans, p_source_reference: selected.reference,
      }, token);
      status.textContent = [
        result.imported + ' loans imported',
        result.unchanged + ' already imported',
        result.needs_review + ' need review',
        result.outside_window + ' outside the launch window',
      ].join(' · ');
    });

    signOut.onclick = () => run(async () => {
      const previous = token;
      token = undefined;
      status.textContent = 'Import session ended.';
      await request('/auth/v1/logout?scope=local', null, previous);
    });

    return selected => {
      batch = selected;
      update();
    };
  }
  root.ctInstallFundedImport = installFundedImport;
})(globalThis);
