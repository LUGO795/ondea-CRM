/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — views/interactions.js
   Suivi commercial : timeline moderne de toutes les interactions
   (appel, e-mail, rendez-vous, message, devis, achat, facture,
   relance, autre), regroupées par jour, filtrables par type, client,
   utilisateur, période et statut. Vue « À faire » : relances et
   rendez-vous planifiés, en retard / aujourd'hui / à venir.
   Les interactions « Devis », « Achat » et « Facture » sont créées
   automatiquement et renvoient vers le document correspondant.
   ██████████████████████████████████████████████████████████████ */
"use strict";

const ITF_DEFAULT = { view: 'timeline', q: '', type: '', client: '', user: '', from: '', to: '', status: '', page: 1 };
const ITF = UI_STATE.load('interactions', ITF_DEFAULT);
const ITEMS_PER_PAGE = 40;

function filteredInteractions(f = ITF) {
  const t = norm(f.q);
  return S.interactions.filter(i =>
    (f.view !== 'todo' || !i.done) &&
    (!f.type || i.type === f.type) && (!f.client || i.clientId === f.client) && (!f.user || i.userId === f.user) &&
    (!f.from || i.date >= f.from) && (!f.to || i.date <= f.to) &&
    (!f.status || (f.status === 'done' ? i.done : f.status === 'late' ? isTaskOverdue(i) : !i.done)) &&
    (!t || norm(i.title + ' ' + i.description + ' ' + clientName(i.clientId) + ' ' + i.userName).includes(t))
  ).sort((a, b) => {
    const ka = a.date + (a.time || ''), kb = b.date + (b.time || '');
    return f.view === 'todo' ? ka.localeCompare(kb) : kb.localeCompare(ka);
  });
}

