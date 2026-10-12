// Xero Remittance Email Picker — content script
// Runs on go.xero.com. When the "Send Remittance Advice" dialog opens, it reads
// every contact row, and for any contact with more than one email address it
// shows a picker so you can choose the address(es) in one step. The chosen
// emails are written back into Xero's own inputs; you then click Xero's Send.
// Choices are remembered per contact (chrome.storage.local) and pre-selected
// next time.

(() => {
  const OVERLAY_ID = 'xre-overlay';
  const BTN_ID = 'xre-pick-btn';
  const STORAGE_KEY = 'xreChoices';

  // ---------- helpers ----------

  const parseEmails = (v) =>
    String(v || '')
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const dedupe = (arr) => [...new Set(arr.map((e) => e.toLowerCase()))];

  function getDialog() {
    const form = document.querySelector('form.bulk');
    if (!form) return null;
    if (!form.querySelector('input[id^="ContactEmail_"]')) return null;
    return form;
  }

  function getRows(form) {
    return [...form.querySelectorAll('table.standard tbody tr')]
      .map((tr) => {
        const input = tr.querySelector('td.col-email input[type="text"]');
        if (!input) return null;
        const name = (tr.children[0]?.innerText || '').trim() || '(unnamed contact)';
        const send = tr.querySelector('td.col-send input[type="checkbox"]');
        const contactId = tr.id || input.id.replace(/^ContactEmail_/, '');
        // Xero keeps the untouched list in a hidden OriginalContactEmail_<guid>
        // input, so the full set of options survives after we rewrite the field.
        const original = tr.querySelector('input[id^="OriginalContactEmail_"]');
        const current = dedupe(parseEmails(input.value));
        const emails = dedupe([...parseEmails(original?.value || ''), ...current]);
        return { tr, input, send, name, contactId, emails, current };
      })
      .filter(Boolean);
  }

  function setInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  const storage = {
    async get() {
      return new Promise((res) =>
        chrome.storage.local.get(STORAGE_KEY, (r) => res(r[STORAGE_KEY] || {}))
      );
    },
    async set(choices) {
      return new Promise((res) => chrome.storage.local.set({ [STORAGE_KEY]: choices }, res));
    },
  };

  // ---------- UI ----------

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of children) n.append(c);
    return n;
  }

  function closeOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  async function openPicker(form) {
    closeOverlay();
    const rows = getRows(form);
    if (!rows.length) return;
    const remembered = await storage.get();

    const list = el('div', { class: 'xre-list' });
    const state = []; // { row, boxes[] }

    for (const row of rows) {
      const multi = row.emails.length > 1;
      // Pre-tick priority: a choice already applied to the field (current is a
      // strict subset of the options) → remembered choice → first address.
      const prev = remembered[row.contactId];
      const alreadyChosen = multi && row.current.length && row.current.length < row.emails.length;
      const preselect = new Set(
        alreadyChosen
          ? row.current
          : prev && prev.some((e) => row.emails.includes(e))
          ? prev.filter((e) => row.emails.includes(e))
          : row.emails.length ? [row.emails[0]] : []
      );

      const boxes = [];
      const emailsWrap = el('div', { class: 'xre-emails' });
      if (!row.emails.length) {
        emailsWrap.append(el('span', { class: 'xre-muted', text: 'No email address' }));
      }
      for (const email of row.emails) {
        const cb = el('input', { type: 'checkbox' });
        cb.checked = multi ? preselect.has(email) : true;
        cb.disabled = !multi;
        cb.value = email;
        boxes.push(cb);
        emailsWrap.append(
          el('label', { class: 'xre-email' + (multi ? '' : ' xre-single') }, [cb, el('span', { text: email })])
        );
      }

      const item = el('div', { class: 'xre-row' + (multi ? ' xre-multi' : '') }, [
        el('div', { class: 'xre-name', text: row.name }),
        emailsWrap,
      ]);
      list.append(item);
      state.push({ row, boxes });
    }

    const multiCount = rows.filter((r) => r.emails.length > 1).length;

    const apply = async (thenSend) => {
      const choices = await storage.get();
      let changed = 0;
      for (const { row, boxes } of state) {
        if (row.emails.length <= 1) continue;
        const chosen = boxes.filter((b) => b.checked).map((b) => b.value);
        if (!chosen.length) continue; // leave untouched if nothing ticked
        const newVal = chosen.join(', ');
        if (newVal !== row.input.value) {
          setInputValue(row.input, newVal);
          changed++;
        }
        choices[row.contactId] = chosen;
      }
      await storage.set(choices);
      closeOverlay();
      if (thenSend) {
        const sendBtn = document.querySelector('#popupSend');
        if (sendBtn) sendBtn.click();
      }
    };

    const footer = el('div', { class: 'xre-footer' }, [
      el('span', {
        class: 'xre-muted',
        text: multiCount
          ? `${multiCount} contact${multiCount === 1 ? '' : 's'} with multiple addresses`
          : 'All contacts have a single address',
      }),
      el('span', { class: 'xre-spacer' }),
      el('button', { type: 'button', class: 'xre-btn', onclick: closeOverlay, text: 'Cancel' }),
      el('button', { type: 'button', class: 'xre-btn xre-primary', onclick: () => apply(false), text: 'Apply' }),
      el('button', { type: 'button', class: 'xre-btn xre-send', onclick: () => apply(true), text: 'Apply & Send' }),
    ]);

    const panel = el('div', { class: 'xre-panel', role: 'dialog', 'aria-label': 'Choose remittance emails' }, [
      el('div', { class: 'xre-header' }, [
        el('div', { class: 'xre-title', text: 'Choose remittance emails' }),
        el('button', { type: 'button', class: 'xre-x', 'aria-label': 'Close', onclick: closeOverlay, text: '×' }),
      ]),
      list,
      footer,
    ]);

    const overlay = el('div', { id: OVERLAY_ID }, [panel]);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay();
    });
    document.addEventListener(
      'keydown',
      function esc(e) {
        if (e.key === 'Escape') {
          closeOverlay();
          document.removeEventListener('keydown', esc);
        }
      }
    );
    document.body.append(overlay);
  }

  // ---------- injection ----------

  function injectButton(form) {
    if (form.querySelector('#' + BTN_ID)) return;
    const anchor = form.querySelector('.contact-list') || form;
    const btn = el('button', {
      id: BTN_ID,
      type: 'button',
      class: 'xre-btn xre-primary xre-inline',
      text: 'Choose emails…',
      onclick: () => openPicker(form),
    });
    anchor.parentElement.insertBefore(btn, anchor);
  }

  let lastForm = null;
  function check() {
    const form = getDialog();
    if (!form) {
      lastForm = null;
      return;
    }
    injectButton(form);
    if (form !== lastForm) {
      lastForm = form;
      // Auto-open only when there is actually something to choose.
      if (getRows(form).some((r) => r.emails.length > 1)) openPicker(form);
    }
  }

  let t = null;
  const observer = new MutationObserver(() => {
    clearTimeout(t);
    t = setTimeout(check, 150);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  check();
})();
