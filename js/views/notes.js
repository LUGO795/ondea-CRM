/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — views/notes.js
   Notes internes : date, auteur, titre, contenu, priorité (faible,
   normale, importante, urgente) et statut (ouverte, en cours, traitée).
   Clairement marquées « Interne » : elles ne figurent jamais sur un
   document destiné au client (devis, facture, fiche imprimée).
   ██████████████████████████████████████████████████████████████ */
"use strict";

const NTF_DEFAULT = { q: '', prio: '', status: 'open', client: '', page: 1 };
const NTF = UI_STATE.load('notes', NTF_DEFAULT);
/* Tri : épinglées, puis non traitées, puis priorité décroissante, puis plus récentes */
const noteSort = (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.status === 'traitee' ? 1 : 0) - (b.status === 'traitee' ? 1 : 0) || NOTE_PRIO[b.priority].rank - NOTE_PRIO[a.priority].rank || (a.updatedAt < b.updatedAt ? 1 : -1);

function filteredNotes(f = NTF) {
  const t = norm(f.q);
  return S.notes.filter(n => (!f.prio || n.priority === f.prio) && (!f.client || n.clientId === f.client) &&
    (!f.status || (f.status === 'open' ? n.status !== 'traitee' : n.status === f.status)) &&
    (!t || norm(n.title + ' ' + n.content + ' ' + clientName(n.clientId) + ' ' + n.authorName).includes(t))).sort(noteSort);
}

VIEWS.notes = (el) => {
  const open = S.notes.filter(n => n.status !== 'traitee');
  el.innerHTML = pageHead('Notes internes', crumbFor('notes'),
    (can('export') ? `<button type="button" class="btn" id="nCsv">${svg('down')} Export CSV</button>` : '') +
    (can('note.edit') ? `<button type="button" class="btn gold" id="nNew">${svg('plus')} Nouvelle note</button>` : ''),
    `${open.length} note(s) ouverte(s) · ${open.filter(n => n.priority === 'urgente').length} urgente(s)`) +
    `<div class="notice" role="note">${svg('lock')}<div><b>Usage interne uniquement.</b> Les notes ne sont jamais imprimées ni exportées sur les documents destinés aux clients.</div></div>
    <div class="tbl-tools" role="search" aria-label="Filtrer les notes">
      ${searchBox('nQ', 'Rechercher dans les notes', NTF.q, 'Titre, contenu, client, auteur…', 280)}
      ${filterSelect('nPrio', 'Priorité', Object.entries(NOTE_PRIO).map(([k, p]) => [k, p.label]), NTF.prio, 'Toutes priorités')}
      ${filterSelect('nStatus', 'Statut', [['open', 'Non traitées'], ...Object.entries(NOTE_STATUS).map(([k, s]) => [k, s.label])], NTF.status, 'Tous statuts')}
      ${filterSelect('nClient', 'Client', optClients(() => true).map(([v, l]) => [v, l.split(' — ')[0]]), NTF.client, 'Tous clients')}
      <button type="button" class="btn ghost sm" id="nReset">Réinitialiser</button></div>
    <div id="nList" aria-live="polite"></div>`;
  const draw = () => {
    UI_STATE.save('notes', NTF);
    const rows = filteredNotes();
    const pg = paginate(rows, NTF, 24);
    const host = $('#nList', el);
    host.innerHTML = rows.length ? `<div class="notes-grid">${pg.rows.map(n => noteCardHTML(n, { client: true })).join('')}</div>` + pagerHTML(NTF.page, pg.pages, pg.total, pg.start, pg.rows.length, 'note')
      : S.notes.length ? emptyState('search', 'Aucune note', 'Aucune note ne correspond à ces filtres.') : emptyState('note', 'Aucune note interne', 'Consignez les informations utiles à l\'équipe : préférences, points de vigilance, historique d\'un litige…', can('note.edit') ? `<button type="button" class="btn gold" data-nnew>${svg('plus')} Nouvelle note</button>` : '');
    bindPager(host, NTF, draw); bindNoteCards(host);
    $$('[data-nnew]', host).forEach(b => b.onclick = () => noteForm());
  };
  draw();
  $('#nQ', el).oninput = debounce(e => { NTF.q = e.target.value; NTF.page = 1; draw(); }, 150);
  [['nPrio', 'prio'], ['nStatus', 'status'], ['nClient', 'client']].forEach(([id, k]) => $('#' + id, el).onchange = e => { NTF[k] = e.target.value; NTF.page = 1; draw(); });
  $('#nReset', el).onclick = () => { Object.assign(NTF, NTF_DEFAULT); UI_STATE.save('notes', NTF); route(); };
  if ($('#nNew', el)) $('#nNew', el).onclick = () => noteForm(null, { clientId: NTF.client || '' });
  if ($('#nCsv', el)) $('#nCsv', el).onclick = () => exportNotesCSV(filteredNotes());
};

