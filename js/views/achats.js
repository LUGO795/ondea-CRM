/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — views/achats.js
   Historique des achats : date, n° de commande, produits, quantités,
   montants HT / TVA / TTC, moyen de paiement, statut, vendeur,
   commentaire. Indicateurs (total, nombre, panier moyen, premier et
   dernier achat), fiche détaillée en panneau latéral, génération de la
   facture correspondante, points de fidélité calculés automatiquement.
   ██████████████████████████████████████████████████████████████ */
"use strict";

const ACF_DEFAULT = { q: '', status: '', pay: '', client: '', from: '', to: '', page: 1 };
const ACF = UI_STATE.load('achats', ACF_DEFAULT);

function filteredAchats(f = ACF) {
  const t = norm(f.q);
  return S.achats.filter(a => (!f.status || a.status === f.status) && (!f.pay || a.paymentMethod === f.pay) && (!f.client || a.clientId === f.client) &&
    (!f.from || a.date >= f.from) && (!f.to || a.date <= f.to) &&
    (!t || norm(a.number + ' ' + clientName(a.clientId) + ' ' + a.seller + ' ' + a.lines.map(l => l.label).join(' ')).includes(t)))
    .sort((a, b) => (a.date + a.number < b.date + b.number ? 1 : -1));
}

VIEWS.achats = (el, params) => {
  if (params.client) ACF.client = params.client;
  const pays = [...new Set([...SETTINGS.paymentMethods, ...S.achats.map(a => a.paymentMethod).filter(Boolean)])];
  el.innerHTML = pageHead('Historique des achats', crumbFor('achats'),
    (can('export') ? `<button type="button" class="btn" id="aCsv">${svg('down')} Export CSV</button><button type="button" class="btn" id="aPrint">${svg('printer')} Imprimer</button>` : '') +
    (can('sale.edit') ? `<button type="button" class="btn gold" id="aNew">${svg('plus')} Nouvel achat</button>` : ''),
    'Toutes les ventes enregistrées pour vos clients. Les achats payés créditent automatiquement les points de fidélité.') +
    `<div class="tbl-tools" role="search" aria-label="Filtrer les achats">
      ${searchBox('aQ', 'Rechercher un achat', ACF.q, 'N° de commande, client, produit, vendeur…', 280)}
      ${filterSelect('aStatus', 'Statut', Object.entries(ACHAT_STATUS).map(([k, s]) => [k, s.label]), ACF.status, 'Tous statuts')}
      ${filterSelect('aPay', 'Moyen de paiement', pays, ACF.pay, 'Tous paiements')}
      ${filterSelect('aClient', 'Client', optClients(() => true).map(([v, l]) => [v, l.split(' — ')[0]]), ACF.client, 'Tous clients')}
      <label class="sr-only" for="aFrom">Du</label><input class="inp" type="date" id="aFrom" value="${esc(ACF.from)}" style="width:auto" title="Du">
      <label class="sr-only" for="aTo">Au</label><input class="inp" type="date" id="aTo" value="${esc(ACF.to)}" style="width:auto" title="Au">
      <button type="button" class="btn ghost sm" id="aReset">Réinitialiser</button></div>
    <div id="aSum"></div><div id="aList" aria-live="polite"></div>`;
  const draw = () => {
    UI_STATE.save('achats', ACF);
    const rows = filteredAchats();
    const live = rows.filter(isRevenue);
    const total = sum(live, a => docTotals(a).ttc), totalHT = sum(live, a => docTotals(a).ht);
    const dates = live.map(a => a.date).sort();
    $('#aSum', el).innerHTML = `<div class="mini-kpis" style="margin:0 0 16px"><div><span class="k">Total TTC</span><b class="mono">${fmtMoneyShort(total)}</b><small>${fmtMoney(totalHT)} HT</small></div><div><span class="k">Achats</span><b class="mono">${live.length}</b><small>${rows.length - live.length} annulé(s) / remboursé(s)</small></div><div><span class="k">Panier moyen</span><b class="mono">${fmtMoneyShort(live.length ? total / live.length : 0)}</b><small>TTC</small></div><div><span class="k">Premier / dernier</span><b class="mono" style="font-size:.95rem">${fmtDate(dates[0])}</b><small>${fmtDate(dates[dates.length - 1])}</small></div></div>`;
    const pg = paginate(rows, ACF);
    const host = $('#aList', el);
    host.innerHTML = rows.length ? achatsTableHTML(pg.rows, { client: true }) + pagerHTML(ACF.page, pg.pages, pg.total, pg.start, pg.rows.length, 'achat')
      : S.achats.length ? emptyState('search', 'Aucun achat', 'Aucun achat ne correspond à ces filtres.') : emptyState('cart', 'Aucun achat enregistré', 'Enregistrez les ventes de vos clients pour suivre leur historique et leur fidélité.', can('sale.edit') ? `<button type="button" class="btn gold" data-anew>${svg('plus')} Nouvel achat</button>` : '');
    bindPager(host, ACF, draw); bindRows(host, 'ach', openAchatDrawer);
    $$('[data-tocli]', host).forEach(b => b.onclick = () => go('client', { id: b.dataset.tocli, tab: 'achats' }));
    $$('[data-anew]', host).forEach(b => b.onclick = () => achatForm());
  };
  draw();
  $('#aQ', el).oninput = debounce(e => { ACF.q = e.target.value; ACF.page = 1; draw(); }, 150);
  [['aStatus', 'status'], ['aPay', 'pay'], ['aClient', 'client'], ['aFrom', 'from'], ['aTo', 'to']].forEach(([id, k]) => $('#' + id, el).onchange = e => { ACF[k] = e.target.value; ACF.page = 1; draw(); });
  $('#aReset', el).onclick = () => { Object.assign(ACF, ACF_DEFAULT); UI_STATE.save('achats', ACF); go('achats'); };
  if ($('#aNew', el)) $('#aNew', el).onclick = () => achatForm(null, { clientId: ACF.client || '' });
  if ($('#aCsv', el)) $('#aCsv', el).onclick = () => exportAchatsCSV(filteredAchats());
  if ($('#aPrint', el)) $('#aPrint', el).onclick = () => { const r = filteredAchats(); printTable('Historique des achats', `<div><span>Achats</span><b>${r.length}</b></div><div><span>Total TTC</span><b>${fmtMoney(sum(r.filter(isRevenue), a => docTotals(a).ttc))}</b></div>`, ['Date', 'N°', 'Client', 'Produits', { t: 'HT', r: 1 }, { t: 'TTC', r: 1 }, 'Paiement', 'Statut'], r.map(a => [fmtDate(a.date), esc(a.number), esc(clientName(a.clientId)), esc(linesText(a.lines)), fmtMoney(docTotals(a).ht), fmtMoney(docTotals(a).ttc), esc(a.paymentMethod), ACHAT_STATUS[a.status].label])); };
};

