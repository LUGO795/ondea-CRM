/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — views/clients.js
   Liste des clients : recherche instantanée, filtres avancés mémorisés
   (statut, catégorie, ville, commercial, date de création, dernière
   activité, montant dépensé, fidélité, actif/inactif), tri, vue tableau
   ou cartes, pagination fluide même avec des centaines de clients.
   Bouton « œil » : archiver / réafficher un client (avec confirmation).
   Formulaire client complet avec photo ou logo (IndexedDB).
   ██████████████████████████████████████████████████████████████ */
"use strict";

const CLF_DEFAULT = { q: '', status: '', cat: '', city: '', rep: '', createdFrom: '', createdTo: '', lastAct: '', spentMin: '', spentMax: '', tier: '', activity: '', follow: '', sort: 'name', dir: 1, view: 'table', page: 1 };
const CLF = UI_STATE.load('clients', CLF_DEFAULT);
const CL_SORT = { name: 'Tri : nom', number: 'Tri : n° client', created: 'Tri : date de création', activity: 'Tri : dernière activité', spent: 'Tri : montant dépensé', points: 'Tri : points de fidélité' };
const LAST_ACT = { lt30: 'Activité < 30 jours', lt90: 'Activité < 90 jours', gt90: 'Sans activité depuis 90 j', gt180: 'Sans activité depuis 180 j', gt365: 'Sans activité depuis 1 an' };

/* Nombre de filtres avancés actifs (affiché sur le panneau replié) */
const advCount = f => ['city', 'rep', 'createdFrom', 'createdTo', 'lastAct', 'spentMin', 'spentMax', 'tier', 'activity', 'follow'].filter(k => f[k]).length;

/* Filtrage + tri (appelé à chaque saisie, sans reconstruire toute la page) */
function filteredClients(f = CLF) {
  const t = norm(f.q), digits = f.q.replace(/\D/g, '');
  const follow = f.follow ? new Set(clientsToFollow().map(x => x.client.id)) : null;
  const min = parseNum(f.spentMin), max = parseNum(f.spentMax);
  const rows = S.clients.filter(c => {
    if (f.status ? c.status !== f.status : c.status === 'archive') return false;
    if (f.cat && (f.cat === '_none' ? !!c.categoryId : c.categoryId !== f.cat)) return false;
    if (f.city && norm(c.city) !== norm(f.city)) return false;
    if (f.rep && c.salesRepId !== f.rep) return false;
    const created = dayOf(c.createdAt);
    if (f.createdFrom && created < f.createdFrom) return false;
    if (f.createdTo && created > f.createdTo) return false;
    const m = metricsOf(c.id);
    if (f.lastAct) { const d = daysSinceActivity(c); const lim = Number(f.lastAct.slice(2)); if (f.lastAct.startsWith('lt') ? d > lim : d <= lim) return false; }
    if (!isNaN(min) && m.spent < min) return false;
    if (!isNaN(max) && m.spent > max) return false;
    if (f.tier && m.tier !== f.tier) return false;
    if (f.activity === 'active' && !isActiveClient(c)) return false;
    if (f.activity === 'inactive' && !isInactiveClient(c)) return false;
    if (follow && !follow.has(c.id)) return false;
    if (t) {
      const hay = norm([c.firstName, c.lastName, c.company, c.email, c.number, c.city, c.jobTitle, c.firstName + ' ' + c.lastName, c.lastName + ' ' + c.firstName].join(' | '));
      const phone = digits.length >= 4 && [c.phone, c.phone2].some(p => String(p || '').replace(/\D/g, '').includes(digits));
      if (!hay.includes(t) && !phone) return false;
    }
    return true;
  });
  const key = {
    name: c => norm(clientName(c)), number: c => c.number, created: c => c.createdAt,
    activity: c => metricsOf(c.id).lastActivity || '', spent: c => metricsOf(c.id).spent, points: c => metricsOf(c.id).available
  }[f.sort] || (c => norm(clientName(c)));
  rows.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * f.dir; });
  return rows;
}

