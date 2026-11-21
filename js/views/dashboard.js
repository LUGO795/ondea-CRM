/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — views/dashboard.js
   Tableau de bord : indicateurs calculés à partir des données réelles,
   évolution de l'activité commerciale filtrable par période, clients à
   relancer, activité récente, dernières interactions et derniers
   clients / devis / factures — tout est cliquable.
   ██████████████████████████████████████████████████████████████ */
"use strict";

const DASH = UI_STATE.load('dash', { period: '365', from: '', to: '', last: 'clients', series: 'ca' });

/* ---------- Démarrage guidé (base vide) ---------- */
function gettingStarted() {
  const steps = [
    { ok: !!SETTINGS.address || !!SETTINGS.logoId, t: 'Compléter les informations de votre entreprise (adresse, logo, SIRET)', a: 'parametres', b: 'Paramètres' },
    { ok: S.categories.length > 0, t: 'Créer vos catégories de clients', a: 'parametres', b: 'Catégories' },
    { ok: S.clients.length > 0, t: 'Créer votre première fiche client', a: 'clients', b: 'Clients', act: 'new' },
    { ok: S.devis.length > 0, t: 'Établir un premier devis', a: 'devis', b: 'Devis', act: 'new' },
    { ok: S.interactions.some(i => !i.auto), t: 'Noter un appel, un rendez-vous ou planifier une relance', a: 'interactions', b: 'Suivi', act: 'new' }
  ];
  const done = steps.filter(s => s.ok).length;
  return `<section class="panel start-panel" aria-labelledby="gsT"><div class="panel-h"><h3 id="gsT">Démarrage guidé</h3><span class="chip gold">${done} / ${steps.length}</span></div>
    <div class="panel-b"><p class="soft" style="margin-bottom:14px">Suivez ces étapes pour mettre en place votre relation client. Vous pouvez aussi explorer l'application avec des données fictives.</p>
    <ol class="gs-list">${steps.map((s, i) => `<li class="${s.ok ? 'done' : ''}"><span class="gs-n" aria-hidden="true">${s.ok ? svg('check') : i + 1}</span><span class="grow">${esc(s.t)}${s.ok ? ' <span class="sr-only">(fait)</span>' : ''}</span>
      <a class="btn sm ${s.ok ? 'ghost' : ''}" href="#/${s.a}${s.act ? '?action=' + s.act : ''}">${esc(s.b)}</a></li>`).join('')}</ol>
    ${can('demo') ? `<div class="row wrap" style="margin-top:16px"><button type="button" class="btn" id="gsDemo">${svg('zap')} Charger les données de démonstration</button></div>` : ''}</div></section>`;
}