function noteCardHTML(n, { client = false } = {}) {
  const p = NOTE_PRIO[n.priority];
  return `<article class="card note-card p-${n.priority} ${n.status === 'traitee' ? 'is-done' : ''}" aria-label="Note interne : ${esc(n.title)}">
    <div class="row between" style="align-items:flex-start;gap:8px"><span class="internal-tag">${svg('lock')}Interne${n.pinned ? ' · épinglée' : ''}</span><div class="row wrap" style="gap:4px">${statusChip(NOTE_PRIO, n.priority, 'xs')}${statusChip(NOTE_STATUS, n.status, 'xs')}</div></div>
    <h4>${esc(n.title)}</h4>
    ${client ? `<button type="button" class="link-btn" data-tocli="${n.clientId}" style="font-size:.84rem">${esc(clientName(n.clientId))}</button>` : ''}
    <div class="note-body">${esc(n.content)}</div>
    <div class="note-meta">${fmtDate(n.date)} · ${esc(n.authorName || '—')}${n.updatedAt && n.updatedAt !== n.createdAt ? ' · modifiée le ' + fmtDate(n.updatedAt) : ''}<span class="sr-only">, priorité ${p.label}</span></div>
    ${can('note.edit') ? `<div class="row wrap" style="gap:6px;margin-top:4px">
      ${n.status !== 'traitee' ? `<button type="button" class="btn sm" data-nstat="${n.id}" data-s="traitee">${svg('check')} Traitée</button>` : `<button type="button" class="btn sm ghost" data-nstat="${n.id}" data-s="ouverte">${svg('undo')} Rouvrir</button>`}
      <button type="button" class="btn icon sm ghost" data-nedit="${n.id}" aria-label="Modifier la note « ${esc(n.title)} »" title="Modifier">${svg('edit')}</button>
      <button type="button" class="btn icon sm danger" data-ndel="${n.id}" aria-label="Supprimer la note « ${esc(n.title)} »" title="Supprimer">${svg('trash')}</button></div>` : ''}
  </article>`;
}
function bindNoteCards(root) {
  $$('[data-tocli]', root).forEach(b => b.onclick = () => go('client', { id: b.dataset.tocli, tab: 'notes' }));
  $$('[data-nedit]', root).forEach(b => b.onclick = () => noteForm(b.dataset.nedit));
  $$('[data-nstat]', root).forEach(b => b.onclick = () => guard(b, async () => { await setNoteStatus(b.dataset.nstat, b.dataset.s); toast(b.dataset.s === 'traitee' ? 'Note marquée comme traitée' : 'Note rouverte', 'ok'); }));
  $$('[data-ndel]', root).forEach(b => b.onclick = () => {
    const n = noteById(b.dataset.ndel); if (!n) return;
    confirmDialog(`Supprimer la note interne « ${n.title} » (${clientName(n.clientId)}) ? Cette action est irréversible.`, async () => { await deleteNote(n.id); toast('Note supprimée', 'dng'); }, { yes: 'Supprimer la note' });
  });
}

function noteForm(id, preset = {}) {
  const n = id ? noteById(id) : null;
  if (!S.clients.length) { toast('Créez d\'abord un client.', 'warn'); return go('clients', { action: 'new' }); }
  const d = n || { priority: 'normale', status: 'ouverte', date: todayISO(), ...preset };
  openModal({
    title: n ? 'Modifier la note interne' : 'Nouvelle note interne', wide: true,
    body: `<p class="internal-tag" style="margin-bottom:12px">${svg('lock')}Note interne — jamais visible par le client</p>
      ${clientPicker('nfCli', 'Client concerné', d.clientId || '', { filter: () => true })}
      <div class="grid-3">${fieldHTML({ id: 'nfDate', label: 'Date', type: 'date', value: d.date, req: true })}${selectHTML({ id: 'nfPrio', label: 'Priorité', options: Object.entries(NOTE_PRIO).map(([k, p]) => [k, p.label]), value: d.priority, req: true })}${selectHTML({ id: 'nfStatus', label: 'Statut', options: Object.entries(NOTE_STATUS).map(([k, s]) => [k, s.label]), value: d.status, req: true })}</div>
      ${fieldHTML({ id: 'nfTitle', label: 'Titre', value: d.title || '', req: true })}
      ${textareaHTML({ id: 'nfContent', label: 'Contenu', value: d.content || '', rows: 6 })}
      <label class="chk-inline"><input type="checkbox" id="nfPin" ${d.pinned ? 'checked' : ''}> Épingler en tête de liste</label>
      ${n ? `<p class="hint" style="margin-top:10px">Auteur : ${esc(n.authorName || '—')} · créée le ${fmtDateTime(n.createdAt)}</p>` : `<p class="hint" style="margin-top:10px">Auteur : ${esc(SESSION_OP?.name || '')}</p>`}`,
    footer: `<button type="button" class="btn ghost" data-close>Annuler</button><button type="button" class="btn gold" id="nfSave">${n ? 'Enregistrer' : 'Ajouter la note'}</button>`,
    onOpen: m => {
      bindClientPicker(m, 'nfCli');
      $('#nfSave', m).onclick = e => guard(e.currentTarget, async () => {
        formError(m, '');
        const data = { clientId: val(m, 'nfCli'), date: val(m, 'nfDate'), priority: val(m, 'nfPrio'), status: val(m, 'nfStatus'), title: val(m, 'nfTitle'), content: val(m, 'nfContent'), pinned: $('#nfPin', m).checked };
        try { await saveNote(data, id); closeModal(1); toast(n ? 'Note mise à jour' : 'Note interne ajoutée', 'ok'); }
        catch (err) { formError(m, err.message); markInvalid(m, [!data.clientId && 'nfCli', !data.title && 'nfTitle', !data.content && 'nfContent'].filter(Boolean)); }
      });
    }
  });
}
