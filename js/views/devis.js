/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — views/devis.js
   Devis : création, modification, duplication, consultation,
   suppression, changement de statut (Brouillon → Envoyé → Accepté /
   Refusé / Expiré), transformation en facture, impression A4 (PDF),
   recherche et filtres. Un devis envoyé dont la date de validité est
   dépassée passe automatiquement « Expiré ».
   ██████████████████████████████████████████████████████████████ */
"use strict";

const DVF_DEFAULT = { status: '', q: '', client: '', from: '', to: '', page: 1 };
const DVF = UI_STATE.load('devis', DVF_DEFAULT);

function filteredDevis(f = DVF) {
  const t = norm(f.q);
  return S.devis.filter(d => (!f.status || devisStatus(d) === f.status) && (!f.client || d.clientId === f.client) && (!f.from || d.date >= f.from) && (!f.to || d.date <= f.to) &&
    (!t || norm(d.number + ' ' + clientName(d.clientId) + ' ' + d.comment + ' ' + d.lines.map(l => l.label).join(' ')).includes(t)))
    .sort((a, b) => (a.date + a.number < b.date + b.number ? 1 : -1));
}

VIEWS.devis = (el, params) => {
  if (params.status !== undefined) DVF.status = params.status;
  const cnt = k => k ? S.devis.filter(d => devisStatus(d) === k).length : S.devis.length;
  const pending = S.devis.filter(d => devisStatus(d) === 'sent');
  el.innerHTML = pageHead('Devis', crumbFor('devis'),
    (can('export') ? `<button type="button" class="btn" id="dvCsv">${svg('down')} Export CSV</button>` : '') +
    (can('sale.edit') ? `<button type="button" class="btn gold" id="dvNew">${svg('plus')} Nouveau devis</button>` : ''),
    `${pending.length} devis en attente de réponse · ${fmtMoney(sum(pending, d => docTotals(d).ttc))} TTC`) +
    `<div class="tbl-tools"><div class="seg wrap-seg" role="group" aria-label="Filtrer par statut">${[['', 'Tous'], ...Object.entries(DEVIS_STATUS).map(([k, s]) => [k, s.label])].map(([k, l]) => `<button type="button" data-dst="${k}" class="${DVF.status === k ? 'on' : ''}" aria-pressed="${DVF.status === k}">${l} <span class="mono">${cnt(k)}</span></button>`).join('')}</div></div>
    <div class="tbl-tools" role="search" aria-label="Filtrer les devis">
      ${searchBox('dvQ', 'Rechercher un devis', DVF.q, 'N° de devis, client, désignation…', 280)}
      ${filterSelect('dvClient', 'Client', optClients(() => true).map(([v, l]) => [v, l.split(' — ')[0]]), DVF.client, 'Tous clients')}
      <label class="sr-only" for="dvFrom">Du</label><input class="inp" type="date" id="dvFrom" value="${esc(DVF.from)}" style="width:auto" title="Du">
      <label class="sr-only" for="dvTo">Au</label><input class="inp" type="date" id="dvTo" value="${esc(DVF.to)}" style="width:auto" title="Au">
      <button type="button" class="btn ghost sm" id="dvReset">Réinitialiser</button></div>
    <div id="dvList" aria-live="polite"></div>`;
  const draw = () => {
    UI_STATE.save('devis', DVF);
    const rows = filteredDevis();
    const pg = paginate(rows, DVF);
    const host = $('#dvList', el);
    host.innerHTML = rows.length ? devisTableHTML(pg.rows, { client: true }) + pagerHTML(DVF.page, pg.pages, pg.total, pg.start, pg.rows.length, 'devis')
      : S.devis.length ? emptyState('search', 'Aucun devis', 'Aucun devis ne correspond à ces filtres.') : emptyState('file', 'Aucun devis', 'Établissez votre premier devis : il pourra ensuite être transformé en facture en un clic.', can('sale.edit') ? `<button type="button" class="btn gold" data-dvnew>${svg('plus')} Nouveau devis</button>` : '');
    bindPager(host, DVF, draw); bindRows(host, 'dev', openDevisDrawer);
    $$('[data-tocli]', host).forEach(b => b.onclick = () => go('client', { id: b.dataset.tocli, tab: 'devis' }));
    $$('[data-dvnew]', host).forEach(b => b.onclick = () => devisForm());
  };
  draw();
  $$('[data-dst]', el).forEach(b => b.onclick = () => { DVF.status = b.dataset.dst; DVF.page = 1; UI_STATE.save('devis', DVF); history.replaceState(null, '', '#/devis'); route({ keepScroll: true }); });
  $('#dvQ', el).oninput = debounce(e => { DVF.q = e.target.value; DVF.page = 1; draw(); }, 150);
  [['dvClient', 'client'], ['dvFrom', 'from'], ['dvTo', 'to']].forEach(([id, k]) => $('#' + id, el).onchange = e => { DVF[k] = e.target.value; DVF.page = 1; draw(); });
  $('#dvReset', el).onclick = () => { Object.assign(DVF, DVF_DEFAULT); UI_STATE.save('devis', DVF); history.replaceState(null, '', '#/devis'); route(); };
  if ($('#dvNew', el)) $('#dvNew', el).onclick = () => devisForm(null, { clientId: DVF.client || '' });
  if ($('#dvCsv', el)) $('#dvCsv', el).onclick = () => exportDevisCSV(filteredDevis());
  if (params.action === 'new' && can('sale.edit')) { history.replaceState(null, '', '#/devis'); setTimeout(() => devisForm(), 50); }
};