/* ═════════════════════ VUE ═════════════════════ */
VIEWS.dashboard = (el) => {
  const P = statePeriod(DASH);
  const k = dashboardKpis(P);
  const follow = clientsToFollow();
  const empty = !S.clients.length;
  el.innerHTML = pageHead('Tableau de bord', crumb('Pilotage', 'Tableau de bord'),
    (!empty ? `<button type="button" class="btn" id="dInter">${svg('msg')} Interaction</button><button type="button" class="btn" id="dDevis">${svg('file')} Devis</button>` : '') +
    (can('client.edit') ? `<button type="button" class="btn gold" id="dNew">${svg('plus')} Nouveau client</button>` : ''),
    `Bonjour ${esc(SESSION_OP.name.split(' ')[0])} · ${esc(SETTINGS.companyName || '')} · ${fmtDate(todayISO())}`) +
    demoBanner() + (S.clients.length < 3 ? gettingStarted() : '') +
    (k.lateCount ? `<div class="notice warn-n" role="note">${svg('warn')}<div class="grow"><b>${k.lateCount} facture(s) en retard de paiement</b> — pensez à relancer les clients concernés.</div><a class="btn sm" href="#/factures?status=late">Voir les factures</a></div>` : '') +
    `<div class="row wrap between" style="margin:4px 0 18px">${periodControls(DASH, 'dp')}<small class="muted">Période : ${esc(P.label)}</small></div>
    <div class="kpi-grid k9">
      ${kpiCard({ icon: 'users', num: fmtNum(k.total, 0), lbl: 'Clients', sub: k.archived ? `${k.archived} archivé(s)` : 'hors archivés', go: 'clients' })}
      ${kpiCard({ icon: 'plus', cls: 'ok', num: fmtNum(k.newClients, 0), lbl: 'Nouveaux clients', sub: P.label.toLowerCase(), go: 'clients?created=period' })}
      ${kpiCard({ icon: 'check', cls: 'ok', num: fmtNum(k.active, 0), lbl: 'Clients actifs', sub: `activité < ${SETTINGS.inactiveDays} jours`, go: 'clients?activity=active' })}
      ${kpiCard({ icon: 'clock', cls: k.inactive ? 'warn' : 'ok', num: fmtNum(k.inactive, 0), lbl: 'Clients inactifs', sub: `aucune activité depuis ${SETTINGS.inactiveDays} j`, go: 'clients?activity=inactive' })}
      ${kpiCard({ icon: 'euro', cls: 'ok', num: fmtMoneyShort(k.ca), money: true, lbl: 'Chiffre d\'affaires TTC', sub: `${fmtMoney(k.ca)} · ${k.nAchats} achat(s)`, go: 'statistiques' })}
      ${kpiCard({ icon: 'cart', num: fmtMoneyShort(k.basket), money: true, lbl: 'Panier moyen', sub: P.label.toLowerCase(), go: 'achats' })}
      ${kpiCard({ icon: 'file', num: fmtNum(k.pendingQuotes, 0), lbl: 'Devis en attente', sub: fmtMoney(k.pendingQuotesValue) + ' TTC', go: 'devis?status=sent' })}
      ${kpiCard({ icon: 'receipt', cls: k.lateCount ? 'dng' : k.unpaidCount ? 'warn' : 'ok', num: fmtNum(k.unpaidCount, 0), lbl: 'Factures impayées', sub: `${fmtMoney(k.unpaidValue)}${k.lateCount ? ` · ${k.lateCount} en retard` : ''}`, go: 'factures?status=unpaid' })}
      ${kpiCard({ icon: 'gift', num: fmtNum(k.points, 0), lbl: 'Points de fidélité', sub: 'disponibles chez vos clients', go: 'fidelite' })}
    </div>
    <div class="cols">
      ${chartPanel('chSales', 'Évolution de l\'activité commerciale', DASH.series === 'ca' ? legendItem('s1', 'Chiffre d\'affaires TTC') + legendItem('s2', 'Devis émis TTC') : legendItem('s3', 'Nouveaux clients'),
      `<div class="seg" role="group" aria-label="Série affichée"><button type="button" data-ser="ca" class="${DASH.series === 'ca' ? 'on' : ''}" aria-pressed="${DASH.series === 'ca'}">€</button><button type="button" data-ser="clients" class="${DASH.series === 'clients' ? 'on' : ''}" aria-pressed="${DASH.series === 'clients'}">Clients</button></div>`)}
      ${chartPanel('chStatus', 'Clients par statut')}
    </div>
    <div class="cols" style="margin-top:20px">
      <section class="panel" aria-labelledby="actT"><div class="panel-h"><h3 id="actT">Activité récente</h3><a class="btn sm ghost" href="#/interactions">Suivi commercial</a></div><div class="panel-b" style="padding-top:6px" id="feed"></div></section>
      <section class="panel" aria-labelledby="relT"><div class="panel-h"><h3 id="relT">Clients à relancer</h3><span class="chip ${follow.some(f => f.prio >= 3) ? 'dng' : follow.length ? 'warn' : 'ok'}">${follow.length}</span></div><div class="panel-b" id="dFollow"></div></section>
    </div>
    <div class="cols" style="margin-top:20px">
      <section class="panel" aria-labelledby="intT"><div class="panel-h"><h3 id="intT">Dernières interactions</h3><a class="btn sm ghost" href="#/interactions">Timeline</a></div><div class="panel-b" id="dInters"></div></section>
      <section class="panel" aria-labelledby="lastT"><div class="panel-h"><h3 id="lastT">Derniers enregistrements</h3>
        <div class="seg" role="group" aria-label="Afficher">${[['clients', 'Clients'], ['devis', 'Devis'], ['factures', 'Factures']].map(([v, l]) => `<button type="button" data-last="${v}" class="${DASH.last === v ? 'on' : ''}" aria-pressed="${DASH.last === v}">${l}</button>`).join('')}</div></div>
        <div class="panel-b quick-list" id="dLast"></div></section>
    </div>`;

  /* Graphiques */
  const ss = salesSeries(P);
  const labels = ss.buckets.map(b => b.label);
  if (DASH.series === 'ca') barChart($('#chSales', el), { labels, series: [{ name: 'Chiffre d\'affaires TTC', values: ss.ca, cls: 's1' }, { name: 'Devis émis TTC', values: ss.quotes, cls: 's2' }], fmt: fmtMoney, axisFmt: fmtMoneyShort, label: 'Chiffre d\'affaires et devis émis par période', empty: 'Aucune vente ni aucun devis sur cette période.' });
  else lineChart($('#chSales', el), { labels, series: [{ name: 'Nouveaux clients', values: ss.newC, cls: 's3' }], fmt: v => fmtNum(v, 0), axisFmt: v => fmtNum(v), area: true, label: 'Nouveaux clients par période', empty: 'Aucun nouveau client sur cette période.' });
  const st = distribution(c => c.status, s => CLIENT_STATUS[s].label);
  donutChart($('#chStatus', el), st, { fmt: v => fmtNum(v, 0) + ' client(s)', center: fmtNum(S.clients.length, 0), centerLabel: 'clients', label: 'Répartition des clients par statut', empty: 'Aucun client pour le moment.' });
  bindChartToggles(el, {
    chSales: () => chartTable(labels, [{ name: 'CA TTC', values: ss.ca }, { name: 'Devis émis TTC', values: ss.quotes }, { name: 'Achats', values: ss.nAch }, { name: 'Nouveaux clients', values: ss.newC }], v => Number.isInteger(v) && v < 1000 ? fmtNum(v, 0) : fmtMoney(v)),
    chStatus: () => chartTable(st.map(x => x.name), [{ name: 'Clients', values: st.map(x => x.value) }], v => fmtNum(v, 0), 'Statut')
  });
  $$('[data-ser]', el).forEach(b => b.onclick = () => { DASH.series = b.dataset.ser; UI_STATE.save('dash', DASH); route({ keepScroll: true }); });

  /* Activité récente (journal) */
  $('#feed', el).innerHTML = activityFeed(10);
  bindFeed(el);

  /* Clients à relancer */
  $('#dFollow', el).innerHTML = follow.length ? follow.slice(0, 7).map(f => `<button type="button" class="list-row" data-cli="${f.client.id}">
      <div class="row" style="min-width:0">${clientThumb(f.client, 'sm')}<div style="min-width:0"><b>${esc(clientName(f.client))}</b><small class="muted d-block">${f.reasons.map(esc).join(' · ')}</small></div></div>
      <span class="chip ${f.prio >= 4 ? 'dng' : f.prio >= 3 ? 'warn' : 'gold'} xs">${f.prio >= 4 ? 'Urgent' : f.prio >= 3 ? 'Prioritaire' : 'À suivre'}</span></button>`).join('') + (follow.length > 7 ? `<a class="btn sm ghost" style="margin-top:12px" href="#/clients?follow=1">Voir les ${follow.length} clients</a>` : '')
    : `<div class="row ok-t">${svg('check')}<b>Aucun client à relancer : tout est à jour.</b></div>`;

  /* Dernières interactions */
  const last = S.interactions.filter(i => i.done).sort((a, b) => ((b.date + (b.time || '')) > (a.date + (a.time || '')) ? 1 : -1)).slice(0, 6);
  $('#dInters', el).innerHTML = last.length ? timelineHTML(last, { client: true, compact: true }) : `<div class="empty empty-sm"><h4>Aucune interaction</h4><p>Appels, e-mails et rendez-vous apparaîtront ici.</p></div>`;
  bindTimeline($('#dInters', el));

  /* Derniers clients / devis / factures */
  const drawLast = () => {
    const host = $('#dLast', el);
    if (DASH.last === 'clients') {
      const list = S.clients.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 7);
      host.innerHTML = list.length ? list.map(c => `<button type="button" class="list-row" data-cli="${c.id}"><div class="row grow">${clientThumb(c, 'sm')}<div class="grow"><b>${esc(clientName(c))}</b><small class="muted">${esc(c.number)} · ${fmtDate(c.createdAt)}${c.city ? ' · ' + esc(c.city) : ''}</small></div></div>${clientStatusChip(c, true)}</button>`).join('') : '<p class="muted">Aucun client.</p>';
    } else if (DASH.last === 'devis') {
      const list = S.devis.slice().sort((a, b) => (a.date + a.number < b.date + b.number ? 1 : -1)).slice(0, 7);
      host.innerHTML = list.length ? list.map(d => `<button type="button" class="list-row" data-dev="${d.id}"><div class="grow"><b class="mono">${esc(d.number)}</b><small class="muted">${esc(clientName(d.clientId))} · ${fmtDate(d.date)}</small></div><span class="amount">${fmtMoney(docTotals(d).ttc)}</span>${statusChip(DEVIS_STATUS, devisStatus(d), 'xs')}</button>`).join('') : '<p class="muted">Aucun devis.</p>';
    } else {
      const list = S.factures.slice().sort((a, b) => (a.date + a.number < b.date + b.number ? 1 : -1)).slice(0, 7);
      host.innerHTML = list.length ? list.map(f => `<button type="button" class="list-row" data-fac="${f.id}"><div class="grow"><b class="mono">${esc(f.number)}</b><small class="muted">${esc(clientName(f.clientId))} · échéance ${fmtDate(f.dueDate)}</small></div><span class="amount">${fmtMoney(docTotals(f).ttc)}</span>${statusChip(FACT_STATUS, factureStatus(f), 'xs')}</button>`).join('') : '<p class="muted">Aucune facture.</p>';
    }
    bindQuickLinks(host);
  };
  drawLast();
  $$('[data-last]', el).forEach(b => b.onclick = () => { DASH.last = b.dataset.last; UI_STATE.save('dash', DASH); $$('[data-last]', el).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); drawLast(); });

  bindQuickLinks($('#dFollow', el));
  bindKpiLinks(el); bindDemoBanner(el);
  bindPeriodControls(el, DASH, () => { UI_STATE.save('dash', DASH); route({ keepScroll: true }); }, 'dp');
  if ($('#dNew', el)) $('#dNew', el).onclick = () => clientForm();
  if ($('#dDevis', el)) $('#dDevis', el).onclick = () => devisForm();
  if ($('#dInter', el)) $('#dInter', el).onclick = () => interactionForm();
  if ($('#gsDemo', el)) $('#gsDemo', el).onclick = e => guard(e.currentTarget, async () => { await loadDemoData(); toast('Données de démonstration chargées', 'ok'); });
};

