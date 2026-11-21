/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — views/factures.js
   Factures : numéro, client, date, échéance, lignes, HT / TVA / TTC,
   statut (Brouillon, Émise, Partiellement payée, Payée, En retard,
   Annulée), moyen et date de règlement. Règlements partiels, rappel
   clair des impayés et des retards, impression A4 (PDF). Une facture
   soldée enregistre automatiquement l'achat et les points de fidélité.
   ██████████████████████████████████████████████████████████████ */
"use strict";

const FCF_DEFAULT = { status: '', q: '', client: '', from: '', to: '', page: 1 };
const FCF = UI_STATE.load('factures', FCF_DEFAULT);

const factureMatchesStatus = (f, s) => !s || (s === 'unpaid' ? isFactureUnpaid(f) : factureStatus(f) === s);
function filteredFactures(fl = FCF) {
  const t = norm(fl.q);
  return S.factures.filter(f => factureMatchesStatus(f, fl.status) && (!fl.client || f.clientId === fl.client) && (!fl.from || f.date >= fl.from) && (!fl.to || f.date <= fl.to) &&
    (!t || norm(f.number + ' ' + clientName(f.clientId) + ' ' + f.comment + ' ' + f.lines.map(l => l.label).join(' ')).includes(t)))
    .sort((a, b) => (a.date + a.number < b.date + b.number ? 1 : -1));
}

VIEWS.factures = (el, params) => {
  if (params.status !== undefined) FCF.status = params.status;
  const cnt = k => S.factures.filter(f => factureMatchesStatus(f, k)).length;
  const unpaid = S.factures.filter(isFactureUnpaid), late = unpaid.filter(f => factureStatus(f) === 'late');
  el.innerHTML = pageHead('Factures', crumbFor('factures'),
    (can('export') ? `<button type="button" class="btn" id="fcCsv">${svg('down')} Export CSV</button>` : '') +
    (can('sale.edit') ? `<button type="button" class="btn gold" id="fcNew">${svg('plus')} Nouvelle facture</button>` : ''),
    `${unpaid.length} facture(s) impayée(s) · <b>${fmtMoney(sum(unpaid, factureDue))}</b> à encaisser`) +
    (late.length ? `<div class="notice warn-n" role="alert">${svg('warn')}<div class="grow"><b>${late.length} facture(s) en retard</b> pour un total de <b>${fmtMoney(sum(late, factureDue))}</b> : ${late.slice(0, 4).map(f => esc(f.number) + ' (' + esc(clientName(f.clientId)) + ')').join(', ')}${late.length > 4 ? '…' : ''}</div><button type="button" class="btn sm" data-fst="late">Afficher</button></div>` : '') +
    `<div class="tbl-tools"><div class="seg wrap-seg" role="group" aria-label="Filtrer par statut">${[['', 'Toutes'], ['unpaid', 'Impayées'], ...Object.entries(FACT_STATUS).map(([k, s]) => [k, s.label])].map(([k, l]) => `<button type="button" data-fst="${k}" class="${FCF.status === k ? 'on' : ''}" aria-pressed="${FCF.status === k}">${l} <span class="mono">${cnt(k)}</span></button>`).join('')}</div></div>
    <div class="tbl-tools" role="search" aria-label="Filtrer les factures">
      ${searchBox('fcQ', 'Rechercher une facture', FCF.q, 'N° de facture, client, désignation…', 280)}
      ${filterSelect('fcClient', 'Client', optClients(() => true).map(([v, l]) => [v, l.split(' — ')[0]]), FCF.client, 'Tous clients')}
      <label class="sr-only" for="fcFrom">Du</label><input class="inp" type="date" id="fcFrom" value="${esc(FCF.from)}" style="width:auto" title="Du">
      <label class="sr-only" for="fcTo">Au</label><input class="inp" type="date" id="fcTo" value="${esc(FCF.to)}" style="width:auto" title="Au">
      <button type="button" class="btn ghost sm" id="fcReset">Réinitialiser</button></div>
    <div id="fcList" aria-live="polite"></div>`;
  const draw = () => {
    UI_STATE.save('factures', FCF);
    const rows = filteredFactures();
    const pg = paginate(rows, FCF);
    const host = $('#fcList', el);
    host.innerHTML = rows.length ? facturesTableHTML(pg.rows, { client: true }) + pagerHTML(FCF.page, pg.pages, pg.total, pg.start, pg.rows.length, 'facture')
      : S.factures.length ? emptyState('search', 'Aucune facture', 'Aucune facture ne correspond à ces filtres.') : emptyState('receipt', 'Aucune facture', 'Créez une facture, ou transformez un devis accepté en facture en un clic.', can('sale.edit') ? `<button type="button" class="btn gold" data-fcnew>${svg('plus')} Nouvelle facture</button>` : '');
    bindPager(host, FCF, draw); bindRows(host, 'fac', openFactureDrawer);
    $$('[data-tocli]', host).forEach(b => b.onclick = () => go('client', { id: b.dataset.tocli, tab: 'factures' }));
    $$('[data-fcnew]', host).forEach(b => b.onclick = () => factureForm());
  };
  draw();
  $$('[data-fst]', el).forEach(b => b.onclick = () => { FCF.status = b.dataset.fst; FCF.page = 1; UI_STATE.save('factures', FCF); history.replaceState(null, '', '#/factures'); route({ keepScroll: true }); });
  $('#fcQ', el).oninput = debounce(e => { FCF.q = e.target.value; FCF.page = 1; draw(); }, 150);
  [['fcClient', 'client'], ['fcFrom', 'from'], ['fcTo', 'to']].forEach(([id, k]) => $('#' + id, el).onchange = e => { FCF[k] = e.target.value; FCF.page = 1; draw(); });
  $('#fcReset', el).onclick = () => { Object.assign(FCF, FCF_DEFAULT); UI_STATE.save('factures', FCF); history.replaceState(null, '', '#/factures'); route(); };
  if ($('#fcNew', el)) $('#fcNew', el).onclick = () => factureForm(null, { clientId: FCF.client || '' });
  if ($('#fcCsv', el)) $('#fcCsv', el).onclick = () => exportFacturesCSV(filteredFactures());
};