function achatsTableHTML(list, { client = true } = {}) {
  return `<div class="tbl-wrap"><table class="tbl" style="min-width:${client ? 1100 : 960}px"><caption class="sr-only">Historique des achats</caption><thead><tr><th scope="col">Date</th><th scope="col">N° commande</th>${client ? '<th scope="col">Client</th>' : ''}<th scope="col">Produits</th><th scope="col" class="num-c">Qté</th><th scope="col" class="num-c">HT</th><th scope="col" class="num-c">TVA</th><th scope="col" class="num-c">TTC</th><th scope="col">Paiement</th><th scope="col">Statut</th><th scope="col">Vendeur</th></tr></thead><tbody>
    ${list.map(a => { const t = docTotals(a); const prods = linesText(a.lines); return `<tr data-ach="${a.id}" tabindex="0" class="${a.status === 'annulee' ? 'is-cancelled' : ''}"><td>${fmtDate(a.date)}</td><td><b class="mono">${esc(a.number)}</b>${a.demo ? ' <span class="chip gold xs">Démo</span>' : ''}</td>
      ${client ? `<td><button type="button" class="link-btn" data-tocli="${a.clientId}">${esc(clientName(a.clientId))}</button></td>` : ''}
      <td style="max-width:280px"><small title="${esc(prods)}">${esc(prods.length > 70 ? prods.slice(0, 70) + '…' : prods)}</small>${a.comment ? `<small class="muted d-block">${esc(a.comment.slice(0, 60))}</small>` : ''}</td>
      <td class="num-c mono">${fmtNum(sum(a.lines, l => l.qty))}</td><td class="num-c mono">${fmtMoney(t.ht)}</td><td class="num-c mono">${fmtMoney(t.tva)}</td><td class="num-c"><b class="mono">${fmtMoney(t.ttc)}</b></td>
      <td>${esc(a.paymentMethod || '—')}</td><td>${statusChip(ACHAT_STATUS, a.status, 'xs')}${a.invoiceId && factureById(a.invoiceId) ? ` <span class="chip xs" title="Facture ${esc(factureById(a.invoiceId).number)}">${svg('receipt')}</span>` : ''}</td><td>${esc(a.seller || '—')}</td></tr>`; }).join('')}
    </tbody></table></div>`;
}