VIEWS.clients = (el, params) => {
  /* Paramètres venant d'un lien (tableau de bord, statistiques…) : filtres ciblés */
  if (Object.keys(params).some(k => k !== 'action')) {
    Object.assign(CLF, CLF_DEFAULT, { view: CLF.view });
    if (params.activity) CLF.activity = params.activity;
    if (params.status) CLF.status = params.status;
    if (params.cat) CLF.cat = params.cat;
    if (params.tier) CLF.tier = params.tier;
    if (params.follow) CLF.follow = '1';
    if (params.created === 'period') { const P = statePeriod(DASH); CLF.createdFrom = P.from; CLF.createdTo = P.to; }
    UI_STATE.save('clients', CLF);
  }
  const live = S.clients.filter(c => !isArchived(c));
  const archived = S.clients.length - live.length;
  const cities = [...new Set(S.clients.map(c => (c.city || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const nAdv = advCount(CLF);
  el.innerHTML = pageHead('Clients', crumbFor('clients'),
    `<button type="button" class="btn" id="cArch">${svg('eyeoff')} Clients archivés <span class="mono">(${archived})</span></button>` +
    (can('export') ? `<button type="button" class="btn" id="cExport">${svg('down')} Export CSV</button>` : '') +
    (can('client.edit') ? `<button type="button" class="btn gold" id="cNew">${svg('plus')} Nouveau client</button>` : ''),
    `${fmtNum(live.length, 0)} client(s) · ${fmtNum(live.filter(isActiveClient).length, 0)} actif(s) · ${fmtNum(live.filter(c => c.status === 'prospect').length, 0)} prospect(s)`) +
    demoBanner() +
    `<div class="tbl-tools" role="search" aria-label="Filtrer les clients">
      ${searchBox('cSearch', 'Rechercher par nom, entreprise, e-mail, téléphone ou n° client', CLF.q, 'Nom, entreprise, e-mail, téléphone, n°…')}
      ${filterSelect('cStatus', 'Statut', Object.entries(CLIENT_STATUS).map(([k, s]) => [k, s.label]), CLF.status, 'Tous statuts (hors archivés)')}
      <label class="sr-only" for="cCat">Catégorie</label><select class="sel" id="cCat" style="width:auto"><option value="">Toutes catégories</option><option value="_none" ${CLF.cat === '_none' ? 'selected' : ''}>Sans catégorie</option>${optCategories().map(([v, l]) => `<option value="${v}" ${CLF.cat === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      ${filterSelect('cSort', 'Trier par', Object.entries(CL_SORT), CLF.sort, null)}
      <button type="button" class="btn icon" id="cDir" aria-label="Ordre ${CLF.dir > 0 ? 'croissant' : 'décroissant'} (cliquer pour inverser)" title="Inverser l'ordre">${CLF.dir > 0 ? '↑' : '↓'}</button>
      <div class="seg" role="group" aria-label="Affichage"><button type="button" data-cv2="table" class="${CLF.view === 'table' ? 'on' : ''}" aria-pressed="${CLF.view === 'table'}">${svg('list', 'seg-ic')}Tableau</button><button type="button" data-cv2="cards" class="${CLF.view === 'cards' ? 'on' : ''}" aria-pressed="${CLF.view === 'cards'}">${svg('grid', 'seg-ic')}Cartes</button></div>
      <button type="button" class="btn ghost sm" id="cReset">Réinitialiser les filtres</button>
    </div>
    <details class="adv" ${nAdv ? 'open' : ''}><summary>${svg('filter')} Filtres avancés ${nAdv ? `<span class="chip gold xs">${nAdv} actif(s)</span>` : ''}</summary>
      <div class="adv-grid">
        <div class="field"><label for="cCity">Ville</label><select class="sel" id="cCity"><option value="">Toutes</option>${cities.map(v => `<option ${norm(CLF.city) === norm(v) ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div class="field"><label for="cRep">Commercial</label><select class="sel" id="cRep"><option value="">Tous</option>${OPERATORS.map(o => `<option value="${o.id}" ${CLF.rep === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="cFrom">Créé à partir du</label><input class="inp" type="date" id="cFrom" value="${esc(CLF.createdFrom)}"></div>
        <div class="field"><label for="cTo">Créé jusqu'au</label><input class="inp" type="date" id="cTo" value="${esc(CLF.createdTo)}"></div>
        <div class="field"><label for="cLast">Dernière activité</label><select class="sel" id="cLast"><option value="">Indifférente</option>${Object.entries(LAST_ACT).map(([k, l]) => `<option value="${k}" ${CLF.lastAct === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="cMin">Dépensé minimum (€ TTC)</label><input class="inp" id="cMin" inputmode="decimal" value="${esc(CLF.spentMin)}"></div>
        <div class="field"><label for="cMax">Dépensé maximum (€ TTC)</label><input class="inp" id="cMax" inputmode="decimal" value="${esc(CLF.spentMax)}"></div>
        <div class="field"><label for="cTier">Niveau de fidélité</label><select class="sel" id="cTier"><option value="">Tous</option>${TIER_ORDER.map(k => `<option value="${k}" ${CLF.tier === k ? 'selected' : ''}>${TIERS[k].label}</option>`).join('')}</select></div>
        <div class="field"><label for="cAct">Client actif / inactif</label><select class="sel" id="cAct"><option value="">Tous</option><option value="active" ${CLF.activity === 'active' ? 'selected' : ''}>Actifs (activité < ${SETTINGS.inactiveDays} j)</option><option value="inactive" ${CLF.activity === 'inactive' ? 'selected' : ''}>Inactifs</option></select></div>
        <div class="field"><span class="flabel">Relance</span><label class="chk-inline" style="padding:9px 0"><input type="checkbox" id="cFollow" ${CLF.follow ? 'checked' : ''}> Seulement les clients à relancer</label></div>
      </div></details>
    <div id="cList" aria-live="polite"></div>`;

  const draw = () => {
    UI_STATE.save('clients', CLF);
    const rows = filteredClients();
    const pg = paginate(rows, CLF);
    const host = $('#cList', el);
    if (!S.clients.length) {
      host.innerHTML = emptyState('users', 'Aucun client pour le moment', 'Créez votre première fiche client, ou chargez les données de démonstration pour découvrir l\'application.',
        can('client.edit') ? `<button type="button" class="btn gold" data-new>${svg('plus')} Créer un client</button>` : '');
    } else if (!rows.length) {
      host.innerHTML = emptyState('search', 'Aucun résultat', 'Aucun client ne correspond à ces critères. Modifiez la recherche ou réinitialisez les filtres.', `<button type="button" class="btn" data-reset>Réinitialiser les filtres</button>`);
    } else if (CLF.view === 'cards') {
      host.innerHTML = `<div class="pcards">${pg.rows.map(clientCard).join('')}</div>` + pagerHTML(CLF.page, pg.pages, pg.total, pg.start, pg.rows.length, 'client');
    } else {
      const th = (k, l, cls = '') => { const on = CLF.sort === k; return `<th scope="col" class="${cls}" ${on ? `aria-sort="${CLF.dir > 0 ? 'ascending' : 'descending'}"` : ''}><button type="button" class="sort" data-sort="${k}">${l}${on ? (CLF.dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`; };
      host.innerHTML = `<div class="tbl-wrap"><table class="tbl" style="min-width:1000px"><caption class="sr-only">Liste des clients, ${esc(CL_SORT[CLF.sort] || '')}, ordre ${CLF.dir > 0 ? 'croissant' : 'décroissant'}</caption><thead><tr>
        ${th('name', 'Client')}<th scope="col">Coordonnées</th><th scope="col">Catégorie</th><th scope="col">Statut</th>${th('activity', 'Dernière activité')}${th('spent', 'Dépensé TTC', 'num-c')}${th('points', 'Fidélité')}<th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${pg.rows.map(clientRow).join('')}</tbody></table></div>` + pagerHTML(CLF.page, pg.pages, pg.total, pg.start, pg.rows.length, 'client');
    }
    hydrateMedia(host);
    bindPager(host, CLF, draw);
    bindRows(host, 'cli', id => go('client', { id }));
    bindClientVisibility(host);
    $$('[data-inter]', host).forEach(b => b.onclick = () => interactionForm(null, { clientId: b.dataset.inter }));
    $$('[data-sort]', host).forEach(b => b.onclick = () => { if (CLF.sort === b.dataset.sort) CLF.dir *= -1; else { CLF.sort = b.dataset.sort; CLF.dir = b.dataset.sort === 'name' ? 1 : -1; } CLF.page = 1; route({ keepScroll: true }); });
    $$('[data-new]', host).forEach(b => b.onclick = () => clientForm());
    $$('[data-reset]', host).forEach(b => b.onclick = resetFilters);
  };
  const resetFilters = () => { Object.assign(CLF, CLF_DEFAULT, { view: CLF.view }); UI_STATE.save('clients', CLF); go('clients'); };
  draw();
  $('#cSearch', el).oninput = debounce(e => { CLF.q = e.target.value; CLF.page = 1; draw(); }, 120);
  [['cStatus', 'status'], ['cCat', 'cat'], ['cSort', 'sort'], ['cCity', 'city'], ['cRep', 'rep'], ['cFrom', 'createdFrom'], ['cTo', 'createdTo'], ['cLast', 'lastAct'], ['cTier', 'tier'], ['cAct', 'activity']]
    .forEach(([id, k]) => $('#' + id, el).onchange = e => { CLF[k] = e.target.value; CLF.page = 1; draw(); });
  [['cMin', 'spentMin'], ['cMax', 'spentMax']].forEach(([id, k]) => $('#' + id, el).oninput = debounce(e => { CLF[k] = e.target.value.trim(); CLF.page = 1; draw(); }, 250));
  $('#cFollow', el).onchange = e => { CLF.follow = e.target.checked ? '1' : ''; CLF.page = 1; draw(); };
  $('#cDir', el).onclick = () => { CLF.dir *= -1; route({ keepScroll: true }); };
  $$('[data-cv2]', el).forEach(b => b.onclick = () => { CLF.view = b.dataset.cv2; UI_STATE.save('clients', CLF); route({ keepScroll: true }); });
  $('#cReset', el).onclick = resetFilters;
  $('#cArch', el).onclick = () => manageArchivedClients();
  if ($('#cNew', el)) $('#cNew', el).onclick = () => clientForm();
  if ($('#cExport', el)) $('#cExport', el).onclick = () => exportClientsCSV(filteredClients());
  bindDemoBanner(el);
  if (params.action === 'new' && can('client.edit')) { history.replaceState(null, '', '#/clients'); setTimeout(() => clientForm(), 50); }
};

/* ---------- Bouton œil : archiver / réafficher ---------- */
function visibilityBtn(c, extra = '') {
  if (!can('client.edit')) return '';
  const hidden = isArchived(c);
  const lbl = hidden ? `Réafficher : ${clientName(c)}` : `Archiver (ne plus afficher) : ${clientName(c)}`;
  return `<button type="button" class="btn icon sm vis-btn ${extra}" data-vis="${c.id}" aria-label="${esc(lbl)}" title="${hidden ? 'Réafficher ce client' : 'Archiver ce client'}">${svg(hidden ? 'eye' : 'eyeoff')}</button>`;
}
function bindClientVisibility(root) {
  $$('[data-vis]', root).forEach(b => b.onclick = e => {
    e.stopPropagation();
    const c = clientById(b.dataset.vis); if (!c) return;
    if (isArchived(c)) return guard(b, async () => { await setClientArchived(c.id, false); toast(`« ${clientName(c)} » est de nouveau affiché.`, 'ok'); });
    askArchiveClient(c.id);
  });
}
function askArchiveClient(id) {
  const c = clientById(id); if (!c) return;
  const m = metricsOf(id);
  confirmDialog(`Archiver « ${clientName(c)} » ?`, async () => { await setClientArchived(id, true); toast(`« ${clientName(c)} » est archivé. Retrouvez-le dans « Clients archivés ».`, 'ok', 6000); },
    { title: 'Archiver ce client', yes: 'Archiver', danger: false, details: `<ul style="margin:12px 0 0 18px;line-height:1.7"><li>Il disparaît des listes, du tableau de bord et des relances.</li>
      <li>Son historique est conservé : ${m.nAchats} achat(s), ${fmtMoney(m.spent)} dépensés, ${m.nInteractions} interaction(s).</li>${m.unpaid ? `<li><b>Attention :</b> ${fmtMoney(m.unpaid)} restent à encaisser.</li>` : ''}
      <li>Vous pourrez le réafficher à tout moment (bouton « Clients archivés » ou œil).</li></ul>` });
}
function manageArchivedClients() {
  let filtre = '';
  const archived = () => S.clients.filter(isArchived);
  openModal({
    title: 'Clients archivés', wide: true,
    body: `<p style="line-height:1.6">Ces clients ne sont plus affichés (listes, tableau de bord, relances). Leur historique est conservé. Cliquez sur <b>Réafficher</b> pour les remettre partout.</p>
      <div class="row wrap" style="margin-top:12px;gap:10px"><div class="search grow" style="max-width:none"><input id="arQ" type="search" class="inp" placeholder="Rechercher un client archivé…" aria-label="Rechercher un client archivé"></div>
      ${can('client.edit') ? `<button type="button" class="btn" id="arAll">${svg('eye')} Tout réafficher</button>` : ''}</div>
      <div class="list-wrap" id="arList" aria-live="polite" style="margin-top:12px;max-height:min(60vh,520px);overflow:auto"></div>`,
    footer: `<button class="btn ghost" type="button" data-close>Fermer</button>`,
    onOpen: m => {
      const draw = () => {
        const t = norm(filtre);
        const rows = archived().filter(c => !t || norm(clientName(c) + ' ' + c.number).includes(t)).sort((a, b) => clientName(a).localeCompare(clientName(b), 'fr'));
        $('#arList', m).innerHTML = !archived().length ? '<p class="muted" style="padding:14px 4px">Aucun client archivé.</p>' : !rows.length ? '<p class="muted" style="padding:14px 4px">Aucun résultat.</p>'
          : rows.map(c => `<div class="list-row static">${clientThumb(c, 'sm')}<div class="grow" style="min-width:0"><b>${esc(clientName(c))}</b><small class="muted d-block mono">${esc(c.number)} · ${fmtMoney(metricsOf(c.id).spent)}</small></div>
            <a class="btn sm ghost" href="#/client?id=${c.id}" data-close>Fiche</a>${can('client.edit') ? `<button type="button" class="btn sm gold" data-show="${c.id}">${svg('eye')} Réafficher</button>` : ''}</div>`).join('');
        hydrateMedia($('#arList', m));
        if ($('#arAll', m)) $('#arAll', m).disabled = !archived().length;
        $$('[data-show]', m).forEach(b => b.onclick = () => guard(b, async () => { await setClientArchived(b.dataset.show, false); toast('Client réaffiché', 'ok'); draw(); }));
        $$('[data-close]', $('#arList', m)).forEach(a => a.addEventListener('click', () => closeModal(1)));
      };
      $('#arQ', m).oninput = e => { filtre = e.target.value; draw(); };
      if ($('#arAll', m)) $('#arAll', m).onclick = e => guard(e.currentTarget, async () => {
        const list = archived().map(c => { const x = clone(c); x.status = x.prevStatus && x.prevStatus !== 'archive' ? x.prevStatus : 'actif'; delete x.prevStatus; x.updatedAt = nowStamp(); return x; });
        await commit({ put: { clients: list, journal: [journalEntry('client', `a réaffiché ${list.length} client(s) archivé(s)`, {})] } }, { what: 'client' });
        toast(`${list.length} client(s) réaffiché(s)`, 'ok'); draw();
      });
      draw();
    }
  });
}

function clientRow(c) {
  const m = metricsOf(c.id);
  const late = m.nLate > 0;
  return `<tr data-cli="${c.id}" tabindex="0" class="${isArchived(c) ? 'is-archived' : ''} ${late ? 'is-late' : ''}" aria-label="${esc(clientName(c))}, ${CLIENT_STATUS[c.status].label}">
    <td><div class="cell-user cl-cell">${clientThumb(c)}<div><b>${esc(clientName(c))}</b><small class="mono">${esc(c.number)}${c.demo ? ' · <span class="gold">démo</span>' : ''}</small>${c.company && clientPerson(c) ? `<small>${esc(clientPerson(c))}</small>` : ''}</div></div></td>
    <td class="cl-coord"><small class="d-block">${c.phone ? esc(c.phone) : '<span class="muted">—</span>'}</small><small class="muted d-block">${esc(c.email || '')}</small><small class="d-block">${svg('pin', 'inl')} ${esc([c.zip, c.city].filter(Boolean).join(' ') || '—')}</small></td>
    <td>${c.categoryId ? esc(catName(c.categoryId)) : '<span class="muted">—</span>'}</td>
    <td>${clientStatusChip(c, true)}${late ? ` <span class="chip dng xs" title="Factures en retard">${svg('warn')}${fmtMoneyShort(m.overdue)}</span>` : ''}</td>
    <td>${m.lastActivity ? `${fmtDate(m.lastActivity)}<small class="muted d-block">${isActiveClient(c) ? 'actif' : 'inactif'}</small>` : '—'}</td>
    <td class="num-c"><b class="mono">${fmtMoney(m.spent)}</b><small class="muted d-block">${m.nAchats} achat(s)</small></td>
    <td>${tierChip(m.tier, true)}<small class="muted d-block mono">${fmtNum(m.available, 0)} pts</small></td>
    <td class="qa-cell"><button type="button" class="btn icon sm" data-inter="${c.id}" aria-label="Nouvelle interaction avec ${esc(clientName(c))}" title="Nouvelle interaction">${svg('msg')}</button>${visibilityBtn(c)}</td></tr>`;
}
function clientCard(c) {
  const m = metricsOf(c.id);
  return `<article class="pcard card" data-cli="${c.id}" tabindex="0" aria-label="${esc(clientName(c))}">
    <div class="pcard-img client-img">${c.photoId ? `<img data-media="${esc(c.photoId)}" alt="${c.company ? 'Logo de ' : 'Photo de '}${esc(clientName(c))}" loading="lazy">` : `<span aria-hidden="true">${esc(initialsOf(clientName(c)))}</span>`}${clientStatusChip(c)}<div class="pc-tier">${tierChip(m.tier, true)}</div></div>
    <div class="pcard-b"><h4>${esc(clientName(c))}</h4><small class="mono muted">${esc(c.number)}${c.city ? ' · ' + esc(c.city) : ''}</small>
      <div class="row between" style="margin-top:10px"><b class="pcard-q">${fmtMoneyShort(m.spent)} <small>dépensés</small></b><span class="mono muted">${fmtNum(m.available, 0)} pts</span></div>
      <small class="muted">${m.nAchats} achat(s) · dernière activité ${m.lastActivity ? fmtDate(m.lastActivity) : '—'}</small>
      <div class="row" style="margin-top:12px"><button type="button" class="btn sm grow" data-inter="${c.id}">${svg('msg')} Interaction</button>${visibilityBtn(c)}</div>
    </div></article>`;
}

/* ═════════════════════ FORMULAIRE CLIENT ═════════════════════ */
function clientForm(id, preset = {}) {
  const c = id ? clientById(id) : null;
  const d = c || { status: 'prospect', country: SETTINGS.defaultCountry, salesRepId: SESSION_OP?.id || '', ...preset };
  let photo = { blob: null, removed: false };
  openModal({
    title: c ? `Modifier la fiche ${c.number}` : 'Nouveau client', xwide: true,
    body: `<div class="pf-grid">
      <div class="pf-photo">
        <div class="av xl photo-prev" id="cfAv">${c?.photoId ? `<img data-media="${esc(c.photoId)}" alt="Image actuelle">` : `<span aria-hidden="true">${svg('image')}</span>`}</div>
        <label class="btn sm ghost" style="margin-top:12px;cursor:pointer">${svg('up')} Photo ou logo<input type="file" id="cfPhoto" accept="image/*" class="sr-only"></label>
        <button type="button" class="btn sm ghost danger ${c?.photoId ? '' : 'hide'}" id="cfPhotoDel">${svg('trash')} Retirer</button>
        <small class="hint" style="text-align:center">JPEG, PNG ou WebP. L'image est redimensionnée (1024 px max) et enregistrée localement.</small>
      </div>
      <div>
        <fieldset class="fs"><legend>Identité</legend>
          <div class="grid-3">${selectHTML({ id: 'cfCiv', label: 'Civilité', options: [['', '—'], ['M', 'M.'], ['Mme', 'Mme'], ['Dr', 'Dr'], ['Me', 'Me']], value: d.civility || '' })}
            ${fieldHTML({ id: 'cfFirst', label: 'Prénom', value: d.firstName || '', attrs: 'autocomplete="given-name"' })}
            ${fieldHTML({ id: 'cfLast', label: 'Nom', value: d.lastName || '', attrs: 'autocomplete="family-name"', hint: 'Nom ou entreprise obligatoire.' })}</div>
          <div class="grid-3">${fieldHTML({ id: 'cfCompany', label: 'Entreprise', value: d.company || '', attrs: 'autocomplete="organization"' })}
            ${fieldHTML({ id: 'cfJob', label: 'Fonction', value: d.jobTitle || '', attrs: 'autocomplete="organization-title"' })}
            ${fieldHTML({ id: 'cfBirth', label: 'Date de naissance (facultatif)', type: 'date', value: d.birthDate || '' })}</div>
        </fieldset>
        <fieldset class="fs"><legend>Coordonnées</legend>
          <div class="grid-2">${fieldHTML({ id: 'cfPhone', label: 'Téléphone', type: 'tel', value: d.phone || '', attrs: 'autocomplete="tel"' })}${fieldHTML({ id: 'cfPhone2', label: 'Téléphone secondaire', type: 'tel', value: d.phone2 || '' })}</div>
          <div class="grid-2">${fieldHTML({ id: 'cfEmail', label: 'E-mail', type: 'email', value: d.email || '', attrs: 'autocomplete="email"' })}${fieldHTML({ id: 'cfWeb', label: 'Site Internet', value: d.website || '', placeholder: 'www.exemple.fr' })}</div>
          <div class="grid-2">${fieldHTML({ id: 'cfAddr', label: 'Adresse', value: d.address || '', attrs: 'autocomplete="address-line1"' })}${fieldHTML({ id: 'cfAddr2', label: 'Complément d\'adresse', value: d.address2 || '', attrs: 'autocomplete="address-line2"' })}</div>
          <div class="grid-3">${fieldHTML({ id: 'cfZip', label: 'Code postal', value: d.zip || '', attrs: 'autocomplete="postal-code" inputmode="numeric"' })}${fieldHTML({ id: 'cfCity', label: 'Ville', value: d.city || '', attrs: 'autocomplete="address-level2"' })}${fieldHTML({ id: 'cfCountry', label: 'Pays', value: d.country || '', attrs: 'autocomplete="country-name"' })}</div>
        </fieldset>
        <fieldset class="fs"><legend>Suivi commercial</legend>
          <div class="grid-2">${selectHTML({ id: 'cfStatus', label: 'Statut', options: Object.entries(CLIENT_STATUS).map(([k, s]) => [k, s.label]), value: d.status, req: true })}
            <div class="field"><label for="cfCat">Catégorie</label><div class="row" style="gap:8px"><select class="sel" id="cfCat"><option value="">— Sans catégorie —</option>${optCategories().map(([v, l]) => `<option value="${v}" ${d.categoryId === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${can('category.edit') ? `<button type="button" class="btn icon" id="cfCatNew" aria-label="Créer une catégorie" title="Créer une catégorie">${svg('plus')}</button>` : ''}</div></div></div>
          <div class="grid-2">${selectHTML({ id: 'cfSource', label: 'Source du client', options: [...new Set([...SETTINGS.sources, d.source].filter(Boolean))], value: d.source || '', empty: '— Non renseignée —' })}
            ${selectHTML({ id: 'cfRep', label: 'Commercial responsable', options: OPERATORS.map(o => [o.id, o.name + (o.active === false ? ' (inactif)' : '')]), value: d.salesRepId || '', empty: '— Aucun —' })}</div>
          ${c ? `<p class="hint">N° client <b class="mono">${esc(c.number)}</b> · créé le ${fmtDateTime(c.createdAt)} — ne change jamais.</p>` : '<p class="hint">Le numéro client est attribué automatiquement à l\'enregistrement.</p>'}
        </fieldset>
      </div></div>`,
    footer: `<button type="button" class="btn ghost" data-close>Annuler</button><button type="button" class="btn gold" id="cfSave">${c ? 'Enregistrer' : 'Créer la fiche'}</button>`,
    onOpen: m => {
      $('#cfPhoto', m).onchange = async ev => {
        const f = ev.target.files[0]; if (!f) return;
        if (!/^image\//.test(f.type)) return toast('Ce fichier n\'est pas une image.', 'dng');
        try { photo.blob = await resizeImage(f, 1024); photo.removed = false; }
        catch (e) { return toast('Image illisible : ' + e.message, 'dng'); }
        $('#cfAv', m).innerHTML = `<img src="${URL.createObjectURL(photo.blob)}" alt="Aperçu de la nouvelle image">`;
        $('#cfPhotoDel', m).classList.remove('hide');
      };
      $('#cfPhotoDel', m).onclick = () => { photo = { blob: null, removed: true }; $('#cfAv', m).innerHTML = `<span aria-hidden="true">${svg('image')}</span>`; $('#cfPhotoDel', m).classList.add('hide'); };
      if ($('#cfCatNew', m)) $('#cfCatNew', m).onclick = () => categoryForm(null, cat => { const s = $('#cfCat', m); s.add(new Option(cat.name, cat.id)); s.value = cat.id; });
      $('#cfSave', m).onclick = e => guard(e.currentTarget, async () => {
        formError(m, '');
        const data = {
          civility: val(m, 'cfCiv'), firstName: val(m, 'cfFirst'), lastName: val(m, 'cfLast'), company: val(m, 'cfCompany'), jobTitle: val(m, 'cfJob'), birthDate: val(m, 'cfBirth'),
          phone: val(m, 'cfPhone'), phone2: val(m, 'cfPhone2'), email: val(m, 'cfEmail'), website: val(m, 'cfWeb'), address: val(m, 'cfAddr'), address2: val(m, 'cfAddr2'),
          zip: val(m, 'cfZip'), city: val(m, 'cfCity'), country: val(m, 'cfCountry'), status: val(m, 'cfStatus'), categoryId: val(m, 'cfCat'), source: val(m, 'cfSource'), salesRepId: val(m, 'cfRep')
        };
        const errs = validateClient(data, id);
        if (errs.length) {
          formError(m, errs.join('\n'));
          markInvalid(m, [!data.lastName && !data.company && 'cfLast', errs.some(x => x.includes('e-mail')) && 'cfEmail', errs.some(x => x.includes('principal')) && 'cfPhone', errs.some(x => x.includes('secondaire')) && 'cfPhone2', errs.some(x => x.includes('postal')) && 'cfZip', errs.some(x => x.includes('Internet')) && 'cfWeb', errs.some(x => x.includes('naissance')) && 'cfBirth'].filter(Boolean));
          return;
        }
        let newMedia = null;
        if (photo.blob) { newMedia = await IDB.putMedia(photo.blob, 'client-' + (data.company || data.lastName)); data.photoId = newMedia; }
        else if (photo.removed) data.photoId = null;
        try {
          const oldPhoto = c?.photoId;
          const saved = await saveClient(data, id);
          if ((newMedia || photo.removed) && oldPhoto && oldPhoto !== saved.photoId) { await IDB.tx(['media'], t => t.del('media', oldPhoto)); forgetMediaURL(oldPhoto); }
          closeModal(1);
          toast(c ? 'Fiche client mise à jour' : `Client « ${clientName(saved)} » créé (${saved.number})`, 'ok');
          if (!c) go('client', { id: saved.id });
        } catch (err) {
          if (newMedia) IDB.tx(['media'], t => t.del('media', newMedia)).catch(() => { });
          formError(m, err.message);
        }
      });
    }
  });
}

/* Catégorie (création / modification) — utilisable depuis le formulaire client et les Paramètres */
function categoryForm(id, onSaved) {
  const c = id ? categoryById(id) : { color: 1 };
  openModal({
    level: 2, title: id ? 'Modifier la catégorie' : 'Nouvelle catégorie',
    body: fieldHTML({ id: 'catName', label: 'Nom de la catégorie', value: c.name || '', req: true, placeholder: 'Ex. Professionnels, Particuliers, Revendeurs…' }) +
      textareaHTML({ id: 'catDesc', label: 'Description (facultatif)', value: c.description || '', rows: 2 }) +
      selectHTML({ id: 'catColor', label: 'Couleur dans les graphiques', options: [[1, 'Or'], [2, 'Bleu'], [3, 'Orange'], [4, 'Vert'], [5, 'Violet'], [6, 'Rose']], value: c.color }),
    footer: `<button type="button" class="btn ghost" data-close>Annuler</button><button type="button" class="btn gold" id="catSave">Enregistrer</button>`,
    onOpen: m => $('#catSave', m).onclick = e => guard(e.currentTarget, async () => {
      try { const saved = await saveCategory({ name: val(m, 'catName'), description: val(m, 'catDesc'), color: val(m, 'catColor') }, id); closeModal(2); toast('Catégorie enregistrée', 'ok'); if (onSaved) onSaved(saved); }
      catch (err) { formError(m, err.message); markInvalid(m, ['catName']); }
    })
  });
}
