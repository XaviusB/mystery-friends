import { t, lang, languages, setLang } from '/i18n.js';

const app = document.getElementById('app');

const switcher = document.getElementById('lang');
for (const l of languages) {
  const opt = document.createElement('option');
  opt.value = l.code;
  opt.textContent = l.name;
  opt.selected = l.code === lang;
  switcher.append(opt);
}
switcher.addEventListener('change', () => setLang(switcher.value));

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data && data.error ? t(`err.${data.error}`) : t('err.generic'));
  return data;
}

const origin = location.origin;

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', {}, text);
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function shareLink(p, group) {
  const url = `${origin}/me/${p.token}`;
  const text = t('admin.shareText', { name: p.name, group });
  if (navigator.share) return navigator.share({ title: 'Mystery Friends', text, url }).catch(() => {});
  location.href = `mailto:?subject=${encodeURIComponent(`Mystery Friends – ${group}`)}&body=${encodeURIComponent(`${text}\n${url}`)}`;
}

function resultsBox(assignments, byId) {
  const list = h('ul', { hidden: true }, assignments.map((a) => h('li', {}, h('span', {}, `${byId[a.giver]} → ${byId[a.receiver]}`))));
  const btn = h('button', { type: 'button', onclick: () => {
    list.hidden = !list.hidden;
    btn.textContent = list.hidden ? t('admin.showResults') : t('admin.hideResults');
  } }, t('admin.showResults'));
  return h('div', {}, btn, list);
}

// Promise-based modal built on <dialog>. Resolves with true/false (confirm) or the input value/null (input).
function modal({ title, text, input, confirmLabel, danger }) {
  return new Promise((resolve) => {
    const field = input != null ? h('input', { maxlength: 100, value: input, required: true }) : null;
    const dlg = h('dialog', { class: 'modal' });
    let result = field ? null : false;
    const ok = h('button', { type: 'submit', class: danger ? 'danger' : '' }, confirmLabel || t('modal.ok'));
    const cancel = h('button', { type: 'button', class: 'secondary', onclick: () => dlg.close() }, t('modal.cancel'));
    const f = h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        result = field ? field.value.trim() || null : true;
        dlg.close();
      },
    }, h('h2', {}, title), text && h('p', {}, text), field, h('div', { class: 'row modal-actions' }, cancel, ok));
    dlg.append(f);
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
    (field || ok).focus();
    field?.select();
  });
}
const confirmModal = (opts) => modal(opts);
const inputModal = (opts) => modal(opts);

function linkBox(label, url) {
  const input = h('input', { readonly: true, value: url });
  const btn = h('button', {
    type: 'button',
    onclick: async () => {
      try { await navigator.clipboard.writeText(url); } catch { input.select(); document.execCommand('copy'); }
      btn.textContent = t('copied');
      setTimeout(() => (btn.textContent = t('copy')), 1500);
    },
  }, t('copy'));
  return h('div', {}, h('label', {}, label), h('div', { class: 'link' }, input, btn));
}

const DISMISS_COOKIE = 'mf_warn_dismissed';
const warnDismissed = () => document.cookie.split('; ').includes(`${DISMISS_COOKIE}=1`);

// Guest pages also tell the guest that the admin can resend the link.
function keepWarning(whatKey, guest = false) {
  if (warnDismissed()) return null;
  const close = h('button', { class: 'warn-close', type: 'button', title: t('warn.close'), 'aria-label': t('warn.close'), onclick: (e) => {
    document.cookie = `${DISMISS_COOKIE}=1; max-age=31536000; path=/; SameSite=Lax`;
    e.currentTarget.closest('.warn').remove();
  } }, '×');
  return h('div', { class: 'warn' }, close,
    h('p', {}, t('warn.keep', { what: t(whatKey) })),
    guest && h('p', {}, t('warn.resend')),
    h('p', { class: 'muted' }, t('warn.cookie')));
}

// Wraps a form handler: shows errors, disables submit during the request.
function form(fields, submitLabel, onSubmit) {
  const err = h('div', { class: 'error' });
  const btn = h('button', { type: 'submit' }, submitLabel);
  const f = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      try { await onSubmit(new FormData(f)); } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    },
  }, fields, btn, err);
  return f;
}

