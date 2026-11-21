/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — views/fidelite.js
   Programme de fidélité :
     • points gagnés automatiquement sur chaque achat payé
       (X points par euro TTC ou HT, réglable) ;
     • points disponibles / gagnés / utilisés, niveau Bronze, Argent,
       Or, Platine (seuils configurables, calculés sur les points gagnés) ;
     • récompenses échangeables, bonus et ajustements manuels tracés ;
     • historique complet des mouvements et date de dernière activité.
   ██████████████████████████████████████████████████████████████ */
"use strict";

const FDF_DEFAULT = { q: '', tier: '', page: 1, hq: '' };
const FDF = UI_STATE.load('fidelite', FDF_DEFAULT);

VIEWS.fidelite = (el) => {
  const L = SETTINGS.loyalty;
  const all = S.clients.filter(c => !isArchived(c)).map(c => ({ c, l: loyaltyOf(c.id) }));
  const tiers = TIER_ORDER.slice(1).map(k => ({ k, n: all.filter(x => x.l.tier === k).length }));
  const canRules = can('loyalty.rules');
  el.innerHTML = pageHead('Fidélité', crumbFor('fidelite'),
    (can('export') ? `<button type="button" class="btn" id="fdCsv">${svg('down')} Export CSV</button>` : '') +
    (can('loyalty.edit') ? `<button type="button" class="btn gold" id="fdMove">${svg('gift')} Ajouter / retirer des points</button>` : ''),
    L.enabled ? `${loyaltyRuleLabel(L)} sur chaque achat payé.` : '<b>Programme désactivé</b> : aucun point n\'est crédité sur les nouveaux achats.') +
    `<div class="kpi-grid">
      ${kpiCard({ icon: 'gift', num: fmtNum(sum(all, x => x.l.available), 0), lbl: 'Points disponibles', sub: 'chez l\'ensemble de vos clients' })}
      ${kpiCard({ icon: 'trend', cls: 'ok', num: fmtNum(sum(all, x => x.l.earned), 0), lbl: 'Points gagnés', sub: 'depuis le début' })}
      ${kpiCard({ icon: 'award', cls: 'warn', num: fmtNum(sum(all, x => x.l.used), 0), lbl: 'Points utilisés', sub: 'récompenses et retraits' })}
      ${kpiCard({ icon: 'users', num: fmtNum(all.filter(x => x.l.tier !== 'none').length, 0), lbl: 'Clients fidélisés', sub: `niveau Bronze ou plus (${fmtNum(L.tiers.bronze, 0)} pts)` })}
    </div>
    <section class="panel" style="margin-bottom:20px"><div class="panel-h"><h3>Niveaux de fidélité</h3><small class="muted">calculés sur les points gagnés (cumul)</small></div><div class="panel-b"><div class="tier-grid">
      ${tiers.map(t => `<button type="button" class="tier-card kpi-btn ${FDF.tier === t.k ? 'sel' : ''}" data-tier="${t.k}" aria-pressed="${FDF.tier === t.k}">${tierChip(t.k)}<b>${t.n}</b><small>client(s) · dès ${fmtNum(L.tiers[t.k], 0)} points</small></button>`).join('')}
    </div></div></section>
    <div class="cols">
      <section class="panel"><div class="panel-h"><h3>Clients et points</h3>${FDF.tier ? `<button type="button" class="btn sm ghost" id="fdAllTiers">Tous les niveaux</button>` : ''}</div>
        <div class="panel-b"><div class="tbl-tools" style="margin-bottom:12px">${searchBox('fdQ', 'Rechercher un client', FDF.q, 'Nom, entreprise, n° client…', 320)}</div><div id="fdList"></div></div></section>
      <section class="panel"><div class="panel-h"><h3>Règles du programme</h3>${canRules ? '' : '<small class="muted">consultation</small>'}</div><div class="panel-b">
        <fieldset class="set-fs" ${canRules ? '' : 'disabled'} style="gap:0">
          <div class="set-row"><span>Programme actif</span><label class="switch"><input type="checkbox" id="lrOn" ${L.enabled ? 'checked' : ''}><span class="sr-only">Programme de fidélité actif</span></label></div>
          <div class="grid-2" style="margin-top:12px">${fieldHTML({ id: 'lrRate', label: 'Points par euro dépensé', value: String(L.pointsPerEuro).replace('.', ','), attrs: 'inputmode="decimal"', hint: '0,1 = 1 point par tranche de 10 €' })}${selectHTML({ id: 'lrBasis', label: 'Base de calcul', options: [['ttc', 'Montant TTC'], ['ht', 'Montant HT']], value: L.basis })}</div>
          <span class="flabel">Seuils des niveaux (points gagnés)</span>
          <div class="grid-2">${TIER_ORDER.slice(1).map(k => fieldHTML({ id: 'lrT' + k, label: TIERS[k].label, value: L.tiers[k], attrs: 'inputmode="numeric"' })).join('')}</div>
          <span class="flabel">Récompenses</span>
          <div id="lrRewards"></div>
          ${canRules ? `<button type="button" class="btn sm" id="lrAddRw" style="margin:6px 0 14px">${svg('plus')} Ajouter une récompense</button>` : ''}
        </fieldset>
        ${canRules ? `<div class="row wrap" style="gap:8px"><button type="button" class="btn gold" id="lrSave">${svg('check')} Enregistrer les règles</button><button type="button" class="btn" id="lrRecalc">${svg('repeat')} Recalculer les points des achats</button></div>
        <p class="hint" style="margin-top:8px">Le recalcul applique les règles actuelles à tous les achats payés (les bonus, ajustements et récompenses ne sont pas modifiés).</p>` : ''}
      </div></section>
    </div>
    <section class="panel" style="margin-top:20px"><div class="panel-h"><h3>Historique des mouvements de points</h3>${can('export') ? `<button type="button" class="btn sm" id="fdMvCsv">${svg('down')} CSV</button>` : ''}</div>
      <div class="panel-b"><div class="tbl-tools" style="margin-bottom:12px">${searchBox('fdHq', 'Filtrer l\'historique', FDF.hq, 'Client, motif…', 320)}</div><div id="fdHist"></div></div></section>`;

  /* Clients */
  const drawList = () => {
    UI_STATE.save('fidelite', FDF);
    const t = norm(FDF.q);
    const rows = all.filter(x => (!FDF.tier || x.l.tier === FDF.tier) && (!t || norm(clientName(x.c) + ' ' + x.c.number).includes(t))).sort((a, b) => b.l.available - a.l.available || b.l.earned - a.l.earned);
    const pg = paginate(rows, FDF, 15);
    const host = $('#fdList', el);
    host.innerHTML = rows.length ? `<div class="tbl-wrap flat"><table class="tbl" style="min-width:620px"><caption class="sr-only">Points de fidélité par client</caption><thead><tr><th scope="col">Client</th><th scope="col">Niveau</th><th scope="col" class="num-c">Disponibles</th><th scope="col" class="num-c">Gagnés</th><th scope="col" class="num-c">Utilisés</th><th scope="col">Dernière activité</th></tr></thead><tbody>
      ${pg.rows.map(({ c, l }) => `<tr data-cli="${c.id}" tabindex="0"><td><div class="cell-user">${clientThumb(c, 'sm')}<div><b>${esc(clientName(c))}</b><small class="mono">${esc(c.number)}</small></div></div></td><td>${tierChip(l.tier, true)}</td><td class="num-c"><b class="mono">${fmtNum(l.available, 0)}</b></td><td class="num-c mono">${fmtNum(l.earned, 0)}</td><td class="num-c mono">${fmtNum(l.used, 0)}</td><td>${fmtDate(l.lastActivity)}</td></tr>`).join('')}
      </tbody></table></div>` + pagerHTML(FDF.page, pg.pages, pg.total, pg.start, pg.rows.length, 'client') : '<p class="muted">Aucun client à ce niveau.</p>';
    hydrateMedia(host); bindPager(host, FDF, drawList);
    bindRows(host, 'cli', id => go('client', { id, tab: 'fidelite' }));
  };
  drawList();
  $('#fdQ', el).oninput = debounce(e => { FDF.q = e.target.value; FDF.page = 1; drawList(); }, 120);
  $$('[data-tier]', el).forEach(b => b.onclick = () => { FDF.tier = FDF.tier === b.dataset.tier ? '' : b.dataset.tier; FDF.page = 1; UI_STATE.save('fidelite', FDF); route({ keepScroll: true }); });
  if ($('#fdAllTiers', el)) $('#fdAllTiers', el).onclick = () => { FDF.tier = ''; UI_STATE.save('fidelite', FDF); route({ keepScroll: true }); };

  /* Historique */
  const drawHist = () => {
    const t = norm(FDF.hq);
    const rows = S.fidelite.filter(f => !t || norm(clientName(f.clientId) + ' ' + f.label).includes(t)).sort((a, b) => (a.date + a.createdAt < b.date + b.createdAt ? 1 : -1)).slice(0, 150);
    $('#fdHist', el).innerHTML = rows.length ? loyaltyMovesTable(rows, true) : '<p class="muted">Aucun mouvement de points.</p>';
    bindLoyaltyMoves($('#fdHist', el));
  };
  drawHist();
  $('#fdHq', el).oninput = debounce(e => { FDF.hq = e.target.value; UI_STATE.save('fidelite', FDF); drawHist(); }, 150);

  /* Règles */
  let rewards = clone(L.rewards);
  const drawRewards = () => {
    $('#lrRewards', el).innerHTML = rewards.length ? rewards.map((r, i) => `<div class="row" style="gap:8px;margin-bottom:8px"><label class="sr-only" for="rwN${i}">Récompense ${i + 1}</label><input class="inp" id="rwN${i}" data-rwn="${i}" value="${esc(r.name)}"><label class="sr-only" for="rwC${i}">Coût en points</label><input class="inp" id="rwC${i}" data-rwc="${i}" value="${r.cost}" inputmode="numeric" style="max-width:110px"><span class="muted">pts</span>${canRules ? `<button type="button" class="btn icon sm danger" data-rwdel="${i}" aria-label="Retirer ${esc(r.name)}">${svg('x')}</button>` : ''}</div>`).join('') : '<p class="muted small-p">Aucune récompense définie.</p>';
    $$('[data-rwn]', el).forEach(x => x.oninput = () => rewards[+x.dataset.rwn].name = x.value);
    $$('[data-rwc]', el).forEach(x => x.oninput = () => rewards[+x.dataset.rwc].cost = x.value);
    $$('[data-rwdel]', el).forEach(b => b.onclick = () => { rewards.splice(+b.dataset.rwdel, 1); drawRewards(); });
  };
  drawRewards();
  if ($('#lrAddRw', el)) $('#lrAddRw', el).onclick = () => { rewards.push({ id: uid('rw'), name: 'Nouvelle récompense', cost: 500 }); drawRewards(); $(`#rwN${rewards.length - 1}`, el).select(); };
  if ($('#lrSave', el)) $('#lrSave', el).onclick = e => guard(e.currentTarget, async () => {
    requireRight('loyalty.rules', 'modifier les règles de fidélité');
    const rate = parseNum(val(el, 'lrRate'));
    if (isNaN(rate) || rate < 0 || rate > 1000) throw new Error('Points par euro : nombre entre 0 et 1000 attendu.');
    const tiers2 = {}; TIER_ORDER.slice(1).forEach(k => tiers2[k] = Math.round(parseNum(val(el, 'lrT' + k))));
    if (Object.values(tiers2).some(v => isNaN(v) || v < 0)) throw new Error('Les seuils doivent être des nombres entiers positifs.');
    if (!(tiers2.bronze < tiers2.argent && tiers2.argent < tiers2.or && tiers2.or < tiers2.platine)) throw new Error('Les seuils doivent être croissants : Bronze < Argent < Or < Platine.');
    const rw = rewards.map(r => ({ id: r.id || uid('rw'), name: String(r.name).trim(), cost: Math.round(parseNum(r.cost)) }));
    if (rw.some(r => !r.name || !(r.cost > 0))) throw new Error('Chaque récompense doit avoir un nom et un coût en points positif.');
    await saveSettings({ loyalty: { enabled: $('#lrOn', el).checked, pointsPerEuro: rate, basis: val(el, 'lrBasis'), tiers: tiers2, rewards: rw } });
    toast('Règles de fidélité enregistrées — niveaux recalculés.', 'ok');
  });
  if ($('#lrRecalc', el)) $('#lrRecalc', el).onclick = () => confirmDialog('Recalculer les points de tous les achats payés avec les règles enregistrées ? Les points des achats seront remplacés ; bonus, ajustements et récompenses sont conservés.', async () => { const n = await recomputeLoyaltyFromAchats(); toast(`${n} achat(s) recalculé(s)`, 'ok'); }, { danger: false, yes: 'Recalculer' });

  if ($('#fdMove', el)) $('#fdMove', el).onclick = () => loyaltyForm();
  if ($('#fdCsv', el)) $('#fdCsv', el).onclick = () => exportFideliteCSV();
  if ($('#fdMvCsv', el)) $('#fdMvCsv', el).onclick = () => exportFideliteMovesCSV();
};