function facturesTableHTML(list, { client = true } = {}) {
  return `<div class="tbl-wrap"><table class="tbl" style="min-width:${client ? 1040 : 900}px"><caption class="sr-only">Liste des factures</caption><thead><tr><th scope="col">N°</th>${client ? '<th scope="col">Client</th>' : ''}<th scope="col">Date</th><th scope="col">Échéance</th><th scope="col">Statut</th><th scope="col" class="num-c">Total TTC</th><th scope="col" class="num-c">Reste à payer</th><th scope="col">Règlement</th></tr></thead><tbody>
    ${list.map(f => { const st = factureStatus(f), t = docTotals(f), due = factureDue(f);
      return `<tr data-fac="${f.id}" tabindex="0" class="${st === 'late' ? 'is-late' : isFactureUnpaid(f) ? 'is-due' : ''} ${f.status === 'cancelled' ? 'is-cancelled' : ''}"><td><b class="mono">${esc(f.number)}</b>${f.demo ? ' <span class="chip gold xs">Démo</span>' : ''}</td>
      ${client ? `<td><button type="button" class="link-btn" data-tocli="${f.clientId}">${esc(clientName(f.clientId))}</button></td>` : ''}
      <td>${fmtDate(f.date)}</td><td>${fmtDate(f.dueDate)}${st === 'late' ? ` <span class="chip dng xs">${svg('clock')}${daysBetween(f.dueDate, todayISO())} j</span>` : ''}</td>
      <td>${statusChip(FACT_STATUS, st, 'xs')}</td><td class="num-c"><b class="mono">${fmtMoney(t.ttc)}</b></td><td class="num-c mono ${st === 'late' ? 'dng-t' : ''}">${due ? fmtMoney(due) : '—'}</td>
      <td>${f.status === 'paid' ? `<small>${esc(f.paymentMethod || '')} · ${fmtDate(f.paidDate)}</small>` : (f.payments || []).length ? `<small>${fmtMoney(facturePaid(f))} reçus</small>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')}
    </tbody></table></div>`;
}

/* ═════════════════════ FORMULAIRE ═════════════════════ */
function factureForm(id, preset = {}) {
  const f = id ? factureById(id) : null;
  if (!S.clients.length) { toast('Créez d\'abord un client.', 'warn'); return go('clients', { action: 'new' }); }
  const d = f ? clone(f) : { date: todayISO(), dueDate: addDays(todayISO(), Number(SETTINGS.invoiceDueDays) || 30), lines: [], paymentMethod: '', status: 'issued', ...preset };
  let readLines;
  openModal({
    title: f ? `Modifier la facture ${f.number}` : 'Nouvelle facture', xwide: true,
    body: `<div class="grid-2">${clientPicker('ffCli', 'Client', d.clientId || '')}<div class="grid-2" style="gap:0 12px">${fieldHTML({ id: 'ffDate', label: 'Date de facture', type: 'date', value: d.date, req: true })}${fieldHTML({ id: 'ffDue', label: 'Date d\'échéance', type: 'date', value: d.dueDate, req: true })}</div></div>
      ${linesEditorHTML('ffLines', 'Lignes de la facture')}
      <div class="grid-2">${selectHTML({ id: 'ffPay', label: 'Moyen de paiement prévu', options: [...new Set([...SETTINGS.paymentMethods, d.paymentMethod].filter(Boolean))], value: d.paymentMethod, empty: '— À définir —' })}
        ${!f ? selectHTML({ id: 'ffStatus', label: 'Statut à l\'enregistrement', options: [['issued', 'Émise (envoyée au client)'], ['draft', 'Brouillon']], value: d.status }) : '<div></div>'}</div>
      ${textareaHTML({ id: 'ffCom', label: 'Commentaire (imprimé sur la facture)', value: d.comment || '', rows: 2 })}`,
    footer: `<button type="button" class="btn ghost" data-close>Annuler</button><button type="button" class="btn gold" id="ffSave">${f ? 'Enregistrer' : 'Créer la facture'}</button>`,
    onOpen: m => {
      bindClientPicker(m, 'ffCli');
      readLines = bindLinesEditor(m, 'ffLines', d.lines);
      $('#ffDate', m).onchange = e => { if (!f && e.target.value) $('#ffDue', m).value = addDays(e.target.value, Number(SETTINGS.invoiceDueDays) || 30); };
      $('#ffSave', m).onclick = e => guard(e.currentTarget, async () => {
        formError(m, '');
        const data = { clientId: val(m, 'ffCli'), date: val(m, 'ffDate'), dueDate: val(m, 'ffDue'), paymentMethod: val(m, 'ffPay'), comment: val(m, 'ffCom'), lines: readLines(), status: f ? f.status : val(m, 'ffStatus'), quoteId: d.quoteId, achatId: d.achatId };
        try { const r = await saveFacture(data, id); closeModal(1); toast(f ? 'Facture mise à jour' : `Facture ${r.number} créée`, 'ok'); openFactureDrawer(r.id); }
        catch (err) { formError(m, err.message); markInvalid(m, [!data.clientId && 'ffCli', !data.date && 'ffDate', (!data.dueDate || err.message.includes('échéance')) && 'ffDue'].filter(Boolean)); }
      });
    }
  });
}

/* Règlement (total ou partiel) */
function paymentForm(id) {
  const f = factureById(id); if (!f) return;
  const due = factureDue(f);
  openModal({
    level: 2, title: `Règlement — facture ${f.number}`,
    body: `<p class="soft" style="margin-bottom:14px">Total TTC ${fmtMoney(docTotals(f).ttc)} · déjà réglé ${fmtMoney(facturePaid(f))} · <b>reste ${fmtMoney(due)}</b></p>
      <div class="grid-2">${fieldHTML({ id: 'pyAmt', label: 'Montant reçu', value: String(due).replace('.', ','), req: true, attrs: 'inputmode="decimal"' })}${fieldHTML({ id: 'pyDate', label: 'Date du règlement', type: 'date', value: todayISO(), req: true })}</div>
      ${selectHTML({ id: 'pyMethod', label: 'Moyen de paiement', options: [...new Set([...SETTINGS.paymentMethods, f.paymentMethod].filter(Boolean))], value: f.paymentMethod || SETTINGS.paymentMethods[0] })}
      ${fieldHTML({ id: 'pyNote', label: 'Référence / remarque', value: '', placeholder: 'N° de chèque, référence de virement…' })}`,
    footer: `<button type="button" class="btn ghost" data-close>Annuler</button><button type="button" class="btn gold" id="pySave">${svg('check')} Enregistrer le règlement</button>`,
    onOpen: m => $('#pySave', m).onclick = e => guard(e.currentTarget, async () => {
      const amount = parseNum(val(m, 'pyAmt'));
      try { const r = await addPayment(id, { amount, date: val(m, 'pyDate'), method: val(m, 'pyMethod'), note: val(m, 'pyNote') }); closeModal(2); toast(r.status === 'paid' ? `Facture ${r.number} soldée — achat et points de fidélité enregistrés` : `Règlement partiel enregistré · reste ${fmtMoney(factureDue(r))}`, 'ok', 5000); }
      catch (err) { formError(m, err.message); markInvalid(m, ['pyAmt']); }
    })
  });
}

/* ═════════════════════ FICHE FACTURE (panneau latéral) ═════════════════════ */
function openFactureDrawer(id) {
  const render = () => {
    const f = factureById(id); if (!f) { closeDrawer(); DRAWER_REFRESH = null; return; }
    const t = docTotals(f), st = factureStatus(f), due = factureDue(f), q = devisById(f.quoteId), a = achatById(f.achatId);
    const editable = can('sale.edit') && ['draft', 'issued'].includes(f.status) && !(f.payments || []).length;
    openDrawer(`<div class="drawer-h">
        <div class="row" style="justify-content:space-between"><button type="button" class="x-btn" data-drclose aria-label="Fermer">${svg('x')}</button>
          <div class="row wrap" style="gap:6px"><button type="button" class="btn sm ghost" id="fdPrint2">${svg('printer')} Imprimer / PDF</button>${editable ? `<button type="button" class="btn sm ghost" id="fdEdit2" aria-label="Modifier">${svg('edit')}</button>` : ''}</div></div>
        <div style="margin-top:14px"><span class="eyebrow">Facture</span><h3 style="font-size:1.4rem;margin-top:4px" class="mono">${esc(f.number)}</h3>
          <button type="button" class="link-btn" data-tocli="${f.clientId}">${esc(clientName(f.clientId))}</button>
          <div class="row wrap" style="margin-top:8px;gap:6px">${statusChip(FACT_STATUS, st)}<span class="chip">du ${fmtDate(f.date)}</span><span class="chip ${st === 'late' ? 'dng' : ''}">échéance ${fmtDate(f.dueDate)}</span>${f.demo ? '<span class="chip gold">Démo</span>' : ''}</div></div>
        <div class="mini-kpis"><div><span class="k">Total HT</span><b class="mono">${fmtMoneyShort(t.ht)}</b><small>${fmtMoney(t.ht)}</small></div><div><span class="k">TVA</span><b class="mono">${fmtMoneyShort(t.tva)}</b><small>${fmtMoney(t.tva)}</small></div><div><span class="k">Total TTC</span><b class="mono gold">${fmtMoneyShort(t.ttc)}</b><small>${fmtMoney(t.ttc)}</small></div><div><span class="k">Reste à payer</span><b class="mono ${st === 'late' ? 'dng-t' : ''}">${fmtMoneyShort(due)}</b><small>${fmtMoney(facturePaid(f))} reçus</small></div></div>
      </div>
      <div class="drawer-b">
        ${can('sale.edit') ? `<div class="row wrap" style="gap:8px;margin-bottom:16px">
          ${f.status === 'draft' ? `<button type="button" class="btn sm gold" data-fst2="issued">${svg('send')} Émettre la facture</button>` : ''}
          ${isFactureUnpaid(f) ? `<button type="button" class="btn sm gold" id="fdPay">${svg('euro')} Enregistrer un règlement</button><button type="button" class="btn sm" id="fdPaidAll">${svg('check')} Marquer payée (${fmtMoney(due)})</button>` : ''}
          ${f.status === 'issued' && !(f.payments || []).length ? `<button type="button" class="btn sm ghost" data-fst2="draft">${svg('undo')} Repasser en brouillon</button>` : ''}
          ${['draft', 'issued'].includes(f.status) && !(f.payments || []).length ? `<button type="button" class="btn sm ghost" data-fst2="cancelled">${svg('x')} Annuler la facture</button>` : ''}
          ${f.status === 'cancelled' ? `<button type="button" class="btn sm ghost" data-fst2="draft">${svg('undo')} Rétablir en brouillon</button>` : ''}
          ${st === 'late' && can('client.edit') ? `<button type="button" class="btn sm" id="fdRelance">${svg('bell')} Planifier une relance</button>` : ''}</div>` : ''}
        <div class="tbl-wrap"><table class="tbl" style="min-width:0"><thead><tr><th scope="col">Désignation</th><th scope="col" class="num-c">Qté</th><th scope="col" class="num-c">PU HT</th><th scope="col" class="num-c">Montant HT</th></tr></thead><tbody>
          ${f.lines.map(l => `<tr><td>${esc(l.label)}${l.discount ? ` <small class="muted">(remise ${fmtPct(l.discount, l.discount % 1 ? 1 : 0)})</small>` : ''}<small class="muted d-block">TVA ${fmtPct(l.vatRate, l.vatRate % 1 ? 1 : 0)}</small></td><td class="num-c mono">${fmtNum(l.qty)}</td><td class="num-c mono">${fmtMoney(l.unitPrice)}</td><td class="num-c mono">${fmtMoney(lineHT(l))}</td></tr>`).join('')}</tbody></table></div>
        <div style="margin-top:16px">
          <div class="info-line"><span class="k">Moyen de paiement</span><span class="v">${esc(f.paymentMethod || '—')}</span></div>
          <div class="info-line"><span class="k">Date de règlement</span><span class="v">${f.paidDate ? fmtDate(f.paidDate) : '—'}</span></div>
          <div class="info-line"><span class="k">Devis d'origine</span><span class="v">${q ? `<button type="button" class="link-btn" data-dev="${q.id}">${esc(q.number)}</button>` : '—'}</span></div>
          <div class="info-line"><span class="k">Achat lié</span><span class="v">${a ? `<button type="button" class="link-btn" data-ach="${a.id}">${esc(a.number)}</button>` : '—'}</span></div>
          ${f.comment ? `<div class="info-line"><span class="k">Commentaire</span><span class="v" style="text-align:left;max-width:65%">${esc(f.comment)}</span></div>` : ''}
        </div>
        <h4 style="margin:18px 0 8px">Règlements</h4>
        <div class="pay-list">${(f.payments || []).length ? f.payments.map(p => `<div class="list-row static"><div><b class="mono badge-paid">${fmtMoney(p.amount)}</b><small class="muted d-block">${fmtDate(p.date)} · ${esc(p.method || '—')}${p.note ? ' · ' + esc(p.note) : ''}</small></div>${svg('check', 'inl')}</div>`).join('') : '<p class="muted">Aucun règlement enregistré.</p>'}</div>
        <h4 style="margin:18px 0 8px">Historique</h4>
        ${(f.history || []).slice().reverse().map(h => `<div class="info-line"><span class="k">${fmtDateTime(h.at)}${h.by ? ' · ' + esc(h.by) : ''}</span><span class="v">${statusChip(FACT_STATUS, h.status, 'xs')}${h.note ? ' <small class="muted">' + esc(h.note) + '</small>' : ''}</span></div>`).join('')}
        <div class="drawer-actions">
          ${can('sale.edit') ? `<button type="button" class="btn sm ghost" id="fdDup">${svg('copy')} Dupliquer</button>` : ''}
          ${can('sale.delete') ? `<button type="button" class="btn sm danger" id="fdDel2">${svg('trash')} Supprimer</button>` : ''}
        </div></div>`, dr => {
      $('[data-drclose]', dr).onclick = closeDrawer;
      $$('[data-tocli]', dr).forEach(b => b.onclick = () => { closeDrawer(); go('client', { id: b.dataset.tocli, tab: 'factures' }); });
      bindQuickLinks(dr);
      $('#fdPrint2', dr).onclick = () => printFacture(f);
      if ($('#fdEdit2', dr)) $('#fdEdit2', dr).onclick = () => factureForm(f.id);
      if ($('#fdPay', dr)) $('#fdPay', dr).onclick = () => paymentForm(f.id);
      if ($('#fdPaidAll', dr)) $('#fdPaidAll', dr).onclick = () => confirmDialog(`Enregistrer le règlement complet de ${fmtMoney(due)} pour la facture ${f.number} (aujourd'hui, ${f.paymentMethod || 'moyen de paiement non précisé'}) ?`, async () => { await addPayment(f.id, { amount: due, date: todayISO(), method: f.paymentMethod }); toast(`Facture ${f.number} payée`, 'ok'); }, { danger: false, yes: 'Marquer payée' });
      if ($('#fdRelance', dr)) $('#fdRelance', dr).onclick = () => interactionForm(null, { clientId: f.clientId, type: 'relance', done: false, date: todayISO(), title: `Relance paiement facture ${f.number}`, description: `Reste à payer : ${fmtMoney(due)} — échéance dépassée depuis le ${fmtDate(f.dueDate)}.` });
      $$('[data-fst2]', dr).forEach(b => b.onclick = () => {
        const s = b.dataset.fst2;
        const run = async () => { await setFactureStatus(f.id, s); toast(`Facture ${f.number} : ${FACT_STATUS[s].label.toLowerCase()}`, 'ok'); };
        if (s === 'cancelled') confirmDialog(`Annuler la facture ${f.number} ? Elle reste consultable mais n'est plus due par le client.`, run, { yes: 'Annuler la facture' });
        else guard(b, run);
      });
      if ($('#fdDup', dr)) $('#fdDup', dr).onclick = e => guard(e.currentTarget, async () => { const nf = await duplicateFacture(f.id); toast(`Copie créée : ${nf.number} (brouillon)`, 'ok'); openFactureDrawer(nf.id); });
      if ($('#fdDel2', dr)) $('#fdDel2', dr).onclick = () => confirmDialog(`Supprimer définitivement la facture ${f.number} (${fmtMoney(t.ttc)}, ${clientName(f.clientId)}) ? ${f.status === 'draft' || f.status === 'cancelled' ? '' : 'Une facture émise doit en principe être conservée : préférez l\'annulation. '}Cette action est irréversible.`,
        async () => { await deleteFacture(f.id); closeDrawer(); toast('Facture supprimée', 'dng'); }, { yes: 'Supprimer la facture', requireText: f.status === 'draft' ? '' : 'SUPPRIMER' });
    }, 'Facture ' + f.number);
  };
  DRAWER_REFRESH = render;
  render();
}