/* Liens rapides : client, devis, facture, achat (listes compactes) */
function bindQuickLinks(root) {
  $$('[data-cli]', root).forEach(b => { if (b.tagName === 'BUTTON' || b.getAttribute('role') === 'button') b.onclick = () => go('client', { id: b.dataset.cli }); });
  $$('[data-dev]', root).forEach(b => b.onclick = () => openDevisDrawer(b.dataset.dev));
  $$('[data-fac]', root).forEach(b => b.onclick = () => openFactureDrawer(b.dataset.fac));
  $$('[data-ach]', root).forEach(b => b.onclick = () => openAchatDrawer(b.dataset.ach));
}

/* ---------- Fil d'activité (journal) ---------- */
const JOURNAL_ICON = { client: 'user', contact: 'user', achat: 'cart', devis: 'file', facture: 'receipt', interaction: 'msg', note: 'note', fidelite: 'gift', document: 'folder', system: 'gear' };
function activityFeed(n = 10, filter = () => true) {
  const items = S.journal.filter(filter).slice(0, n);
  if (!items.length) return `<div class="empty empty-sm"><h4>Aucune activité</h4><p>Les opérations apparaîtront ici.</p></div>`;
  return items.map(j => `<button type="button" class="feed-item feed-btn" data-ref="${esc(j.ref?.type || '')}" data-id="${esc(j.ref?.id || '')}"><span class="tm">${timeAgo(j.at)}</span>
      <span class="txt">${svg(JOURNAL_ICON[j.kind] || 'info', 'feed-ic')} <b>${esc(j.operatorName || 'Système')}</b> ${j.text}<small class="muted feed-meta">${fmtDateTime(j.at)}</small></span></button>`).join('');
}
function bindFeed(root) {
  $$('.feed-btn', root).forEach(b => b.onclick = () => { if (b.dataset.id) openRef(b.dataset.ref, b.dataset.id); else toast('Cet élément a été supprimé.', 'info'); });
}
