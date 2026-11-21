/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — views/contacts.js
   Contacts : plusieurs interlocuteurs par client (responsable achats,
   comptabilité…), un contact principal unique par client, historique
   des modifications de chaque contact. Vue globale filtrable + cartes
   réutilisées dans la fiche client.
   ██████████████████████████████████████████████████████████████ */
"use strict";

const CTF_DEFAULT = { q: '', client: '', primary: '', page: 1 };
const CTF = UI_STATE.load('contacts', CTF_DEFAULT);

function filteredContacts(f = CTF) {
  const t = norm(f.q), digits = f.q.replace(/\D/g, '');
  return S.contacts.filter(ct =>
    (!f.client || ct.clientId === f.client) && (!f.primary || ct.isPrimary) &&
    (!t || norm([ct.firstName, ct.lastName, ct.email, ct.jobTitle, clientName(ct.clientId)].join(' ')).includes(t) || (digits.length >= 4 && String(ct.phone || '').replace(/\D/g, '').includes(digits)))
  ).sort((a, b) => clientName(a.clientId).localeCompare(clientName(b.clientId), 'fr') || (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || contactName(a).localeCompare(contactName(b), 'fr'));
}

VIEWS.contacts = (el) => {
  el.innerHTML = pageHead('Contacts', crumbFor('contacts'),
    (can('export') ? `<button type="button" class="btn" id="ctCsv">${svg('down')} Export CSV</button>` : '') +
    (can('client.edit') ? `<button type="button" class="btn gold" id="ctNew">${svg('plus')} Nouveau contact</button>` : ''),
    `${S.contacts.length} contact(s) répartis sur ${new Set(S.contacts.map(c => c.clientId)).size} client(s)`) +
    `<div class="tbl-tools" role="search" aria-label="Filtrer les contacts">
      ${searchBox('ctQ', 'Rechercher un contact', CTF.q, 'Nom, e-mail, téléphone, fonction, client…')}
      ${filterSelect('ctClient', 'Client', optClients(() => true).map(([v, l]) => [v, l.split(' — ')[0]]), CTF.client, 'Tous clients')}
      <label class="chk-inline"><input type="checkbox" id="ctPrim" ${CTF.primary ? 'checked' : ''}> Contacts principaux uniquement</label>
      <button type="button" class="btn ghost sm" id="ctReset">Réinitialiser</button></div>
    <div id="ctList" aria-live="polite"></div>`;
  const draw = () => {
    UI_STATE.save('contacts', CTF);
    const rows = filteredContacts();
    const pg = paginate(rows, CTF);
    const host = $('#ctList', el);
    host.innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl" style="min-width:900px"><caption class="sr-only">Liste des contacts</caption><thead><tr><th scope="col">Contact</th><th scope="col">Client</th><th scope="col">Fonction</th><th scope="col">Téléphone</th><th scope="col">E-mail</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>
      ${pg.rows.map(ct => `<tr data-ctc="${ct.id}" tabindex="0"><td><div class="cell-user"><div class="av sm" aria-hidden="true">${esc(initialsOf(contactName(ct)))}</div><div><b>${esc([CIVILITY[ct.civility], contactName(ct)].filter(Boolean).join(' '))}</b>${ct.isPrimary ? ` <span class="chip gold xs">${svg('star')}Principal</span>` : ''}</div></div></td>
        <td><button type="button" class="link-btn" data-tocli="${ct.clientId}">${esc(clientName(ct.clientId))}</button></td><td>${esc(ct.jobTitle || '—')}</td>
        <td>${ct.phone ? `<a href="${telHref(ct.phone)}">${esc(ct.phone)}</a>` : '—'}</td><td>${ct.email ? `<a href="mailto:${esc(ct.email)}">${esc(ct.email)}</a>` : '—'}</td>
        <td class="qa-cell">${contactActions(ct)}</td></tr>`).join('')}</tbody></table></div>` + pagerHTML(CTF.page, pg.pages, pg.total, pg.start, pg.rows.length, 'contact')
      : S.contacts.length ? emptyState('search', 'Aucun résultat', 'Aucun contact ne correspond à ces filtres.') : emptyState('user', 'Aucun contact', 'Ajoutez les interlocuteurs de vos clients : responsable achats, comptabilité, direction…', can('client.edit') ? `<button type="button" class="btn gold" data-ctnew>${svg('plus')} Nouveau contact</button>` : '');
    bindPager(host, CTF, draw); bindContactCards(host);
    bindRows(host, 'ctc', id => contactHistory(id));
    $$('[data-tocli]', host).forEach(b => b.onclick = () => go('client', { id: b.dataset.tocli, tab: 'contacts' }));
    $$('[data-ctnew]', host).forEach(b => b.onclick = () => contactForm());
  };
  draw();
  $('#ctQ', el).oninput = debounce(e => { CTF.q = e.target.value; CTF.page = 1; draw(); }, 120);
  $('#ctClient', el).onchange = e => { CTF.client = e.target.value; CTF.page = 1; draw(); };
  $('#ctPrim', el).onchange = e => { CTF.primary = e.target.checked ? '1' : ''; CTF.page = 1; draw(); };
  $('#ctReset', el).onclick = () => { Object.assign(CTF, CTF_DEFAULT); UI_STATE.save('contacts', CTF); route(); };
  if ($('#ctNew', el)) $('#ctNew', el).onclick = () => contactForm(null, { clientId: CTF.client || '' });
  if ($('#ctCsv', el)) $('#ctCsv', el).onclick = () => exportContactsCSV(filteredContacts());
};

/* Boutons d'action d'un contact (tableau et cartes) */
function contactActions(ct) {
  const name = esc(contactName(ct));
  return `<button type="button" class="btn icon sm ghost" data-cthist="${ct.id}" aria-label="Historique de ${name}" title="Historique">${svg('clock')}</button>` +
    (can('client.edit') ? `${!ct.isPrimary ? `<button type="button" class="btn icon sm ghost" data-ctprim="${ct.id}" aria-label="Définir ${name} comme contact principal" title="Définir comme principal">${svg('star')}</button>` : ''}
    <button type="button" class="btn icon sm ghost" data-ctedit="${ct.id}" aria-label="Modifier ${name}" title="Modifier">${svg('edit')}</button>
    <button type="button" class="btn icon sm danger" data-ctdel="${ct.id}" aria-label="Supprimer ${name}" title="Supprimer">${svg('trash')}</button>` : '');
}
/* Carte contact (fiche client) */
function contactCardHTML(ct, { bare = false } = {}) {
  const inner = `<div class="row between" style="align-items:flex-start"><div class="row" style="min-width:0"><div class="av" aria-hidden="true">${esc(initialsOf(contactName(ct)))}</div><div style="min-width:0"><b>${esc([CIVILITY[ct.civility], contactName(ct)].filter(Boolean).join(' '))}</b><small class="muted d-block">${esc(ct.jobTitle || 'Fonction non précisée')}</small></div></div>${ct.isPrimary ? `<span class="chip gold xs">${svg('star')}Principal</span>` : ''}</div>
    ${ct.phone ? `<a class="ct-line" href="${telHref(ct.phone)}">${svg('phone')}${esc(ct.phone)}</a>` : ''}${ct.email ? `<a class="ct-line" href="mailto:${esc(ct.email)}">${svg('mail')}${esc(ct.email)}</a>` : ''}${ct.notes ? `<div class="ct-line">${svg('info')}${esc(ct.notes)}</div>` : ''}
    <div class="row wrap" style="gap:6px;margin-top:4px">${contactActions(ct)}</div>`;
  return bare ? inner : `<article class="card ct-card ${ct.isPrimary ? 'primary' : ''}" aria-label="Contact ${esc(contactName(ct))}">${inner}</article>`;
}
function bindContactCards(root) {
  $$('[data-ctedit]', root).forEach(b => b.onclick = e => { e.stopPropagation(); contactForm(b.dataset.ctedit); });
  $$('[data-cthist]', root).forEach(b => b.onclick = e => { e.stopPropagation(); contactHistory(b.dataset.cthist); });
  $$('[data-ctprim]', root).forEach(b => b.onclick = e => { e.stopPropagation(); guard(b, async () => { await setPrimaryContact(b.dataset.ctprim); toast('Contact principal mis à jour', 'ok'); }); });
  $$('[data-ctdel]', root).forEach(b => b.onclick = e => {
    e.stopPropagation();
    const ct = contactById(b.dataset.ctdel); if (!ct) return;
    const n = S.interactions.filter(i => i.contactId === ct.id).length;
    confirmDialog(`Supprimer le contact « ${contactName(ct)} » (${clientName(ct.clientId)}) ?${ct.isPrimary ? ' Un autre contact deviendra principal.' : ''}${n ? ` Ses ${n} interaction(s) sont conservées dans l'historique du client.` : ''}`, async () => { await deleteContact(ct.id); toast('Contact supprimé', 'dng'); }, { yes: 'Supprimer le contact' });
  });
}
function contactHistory(id) {
  const ct = contactById(id); if (!ct) return;
  const inter = S.interactions.filter(i => i.contactId === id).sort((a, b) => (a.date < b.date ? 1 : -1));
  openModal({
    title: 'Contact — ' + contactName(ct), wide: true,
    body: `<div class="mini-kpis" style="margin:0 0 16px"><div><span class="k">Client</span><b style="font-size:1rem">${esc(clientName(ct.clientId))}</b><small>${esc(clientById(ct.clientId)?.number || '')}</small></div><div><span class="k">Fonction</span><b style="font-size:1rem">${esc(ct.jobTitle || '—')}</b><small>${ct.isPrimary ? 'contact principal' : 'contact'}</small></div><div><span class="k">Interactions</span><b class="mono">${inter.length}</b><small>avec ce contact</small></div><div><span class="k">Créé le</span><b style="font-size:1rem">${fmtDate(ct.createdAt)}</b><small>modifié ${fmtDate(ct.updatedAt)}</small></div></div>
      <h4 style="margin-bottom:8px">Historique du contact</h4>
      ${(ct.history || []).slice().reverse().map(h => `<div class="info-line"><span class="k">${fmtDateTime(h.at)}${h.by ? ' · ' + esc(h.by) : ''}</span><span class="v">${esc(h.text)}</span></div>`).join('') || '<p class="muted">Aucun historique.</p>'}
      ${inter.length ? `<h4 style="margin:18px 0 8px">Interactions avec ce contact</h4>${timelineHTML(inter.slice(0, 10), { compact: true })}` : ''}`,
    footer: `<button type="button" class="btn ghost" data-close>Fermer</button><a class="btn" href="#/client?id=${ct.clientId}" data-close>${svg('user')} Fiche client</a>${can('client.edit') ? `<button type="button" class="btn gold" id="chEdit">${svg('edit')} Modifier</button>` : ''}`,
    onOpen: m => { bindTimeline(m); if ($('#chEdit', m)) $('#chEdit', m).onclick = () => { closeModal(1); contactForm(id); }; }
  });
}

function contactForm(id, preset = {}) {
  const ct = id ? contactById(id) : null;
  if (!S.clients.length) { toast('Créez d\'abord un client.', 'warn'); return go('clients', { action: 'new' }); }
  const d = ct || { ...preset };
  openModal({
    title: ct ? 'Modifier le contact' : 'Nouveau contact', wide: true,
    body: `${clientPicker('cfCli', 'Client', d.clientId || '', { filter: () => true })}
      <div class="grid-3">${selectHTML({ id: 'ctCiv', label: 'Civilité', options: [['', '—'], ['M', 'M.'], ['Mme', 'Mme'], ['Dr', 'Dr'], ['Me', 'Me']], value: d.civility || '' })}${fieldHTML({ id: 'ctFirst', label: 'Prénom', value: d.firstName || '' })}${fieldHTML({ id: 'ctLast', label: 'Nom', value: d.lastName || '', req: true })}</div>
      <div class="grid-3">${fieldHTML({ id: 'ctJob', label: 'Fonction', value: d.jobTitle || '', placeholder: 'Ex. Responsable achats' })}${fieldHTML({ id: 'ctPhone', label: 'Téléphone', type: 'tel', value: d.phone || '' })}${fieldHTML({ id: 'ctMail', label: 'E-mail', type: 'email', value: d.email || '' })}</div>
      ${textareaHTML({ id: 'ctNotes', label: 'Remarques', value: d.notes || '', rows: 2 })}
      <label class="chk-inline"><input type="checkbox" id="ctPrimary" ${d.isPrimary ? 'checked' : ''}> Contact principal du client</label>`,
    footer: `<button type="button" class="btn ghost" data-close>Annuler</button><button type="button" class="btn gold" id="ctSave">${ct ? 'Enregistrer' : 'Ajouter le contact'}</button>`,
    onOpen: m => {
      bindClientPicker(m, 'cfCli');
      $('#ctSave', m).onclick = e => guard(e.currentTarget, async () => {
        formError(m, '');
        const data = { clientId: val(m, 'cfCli'), civility: val(m, 'ctCiv'), firstName: val(m, 'ctFirst'), lastName: val(m, 'ctLast'), jobTitle: val(m, 'ctJob'), phone: val(m, 'ctPhone'), email: val(m, 'ctMail'), notes: val(m, 'ctNotes'), isPrimary: $('#ctPrimary', m).checked };
        try { await saveContact(data, id); closeModal(1); toast(ct ? 'Contact mis à jour' : 'Contact ajouté', 'ok'); }
        catch (err) { formError(m, err.message); markInvalid(m, [!data.clientId && 'cfCli', !data.lastName && !data.firstName && 'ctLast', err.message.includes('e-mail') && 'ctMail', err.message.includes('téléphone') && 'ctPhone'].filter(Boolean)); }
      });
    }
  });
}
