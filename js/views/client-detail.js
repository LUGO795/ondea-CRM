/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — views/client-detail.js
   Fiche client complète (page dédiée #/client?id=…) :
   en-tête avec coordonnées cliquables, indicateurs, actions rapides,
   puis onglets : Vue générale, Informations, Contacts, Achats, Devis,
   Factures, Fidélité, Interactions, Notes internes, Documents,
   Statistiques. Chaque onglet réutilise les composants des modules
   (tableaux, timeline, cartes de notes…) pour une cohérence totale.
   ██████████████████████████████████████████████████████████████ */
"use strict";

let _clientTab = 'overview';
const CLIENT_TABS = [
  ['overview', 'Vue générale'], ['infos', 'Informations'], ['contacts', 'Contacts'], ['achats', 'Achats'], ['devis', 'Devis'], ['factures', 'Factures'],
  ['fidelite', 'Fidélité'], ['interactions', 'Interactions'], ['notes', 'Notes internes'], ['documents', 'Documents'], ['stats', 'Statistiques']
];

VIEWS.clientDetail = (el, params) => {
  const c = clientById(params.id);
  if (!c) { el.innerHTML = pageHead('Fiche client', crumb('Pilotage', 'Clients'), '') + emptyState('user', 'Client introuvable', 'Cette fiche a peut-être été supprimée.', `<a class="btn gold" href="#/clients">${svg('users')} Retour aux clients</a>`); return; }
  if (params.tab && CLIENT_TABS.some(([k]) => k === params.tab)) { _clientTab = params.tab; history.replaceState(null, '', '#/client?id=' + c.id); }
  document.title = clientName(c) + ' · Ondea CRM';
  const m = metricsOf(c.id), L = loyaltyOf(c.id);
  const counts = { contacts: m.nContacts, achats: S.achats.filter(a => a.clientId === c.id).length, devis: S.devis.filter(d => d.clientId === c.id).length, factures: S.factures.filter(f => f.clientId === c.id).length, interactions: m.nInteractions, notes: m.nNotes, documents: m.nDocs };
  const addr = [c.address, c.address2, [c.zip, c.city].filter(Boolean).join(' '), c.country].filter(Boolean).join(', ');
  const web = c.website ? (/^https?:\/\//i.test(c.website) ? c.website : 'https://' + c.website) : '';
  el.innerHTML = pageHead(clientName(c), crumb('Pilotage', 'Clients', clientName(c)),
    `<button type="button" class="btn" id="fdPrint">${svg('printer')} Imprimer la fiche</button>` +
    (can('client.edit') ? `<button type="button" class="btn" id="fdArch">${svg(isArchived(c) ? 'eye' : 'eyeoff')} ${isArchived(c) ? 'Réafficher' : 'Archiver'}</button>` : '') +
    (can('client.delete') ? `<button type="button" class="btn danger" id="fdDel">${svg('trash')} Supprimer</button>` : '') +
    (can('client.edit') ? `<button type="button" class="btn gold" id="fdEdit">${svg('edit')} Modifier</button>` : ''),
    `<span class="mono">${esc(c.number)}</span> · client depuis le ${fmtDate(c.createdAt)}${c.salesRepId && operatorName(c.salesRepId) ? ' · suivi par <b>' + esc(operatorName(c.salesRepId)) + '</b>' : ''}`) +
    `<section class="card client-hero" aria-label="Résumé du client">
      <div class="hero-top">${clientThumb(c, 'xl')}
        <div class="hero-id"><h3>${esc(clientName(c))}</h3>${clientPerson(c) ? `<div class="hero-sub">${esc(clientPerson(c))}${c.company && c.jobTitle ? ' · ' + esc(c.jobTitle) : ''}</div>` : ''}
          <div class="hero-chips">${clientStatusChip(c)}${c.categoryId ? `<span class="chip">${svg('tag')}${esc(catName(c.categoryId))}</span>` : ''}${tierChip(L.tier)}<span class="chip ${isActiveClient(c) ? 'ok' : ''}">${isActiveClient(c) ? 'Actif' : 'Inactif'}</span>${c.demo ? '<span class="chip gold">Démo</span>' : ''}</div>
          <div class="hero-contact">${c.phone ? `<a href="${telHref(c.phone)}">${svg('phone')}${esc(c.phone)}</a>` : ''}${c.phone2 ? `<a href="${telHref(c.phone2)}">${svg('phone')}${esc(c.phone2)}</a>` : ''}${c.email ? `<a href="mailto:${esc(c.email)}">${svg('mail')}${esc(c.email)}</a>` : ''}${web ? `<a href="${esc(web)}" target="_blank" rel="noopener">${svg('globe')}${esc(c.website)}</a>` : ''}${addr ? `<span>${svg('pin')}${esc(addr)}</span>` : ''}</div></div>
        <div class="hero-acts">
          ${can('client.edit') ? `<button type="button" class="btn sm" data-qa="interaction">${svg('msg')} Interaction</button>` : ''}
          ${can('sale.edit') ? `<button type="button" class="btn sm" data-qa="achat">${svg('cart')} Achat</button><button type="button" class="btn sm" data-qa="devis">${svg('file')} Devis</button><button type="button" class="btn sm" data-qa="facture">${svg('receipt')} Facture</button>` : ''}
          ${can('note.edit') ? `<button type="button" class="btn sm" data-qa="note">${svg('note')} Note</button>` : ''}
          ${can('doc.edit') ? `<button type="button" class="btn sm" data-qa="document">${svg('clipfile')} Document</button>` : ''}
          ${can('client.edit') ? `<label class="sr-only" for="fdStatus">Changer le statut</label><select class="sel" id="fdStatus" style="width:auto;padding-top:6px;padding-bottom:6px">${Object.entries(CLIENT_STATUS).map(([k, s]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>Statut : ${s.label}</option>`).join('')}</select>` : ''}
        </div></div>
      <div class="mini-kpis">
        <div><span class="k">Dépensé</span><b class="mono">${fmtMoneyShort(m.spent)}</b><small>${fmtMoney(m.spent)} TTC</small></div>
        <div><span class="k">Achats</span><b class="mono">${m.nAchats}</b><small>${m.lastPurchase ? 'dernier ' + fmtDate(m.lastPurchase) : 'aucun'}</small></div>
        <div><span class="k">Panier moyen</span><b class="mono">${fmtMoneyShort(m.avgBasket)}</b><small>${fmtMoney(m.avgBasket)}</small></div>
        <div><span class="k">À encaisser</span><b class="mono ${m.overdue ? 'dng-t' : ''}">${fmtMoneyShort(m.unpaid)}</b><small>${m.nLate ? m.nLate + ' en retard' : 'à jour'}</small></div>
        <div><span class="k">Points</span><b class="mono">${fmtNum(L.available, 0)}</b><small>${TIERS[L.tier].label}</small></div>
        <div><span class="k">Dernière activité</span><b class="mono" style="font-size:1rem">${m.lastActivity ? fmtDate(m.lastActivity) : '—'}</b><small>${daysSinceActivity(c) === Infinity ? '' : 'il y a ' + daysSinceActivity(c) + ' j'}</small></div>
      </div>
    </section>
    <div class="fiche-tabs"><div class="tabs" role="tablist" aria-label="Sections de la fiche client">
      ${CLIENT_TABS.map(([k, l]) => `<button type="button" class="tab ${_clientTab === k ? 'active' : ''}" role="tab" id="ctab-${k}" aria-controls="fdTab" aria-selected="${_clientTab === k}" tabindex="${_clientTab === k ? 0 : -1}" data-t="${k}">${l}${counts[k] !== undefined ? `<span class="cnt">${counts[k]}</span>` : ''}</button>`).join('')}
    </div></div>
    <div id="fdTab" role="tabpanel" aria-labelledby="ctab-${_clientTab}"></div>`;

  const show = t => {
    _clientTab = t;
    const host = $('#fdTab', el);
    host.setAttribute('aria-labelledby', 'ctab-' + t);
    $$('.fiche-tabs .tab', el).forEach(x => { const on = x.dataset.t === t; x.classList.toggle('active', on); x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; });
    (CLIENT_TAB_RENDER[t] || CLIENT_TAB_RENDER.overview)(host, c);
    hydrateMedia(host);
  };
  show(_clientTab);
  $$('.fiche-tabs .tab', el).forEach(b => b.onclick = () => show(b.dataset.t));
  /* Navigation clavier entre onglets (flèches, Début, Fin) */
  $('.fiche-tabs .tabs', el).onkeydown = e => {
    const ts = $$('.fiche-tabs .tab', el); const i = ts.findIndex(x => x.classList.contains('active'));
    const n = e.key === 'ArrowRight' ? (i + 1) % ts.length : e.key === 'ArrowLeft' ? (i - 1 + ts.length) % ts.length : e.key === 'Home' ? 0 : e.key === 'End' ? ts.length - 1 : -1;
    if (n < 0) return; e.preventDefault(); ts[n].focus(); show(ts[n].dataset.t);
  };

  /* Actions */
  const qa = { interaction: () => interactionForm(null, { clientId: c.id }), achat: () => achatForm(null, { clientId: c.id }), devis: () => devisForm(null, { clientId: c.id }), facture: () => factureForm(null, { clientId: c.id }), note: () => noteForm(null, { clientId: c.id }), document: () => documentForm(c.id) };
  $$('[data-qa]', el).forEach(b => b.onclick = () => qa[b.dataset.qa]());
  $('#fdPrint', el).onclick = () => printClientSheet(c);
  if ($('#fdEdit', el)) $('#fdEdit', el).onclick = () => clientForm(c.id);
  if ($('#fdStatus', el)) $('#fdStatus', el).onchange = e => guard(e.target, async () => { await setClientStatus(c.id, e.target.value); toast('Statut mis à jour : ' + CLIENT_STATUS[e.target.value].label, 'ok'); });
  if ($('#fdArch', el)) $('#fdArch', el).onclick = e => isArchived(c) ? guard(e.currentTarget, async () => { await setClientArchived(c.id, false); toast('Client réaffiché', 'ok'); }) : askArchiveClient(c.id);
  if ($('#fdDel', el)) $('#fdDel', el).onclick = () => {
    const n = clientLinkedCounts(c.id);
    const parts = [['contacts', 'contact(s)'], ['achats', 'achat(s)'], ['devis', 'devis'], ['factures', 'facture(s)'], ['interactions', 'interaction(s)'], ['notes', 'note(s)'], ['fidelite', 'mouvement(s) de fidélité'], ['documents', 'document(s)']].filter(([k]) => n[k]).map(([k, l]) => `<li><b>${n[k]}</b> ${l}</li>`).join('');
    confirmDialog(`Supprimer définitivement « ${clientName(c)} » (${c.number}) ainsi que toutes ses données associées ? Cette action est irréversible.`,
      async () => { await deleteClient(c.id); toast('Client et données associées supprimés', 'dng'); go('clients'); },
      { yes: 'Supprimer définitivement', requireText: 'SUPPRIMER', title: 'Suppression d\'un client', details: (parts ? `<p style="margin-top:10px">Seront également supprimés :</p><ul style="margin:6px 0 0 18px;line-height:1.7">${parts}</ul>` : '') + `<p class="notice-sm">${svg('info', 'inl')} Pour conserver l'historique, préférez <b>Archiver</b>.</p>` });
  };
};

/* ═════════════════════ CONTENU DES ONGLETS ═════════════════════ */
const byClient = (list, id) => list.filter(x => x.clientId === id);
const CLIENT_TAB_RENDER = {
  overview(host, c) {
    const m = metricsOf(c.id), L = loyaltyOf(c.id);
    const tasks = pendingTasks().filter(i => i.clientId === c.id);
    const follow = clientsToFollow().find(f => f.client.id === c.id);
    const recent = byClient(S.interactions, c.id).filter(i => i.done).sort((a, b) => ((b.date + (b.time || '')) > (a.date + (a.time || '')) ? 1 : -1)).slice(0, 5);
    const unpaid = byClient(S.factures, c.id).filter(isFactureUnpaid);
    const primary = S.contacts.find(x => x.clientId === c.id && x.isPrimary);
    const urgent = byClient(S.notes, c.id).filter(n => n.status !== 'traitee' && NOTE_PRIO[n.priority].rank >= 3);
    host.innerHTML = `<div class="fiche-grid"><div style="display:flex;flex-direction:column;gap:20px">
        <section class="panel"><div class="panel-h"><h3>Prochaines actions</h3>${can('client.edit') ? `<button type="button" class="btn sm" id="ovTask">${svg('plus')} Planifier une relance</button>` : ''}</div><div class="panel-b">
          ${follow ? `<div class="notice warn-n" style="margin-bottom:12px">${svg('bell')}<div>${follow.reasons.map(esc).join('<br>')}</div></div>` : ''}
          ${tasks.length ? timelineHTML(tasks, { compact: true }) : `<p class="muted">${follow ? 'Aucune relance planifiée : pensez à en programmer une.' : 'Aucune action en attente pour ce client.'}</p>`}
        </div></section>
        <section class="panel"><div class="panel-h"><h3>Dernières interactions</h3><button type="button" class="btn sm ghost" data-goto-tab="interactions">Tout voir</button></div><div class="panel-b">${recent.length ? timelineHTML(recent, { compact: true }) : '<p class="muted">Aucune interaction enregistrée.</p>'}</div></section>
      </div><div style="display:flex;flex-direction:column;gap:20px">
        ${urgent.length ? `<section class="panel"><div class="panel-h"><h3>Notes internes importantes</h3><span class="internal-tag">${svg('lock')}Interne</span></div><div class="panel-b">${urgent.slice(0, 3).map(n => `<div class="list-row static"><div class="grow"><b>${esc(n.title)}</b><small class="muted d-block">${esc(n.content.slice(0, 120))}${n.content.length > 120 ? '…' : ''}</small></div>${statusChip(NOTE_PRIO, n.priority, 'xs')}</div>`).join('')}</div></section>` : ''}
        <section class="panel"><div class="panel-h"><h3>Synthèse commerciale</h3></div><div class="panel-b">
          <div class="info-line"><span class="k">Total dépensé (TTC)</span><span class="v mono">${fmtMoney(m.spent)}</span></div>
          <div class="info-line"><span class="k">Nombre d'achats</span><span class="v mono">${m.nAchats}</span></div>
          <div class="info-line"><span class="k">Panier moyen</span><span class="v mono">${fmtMoney(m.avgBasket)}</span></div>
          <div class="info-line"><span class="k">Premier / dernier achat</span><span class="v">${fmtDate(m.firstPurchase)} / ${fmtDate(m.lastPurchase)}</span></div>
          <div class="info-line"><span class="k">Devis en attente</span><span class="v mono">${m.openQuotes} · ${fmtMoney(m.openQuotesValue)}</span></div>
          <div class="info-line"><span class="k">Reste à encaisser</span><span class="v mono ${m.overdue ? 'dng-t' : ''}">${fmtMoney(m.unpaid)}</span></div>
          ${unpaid.length ? `<div class="quick-list" style="margin-top:10px">${unpaid.map(f => `<button type="button" class="list-row" data-fac="${f.id}"><div class="grow"><b class="mono">${esc(f.number)}</b><small class="muted">échéance ${fmtDate(f.dueDate)}</small></div><span class="amount">${fmtMoney(factureDue(f))}</span>${statusChip(FACT_STATUS, factureStatus(f), 'xs')}</button>`).join('')}</div>` : ''}
        </div></section>
        <section class="panel"><div class="panel-h"><h3>Contact principal</h3><button type="button" class="btn sm ghost" data-goto-tab="contacts">Contacts (${m.nContacts})</button></div><div class="panel-b">${primary ? contactCardHTML(primary, { bare: true }) : `<p class="muted">Aucun contact enregistré.</p>${can('client.edit') ? `<button type="button" class="btn sm" id="ovContact" style="margin-top:10px">${svg('plus')} Ajouter un contact</button>` : ''}`}</div></section>
        <section class="panel"><div class="panel-h"><h3>Fidélité</h3>${tierChip(L.tier)}</div><div class="panel-b">
          <div class="row between"><span class="soft">Points disponibles</span><b class="mono" style="font-size:1.3rem">${fmtNum(L.available, 0)}</b></div>
          <div class="tier-prog"><div class="prog" role="img" aria-label="Progression vers le niveau suivant : ${Math.round(L.progress)} %"><span style="width:${L.progress}%"></span></div><small>${L.next ? `Encore ${fmtNum(L.toNext, 0)} point(s) gagnés pour atteindre le niveau ${TIERS[L.next].label}.` : 'Niveau maximal atteint.'}</small></div>
        </div></section>
      </div></div>`;
    bindTimeline(host); bindQuickLinks(host); bindContactCards(host);
    $$('[data-goto-tab]', host).forEach(b => b.onclick = () => $(`.fiche-tabs .tab[data-t="${b.dataset.gotoTab}"]`)?.click());
    if ($('#ovTask', host)) $('#ovTask', host).onclick = () => interactionForm(null, { clientId: c.id, type: 'relance', done: false, date: addDays(todayISO(), 7) });
    if ($('#ovContact', host)) $('#ovContact', host).onclick = () => contactForm(null, { clientId: c.id });
  },
  infos(host, c) {
    const L = (k, v) => `<div class="info-line"><span class="k">${k}</span><span class="v">${v || '<span class="muted">—</span>'}</span></div>`;
    host.innerHTML = `<section class="panel"><div class="panel-h"><h3>Informations générales</h3>${can('client.edit') ? `<button type="button" class="btn sm" id="inEdit">${svg('edit')} Modifier</button>` : ''}</div><div class="panel-b"><div class="info-cols">
      <div>${L('Identifiant', `<span class="mono" style="font-size:.76rem">${esc(c.id)}</span>`)}${L('Numéro client', `<b class="mono">${esc(c.number)}</b>`)}${L('Civilité', esc(CIVILITY[c.civility] || ''))}${L('Prénom', esc(c.firstName))}${L('Nom', esc(c.lastName))}${L('Entreprise', esc(c.company))}${L('Fonction', esc(c.jobTitle))}${L('Date de naissance', c.birthDate ? fmtDate(c.birthDate) : '')}${L('Statut', clientStatusChip(c, true))}${L('Catégorie', c.categoryId ? esc(catName(c.categoryId)) : '')}${L('Source', esc(c.source))}${L('Commercial responsable', esc(operatorName(c.salesRepId)))}</div>
      <div>${L('Téléphone', c.phone ? `<a href="${telHref(c.phone)}">${esc(c.phone)}</a>` : '')}${L('Téléphone secondaire', c.phone2 ? `<a href="${telHref(c.phone2)}">${esc(c.phone2)}</a>` : '')}${L('E-mail', c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '')}${L('Site Internet', esc(c.website))}${L('Adresse', esc(c.address))}${L('Complément', esc(c.address2))}${L('Code postal', esc(c.zip))}${L('Ville', esc(c.city))}${L('Pays', esc(c.country))}${L('Créé le', fmtDateTime(c.createdAt))}${L('Modifié le', fmtDateTime(c.updatedAt))}${L('Activité', isActiveClient(c) ? 'Actif' : 'Inactif')}</div>
    </div></div></section>`;
    if ($('#inEdit', host)) $('#inEdit', host).onclick = () => clientForm(c.id);
  },
  contacts(host, c) {
    const list = byClient(S.contacts, c.id).sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || contactName(a).localeCompare(contactName(b), 'fr'));
    host.innerHTML = `<div class="row between wrap" style="margin-bottom:14px"><p class="soft">${list.length} contact(s) chez ${esc(clientName(c))}. Le contact principal est mis en évidence.</p>${can('client.edit') ? `<button type="button" class="btn gold" id="tcNew">${svg('plus')} Ajouter un contact</button>` : ''}</div>` +
      (list.length ? `<div class="ct-grid">${list.map(ct => contactCardHTML(ct)).join('')}</div>` : emptyState('user', 'Aucun contact', 'Ajoutez les interlocuteurs de ce client (responsable achats, comptabilité…).'));
    bindContactCards(host);
    if ($('#tcNew', host)) $('#tcNew', host).onclick = () => contactForm(null, { clientId: c.id });
  },
  achats(host, c) {
    const list = byClient(S.achats, c.id).sort((a, b) => (a.date < b.date ? 1 : -1));
    const m = metricsOf(c.id);
    host.innerHTML = `<div class="mini-kpis" style="margin:0 0 16px"><div><span class="k">Total dépensé</span><b class="mono">${fmtMoneyShort(m.spent)}</b><small>${fmtMoney(m.spentHT)} HT</small></div><div><span class="k">Nombre d'achats</span><b class="mono">${m.nAchats}</b><small>hors annulés</small></div><div><span class="k">Panier moyen</span><b class="mono">${fmtMoneyShort(m.avgBasket)}</b><small>TTC</small></div><div><span class="k">Premier / dernier</span><b class="mono" style="font-size:.95rem">${fmtDate(m.firstPurchase)}</b><small>${fmtDate(m.lastPurchase)}</small></div></div>
      <div class="row between wrap" style="margin-bottom:12px"><span></span><div class="row wrap" style="gap:8px">${can('export') && list.length ? `<button type="button" class="btn sm" id="taCsv">${svg('down')} CSV</button>` : ''}${can('sale.edit') ? `<button type="button" class="btn gold" id="taNew">${svg('plus')} Ajouter un achat</button>` : ''}</div></div>` +
      (list.length ? achatsTableHTML(list, { client: false }) : emptyState('cart', 'Aucun achat', 'L\'historique des achats de ce client apparaîtra ici.'));
    bindRows(host, 'ach', openAchatDrawer);
    if ($('#taNew', host)) $('#taNew', host).onclick = () => achatForm(null, { clientId: c.id });
    if ($('#taCsv', host)) $('#taCsv', host).onclick = () => exportAchatsCSV(list);
  },
  devis(host, c) {
    const list = byClient(S.devis, c.id).sort((a, b) => (a.date + a.number < b.date + b.number ? 1 : -1));
    host.innerHTML = `<div class="row between wrap" style="margin-bottom:12px"><p class="soft">${list.length} devis · ${list.filter(d => devisStatus(d) === 'accepted').length} accepté(s)</p>${can('sale.edit') ? `<button type="button" class="btn gold" id="tdNew">${svg('plus')} Nouveau devis</button>` : ''}</div>` +
      (list.length ? devisTableHTML(list, { client: false }) : emptyState('file', 'Aucun devis', 'Les devis établis pour ce client apparaîtront ici.'));
    bindRows(host, 'dev', openDevisDrawer);
    if ($('#tdNew', host)) $('#tdNew', host).onclick = () => devisForm(null, { clientId: c.id });
  },
  factures(host, c) {
    const list = byClient(S.factures, c.id).sort((a, b) => (a.date + a.number < b.date + b.number ? 1 : -1));
    const due = sum(list, factureDue);
    host.innerHTML = `${due ? `<div class="notice ${list.some(f => factureStatus(f) === 'late') ? 'warn-n' : ''}">${svg('receipt')}<div class="grow">Reste à encaisser : <b>${fmtMoney(due)}</b> sur ${list.filter(isFactureUnpaid).length} facture(s).</div></div>` : ''}
      <div class="row between wrap" style="margin-bottom:12px"><p class="soft">${list.length} facture(s)</p>${can('sale.edit') ? `<button type="button" class="btn gold" id="tfNew">${svg('plus')} Nouvelle facture</button>` : ''}</div>` +
      (list.length ? facturesTableHTML(list, { client: false }) : emptyState('receipt', 'Aucune facture', 'Les factures de ce client apparaîtront ici.'));
    bindRows(host, 'fac', openFactureDrawer);
    if ($('#tfNew', host)) $('#tfNew', host).onclick = () => factureForm(null, { clientId: c.id });
  },
  fidelite(host, c) { host.innerHTML = loyaltyPanelHTML(c.id); bindLoyaltyPanel(host, c.id); },
  interactions(host, c) {
    const list = byClient(S.interactions, c.id).sort((a, b) => ((b.date + (b.time || '')) > (a.date + (a.time || '')) ? 1 : -1));
    host.innerHTML = `<div class="row between wrap" style="margin-bottom:14px"><div class="seg wrap-seg" role="group" aria-label="Filtrer par type"><button type="button" class="on" data-it="" aria-pressed="true">Toutes</button>${Object.entries(INTER_TYPES).filter(([k]) => list.some(i => i.type === k)).map(([k, t]) => `<button type="button" data-it="${k}" aria-pressed="false">${t.label}</button>`).join('')}</div>
      ${can('client.edit') ? `<button type="button" class="btn gold" id="tiNew">${svg('plus')} Nouvelle interaction</button>` : ''}</div><div id="tiList"></div>`;
    const draw = type => {
      const l = list.filter(i => !type || i.type === type);
      $('#tiList', host).innerHTML = l.length ? timelineHTML(l, { grouped: true }) : emptyState('msg', 'Aucune interaction', 'Appels, e-mails, rendez-vous et relances apparaîtront ici sous forme de timeline.');
      bindTimeline($('#tiList', host));
    };
    draw('');
    $$('[data-it]', host).forEach(b => b.onclick = () => { $$('[data-it]', host).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); draw(b.dataset.it); });
    if ($('#tiNew', host)) $('#tiNew', host).onclick = () => interactionForm(null, { clientId: c.id });
  },
  notes(host, c) {
    const list = byClient(S.notes, c.id).sort(noteSort);
    host.innerHTML = `<div class="notice" role="note">${svg('lock')}<div class="grow"><b>Notes internes</b> — réservées à votre équipe. Elles n'apparaissent jamais sur les devis, factures ou fiches imprimées destinés au client.</div>${can('note.edit') ? `<button type="button" class="btn sm gold" id="tnNew">${svg('plus')} Nouvelle note</button>` : ''}</div>` +
      (list.length ? `<div class="notes-grid">${list.map(n => noteCardHTML(n)).join('')}</div>` : emptyState('note', 'Aucune note interne', 'Consignez ici les informations utiles à l\'équipe (préférences, points de vigilance…).'));
    bindNoteCards(host);
    if ($('#tnNew', host)) $('#tnNew', host).onclick = () => noteForm(null, { clientId: c.id });
  },
  documents(host, c) {
    const list = byClient(S.documents, c.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    host.innerHTML = (can('doc.edit') ? dropZoneHTML('tdDrop') : '') + `<section class="panel"><div class="panel-h"><h3>Documents du client</h3><span class="chip">${list.length}</span></div><div class="panel-b">${list.length ? docListHTML(list) : '<p class="muted">Aucun document. Déposez des fichiers ci-dessus (contrats, justificatifs…).</p>'}</div></section>`;
    bindDocList(host);
    if (can('doc.edit')) bindDropZone(host, 'tdDrop', files => documentForm(c.id, files));
  },
  stats(host, c) {
    const P = periodFromKey('365');
    const { buckets } = bucketsFor(P, 'month');
    const spend = buckets.map(() => 0), inter = buckets.map(() => 0);
    byClient(S.achats, c.id).forEach(a => { if (!isRevenue(a)) return; const i = bucketIndex(buckets, a.date); if (i >= 0) spend[i] += docTotals(a).ttc; });
    byClient(S.interactions, c.id).forEach(x => { if (!x.done) return; const i = bucketIndex(buckets, x.date); if (i >= 0) inter[i]++; });
    const prods = new Map();
    byClient(S.achats, c.id).filter(isRevenue).forEach(a => a.lines.forEach(l => { const r = prods.get(l.label) || { label: l.label, value: 0 }; r.value += lineHT(l); prods.set(l.label, r); }));
    const top = [...prods.values()].sort((a, b) => b.value - a.value).slice(0, 8);
    const types = Object.entries(INTER_TYPES).map(([k, t]) => ({ name: t.label, value: byClient(S.interactions, c.id).filter(i => i.type === k).length }));
    const qs = byClient(S.devis, c.id);
    const acc = qs.filter(d => d.status === 'accepted').length, dec = qs.filter(d => ['accepted', 'refused', 'expired'].includes(devisStatus(d))).length;
    const paid = byClient(S.factures, c.id).filter(f => f.status === 'paid' && f.paidDate);
    const delay = paid.length ? sum(paid, f => Math.max(0, daysBetween(f.date, f.paidDate))) / paid.length : null;
    host.innerHTML = `<div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
        ${kpiCard({ icon: 'euro', cls: 'ok', num: fmtMoneyShort(sum(spend, x => x)), money: true, lbl: 'Dépensé sur 12 mois', sub: fmtMoney(sum(spend, x => x)) })}
        ${kpiCard({ icon: 'target', num: dec ? fmtPct(acc / dec * 100) : '—', lbl: 'Taux de transformation des devis', sub: `${acc} accepté(s) sur ${dec} décidé(s)` })}
        ${kpiCard({ icon: 'clock', num: delay === null ? '—' : Math.round(delay) + ' j', lbl: 'Délai moyen de paiement', sub: `${paid.length} facture(s) réglée(s)` })}
        ${kpiCard({ icon: 'msg', num: fmtNum(sum(inter, x => x), 0), lbl: 'Interactions sur 12 mois', sub: 'appels, e-mails, rendez-vous…' })}
      </div>
      <div class="cols">${chartPanel('csSpend', 'Dépenses mensuelles (12 mois)')}${chartPanel('csTypes', 'Interactions par type')}</div>
      <section class="panel" style="margin-top:20px"><div class="panel-h"><h3>Produits et prestations les plus achetés (HT)</h3></div><div class="panel-b">${rankBars(top.map(t => ({ label: t.label, value: round2(t.value) })), { fmt: fmtMoney, labelW: 260, empty: 'Aucun achat enregistré.' })}</div></section>`;
    const labels = buckets.map(b => b.label);
    barChart($('#csSpend', host), { labels, series: [{ name: 'Dépensé TTC', values: spend.map(round2), cls: 's1' }], fmt: fmtMoney, axisFmt: fmtMoneyShort, label: 'Dépenses mensuelles du client', empty: 'Aucun achat sur les 12 derniers mois.' });
    donutChart($('#csTypes', host), types, { fmt: v => fmtNum(v, 0), center: fmtNum(sum(types, t => t.value), 0), centerLabel: 'interactions', label: 'Répartition des interactions par type', empty: 'Aucune interaction.' });
    bindChartToggles(host, { csSpend: () => chartTable(labels, [{ name: 'Dépensé TTC', values: spend.map(round2) }, { name: 'Interactions', values: inter }], v => Number.isInteger(v) && v < 1000 ? fmtNum(v, 0) : fmtMoney(v)), csTypes: () => chartTable(types.map(t => t.name), [{ name: 'Interactions', values: types.map(t => t.value) }], v => fmtNum(v, 0), 'Type') });
  }
};