const field = (label, name, extra = {}) =>
  h('div', {}, h('label', { for: name }, label), h('input', { id: name, name, required: true, maxlength: 100, ...extra }));

function render(...nodes) { app.replaceChildren(...nodes); }

function showError(message) {
  render(h('div', { class: 'card' }, h('h2', {}, t('oops')), h('p', {}, message), h('a', { href: '/' }, t('backHome'))));
}

// ---------- Home: create a group ----------
function home() {
  render(h('div', { class: 'card' },
    h('h1', {}, t('home.title')),
    h('p', { class: 'muted' }, t('home.intro')),
    form([field(t('home.groupName'), 'name', { placeholder: t('home.groupPlaceholder') }), field(t('home.yourName'), 'adminName')],
      t('home.create'),
      async (fd) => {
        const r = await api('POST', '/api/groups', { name: fd.get('name'), adminName: fd.get('adminName') });
        localStorage.setItem('mf-last-admin', r.adminToken);
        created(r);
      }),
  ));
}

function created(r) {
  render(h('div', { class: 'card' },
    h('h1', {}, t('created.title')),
    keepWarning('warn.theseLinks'),
    linkBox(t('created.admin'), `${origin}/admin/${r.adminToken}`),
    linkBox(t('created.invite'), `${origin}/join/${r.joinToken}`),
    linkBox(t('created.me'), `${origin}/me/${r.participantToken}`),
    h('a', { href: `/admin/${r.adminToken}` }, h('button', { type: 'button' }, t('created.go'))),
  ));
}

// ---------- Join ----------
async function join(token) {
  const info = await api('GET', `/api/join/${token}`);
  if (info.drawn) return showError(t('join.alreadyDrawn'));
  render(h('div', { class: 'card' },
    h('h1', {}, t('join.title', { name: info.name })),
    h('p', { class: 'muted' }, t('join.count', { count: info.count })),
    form([field(t('home.yourName'), 'name')], t('join.button'), async (fd) => {
      const r = await api('POST', `/api/join/${token}`, { name: fd.get('name') });
      render(h('div', { class: 'card' },
        h('h1', {}, t('join.done')),
        keepWarning('warn.personalBelow', true),
        linkBox(t('join.yourLink'), `${origin}/me/${r.participantToken}`),
        h('a', { href: `/me/${r.participantToken}` }, h('button', { type: 'button' }, t('join.open'))),
      ));
    }),
  ));
}

// ---------- Participant ----------
async function me(token) {
  const d = await api('GET', `/api/me/${token}`);
  render(h('div', { class: 'card' },
    h('h1', {}, t('me.hello', { name: d.name })),
    h('p', {}, t('me.group', { group: d.groupName })),
    d.drawn
      ? [h('p', {}, t('me.mustOffer')), h('div', { class: 'target' }, d.target || '—'), h('p', { class: 'muted' }, t('me.secret'))]
      : h('p', {}, t('me.notYet')),
    keepWarning('warn.thisPage', true),
  ),
  h('div', { class: 'card' },
    h('h2', {}, t('me.members', { count: d.members.length })),
    h('ul', {}, d.members.map((m) => h('li', {}, h('span', {}, m.name, m.me ? ` ${t('me.you')}` : '')))),
  ),
  h('div', { class: 'card' },
    h('h2', {}, t('me.rename')),
    form([field(t('home.yourName'), 'name', { value: d.name })], t('save'), async (fd) => {
      await api('PATCH', `/api/me/${token}`, { name: fd.get('name') });
      await me(token);
    }),
  ));
}