/* Règle lisible : « 1 point par tranche de 10 € TTC » ou « 2 points par euro TTC » */
function loyaltyRuleLabel(L = SETTINGS.loyalty) {
  const r = Number(L.pointsPerEuro) || 0, base = L.basis === 'ht' ? 'HT' : 'TTC';
  if (r > 0 && r < 1) return `1 point par tranche de ${fmtNum(round2(1 / r))} € ${base}`;
  return `${fmtNum(r)} point${r > 1 ? 's' : ''} par euro ${base}`;
}

/* Tableau des mouvements de points */
function loyaltyMovesTable(rows, showClient) {
  return `<div class="tbl-wrap flat"><table class="tbl" style="min-width:${showClient ? 760 : 560}px"><caption class="sr-only">Mouvements de points</caption><thead><tr><th scope="col">Date</th>${showClient ? '<th scope="col">Client</th>' : ''}<th scope="col">Type</th><th scope="col">Motif</th><th scope="col" class="num-c">Points</th><th scope="col">Par</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>
    ${rows.map(f => `<tr><td>${fmtDate(f.date)}</td>${showClient ? `<td><button type="button" class="link-btn" data-tocli="${f.clientId}">${esc(clientName(f.clientId))}</button></td>` : ''}<td><span class="chip xs ${f.points > 0 ? 'ok' : 'warn'}">${esc(LOYALTY_TYPES[f.type] || f.type)}</span></td><td>${esc(f.label)}</td>
      <td class="num-c"><b class="mono ${f.points > 0 ? 'ok-t' : 'dng-t'}">${f.points > 0 ? '+' : '−'}${fmtNum(Math.abs(f.points), 0)}</b></td><td>${esc(f.userName || (f.auto ? 'Automatique' : '—'))}</td>
      <td class="qa-cell">${f.auto && f.ref?.id ? `<button type="button" class="btn icon sm ghost" data-flref="${f.ref.id}" aria-label="Ouvrir l'achat lié" title="Ouvrir l'achat">${svg('ext')}</button>` : ''}${!f.auto && can('loyalty.edit') ? `<button type="button" class="btn icon sm danger" data-fldel="${f.id}" aria-label="Annuler ce mouvement" title="Annuler ce mouvement">${svg('trash')}</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>`;
}
function bindLoyaltyMoves(root) {
  $$('[data-tocli]', root).forEach(b => b.onclick = () => go('client', { id: b.dataset.tocli, tab: 'fidelite' }));
  $$('[data-flref]', root).forEach(b => b.onclick = () => openAchatDrawer(b.dataset.flref));
  $$('[data-fldel]', root).forEach(b => b.onclick = () => {
    const mv = S.fidelite.find(x => x.id === b.dataset.fldel); if (!mv) return;
    confirmDialog(`Annuler le mouvement « ${mv.label} » (${mv.points > 0 ? '+' : ''}${mv.points} points) de ${clientName(mv.clientId)} ?`, async () => { await deleteLoyaltyMovement(mv.id); toast('Mouvement annulé', 'ok'); }, { yes: 'Annuler le mouvement' });
  });
}

/* Panneau fidélité de la fiche client */
function loyaltyPanelHTML(clientId) {
  const L = loyaltyOf(clientId), R = SETTINGS.loyalty.rewards;
  const moves = S.fidelite.filter(f => f.clientId === clientId).sort((a, b) => (a.date + a.createdAt < b.date + b.createdAt ? 1 : -1));
  return `<div class="fiche-grid"><section class="panel"><div class="panel-h"><h3>Statut de fidélité</h3>${tierChip(L.tier)}</div><div class="panel-b">
      <div class="mini-kpis" style="margin-top:0"><div><span class="k">Disponibles</span><b class="mono">${fmtNum(L.available, 0)}</b><small>points</small></div><div><span class="k">Gagnés</span><b class="mono">${fmtNum(L.earned, 0)}</b><small>cumul</small></div><div><span class="k">Utilisés</span><b class="mono">${fmtNum(L.used, 0)}</b><small>récompenses</small></div><div><span class="k">Dernière activité</span><b class="mono" style="font-size:1rem">${fmtDate(L.lastActivity)}</b><small>fidélité</small></div></div>
      <div class="tier-prog"><div class="prog" role="img" aria-label="Progression vers le niveau suivant : ${Math.round(L.progress)} %"><span style="width:${L.progress}%"></span></div><small>${L.next ? `Encore <b>${fmtNum(L.toNext, 0)}</b> point(s) à gagner pour atteindre le niveau <b>${TIERS[L.next].label}</b>.` : 'Niveau maximal (Platine) atteint.'}</small></div>
      ${can('loyalty.edit') ? `<div class="row wrap" style="gap:8px;margin-top:16px"><button type="button" class="btn sm" data-lmode="bonus">${svg('plus')} Ajouter des points</button><button type="button" class="btn sm" data-lmode="ajustement">${svg('minus')} Retirer des points</button></div>` : ''}
    </div></section>
    <section class="panel"><div class="panel-h"><h3>Récompenses</h3></div><div class="panel-b">${R.length ? `<div class="reward-grid">${R.map(r => `<div class="reward ${L.available < r.cost ? 'locked' : ''}"><b>${esc(r.name)}</b><span class="pts">${fmtNum(r.cost, 0)} pts</span>${can('loyalty.edit') ? `<button type="button" class="btn sm ${L.available >= r.cost ? 'gold' : ''}" data-reward="${r.id}" ${L.available < r.cost ? 'disabled' : ''}>${L.available >= r.cost ? 'Utiliser' : `Manque ${fmtNum(r.cost - L.available, 0)} pts`}</button>` : ''}</div>`).join('')}</div>` : '<p class="muted">Aucune récompense définie (rubrique Fidélité).</p>'}</div></section></div>
    <section class="panel" style="margin-top:20px"><div class="panel-h"><h3>Historique des mouvements</h3><span class="chip">${moves.length}</span></div><div class="panel-b">${moves.length ? loyaltyMovesTable(moves, false) : '<p class="muted">Aucun mouvement de points pour ce client.</p>'}</div></section>`;
}
function bindLoyaltyPanel(root, clientId) {
  $$('[data-lmode]', root).forEach(b => b.onclick = () => loyaltyForm(clientId, b.dataset.lmode));
  $$('[data-reward]', root).forEach(b => b.onclick = () => {
    const r = SETTINGS.loyalty.rewards.find(x => x.id === b.dataset.reward); if (!r) return;
    confirmDialog(`Utiliser la récompense « ${r.name} » pour ${clientName(clientId)} ? ${fmtNum(r.cost, 0)} points seront débités.`, async () => { await addLoyaltyMovement({ clientId, type: 'utilisation', points: -r.cost, label: r.name, rewardId: r.id }); toast(`Récompense « ${r.name} » utilisée`, 'ok'); }, { danger: false, yes: 'Utiliser la récompense' });
  });
  bindLoyaltyMoves(root);
}

/* Ajout / retrait manuel de points */
function loyaltyForm(clientId = '', mode = 'bonus') {
  if (!S.clients.length) { toast('Créez d\'abord un client.', 'warn'); return; }
  openModal({
    title: mode === 'ajustement' ? 'Retirer des points' : 'Ajouter / retirer des points',
    body: `${clientPicker('lfCli', 'Client', clientId)}
      <div class="grid-2">${selectHTML({ id: 'lfDir', label: 'Opération', options: [['plus', 'Ajouter des points (bonus)'], ['minus', 'Retirer des points (ajustement)']], value: mode === 'ajustement' ? 'minus' : 'plus' })}${fieldHTML({ id: 'lfPts', label: 'Nombre de points', value: '', req: true, attrs: 'inputmode="numeric"' })}</div>
      ${fieldHTML({ id: 'lfLabel', label: 'Motif', value: mode === 'ajustement' ? 'Ajustement manuel' : 'Bonus fidélité', req: true })}
      <p class="hint" id="lfSolde"></p>`,
    footer: `<button type="button" class="btn ghost" data-close>Annuler</button><button type="button" class="btn gold" id="lfSave">Enregistrer</button>`,
    onOpen: m => {
      const solde = () => { const id = val(m, 'lfCli'); $('#lfSolde', m).textContent = id ? `Solde actuel : ${fmtNum(loyaltyOf(id).available, 0)} point(s) · niveau ${TIERS[loyaltyOf(id).tier].label}` : ''; };
      bindClientPicker(m, 'lfCli', solde); solde();
      $('#lfDir', m).onchange = e => { const l = $('#lfLabel', m); if (['Bonus fidélité', 'Ajustement manuel'].includes(l.value)) l.value = e.target.value === 'minus' ? 'Ajustement manuel' : 'Bonus fidélité'; };
      $('#lfSave', m).onclick = e => guard(e.currentTarget, async () => {
        const n = Math.round(parseNum(val(m, 'lfPts')));
        if (!(n > 0)) { formError(m, 'Indiquez un nombre de points entier positif.'); return markInvalid(m, ['lfPts']); }
        const minus = val(m, 'lfDir') === 'minus';
        try { await addLoyaltyMovement({ clientId: val(m, 'lfCli'), type: minus ? 'ajustement' : 'bonus', points: minus ? -n : n, label: val(m, 'lfLabel') }); closeModal(1); toast(`${minus ? '−' : '+'}${n} point(s) enregistré(s)`, 'ok'); }
        catch (err) { formError(m, err.message); }
      });
    }
  });
}