/* ═════════════════════ FORMULAIRE ═════════════════════ */
function achatForm(id, preset = {}) {
  const a = id ? achatById(id) : null;
  if (!S.clients.length) { toast('Créez d\'abord un client.', 'warn'); return go('clients', { action: 'new' }); }
  const d = a ? clone(a) : { date: todayISO(), status: 'payee', paymentMethod: SETTINGS.paymentMethods[0] || '', sellerId: SESSION_OP?.id, lines: [], ...preset };
  let readLines;
  openModal({
    title: a ? `Modifier l'achat ${a.number}` : 'Nouvel achat', xwide: true,
    body: `<div class="grid-2">${clientPicker('afCli', 'Client', d.clientId || '')}<div class="grid-2" style="gap:0 12px">${fieldHTML({ id: 'afDate', label: 'Date de l\'achat', type: 'date', value: d.date, req: true })}${selectHTML({ id: 'afStatus', label: 'Statut', options: Object.entries(ACHAT_STATUS).map(([k, s]) => [k, s.label]), value: d.status, req: true })}</div></div>
      ${linesEditorHTML('afLines', 'Produits et prestations achetés')}
      <div class="grid-3">${selectHTML({ id: 'afPay', label: 'Moyen de paiement', options: [...new Set([...SETTINGS.paymentMethods, d.paymentMethod].filter(Boolean))], value: d.paymentMethod, empty: '— Non précisé —' })}
        ${selectHTML({ id: 'afSeller', label: 'Vendeur', options: OPERATORS.map(o => [o.id, o.name]), value: d.sellerId || '', empty: '— Non précisé —' })}
        <div class="field"><span class="flabel">Fidélité</span><div class="calc-box"><b class="mono" id="afPts">—</b><small class="muted">points crédités si l'achat est payé</small></div></div></div>
      ${textareaHTML({ id: 'afCom', label: 'Commentaire', value: d.comment || '', rows: 2 })}`,
    footer: `<button type="button" class="btn ghost" data-close>Annuler</button><button type="button" class="btn gold" id="afSave">${a ? 'Enregistrer' : 'Enregistrer l\'achat'}</button>`,
    onOpen: m => {
      bindClientPicker(m, 'afCli');
      const pts = () => { const p = pointsForAchat({ status: val(m, 'afStatus'), lines: readLines ? readLines() : d.lines }); $('#afPts', m).textContent = SETTINGS.loyalty.enabled ? `+ ${fmtNum(p, 0)} point(s)` : 'programme désactivé'; };
      readLines = bindLinesEditor(m, 'afLines', d.lines, { onTotals: () => pts() });
      $('#afStatus', m).onchange = pts; pts();
      $('#afSave', m).onclick = e => guard(e.currentTarget, async () => {
        formError(m, '');
        const data = { clientId: val(m, 'afCli'), date: val(m, 'afDate'), status: val(m, 'afStatus'), paymentMethod: val(m, 'afPay'), sellerId: val(m, 'afSeller'), comment: val(m, 'afCom'), lines: readLines() };
        try { const r = await saveAchat(data, id); closeModal(1); toast(a ? 'Achat mis à jour' : `Achat ${r.number} enregistré${pointsForAchat(r) ? ` · +${pointsForAchat(r)} points` : ''}`, 'ok'); }
        catch (err) { formError(m, err.message); markInvalid(m, [!data.clientId && 'afCli', !data.date && 'afDate'].filter(Boolean)); }
      });
    }
  });
}