// ---------- Admin ----------
async function admin(token) {
  const d = await api('GET', `/api/admin/${token}`);
  const reload = () => admin(token).catch((e) => showError(e.message));
  const byId = Object.fromEntries(d.participants.map((p) => [p.id, p.name]));
  const run = (fn) => async () => {
    try { await fn(); await reload(); } catch (e) { await modal({ title: t('oops'), text: e.message, confirmLabel: t('modal.ok') }); }
  };

  const people = h('ul', {}, d.participants.map((p) => h('li', { class: 'person' },
    h('span', {}, p.name),
    h('span', { class: 'row' },
      h('button', { class: 'small secondary', type: 'button', onclick: run(async () => {
        const name = await inputModal({ title: t('admin.rename'), text: t('admin.renamePrompt', { name: p.name }), input: p.name, confirmLabel: t('save') });
        if (name && name !== p.name) await api('PATCH', `/api/admin/${token}/participants/${p.id}`, { name });
      }) }, t('admin.rename')),
      h('button', { class: 'small secondary', type: 'button', title: t('copyPersonal'), onclick: async (e) => {
        await copyText(`${origin}/me/${p.token}`);
        e.target.textContent = t('copied');
        setTimeout(() => (e.target.textContent = t('admin.copyLink')), 1500);
      } }, t('admin.copyLink')),
      h('button', { class: 'small secondary', type: 'button', onclick: () => shareLink(p, d.name) }, t('admin.share')),
      !d.drawn && h('button', { class: 'small', type: 'button', onclick: run(async () => {
        if (await confirmModal({ title: t('admin.removeTitle'), text: t('admin.remove', { name: p.name }), confirmLabel: t('admin.removeBtn'), danger: true })) await api('DELETE', `/api/admin/${token}/participants/${p.id}`);
      }) }, '✕')),
  )));

  const exclusions = d.exclusions.length
    ? h('ul', {}, d.exclusions.map((x) => h('li', {},
      h('span', {}, `${byId[x.a]} ⇄ ${byId[x.b]}`),
      !d.drawn && h('button', { class: 'small', type: 'button', onclick: run(() => api('DELETE', `/api/admin/${token}/exclusions/${x.id}`)) }, '✕'))))
    : h('p', { class: 'muted' }, t('admin.noExcl'));

  const options = () => d.participants.map((p) => h('option', { value: p.id }, p.name));
  const exclusionForm = d.drawn || d.participants.length < 2 ? null : form(
    h('div', { class: 'row' }, h('select', { name: 'a' }, options()), h('span', {}, '⇄'), h('select', { name: 'b' }, options())),
    t('admin.forbid'),
    async (fd) => { await api('POST', `/api/admin/${token}/exclusions`, { a: fd.get('a'), b: fd.get('b') }); await reload(); },
  );

  render(
    h('div', { class: 'card' },
      h('h1', {}, d.name),
      keepWarning('warn.thisAdmin'),
      linkBox(t('created.invite'), `${origin}/join/${d.joinToken}`),
    ),
    h('div', { class: 'card' }, h('h2', {}, t('admin.participants', { count: d.participants.length })), people),
    h('div', { class: 'card' },
      h('h2', {}, t('admin.exclTitle')),
      h('p', { class: 'muted' }, t('admin.exclHelp')),
      exclusions, exclusionForm),
    h('div', { class: 'card' },
      d.drawn
        ? [h('h2', {}, t('admin.drawDone')), h('p', {}, t('admin.drawDoneText')),
           resultsBox(d.assignments, byId),
           h('button', { class: 'secondary', type: 'button', onclick: run(async () => {
             if (await confirmModal({ title: t('admin.cancelDraw'), text: t('admin.cancelConfirm'), confirmLabel: t('admin.cancelDraw'), danger: true })) await api('POST', `/api/admin/${token}/reset`);
           }) }, t('admin.cancelDraw'))]
        : [h('h2', {}, t('admin.ready')), h('p', { class: 'muted' }, t('admin.readyText')),
           h('button', { type: 'button', disabled: d.participants.length < 3, onclick: run(async () => {
             if (await confirmModal({ title: t('admin.roll'), text: t('admin.rollConfirm'), confirmLabel: t('admin.roll') })) await api('POST', `/api/admin/${token}/draw`);
           }) }, t('admin.roll'))],
    ),
  );
}

// ---------- Router ----------
const m = location.pathname.match(/^\/(join|admin|me)\/([^/]+)$/);
const routes = { join, admin, me };
(m ? routes[m[1]](m[2]) : Promise.resolve(home())).catch((e) => showError(e.message));