function devisTableHTML(list, { client = true } = {}) {
  return `<div class="tbl-wrap"><table class="tbl" style="min-width:${client ? 960 : 820}px"><caption class="sr-only">Liste des devis</caption><thead><tr><th scope="col">N°</th>${client ? '<th scope="col">Client</th>' : ''}<th scope="col">Date</th><th scope="col">Validité</th><th scope="col">Statut</th><th scope="col" class="num-c">Total HT</th><th scope="col" class="num-c">Total TTC</th><th scope="col">Facture</th></tr></thead><tbody>
    ${list.map(d => { const t = docTotals(d), st = devisStatus(d); const soon = st === 'sent' && daysBetween(todayISO(), d.validUntil) <= 7;
      return `<tr data-dev="${d.id}" tabindex="0" class="${st === 'expired' ? 'is-due' : ''}"><td><b class="mono">${esc(d.number)}</b>${d.demo ? ' <span class="chip gold xs">Démo</span>' : ''}</td>
      ${client ? `<td><button type="button" class="link-btn" data-tocli="${d.clientId}">${esc(clientName(d.clientId))}</button></td>` : ''}
      <td>${fmtDate(d.date)}</td><td>${fmtDate(d.validUntil)}${soon ? ` <span class="chip warn xs">${svg('clock')}${daysBetween(todayISO(), d.validUntil)} j</span>` : ''}</td>
      <td>${statusChip(DEVIS_STATUS, st, 'xs')}</td><td class="num-c mono">${fmtMoney(t.ht)}</td><td class="num-c"><b class="mono">${fmtMoney(t.ttc)}</b></td>
      <td>${factureById(d.invoiceId) ? `<span class="mono">${esc(factureById(d.invoiceId).number)}</span>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')}
    </tbody></table></div>`;
}

/* ═════════════════════ FORMULAIRE ═════════════════════ */
function devisForm(id, preset = {}) {
  const q = id ? devisById(id) : null;
  if (!S.clients.length) { toast('Créez d\'abord un client.', 'warn'); return go('clients', { action: 'new' }); }
  const d = q ? clone(q) : { date: todayISO(), validUntil: addDays(todayISO(), Number(SETTINGS.quoteValidityDays) || 30), lines: [], ...preset };
  let readLines;
  openModal({
    title: q ? `Modifier le devis ${q.number}` : 'Nouveau devis', xwide: true,
    body: `<div class="grid-2">${clientPicker('dfCli', 'Client', d.clientId || '')}<div class="grid-2" style="gap:0 12px">${fieldHTML({ id: 'dfDate', label: 'Date du devis', type: 'date', value: d.date, req: true })}${fieldHTML({ id: 'dfValid', label: 'Valable jusqu\'au', type: 'date', value: d.validUntil, req: true })}</div></div>
      ${linesEditorHTML('dfLines', 'Lignes du devis')}
      ${textareaHTML({ id: 'dfCom', label: 'Commentaire (imprimé sur le devis)', value: d.comment || '', rows: 2 })}
      ${!q ? `<label class="chk-inline"><input type="checkbox" id="dfSent"> Marquer comme envoyé au client dès l'enregistrement</label>` : ''}`,
    footer: `<button type="button" class="btn ghost" data-close>Annuler</button><button type="button" class="btn gold" id="dfSave">${q ? 'Enregistrer' : 'Créer le devis'}</button>`,
    onOpen: m => {
      bindClientPicker(m, 'dfCli');
      readLines = bindLinesEditor(m, 'dfLines', d.lines);
      $('#dfDate', m).onchange = e => { if (!q && e.target.value) $('#dfValid', m).value = addDays(e.target.value, Number(SETTINGS.quoteValidityDays) || 30); };
      $('#dfSave', m).onclick = e => guard(e.currentTarget, async () => {
        formError(m, '');
        const data = { clientId: val(m, 'dfCli'), date: val(m, 'dfDate'), validUntil: val(m, 'dfValid'), comment: val(m, 'dfCom'), lines: readLines() };
        try {
          const r = await saveDevis(data, id);
          if (!q && $('#dfSent', m).checked) await setDevisStatus(r.id, 'sent');
          closeModal(1); toast(q ? 'Devis mis à jour' : `Devis ${r.number} créé`, 'ok'); openDevisDrawer(r.id);
        } catch (err) { formError(m, err.message); markInvalid(m, [!data.clientId && 'dfCli', !data.date && 'dfDate', (!data.validUntil || err.message.includes('validité')) && 'dfValid'].filter(Boolean)); }
      });
    }
  });
}

/* ═════════════════════ FICHE DEVIS (panneau latéral) ═════════════════════ */
function openDevisDrawer(id) {
  const render = () => {
    const d = devisById(id); if (!d) { closeDrawer(); DRAWER_REFRESH = null; return; }
    const t = docTotals(d), st = devisStatus(d), f = factureById(d.invoiceId);
    const editable = !['accepted', 'refused'].includes(d.status) && can('sale.edit');
    const next = { draft: [['sent', 'Marquer envoyé', 'send']], sent: [['accepted', 'Accepté', 'check'], ['refused', 'Refusé', 'x'], ['expired', 'Expiré', 'clock']], expired: [['sent', 'Relancer (renvoyé)', 'send'], ['refused', 'Refusé', 'x']], accepted: [], refused: [['draft', 'Repasser en brouillon', 'undo']] }[st] || [];
    openDrawer(`<div class="drawer-h">
        <div class="row" style="justify-content:space-between"><button type="button" class="x-btn" data-drclose aria-label="Fermer">${svg('x')}</button>
          <div class="row wrap" style="gap:6px"><button type="button" class="btn sm ghost" id="ddPrint">${svg('printer')} Imprimer / PDF</button>${editable ? `<button type="button" class="btn sm ghost" id="ddEdit" aria-label="Modifier">${svg('edit')}</button>` : ''}</div></div>
        <div style="margin-top:14px"><span class="eyebrow">Devis</span><h3 style="font-size:1.4rem;margin-top:4px" class="mono">${esc(d.number)}</h3>
          <button type="button" class="link-btn" data-tocli="${d.clientId}">${esc(clientName(d.clientId))}</button>
          <div class="row wrap" style="margin-top:8px;gap:6px">${statusChip(DEVIS_STATUS, st)}<span class="chip">du ${fmtDate(d.date)}</span><span class="chip ${st === 'expired' ? 'warn' : ''}">valable jusqu'au ${fmtDate(d.validUntil)}</span>${d.demo ? '<span class="chip gold">Démo</span>' : ''}</div></div>
        <div class="mini-kpis"><div><span class="k">Total HT</span><b class="mono">${fmtMoneyShort(t.ht)}</b><small>${fmtMoney(t.ht)}</small></div><div><span class="k">Remises</span><b class="mono">${fmtMoneyShort(t.discount)}</b><small>${fmtMoney(t.discount)}</small></div><div><span class="k">TVA</span><b class="mono">${fmtMoneyShort(t.tva)}</b><small>${fmtMoney(t.tva)}</small></div><div><span class="k">Total TTC</span><b class="mono gold">${fmtMoneyShort(t.ttc)}</b><small>${fmtMoney(t.ttc)}</small></div></div>
      </div>
      <div class="drawer-b">
        ${can('sale.edit') && (next.length || (!f && st === 'accepted')) ? `<div class="row wrap" style="gap:8px;margin-bottom:16px">${next.map(([k, l, ic]) => `<button type="button" class="btn sm ${k === 'accepted' ? 'gold' : ''}" data-dst2="${k}">${svg(ic)} ${l}</button>`).join('')}${!f && ['accepted', 'sent', 'draft'].includes(st) ? `<button type="button" class="btn sm gold" id="ddInv">${svg('receipt')} Transformer en facture</button>` : ''}</div>` : ''}
        ${f ? `<div class="notice">${svg('receipt')}<div class="grow">Transformé en facture <b class="mono">${esc(f.number)}</b> (${FACT_STATUS[factureStatus(f)].label.toLowerCase()}).</div><button type="button" class="btn sm" data-fac="${f.id}">Ouvrir</button></div>` : ''}
        <div class="tbl-wrap"><table class="tbl" style="min-width:0"><thead><tr><th scope="col">Désignation</th><th scope="col" class="num-c">Qté</th><th scope="col" class="num-c">PU HT</th><th scope="col" class="num-c">Montant HT</th></tr></thead><tbody>
          ${d.lines.map(l => `<tr><td>${esc(l.label)}${l.discount ? ` <small class="muted">(remise ${fmtPct(l.discount, l.discount % 1 ? 1 : 0)})</small>` : ''}<small class="muted d-block">TVA ${fmtPct(l.vatRate, l.vatRate % 1 ? 1 : 0)}</small></td><td class="num-c mono">${fmtNum(l.qty)}</td><td class="num-c mono">${fmtMoney(l.unitPrice)}</td><td class="num-c mono">${fmtMoney(lineHT(l))}</td></tr>`).join('')}</tbody></table></div>
        ${d.comment ? `<div class="info-line" style="margin-top:12px"><span class="k">Commentaire</span><span class="v" style="text-align:left;max-width:70%">${esc(d.comment)}</span></div>` : ''}
        <h4 style="margin:18px 0 8px">Historique</h4>
        ${(d.history || []).slice().reverse().map(h => `<div class="info-line"><span class="k">${fmtDateTime(h.at)}${h.by ? ' · ' + esc(h.by) : ''}</span><span class="v">${statusChip(DEVIS_STATUS, h.status, 'xs')}</span></div>`).join('')}
        <div class="drawer-actions">
          ${can('sale.edit') ? `<button type="button" class="btn sm ghost" id="ddDup">${svg('copy')} Dupliquer</button>` : ''}
          ${can('sale.delete') ? `<button type="button" class="btn sm danger" id="ddDel">${svg('trash')} Supprimer</button>` : ''}
        </div></div>`, dr => {
      $('[data-drclose]', dr).onclick = closeDrawer;
      $$('[data-tocli]', dr).forEach(b => b.onclick = () => { closeDrawer(); go('client', { id: b.dataset.tocli, tab: 'devis' }); });
      $$('[data-fac]', dr).forEach(b => b.onclick = () => openFactureDrawer(b.dataset.fac));
      $('#ddPrint', dr).onclick = () => printDevis(d);
      if ($('#ddEdit', dr)) $('#ddEdit', dr).onclick = () => devisForm(d.id);
      $$('[data-dst2]', dr).forEach(b => b.onclick = () => {
        const s = b.dataset.dst2;
        const run = () => guard(b, async () => { await setDevisStatus(d.id, s); toast(`Devis ${d.number} : ${DEVIS_STATUS[s].label.toLowerCase()}`, 'ok'); });
        if (s === 'refused') confirmDialog(`Marquer le devis ${d.number} comme refusé par le client ?`, async () => { await setDevisStatus(d.id, s); toast('Devis refusé', 'info'); }, { danger: false, yes: 'Marquer refusé' }); else run();
      });
      if ($('#ddInv', dr)) $('#ddInv', dr).onclick = () => confirmDialog(`Créer une facture à partir du devis ${d.number} (${fmtMoney(t.ttc)} TTC) ? Le devis passera au statut « Accepté ».`, async () => { const nf = await convertDevisToFacture(d.id); toast(`Facture ${nf.number} créée`, 'ok'); openFactureDrawer(nf.id); }, { danger: false, yes: 'Créer la facture' });
      if ($('#ddDup', dr)) $('#ddDup', dr).onclick = e => guard(e.currentTarget, async () => { const nd = await duplicateDevis(d.id); toast(`Copie créée : ${nd.number}`, 'ok'); openDevisDrawer(nd.id); });
      if ($('#ddDel', dr)) $('#ddDel', dr).onclick = () => confirmDialog(`Supprimer définitivement le devis ${d.number} (${clientName(d.clientId)}) ?${f ? ` La facture ${f.number} est conservée.` : ''} Cette action est irréversible.`, async () => { await deleteDevis(d.id); closeDrawer(); toast('Devis supprimé', 'dng'); }, { yes: 'Supprimer le devis' });
    }, 'Devis ' + d.number);
  };
  DRAWER_REFRESH = render;
  render();
}