/* ═════════════════════ FICHE ACHAT (panneau latéral) ═════════════════════ */
function openAchatDrawer(id) {
  const render = () => {
    const a = achatById(id); if (!a) { closeDrawer(); DRAWER_REFRESH = null; return; }
    const t = docTotals(a), f = factureById(a.invoiceId);
    const pts = S.fidelite.filter(x => x.ref?.id === a.id).reduce((n, x) => n + x.points, 0);
    openDrawer(`<div class="drawer-h">
        <div class="row" style="justify-content:space-between"><button type="button" class="x-btn" data-drclose aria-label="Fermer">${svg('x')}</button>
          <div class="row wrap" style="gap:6px"><button type="button" class="btn sm ghost" id="adPrint">${svg('printer')} Imprimer</button>${can('sale.edit') ? `<button type="button" class="btn sm ghost" id="adEdit" aria-label="Modifier">${svg('edit')}</button>` : ''}</div></div>
        <div style="margin-top:14px"><span class="eyebrow">Achat</span><h3 style="font-size:1.4rem;margin-top:4px" class="mono">${esc(a.number)}</h3>
          <button type="button" class="link-btn" data-tocli="${a.clientId}">${esc(clientName(a.clientId))}</button>
          <div class="row wrap" style="margin-top:8px;gap:6px">${statusChip(ACHAT_STATUS, a.status)}<span class="chip">${fmtDate(a.date)}</span>${a.demo ? '<span class="chip gold">Démo</span>' : ''}</div></div>
        <div class="mini-kpis"><div><span class="k">Total HT</span><b class="mono">${fmtMoneyShort(t.ht)}</b><small>${fmtMoney(t.ht)}</small></div><div><span class="k">TVA</span><b class="mono">${fmtMoneyShort(t.tva)}</b><small>${fmtMoney(t.tva)}</small></div><div><span class="k">Total TTC</span><b class="mono gold">${fmtMoneyShort(t.ttc)}</b><small>${fmtMoney(t.ttc)}</small></div><div><span class="k">Points</span><b class="mono">${pts ? '+' + fmtNum(pts, 0) : '0'}</b><small>fidélité</small></div></div>
      </div>
      <div class="drawer-b">
        <div class="tbl-wrap"><table class="tbl" style="min-width:0"><thead><tr><th scope="col">Produit</th><th scope="col" class="num-c">Qté</th><th scope="col" class="num-c">PU HT</th><th scope="col" class="num-c">Montant HT</th></tr></thead><tbody>
          ${a.lines.map(l => `<tr><td>${esc(l.label)}${l.discount ? ` <small class="muted">(−${fmtPct(l.discount, l.discount % 1 ? 1 : 0)})</small>` : ''}<small class="muted d-block">TVA ${fmtPct(l.vatRate, l.vatRate % 1 ? 1 : 0)}</small></td><td class="num-c mono">${fmtNum(l.qty)}</td><td class="num-c mono">${fmtMoney(l.unitPrice)}</td><td class="num-c mono">${fmtMoney(lineHT(l))}</td></tr>`).join('')}</tbody></table></div>
        <div style="margin-top:16px">
          <div class="info-line"><span class="k">Moyen de paiement</span><span class="v">${esc(a.paymentMethod || '—')}</span></div>
          <div class="info-line"><span class="k">Vendeur</span><span class="v">${esc(a.seller || '—')}</span></div>
          <div class="info-line"><span class="k">Facture</span><span class="v">${f ? `<button type="button" class="link-btn" data-fac="${f.id}">${esc(f.number)}</button> ${statusChip(FACT_STATUS, factureStatus(f), 'xs')}` : 'aucune'}</span></div>
          <div class="info-line"><span class="k">Commentaire</span><span class="v" style="text-align:left;max-width:65%">${esc(a.comment || '—')}</span></div>
          <div class="info-line"><span class="k">Enregistré le</span><span class="v">${fmtDateTime(a.createdAt)}</span></div>
        </div>
        <div class="drawer-actions">
          ${!f && can('sale.edit') && a.status !== 'annulee' ? `<button type="button" class="btn sm gold" id="adInv">${svg('receipt')} Générer la facture</button>` : ''}
          ${can('sale.delete') ? `<button type="button" class="btn sm danger" id="adDel">${svg('trash')} Supprimer</button>` : ''}
        </div></div>`, d => {
      $('[data-drclose]', d).onclick = closeDrawer;
      $$('[data-tocli]', d).forEach(b => b.onclick = () => { closeDrawer(); go('client', { id: b.dataset.tocli, tab: 'achats' }); });
      $$('[data-fac]', d).forEach(b => b.onclick = () => openFactureDrawer(b.dataset.fac));
      $('#adPrint', d).onclick = () => printAchat(a);
      if ($('#adEdit', d)) $('#adEdit', d).onclick = () => achatForm(a.id);
      if ($('#adInv', d)) $('#adInv', d).onclick = e => guard(e.currentTarget, async () => { const nf = await factureFromAchat(a.id); toast(`Facture ${nf.number} créée${nf.status === 'paid' ? ' (payée)' : ''}`, 'ok'); openFactureDrawer(nf.id); });
      if ($('#adDel', d)) $('#adDel', d).onclick = () => confirmDialog(`Supprimer l'achat ${a.number} (${fmtMoney(t.ttc)}) ? Les points de fidélité associés seront retirés${f ? ` et la facture ${f.number} ne sera plus liée à cet achat` : ''}. Cette action est irréversible.`,
        async () => { await deleteAchat(a.id); closeDrawer(); toast('Achat supprimé', 'dng'); }, { yes: 'Supprimer l\'achat' });
    }, 'Achat ' + a.number);
  };
  DRAWER_REFRESH = render;
  render();
}