VIEWS.interactions = (el, params) => {
  if (params.view) ITF.view = params.view === 'todo' ? 'todo' : 'timeline';
  if (params.client) ITF.client = params.client;
  const todo = S.interactions.filter(i => !i.done);
  const late = todo.filter(isTaskOverdue).length, today = todo.filter(i => i.date === todayISO()).length;
  el.innerHTML = pageHead('Suivi commercial', crumbFor('interactions'),
    (can('export') ? `<button type="button" class="btn" id="iCsv">${svg('down')} Export CSV</button>` : '') +
    (can('client.edit') ? `<button type="button" class="btn" id="iPlan">${svg('bell')} Planifier une relance</button><button type="button" class="btn gold" id="iNew">${svg('plus')} Nouvelle interaction</button>` : ''),
    `${S.interactions.length} interaction(s) · <b>${todo.length}</b> à faire${late ? ` · <b class="dng-t">${late} en retard</b>` : ''}${today ? ` · ${today} aujourd'hui` : ''}`) +
    `<div class="tbl-tools"><div class="seg" role="group" aria-label="Affichage">
        <button type="button" data-iv="timeline" class="${ITF.view === 'timeline' ? 'on' : ''}" aria-pressed="${ITF.view === 'timeline'}">${svg('list', 'seg-ic')}Timeline</button>
        <button type="button" data-iv="todo" class="${ITF.view === 'todo' ? 'on' : ''}" aria-pressed="${ITF.view === 'todo'}">${svg('bell', 'seg-ic')}À faire <span class="mono">${todo.length}</span></button></div></div>
    <div class="tbl-tools" role="search" aria-label="Filtrer les interactions">
      ${searchBox('iQ', 'Rechercher dans les interactions', ITF.q, 'Titre, description, client…', 260)}
      ${filterSelect('iType', 'Type', Object.entries(INTER_TYPES).map(([k, t]) => [k, t.label]), ITF.type, 'Tous types')}
      ${filterSelect('iClient', 'Client', optClients(() => true).map(([v, l]) => [v, l.split(' — ')[0]]), ITF.client, 'Tous clients')}
      ${filterSelect('iUser', 'Utilisateur', OPERATORS.map(o => [o.id, o.name]), ITF.user, 'Tous utilisateurs')}
      ${ITF.view === 'timeline' ? filterSelect('iStatus', 'Statut', [['done', 'Réalisées'], ['todo', 'Planifiées'], ['late', 'En retard']], ITF.status, 'Tous statuts') : ''}
      <label class="sr-only" for="iFrom">Du</label><input class="inp" type="date" id="iFrom" value="${esc(ITF.from)}" style="width:auto" title="Du">
      <label class="sr-only" for="iTo">Au</label><input class="inp" type="date" id="iTo" value="${esc(ITF.to)}" style="width:auto" title="Au">
      <button type="button" class="btn ghost sm" id="iReset">Réinitialiser</button>
    </div><div id="iList" aria-live="polite"></div>`;
  const draw = () => {
    UI_STATE.save('interactions', ITF);
    const rows = filteredInteractions();
    const pg = paginate(rows, ITF, ITEMS_PER_PAGE);
    const host = $('#iList', el);
    if (!rows.length) host.innerHTML = S.interactions.length ? emptyState(ITF.view === 'todo' ? 'check' : 'search', ITF.view === 'todo' ? 'Rien à faire' : 'Aucun résultat', ITF.view === 'todo' ? 'Aucune relance ni rendez-vous planifié avec ces filtres.' : 'Aucune interaction ne correspond à ces filtres.')
      : emptyState('msg', 'Aucune interaction', 'Notez vos appels, e-mails et rendez-vous, ou planifiez une relance.', can('client.edit') ? `<button type="button" class="btn gold" data-inew>${svg('plus')} Nouvelle interaction</button>` : '');
    else if (ITF.view === 'todo') {
      const groups = [['Ouvertes en retard', pg.rows.filter(isTaskOverdue)], ['Aujourd\'hui', pg.rows.filter(i => i.date === todayISO())], ['À venir', pg.rows.filter(i => i.date > todayISO())]];
      host.innerHTML = groups.filter(([, l]) => l.length).map(([t, l]) => `<section class="panel" style="margin-bottom:18px"><div class="panel-h"><h3>${t}</h3><span class="chip ${t.startsWith('Ouvertes') ? 'dng' : t.startsWith('Aujourd') ? 'warn' : ''}">${l.length}</span></div><div class="panel-b">${timelineHTML(l, { client: true })}</div></section>`).join('') + pagerHTML(ITF.page, pg.pages, pg.total, pg.start, pg.rows.length, 'interaction');
    } else host.innerHTML = `<section class="panel"><div class="panel-b">${timelineHTML(pg.rows, { client: true, grouped: true })}</div></section>` + pagerHTML(ITF.page, pg.pages, pg.total, pg.start, pg.rows.length, 'interaction');
    bindTimeline(host); bindPager(host, ITF, draw);
    $$('[data-inew]', host).forEach(b => b.onclick = () => interactionForm());
  };
  draw();
  $$('[data-iv]', el).forEach(b => b.onclick = () => { ITF.view = b.dataset.iv; ITF.page = 1; UI_STATE.save('interactions', ITF); history.replaceState(null, '', '#/interactions'); route({ keepScroll: true }); });
  $('#iQ', el).oninput = debounce(e => { ITF.q = e.target.value; ITF.page = 1; draw(); }, 150);
  [['iType', 'type'], ['iClient', 'client'], ['iUser', 'user'], ['iStatus', 'status'], ['iFrom', 'from'], ['iTo', 'to']].forEach(([id, k]) => { const x = $('#' + id, el); if (x) x.onchange = e => { ITF[k] = e.target.value; ITF.page = 1; draw(); }; });
  $('#iReset', el).onclick = () => { Object.assign(ITF, ITF_DEFAULT, { view: ITF.view }); UI_STATE.save('interactions', ITF); history.replaceState(null, '', '#/interactions'); route(); };
  if ($('#iNew', el)) $('#iNew', el).onclick = () => interactionForm(null, { clientId: ITF.client || '' });
  if ($('#iPlan', el)) $('#iPlan', el).onclick = () => interactionForm(null, { clientId: ITF.client || '', type: 'relance', done: false, date: addDays(todayISO(), 7) });
  if ($('#iCsv', el)) $('#iCsv', el).onclick = () => exportInteractionsCSV(filteredInteractions());
  if (params.action === 'new' && can('client.edit')) { history.replaceState(null, '', '#/interactions'); setTimeout(() => interactionForm(), 50); }
};

/* ═════════════════════ TIMELINE (composant réutilisé partout) ═════════════════════
   opts : client (affiche le nom du client), compact (sans description longue),
          grouped (intercalaires par jour) */
function timelineHTML(list, { client = false, compact = false, grouped = false } = {}) {
  let lastDay = '';
  const items = list.map(i => {
    const t = INTER_TYPES[i.type] || INTER_TYPES.autre;
    const ct = contactById(i.contactId);
    const state = i.done ? '' : isTaskOverdue(i) ? 'overdue' : 'todo';
    const refLbl = { devis: 'Ouvrir le devis', facture: 'Ouvrir la facture', achat: 'Ouvrir l\'achat' }[i.ref?.type];
    let day = '';
    if (grouped && i.date !== lastDay) { lastDay = i.date; const d = new Date(i.date + 'T12:00:00'); day = `<li class="tl-day" aria-hidden="true">${i.date === todayISO() ? 'Aujourd\'hui' : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</li>`; }
    const desc = compact && i.description.length > 140 ? i.description.slice(0, 140) + '…' : i.description;
    return day + `<li class="tl-item"><span class="tl-ic t-${i.type}" aria-hidden="true">${svg(t.icon)}</span>
      <div class="tl-card ${state}"><div class="tl-head"><div style="min-width:0"><b>${esc(i.title)}</b>
        <div class="tl-meta">${fmtDate(i.date)}${i.time ? ' · ' + esc(i.time) : ''} · ${esc(t.label)}${i.userName ? ' · ' + esc(i.userName) : ''}${ct ? ' · avec ' + esc(contactName(ct)) : i.contactLabel ? ' · avec ' + esc(i.contactLabel) : ''}</div></div>
        <div class="row wrap" style="gap:6px">${!i.done ? `<span class="chip ${state === 'overdue' ? 'dng' : 'warn'} xs">${svg('clock')}${state === 'overdue' ? 'En retard' : 'À faire'}</span>` : ''}${i.auto ? '<span class="chip xs" title="Créée automatiquement">auto</span>' : ''}</div></div>
        ${client ? `<button type="button" class="link-btn" data-tlcli="${i.clientId}" style="margin-top:4px">${esc(clientName(i.clientId))}</button>` : ''}
        ${desc ? `<div class="tl-desc">${esc(desc)}</div>` : ''}
        <div class="tl-acts">
          ${!i.done && can('client.edit') ? `<button type="button" class="btn sm" data-itdone="${i.id}">${svg('check')} Marquer comme fait</button>` : ''}
          ${refLbl && i.ref?.id ? `<button type="button" class="btn sm ghost" data-itref="${i.ref.type}" data-id="${i.ref.id}">${svg('ext')} ${refLbl}</button>` : ''}
          ${!i.auto && can('client.edit') ? `<button type="button" class="btn icon sm ghost" data-itedit="${i.id}" aria-label="Modifier « ${esc(i.title)} »" title="Modifier">${svg('edit')}</button><button type="button" class="btn icon sm danger" data-itdel="${i.id}" aria-label="Supprimer « ${esc(i.title)} »" title="Supprimer">${svg('trash')}</button>` : ''}
          ${i.done && !i.auto && can('client.edit') ? `<button type="button" class="btn icon sm ghost" data-itundo="${i.id}" aria-label="Rouvrir « ${esc(i.title)} »" title="Repasser à faire">${svg('undo')}</button>` : ''}
        </div></div></li>`;
  }).join('');
  return `<ol class="tl" aria-label="Historique des interactions">${items}</ol>`;
}
function bindTimeline(root) {
  $$('[data-itdone]', root).forEach(b => b.onclick = () => guard(b, async () => { await toggleInteractionDone(b.dataset.itdone); toast('Interaction marquée comme réalisée', 'ok'); }));
  $$('[data-itundo]', root).forEach(b => b.onclick = () => guard(b, async () => { await toggleInteractionDone(b.dataset.itundo); toast('Interaction repassée « à faire »', 'info'); }));
  $$('[data-itedit]', root).forEach(b => b.onclick = () => interactionForm(b.dataset.itedit));
  $$('[data-itref]', root).forEach(b => b.onclick = () => openRef(b.dataset.itref, b.dataset.id));
  $$('[data-tlcli]', root).forEach(b => b.onclick = () => go('client', { id: b.dataset.tlcli, tab: 'interactions' }));
  $$('[data-itdel]', root).forEach(b => b.onclick = () => {
    const i = interactionById(b.dataset.itdel); if (!i) return;
    confirmDialog(`Supprimer l'interaction « ${i.title} » du ${fmtDate(i.date)} ? Cette action est irréversible.`, async () => { await deleteInteraction(i.id); toast('Interaction supprimée', 'dng'); }, { yes: 'Supprimer' });
  });
}

/* ═════════════════════ FORMULAIRE ═════════════════════ */
const INTER_DEFAULT_TITLE = { appel: 'Appel téléphonique', email: 'E-mail envoyé', rdv: 'Rendez-vous', message: 'Message', devis: 'Point sur le devis', achat: 'Suivi de commande', facture: 'Point sur la facture', relance: 'Relance commerciale', autre: 'Échange' };
function interactionForm(id, preset = {}) {
  const it = id ? interactionById(id) : null;
  if (!S.clients.length) { toast('Créez d\'abord un client.', 'warn'); return go('clients', { action: 'new' }); }
  const d = it || { type: 'appel', date: todayISO(), time: hhmmNow(), done: true, userId: SESSION_OP?.id, ...preset };
  if (!it && !preset.title) d.title = INTER_DEFAULT_TITLE[d.type];
  openModal({
    title: it ? 'Modifier l\'interaction' : d.done === false ? 'Planifier une relance' : 'Nouvelle interaction', wide: true,
    body: `${clientPicker('ifCli', 'Client concerné', d.clientId || '')}
      <div class="grid-2">${selectHTML({ id: 'ifContact', label: 'Contact (facultatif)', options: d.clientId ? optContacts(d.clientId) : [], value: d.contactId || '', empty: '— Aucun contact précis —' })}
        ${selectHTML({ id: 'ifType', label: 'Type d\'interaction', options: Object.entries(INTER_TYPES).map(([k, t]) => [k, t.label]), value: d.type, req: true })}</div>
      <div class="grid-3">${fieldHTML({ id: 'ifDate', label: 'Date', type: 'date', value: d.date, req: true })}${fieldHTML({ id: 'ifTime', label: 'Heure', type: 'time', value: d.time || '' })}
        ${selectHTML({ id: 'ifUser', label: 'Utilisateur', options: OPERATORS.map(o => [o.id, o.name]), value: d.userId || SESSION_OP?.id })}</div>
      ${fieldHTML({ id: 'ifTitle', label: 'Titre', value: d.title || '', req: true })}
      ${textareaHTML({ id: 'ifDesc', label: 'Description / compte rendu', value: d.description || '', rows: 4 })}
      <fieldset class="fs"><legend>Statut</legend>
        <label class="radio-card"><input type="radio" name="ifDone" value="1" ${d.done !== false ? 'checked' : ''}><span><b>Réalisée</b> — l'échange a eu lieu, il entre dans l'historique du client.</span></label>
        <label class="radio-card"><input type="radio" name="ifDone" value="0" ${d.done === false ? 'checked' : ''}><span><b>À faire</b> — relance ou rendez-vous planifié : il apparaît dans « À faire », sur la cloche et dans les clients à relancer.</span></label>
      </fieldset>`,
    footer: `<button type="button" class="btn ghost" data-close>Annuler</button><button type="button" class="btn gold" id="ifSave">${it ? 'Enregistrer' : 'Ajouter'}</button>`,
    onOpen: m => {
      bindClientPicker(m, 'ifCli', cid => { const s = $('#ifContact', m); s.innerHTML = `<option value="">— Aucun contact précis —</option>` + (cid ? optContacts(cid) : []).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join(''); });
      let autoTitle = !it && !preset.title;
      $('#ifTitle', m).addEventListener('input', () => { autoTitle = false; });
      $('#ifType', m).onchange = e => { if (autoTitle) $('#ifTitle', m).value = INTER_DEFAULT_TITLE[e.target.value]; };
      $('#ifSave', m).onclick = e => guard(e.currentTarget, async () => {
        formError(m, '');
        const data = { clientId: val(m, 'ifCli'), contactId: val(m, 'ifContact'), type: val(m, 'ifType'), date: val(m, 'ifDate'), time: val(m, 'ifTime'), title: val(m, 'ifTitle'), description: val(m, 'ifDesc'), done: $('input[name=ifDone]:checked', m).value === '1', userId: val(m, 'ifUser') };
        try { await saveInteraction(data, id); closeModal(1); toast(it ? 'Interaction mise à jour' : data.done ? 'Interaction enregistrée' : 'Relance planifiée', 'ok'); }
        catch (err) { formError(m, err.message); markInvalid(m, [!data.clientId && 'ifCli', !data.title && 'ifTitle', !data.date && 'ifDate'].filter(Boolean)); }
      });
    }
  });
}
