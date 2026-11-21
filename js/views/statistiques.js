/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — views/statistiques.js
   Statistiques CRM (mêmes graphiques SVG que la suite Ondea, lisibles
   en clair, sombre et contraste élevé, avec bascule « Tableau ») :
   évolution du nombre de clients, nouveaux clients, chiffre d'affaires
   et panier moyen par période, CA par client, clients les plus actifs,
   clients inactifs, répartitions (statut, catégorie, fidélité), devis
   acceptés / refusés, factures payées / impayées.
   ██████████████████████████████████████████████████████████████ */
"use strict";

const STAT = UI_STATE.load('stats', { period: '365', from: '', to: '', ser: 'ca', catBy: 'count' });

VIEWS.stats = (el) => {
  const P = statePeriod(STAT);
  const k = dashboardKpis(P);
  const dv = devisOutcome(P), fo = facturesOutcome(P), delay = avgPaymentDelay(P);
  el.innerHTML = pageHead('Statistiques', crumbFor('statistiques'),
    can('export') ? `<button type="button" class="btn" id="sCsv">${svg('down')} CA par client (CSV)</button><button type="button" class="btn" id="sPrint">${svg('printer')} Imprimer</button>` : '',
    'Analyse calculée uniquement à partir des données enregistrées dans l\'application.') +
    `<div class="row wrap between" style="margin-bottom:18px;gap:12px">${periodControls(STAT, 'sp')}<small class="muted">Période : ${esc(P.label)}</small></div>
    <div class="kpi-grid k6">
      ${kpiCard({ icon: 'euro', cls: 'ok', num: fmtMoneyShort(k.ca), money: true, lbl: 'Chiffre d\'affaires TTC', sub: `${k.nAchats} achat(s) · ${fmtMoney(k.ca)}` })}
      ${kpiCard({ icon: 'cart', num: fmtMoneyShort(k.basket), money: true, lbl: 'Panier moyen', sub: 'CA ÷ nombre d\'achats' })}
      ${kpiCard({ icon: 'plus', cls: 'ok', num: fmtNum(k.newClients, 0), lbl: 'Nouveaux clients', sub: `${k.total} client(s) au total` })}
      ${kpiCard({ icon: 'target', num: dv.rate === null ? '—' : fmtPct(dv.rate), lbl: 'Taux de transformation', sub: `${dv.accepted} devis accepté(s) / ${dv.accepted + dv.refused + dv.expired} décidé(s)` })}
      ${kpiCard({ icon: 'clock', num: delay === null ? '—' : Math.round(delay) + ' j', lbl: 'Délai moyen de paiement', sub: 'entre facture et règlement complet' })}
      ${kpiCard({ icon: 'receipt', cls: fo.late ? 'dng' : 'ok', num: fmtMoneyShort(fo.unpaidValue + fo.lateValue), money: true, lbl: 'Reste à encaisser', sub: `${fo.unpaid + fo.late} facture(s), dont ${fo.late} en retard` })}
    </div>
    <div class="cols">
      ${chartPanel('stSales', STAT.ser === 'ca' ? 'Chiffre d\'affaires par période' : 'Panier moyen par période', '', `<div class="seg" role="group" aria-label="Indicateur"><button type="button" data-ser="ca" class="${STAT.ser === 'ca' ? 'on' : ''}" aria-pressed="${STAT.ser === 'ca'}">CA</button><button type="button" data-ser="basket" class="${STAT.ser === 'basket' ? 'on' : ''}" aria-pressed="${STAT.ser === 'basket'}">Panier</button></div>`)}
      ${chartPanel('stCount', 'Évolution du nombre de clients')}
    </div>
    <div class="cols" style="margin-top:20px">
      ${chartPanel('stNew', 'Nouveaux clients par période')}
      ${chartPanel('stStatus', 'Répartition par statut')}
    </div>
    <div class="cols" style="margin-top:20px">
      <section class="panel"><div class="panel-h"><h3>Chiffre d'affaires par client</h3><small class="muted">top 10 · TTC</small></div><div class="panel-b" id="stByClient"></div></section>
      <section class="panel"><div class="panel-h"><h3>Clients les plus actifs</h3><small class="muted">interactions + achats</small></div><div class="panel-b" id="stActive"></div></section>
    </div>
    <div class="cols" style="margin-top:20px">
      ${chartPanel('stCat', 'Répartition par catégorie', '', `<div class="seg" role="group" aria-label="Mesure"><button type="button" data-catby="count" class="${STAT.catBy === 'count' ? 'on' : ''}" aria-pressed="${STAT.catBy === 'count'}">Clients</button><button type="button" data-catby="ca" class="${STAT.catBy === 'ca' ? 'on' : ''}" aria-pressed="${STAT.catBy === 'ca'}">CA</button></div>`)}
      ${chartPanel('stTier', 'Fidélité : clients par niveau')}
    </div>
    <div class="cols" style="margin-top:20px">
      ${chartPanel('stQuotes', 'Devis : acceptés / refusés')}
      ${chartPanel('stInv', 'Factures : payées / impayées (montants)')}
    </div>
    <section class="panel" style="margin-top:20px"><div class="panel-h"><h3>Clients inactifs</h3><small class="muted">aucune activité depuis ${SETTINGS.inactiveDays} jours · classés par CA historique</small></div><div class="panel-b quick-list" id="stInactive"></div></section>`;

  const ss = salesSeries(P), labels = ss.buckets.map(b => b.label);
  if (STAT.ser === 'ca') barChart($('#stSales', el), { labels, series: [{ name: 'CA TTC', values: ss.ca, cls: 's1' }], fmt: fmtMoney, axisFmt: fmtMoneyShort, label: 'Chiffre d\'affaires TTC par période', empty: 'Aucune vente sur cette période.' });
  else lineChart($('#stSales', el), { labels, series: [{ name: 'Panier moyen TTC', values: ss.basket, cls: 's2' }], fmt: fmtMoney, axisFmt: fmtMoneyShort, area: true, label: 'Panier moyen par période', empty: 'Aucune vente sur cette période.' });
  const cs = clientCountSeries(P);
  lineChart($('#stCount', el), { labels: cs.buckets.map(b => b.label), series: [{ name: 'Clients', values: cs.values, cls: 's1' }], fmt: v => fmtNum(v, 0), axisFmt: v => fmtNum(v), area: true, label: 'Nombre total de clients à la fin de chaque période', empty: 'Aucun client.' });
  barChart($('#stNew', el), { labels, series: [{ name: 'Nouveaux clients', values: ss.newC, cls: 's3' }], fmt: v => fmtNum(v, 0), axisFmt: v => fmtNum(v), label: 'Nouveaux clients par période', empty: 'Aucun nouveau client sur cette période.' });
  const st = distribution(c => c.status, s => CLIENT_STATUS[s].label);
  donutChart($('#stStatus', el), st, { fmt: v => fmtNum(v, 0), center: fmtNum(S.clients.length, 0), centerLabel: 'clients', label: 'Répartition des clients par statut', empty: 'Aucun client.' });
  const catRows = (() => {
    if (STAT.catBy === 'count') return distribution(c => c.categoryId || '', id => id ? catName(id) : 'Sans catégorie');
    const map = new Map();
    S.achats.forEach(a => { if (!isRevenue(a) || !inP(a.date, P)) return; const key = clientById(a.clientId)?.categoryId || ''; map.set(key, (map.get(key) || 0) + docTotals(a).ttc); });
    return [...map.entries()].map(([k2, v]) => ({ name: k2 ? catName(k2) : 'Sans catégorie', value: round2(v) })).sort((a, b) => b.value - a.value);
  })();
  donutChart($('#stCat', el), catRows, { fmt: STAT.catBy === 'count' ? v => fmtNum(v, 0) : fmtMoney, center: STAT.catBy === 'count' ? fmtNum(sum(catRows, x => x.value), 0) : fmtMoneyShort(sum(catRows, x => x.value)), centerLabel: STAT.catBy === 'count' ? 'clients' : 'CA TTC', label: 'Répartition par catégorie', empty: STAT.catBy === 'count' ? 'Aucun client.' : 'Aucune vente sur cette période.' });
  const tiers = TIER_ORDER.map(t => ({ name: TIERS[t].label, value: S.clients.filter(c => !isArchived(c) && metricsOf(c.id).tier === t).length }));
  donutChart($('#stTier', el), tiers, { fmt: v => fmtNum(v, 0), center: fmtNum(sum(tiers, t => t.value), 0), centerLabel: 'clients', label: 'Clients par niveau de fidélité', empty: 'Aucun client.' });
  const qRows = [{ name: 'Acceptés', value: dv.accepted }, { name: 'Refusés', value: dv.refused }, { name: 'Expirés', value: dv.expired }, { name: 'En attente', value: dv.sent }, { name: 'Brouillons', value: dv.draft }];
  donutChart($('#stQuotes', el), qRows, { fmt: v => fmtNum(v, 0) + ' devis', center: dv.rate === null ? '—' : fmtPct(dv.rate), centerLabel: 'acceptés', label: 'Devis par issue', empty: 'Aucun devis sur cette période.' });
  const iRows = [{ name: 'Encaissé', value: fo.paidValue }, { name: 'À encaisser (non échu)', value: fo.unpaidValue }, { name: 'En retard', value: fo.lateValue }];
  donutChart($('#stInv', el), iRows, { fmt: fmtMoney, label: 'Montants des factures payés et impayés', empty: 'Aucune facture émise sur cette période.' });
  bindChartToggles(el, {
    stSales: () => chartTable(labels, [{ name: 'CA TTC', values: ss.ca }, { name: 'CA HT', values: ss.caHT }, { name: 'Achats', values: ss.nAch }, { name: 'Panier moyen', values: ss.basket }], v => Number.isInteger(v) && v < 1000 ? fmtNum(v, 0) : fmtMoney(v)),
    stCount: () => chartTable(cs.buckets.map(b => b.label), [{ name: 'Clients', values: cs.values }], v => fmtNum(v, 0)),
    stNew: () => chartTable(labels, [{ name: 'Nouveaux clients', values: ss.newC }], v => fmtNum(v, 0)),
    stStatus: () => chartTable(st.map(x => x.name), [{ name: 'Clients', values: st.map(x => x.value) }], v => fmtNum(v, 0), 'Statut'),
    stCat: () => chartTable(catRows.map(x => x.name), [{ name: STAT.catBy === 'count' ? 'Clients' : 'CA TTC', values: catRows.map(x => x.value) }], STAT.catBy === 'count' ? v => fmtNum(v, 0) : fmtMoney, 'Catégorie'),
    stTier: () => chartTable(tiers.map(x => x.name), [{ name: 'Clients', values: tiers.map(x => x.value) }], v => fmtNum(v, 0), 'Niveau'),
    stQuotes: () => chartTable(qRows.map(x => x.name), [{ name: 'Devis', values: qRows.map(x => x.value) }], v => fmtNum(v, 0), 'Issue'),
    stInv: () => chartTable(iRows.map(x => x.name), [{ name: 'Montant', values: iRows.map(x => x.value) }], fmtMoney, 'Situation')
  });

  const byClient = revenueByClient(P).slice(0, 10);
  $('#stByClient', el).innerHTML = rankBars(byClient.map(r => ({ label: clientName(r.clientId), value: r.value, attrs: ` data-cli="${r.clientId}" role="button" tabindex="0"` })), { fmt: fmtMoney, labelW: 200, empty: 'Aucune vente sur cette période.' });
  const act = mostActiveClients(P).slice(0, 10);
  $('#stActive', el).innerHTML = rankBars(act.map(r => ({ label: clientName(r.clientId), value: r.value, attrs: ` data-cli="${r.clientId}" role="button" tabindex="0"` })), { fmt: v => v + ' action(s)', labelW: 200, empty: 'Aucune activité sur cette période.' });
  $$('.stat-row[data-cli]', el).forEach(r => { r.onclick = () => go('client', { id: r.dataset.cli }); r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('client', { id: r.dataset.cli }); } }; });
  const inactive = S.clients.filter(isInactiveClient).sort((a, b) => metricsOf(b.id).spent - metricsOf(a.id).spent).slice(0, 12);
  $('#stInactive', el).innerHTML = inactive.length ? inactive.map(c => { const m = metricsOf(c.id); return `<button type="button" class="list-row" data-cli="${c.id}"><div class="row grow">${clientThumb(c, 'sm')}<div class="grow"><b>${esc(clientName(c))}</b><small class="muted">dernière activité ${fmtDate(m.lastActivity)} · ${m.nAchats} achat(s)</small></div></div><span class="amount">${fmtMoney(m.spent)}</span>${clientStatusChip(c, true)}</button>`; }).join('') + `<a class="btn sm ghost" style="margin-top:12px" href="#/clients?activity=inactive">Voir tous les clients inactifs</a>`
    : `<div class="row ok-t">${svg('check')}<b>Aucun client inactif.</b></div>`;
  bindQuickLinks($('#stInactive', el));

  $$('[data-ser]', el).forEach(b => b.onclick = () => { STAT.ser = b.dataset.ser; UI_STATE.save('stats', STAT); route({ keepScroll: true }); });
  $$('[data-catby]', el).forEach(b => b.onclick = () => { STAT.catBy = b.dataset.catby; UI_STATE.save('stats', STAT); route({ keepScroll: true }); });
  bindPeriodControls(el, STAT, () => { UI_STATE.save('stats', STAT); route({ keepScroll: true }); }, 'sp');
  if ($('#sCsv', el)) $('#sCsv', el).onclick = () => saveCSV('ca-par-client', ['Période du', 'au', 'Client', 'N° client', 'Nombre d\'achats', 'CA TTC', 'Panier moyen'], revenueByClient(P).map(r => [csvDate(P.from), csvDate(P.to), clientName(r.clientId), clientById(r.clientId)?.number || '', r.n, csvMoney(r.value), csvMoney(r.value / r.n)]));
  if ($('#sPrint', el)) $('#sPrint', el).onclick = () => printTable('Statistiques commerciales', `<div><span>Période</span><b>${esc(P.label)}</b></div><div><span>CA TTC</span><b>${fmtMoney(k.ca)}</b></div><div><span>Panier moyen</span><b>${fmtMoney(k.basket)}</b></div><div><span>Nouveaux clients</span><b>${k.newClients}</b></div>`,
    ['Client', 'N°', { t: 'Achats', r: 1 }, { t: 'CA TTC', r: 1 }, { t: 'Panier moyen', r: 1 }], revenueByClient(P).slice(0, 40).map(r => [esc(clientName(r.clientId)), esc(clientById(r.clientId)?.number || ''), r.n, fmtMoney(r.value), fmtMoney(r.value / r.n)]),
    `Devis : ${dv.accepted} accepté(s), ${dv.refused} refusé(s), ${dv.expired} expiré(s). Factures : ${fmtMoney(fo.paidValue)} encaissés, ${fmtMoney(fo.unpaidValue + fo.lateValue)} restant dus.`);
};
