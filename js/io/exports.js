/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — io/exports.js
   • Exports CSV compatibles Excel français : UTF-8 avec BOM, séparateur
     « ; », décimales avec virgule, dates JJ/MM/AAAA, fin de ligne CRLF.
   • Exports JSON par module (clients, achats, devis, factures…).
   • Sauvegarde JSON COMPLÈTE (toutes les données + fichiers en base64)
     et restauration : contrôle du format et de la compatibilité, résumé,
     confirmation, puis fusion (sans doublons) ou remplacement.
   • Documents imprimables A4 (devis, facture, fiche client, listes)
     via l'impression native du navigateur (« Enregistrer en PDF »).
     Les notes internes ne figurent JAMAIS sur un document destiné au client.
   ██████████████████████████████████████████████████████████████ */
"use strict";

/* ═════════════════════ CSV ═════════════════════ */
function csvNum(n, dec = 2) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '';
  let s = Number(n).toFixed(dec);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s.replace('.', ',');
}
const csvMoney = n => (n === null || n === undefined || isNaN(n)) ? '' : Number(n).toFixed(2).replace('.', ',');
const csvDate = iso => { if (!iso) return ''; const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR'); };
const csvDateTime = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  /* Protection contre l'injection de formules dans Excel (texte commençant par = + - @) */
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s;
  if (/[";\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function toCSV(header, rows) { return '﻿' + [header, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n'; }
function saveCSV(name, header, rows) {
  if (!rows.length) { toast('Rien à exporter avec ces filtres.', 'warn'); return; }
  downloadBlob(new Blob([toCSV(header, rows)], { type: 'text/csv;charset=utf-8' }), `ondea-crm-${name}-${todayISO()}.csv`);
  toast(`Export CSV : ${rows.length} ligne(s)`, 'ok');
}
/* Export JSON d'un module (données lisibles, réimportables par un autre outil) */
function saveJSON(name, list) {
  if (!list.length) { toast('Rien à exporter avec ces filtres.', 'warn'); return; }
  const payload = { app: 'Ondea CRM', module: name, exportedAt: nowStamp(), count: list.length, items: list };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `ondea-crm-${name}-${todayISO()}.json`);
  toast(`Export JSON : ${list.length} élément(s)`, 'ok');
}
/* Lignes d'un document aplaties (une ligne CSV par ligne de document) */
const linesText = lines => (lines || []).map(l => `${fmtNum(l.qty)} × ${l.label}`).join(' | ');

function exportClientsCSV(list = S.clients) {
  saveCSV('clients', ['N° client', 'Civilité', 'Prénom', 'Nom', 'Entreprise', 'Fonction', 'Téléphone', 'Téléphone secondaire', 'E-mail', 'Adresse', 'Complément', 'Code postal', 'Ville', 'Pays', 'Site Internet', 'Date de naissance', 'Statut', 'Catégorie', 'Source', 'Commercial', 'Créé le', 'Dernière activité', 'Actif', 'Nb achats', 'Total dépensé TTC', 'Panier moyen', 'Impayés', 'Points disponibles', 'Niveau fidélité', 'Démo'],
    list.map(c => { const m = metricsOf(c.id); return [c.number, CIVILITY[c.civility] || '', c.firstName, c.lastName, c.company, c.jobTitle, c.phone, c.phone2, c.email, c.address, c.address2, c.zip, c.city, c.country, c.website, csvDate(c.birthDate), CLIENT_STATUS[c.status]?.label, c.categoryId ? catName(c.categoryId) : '', c.source, operatorName(c.salesRepId), csvDateTime(c.createdAt), csvDate(m.lastActivity), isActiveClient(c) ? 'oui' : 'non', m.nAchats, csvMoney(m.spent), csvMoney(m.avgBasket), csvMoney(m.unpaid), m.available, TIERS[m.tier].label, c.demo ? 'oui' : '']; }));
}
function exportContactsCSV(list = S.contacts) {
  saveCSV('contacts', ['Client', 'N° client', 'Civilité', 'Prénom', 'Nom', 'Fonction', 'Téléphone', 'E-mail', 'Contact principal', 'Notes', 'Créé le'],
    list.map(ct => [clientName(ct.clientId), clientById(ct.clientId)?.number || '', CIVILITY[ct.civility] || '', ct.firstName, ct.lastName, ct.jobTitle, ct.phone, ct.email, ct.isPrimary ? 'oui' : '', ct.notes, csvDateTime(ct.createdAt)]));
}
function exportAchatsCSV(list = S.achats) {
  saveCSV('achats', ['N° commande', 'Date', 'Client', 'N° client', 'Produits', 'Quantité totale', 'Montant HT', 'TVA', 'Montant TTC', 'Moyen de paiement', 'Statut', 'Vendeur', 'Facture', 'Commentaire'],
    list.map(a => { const t = docTotals(a); return [a.number, csvDate(a.date), clientName(a.clientId), clientById(a.clientId)?.number || '', linesText(a.lines), csvNum(sum(a.lines, l => l.qty), 3), csvMoney(t.ht), csvMoney(t.tva), csvMoney(t.ttc), a.paymentMethod, ACHAT_STATUS[a.status]?.label, a.seller, factureById(a.invoiceId)?.number || '', a.comment]; }));
}
function exportDevisCSV(list = S.devis) {
  saveCSV('devis', ['N° devis', 'Date', 'Validité', 'Client', 'N° client', 'Lignes', 'Remises', 'Total HT', 'TVA', 'Total TTC', 'Statut', 'Facture', 'Commentaire'],
    list.map(d => { const t = docTotals(d); return [d.number, csvDate(d.date), csvDate(d.validUntil), clientName(d.clientId), clientById(d.clientId)?.number || '', linesText(d.lines), csvMoney(t.discount), csvMoney(t.ht), csvMoney(t.tva), csvMoney(t.ttc), DEVIS_STATUS[devisStatus(d)].label, factureById(d.invoiceId)?.number || '', d.comment]; }));
}
function exportFacturesCSV(list = S.factures) {
  saveCSV('factures', ['N° facture', 'Date', 'Échéance', 'Client', 'N° client', 'Lignes', 'Total HT', 'TVA', 'Total TTC', 'Déjà réglé', 'Reste à payer', 'Statut', 'Moyen de paiement', 'Date de règlement', 'Devis d\'origine', 'Commentaire'],
    list.map(f => { const t = docTotals(f); return [f.number, csvDate(f.date), csvDate(f.dueDate), clientName(f.clientId), clientById(f.clientId)?.number || '', linesText(f.lines), csvMoney(t.ht), csvMoney(t.tva), csvMoney(t.ttc), csvMoney(facturePaid(f)), csvMoney(factureDue(f)), FACT_STATUS[factureStatus(f)].label, f.paymentMethod, csvDate(f.paidDate), devisById(f.quoteId)?.number || '', f.comment]; }));
}
function exportInteractionsCSV(list = S.interactions) {
  saveCSV('interactions', ['Date', 'Heure', 'Type', 'Titre', 'Description', 'Client', 'N° client', 'Contact', 'Utilisateur', 'Statut', 'Automatique'],
    list.map(i => [csvDate(i.date), i.time, INTER_TYPES[i.type]?.label, i.title, i.description, clientName(i.clientId), clientById(i.clientId)?.number || '', contactById(i.contactId) ? contactName(contactById(i.contactId)) : (i.contactLabel || ''), i.userName, i.done ? 'Réalisée' : (i.date < todayISO() ? 'En retard' : 'Planifiée'), i.auto ? 'oui' : '']));
}
function exportFideliteCSV() {
  saveCSV('fidelite', ['Client', 'N° client', 'Niveau', 'Points disponibles', 'Points gagnés', 'Points utilisés', 'Dernière activité fidélité'],
    S.clients.filter(c => !isArchived(c)).map(c => { const L = loyaltyOf(c.id); return [clientName(c), c.number, TIERS[L.tier].label, L.available, L.earned, L.used, csvDate(L.lastActivity)]; }));
}
function exportFideliteMovesCSV(list = S.fidelite) {
  saveCSV('fidelite-mouvements', ['Date', 'Client', 'N° client', 'Type', 'Points', 'Motif', 'Utilisateur'],
    list.map(f => [csvDate(f.date), clientName(f.clientId), clientById(f.clientId)?.number || '', LOYALTY_TYPES[f.type] || f.type, f.points, f.label, f.userName]));
}
function exportNotesCSV(list = S.notes) {
  saveCSV('notes-internes', ['Date', 'Client', 'Titre', 'Contenu', 'Priorité', 'Statut', 'Auteur'],
    list.map(n => [csvDate(n.date), clientName(n.clientId), n.title, n.content, NOTE_PRIO[n.priority]?.label, NOTE_STATUS[n.status]?.label, n.authorName]));
}

/* ═════════════════════ SAUVEGARDE JSON ═════════════════════ */
const BACKUP_APP = 'Ondea CRM', BACKUP_FORMAT = 1;
function blobToDataURL(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
function dataURLToBlob(url) {
  const [head, data] = String(url).split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(data || ''); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
async function exportBackup() {
  const media = [];
  for (const m of await IDB.getAll('media')) {
    try { media.push({ id: m.id, name: m.name, type: m.type, size: m.size, at: m.at, demo: !!m.demo, data: await blobToDataURL(m.blob) }); }
    catch (e) { console.warn('Fichier illisible ignoré', m.id); }
  }
  const stores = {}; DATA_STORES.forEach(k => stores[k] = S[k]);
  const payload = {
    app: BACKUP_APP, format: BACKUP_FORMAT, dbVersion: DB_VERSION, exportedAt: nowStamp(), exportedBy: SESSION_OP?.name || '',
    counts: Object.fromEntries(Object.entries(stores).map(([k, v]) => [k, v.length]).concat([['media', media.length]])),
    stores, kv: { settings: SETTINGS, operators: OPERATORS, counters: COUNTERS }, media
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  downloadBlob(blob, `ondea-crm-sauvegarde-${todayISO()}.json`);
  PREF.set('ocrm_last_backup', nowStamp());
  toast(`Sauvegarde complète exportée (${fmtSize(blob.size)}, ${media.length} fichier(s) inclus).`, 'ok', 6000);
}

/* Contrôle du format, de la compatibilité et de l'intégrité avant restauration */
function checkBackup(data) {
  const errs = [], warns = [];
  if (!data || data.app !== BACKUP_APP) { errs.push('Ce fichier n\'est pas une sauvegarde Ondea CRM (application d\'origine : ' + (data?.app || 'inconnue') + ').'); return { errs, warns }; }
  if (data.format !== BACKUP_FORMAT) errs.push('Version de sauvegarde non prise en charge (format ' + data.format + ', attendu ' + BACKUP_FORMAT + ').');
  if (data.dbVersion && data.dbVersion > DB_VERSION) errs.push('Cette sauvegarde provient d\'une version plus récente d\'Ondea CRM : mettez l\'application à jour.');
  const st = data.stores || {};
  ['clients', 'contacts', 'achats', 'devis', 'factures', 'interactions', 'notes', 'fidelite', 'documents', 'categories'].forEach(k => { if (!Array.isArray(st[k])) errs.push(`Section « ${k} » absente ou invalide.`); });
  if (errs.length) return { errs, warns };
  st.clients.forEach((c, i) => { if (!c.id || !c.number || !CLIENT_STATUS[c.status]) errs.push(`Client n° ${i + 1} incomplet (identifiant, numéro ou statut manquant).`); });
  ['devis', 'factures', 'achats'].forEach(k => st[k].forEach((d, i) => { if (!d.id || !d.number || !Array.isArray(d.lines)) errs.push(`${k} n° ${i + 1} invalide.`); }));
  if (errs.length > 8) errs.splice(8, errs.length, '… et d\'autres erreurs.');
  const ids = new Set(st.clients.map(c => c.id));
  const orphans = ['contacts', 'achats', 'devis', 'factures', 'interactions', 'notes', 'fidelite', 'documents'].reduce((n, k) => n + st[k].filter(x => !ids.has(x.clientId)).length, 0);
  if (orphans) warns.push(`${orphans} élément(s) font référence à des clients absents de la sauvegarde : ils seront ignorés.`);
  const mediaIds = new Set((data.media || []).map(m => m.id));
  const missing = st.documents.filter(d => d.mediaId && !mediaIds.has(d.mediaId)).length + st.clients.filter(c => c.photoId && !mediaIds.has(c.photoId)).length;
  if (missing) warns.push(`${missing} fichier(s) référencé(s) ne sont pas inclus dans la sauvegarde.`);
  return { errs, warns };
}
function restoreFromFile(file, { fromWelcome = false } = {}) {
  const rd = new FileReader();
  rd.onload = () => {
    let data;
    try { data = JSON.parse(rd.result); } catch (e) { return toast('Fichier illisible : ce n\'est pas un JSON valide.', 'dng'); }
    const { errs, warns } = checkBackup(data);
    if (errs.length) return openModal({ title: 'Sauvegarde refusée', body: `<div class="login-err">${errs.map(esc).join('<br>')}</div><p class="soft">Aucune donnée n'a été modifiée.</p>`, footer: '<button type="button" class="btn" data-close>Fermer</button>' });
    const st = data.stores;
    const merge = mergePlan(data);
    openModal({
      title: 'Restaurer une sauvegarde', wide: true,
      body: `<p class="soft">Fichier du <b>${fmtDateTime(data.exportedAt)}</b>${data.exportedBy ? ' par ' + esc(data.exportedBy) : ''} :</p>
        <ul class="count-list"><li><b>${st.clients.length}</b> clients</li><li><b>${st.contacts.length}</b> contacts</li><li><b>${st.achats.length}</b> achats</li><li><b>${st.devis.length}</b> devis</li><li><b>${st.factures.length}</b> factures</li><li><b>${st.interactions.length}</b> interactions</li><li><b>${st.notes.length}</b> notes</li><li><b>${st.documents.length}</b> documents</li><li><b>${(data.media || []).length}</b> fichiers</li></ul>
        ${warns.length ? `<div class="notice warn-n">${svg('warn')}<div>${warns.map(esc).join('<br>')}</div></div>` : `<p class="notice-sm">${svg('check', 'inl')} Format, compatibilité et intégrité vérifiés.</p>`}
        <fieldset class="fs"><legend>Mode de restauration</legend>
          <label class="radio-card"><input type="radio" name="rsMode" value="merge" ${fromWelcome ? '' : 'checked'}><span><b>Fusionner</b> — ajoute uniquement ce qui manque : <b>${merge.added}</b> élément(s) nouveau(x), <b>${merge.kept}</b> déjà présent(s) ignoré(s)${merge.dupClients ? `, <b>${merge.dupClients}</b> client(s) reconnu(s) (même e-mail ou même n°) rattaché(s) à la fiche existante` : ''}. Vos réglages actuels sont conservés.</span></label>
          <label class="radio-card"><input type="radio" name="rsMode" value="replace" ${fromWelcome ? 'checked' : ''}><span><b>Remplacer</b> — efface TOUTES les données actuelles de ce navigateur et les remplace par la sauvegarde (y compris réglages et opérateurs).</span></label>
        </fieldset>`,
      footer: `<button type="button" class="btn ghost" data-close>Annuler</button><button type="button" class="btn gold" id="rsGo">Continuer</button>`,
      onOpen: m => $('#rsGo', m).onclick = () => {
        const mode = $('input[name=rsMode]:checked', m).value;
        const run = async () => { await applyRestore(data, mode); closeModal(1); };
        if (mode === 'replace' && (S.clients.length || S.factures.length)) confirmDialog(`Toutes les données actuelles (${S.clients.length} clients, ${S.factures.length} factures, ${S.devis.length} devis…) seront définitivement remplacées. Pensez à exporter une sauvegarde avant.`, run, { yes: 'Remplacer mes données', requireText: 'REMPLACER', title: 'Restauration destructive' });
        else confirmDialog(mode === 'replace' ? 'Restaurer la sauvegarde ?' : `Fusionner la sauvegarde avec les données actuelles (${merge.added} élément(s) ajouté(s)) ?`, run, { danger: false, yes: 'Restaurer' });
      }
    });
  };
  rd.onerror = () => toast('Lecture du fichier impossible.', 'dng');
  rd.readAsText(file);
}

/* Prépare la fusion : aucun doublon (même identifiant, ou même client reconnu par e-mail / n°),
   références réécrites vers la fiche existante, numéros en conflit renumérotés. */
function mergePlan(data) {
  const st = data.stores;
  const clientMap = new Map(), catMap = new Map();
  let kept = 0, dupClients = 0;
  st.categories.forEach(c => { const ex = S.categories.find(x => x.id === c.id || norm(x.name) === norm(c.name)); if (ex) catMap.set(c.id, ex.id); });
  const plan = Object.fromEntries(DATA_STORES.map(k => [k, []]));
  st.categories.forEach(c => { if (catMap.has(c.id)) kept++; else plan.categories.push(c); });
  let counters = clone(COUNTERS);
  st.clients.forEach(c => {
    if (IDX.clients.has(c.id)) { clientMap.set(c.id, c.id); kept++; return; }
    const same = S.clients.find(x => (c.email && norm(x.email) === norm(c.email)) || x.number === c.number && norm(clientName(x)) === norm(clientName(c)));
    if (same) { clientMap.set(c.id, same.id); dupClients++; return; }
    const nc = { ...c, categoryId: catMap.get(c.categoryId) || c.categoryId };
    if (S.clients.some(x => x.number === c.number)) { const r = nextNumber(counters, 'client'); counters = r.counters; nc.number = r.number; }
    clientMap.set(c.id, c.id); plan.clients.push(nc);
  });
  const usedNumbers = k => new Set(S[k].map(x => x.number));
  ['contacts', 'achats', 'devis', 'factures', 'interactions', 'notes', 'fidelite', 'documents'].forEach(k => {
    const nums = ['achats', 'devis', 'factures'].includes(k) ? usedNumbers(k) : null;
    st[k].forEach(o => {
      if (!clientMap.has(o.clientId)) return;              // orphelin : ignoré
      if (IDX[k].has(o.id)) { kept++; return; }
      const no = { ...o, clientId: clientMap.get(o.clientId) };
      if (nums && nums.has(no.number)) { const r = nextNumber(counters, k, Number(String(no.date).slice(0, 4)) || undefined); counters = r.counters; no.number = r.number; }
      plan[k].push(no);
    });
  });
  st.journal?.forEach(j => { if (!IDX.journal.has(j.id)) plan.journal.push(j); });
  /* Compteurs : on garde le plus grand pour ne jamais réattribuer un numéro */
  const bc = data.kv?.counters || {};
  counters.client = Math.max(counters.client || 0, bc.client || 0);
  ['achats', 'devis', 'factures'].forEach(k => { counters[k] = counters[k] || {}; Object.entries(bc[k] || {}).forEach(([y, n]) => counters[k][y] = Math.max(counters[k][y] || 0, n)); });
  const added = sum(DATA_STORES.filter(k => k !== 'journal'), k => plan[k].length);
  return { plan, counters, kept, dupClients, added };
}
async function applyRestore(data, mode) {
  const st = data.stores;
  const media = (data.media || []).map(m => { try { return { id: m.id, name: m.name, type: m.type, size: m.size, at: m.at, demo: !!m.demo, blob: dataURLToBlob(m.data) }; } catch (e) { return null; } }).filter(Boolean);
  let added = 0, kept = 0;
  if (mode === 'replace') {
    await IDB.tx([...DATA_STORES, 'media', 'kv'], t => {
      DATA_STORES.forEach(n => t.clear(n)); t.clear('media'); t.clear('kv');
      DATA_STORES.forEach(n => (st[n] || []).forEach(o => t.put(n, o)));
      media.forEach(md => t.put('media', md));
      const kv = data.kv || {};
      ['settings', 'operators', 'counters'].forEach(k => { if (kv[k] !== undefined) t.put('kv', { key: k, value: kv[k] }); });
    });
    added = sum(DATA_STORES, n => (st[n] || []).length);
  } else {
    const mp = mergePlan(data); added = mp.added; kept = mp.kept + mp.dupClients;
    const localMedia = new Set((await IDB.getAll('media')).map(m => m.id));
    const needed = new Set([...mp.plan.documents.map(d => d.mediaId), ...mp.plan.clients.map(c => c.photoId)].filter(Boolean));
    /* Opérateurs de la sauvegarde absents localement : ajoutés inactifs (pour l'historique) */
    const ops = OPERATORS.concat((data.kv?.operators || []).filter(o => !OPERATORS.some(x => x.id === o.id)).map(o => ({ ...o, active: false })));
    await IDB.tx([...DATA_STORES, 'media', 'kv'], t => {
      DATA_STORES.forEach(n => mp.plan[n].forEach(o => t.put(n, o)));
      media.filter(m => needed.has(m.id) && !localMedia.has(m.id)).forEach(md => t.put('media', md));
      t.put('kv', { key: 'counters', value: mp.counters }); t.put('kv', { key: 'operators', value: ops });
    });
  }
  await loadAll(); MEDIA_URLS.forEach(u => URL.revokeObjectURL(u)); MEDIA_URLS.clear();
  emitChange({ what: 'restore' });
  toast(mode === 'replace' ? `Sauvegarde restaurée : ${fmtNum(added, 0)} élément(s).` : `Fusion terminée : ${fmtNum(added, 0)} élément(s) ajouté(s), ${fmtNum(kept, 0)} doublon(s) évité(s).`, 'ok', 7000);
  if (!SESSION_OP || !OPERATORS.some(o => o.id === SESSION_OP.id && o.active !== false)) { SESSION_OP = null; PREF.set('ocrm_session', ''); $('#app').classList.remove('on'); $('#login').style.display = 'grid'; renderWelcome(); }
  else { SESSION_OP = OPERATORS.find(o => o.id === SESSION_OP.id); buildShell(); refreshView(); }
}

/* ═════════════════════ IMPRESSION A4 ═════════════════════ */
function docHeader(title, sub = '') {
  const s = SETTINGS;
  return `<header class="doc-h"><div class="doc-co">${s.logoId ? `<img data-media="${esc(s.logoId)}" alt="" class="doc-logo">` : ''}<div><b class="doc-cn">${esc(s.companyName || 'Mon entreprise')}</b>
      <div>${esc(s.address || '').replace(/\n/g, '<br>')}</div><div>${[s.phone, s.email].filter(Boolean).map(esc).join(' · ')}</div>${s.siret ? `<div>SIRET ${esc(s.siret)}</div>` : ''}${s.vatNumber ? `<div>TVA intracom. ${esc(s.vatNumber)}</div>` : ''}</div></div>
    <div class="doc-t"><h1>${esc(title)}</h1>${sub}</div></header>`;
}
const docFooter = () => `<footer class="doc-f">${esc(SETTINGS.companyName || '')}${SETTINGS.siret ? ' · SIRET ' + esc(SETTINGS.siret) : ''} — document généré par Ondea CRM le ${fmtDateTime(nowStamp())}${SESSION_OP ? ' par ' + esc(SESSION_OP.name) : ''}</footer>`;
const docClientBlock = (c, title = 'Client') => `<div><h2>${esc(title)}</h2><b>${esc(clientName(c))}</b>${c?.company && clientPerson(c) ? `<div>${esc(clientPerson(c))}</div>` : ''}
  <div>${[c?.address, c?.address2].filter(Boolean).map(esc).join('<br>')}</div><div>${esc([c?.zip, c?.city].filter(Boolean).join(' '))}${c?.country && c.country !== 'France' ? ' · ' + esc(c.country) : ''}</div>
  <div>${[c?.phone, c?.email].filter(Boolean).map(esc).join(' · ')}</div><div class="mono">${esc(c?.number || '')}</div></div>`;

/* Aperçu à l'écran puis impression (le navigateur propose « Enregistrer au format PDF ») */
function printPreview(title, html) {
  openModal({
    title: 'Aperçu avant impression — ' + title, xwide: true, label: 'Aperçu avant impression',
    body: `<div class="paper-wrap"><div class="paper">${html}</div></div>`,
    footer: `<small class="muted grow" style="text-align:left">Astuce : choisissez « Enregistrer au format PDF » comme imprimante pour obtenir un PDF.</small><button type="button" class="btn ghost" data-close>Fermer</button><button type="button" class="btn gold" id="ppGo">${svg('printer')} Imprimer</button>`,
    onOpen: m => { hydrateMedia(m); $('#ppGo', m).onclick = () => doPrint(html); }
  });
}
async function doPrint(html) {
  const area = $('#printArea');
  area.innerHTML = `<div class="paper">${html}</div>`;
  await hydrateMedia(area);
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(() => { if (document.body.classList.contains('printing')) done(); }, 1500); }, 60);
}

/* Tableau des lignes + totaux par taux de TVA (devis, factures, achats) */
function docLinesHTML(doc) {
  const t = docTotals(doc);
  const hasDisc = doc.lines.some(l => Number(l.discount) > 0);
  return `<table class="doc-tbl"><thead><tr><th>Désignation</th><th class="r">Qté</th><th class="r">Prix unit. HT</th>${hasDisc ? '<th class="r">Remise</th>' : ''}<th class="r">TVA</th><th class="r">Montant HT</th></tr></thead><tbody>
    ${doc.lines.map(l => `<tr><td>${esc(l.label)}</td><td class="r">${fmtNum(l.qty)}</td><td class="r">${fmtMoney(l.unitPrice)}</td>${hasDisc ? `<td class="r">${l.discount ? fmtPct(l.discount, l.discount % 1 ? 1 : 0) : ''}</td>` : ''}<td class="r">${fmtPct(l.vatRate, l.vatRate % 1 ? 1 : 0)}</td><td class="r">${fmtMoney(lineHT(l))}</td></tr>`).join('')}
    </tbody></table>
    <div class="doc-totals">${t.discount ? `<div><span>Remises accordées</span><b>− ${fmtMoney(t.discount)}</b></div>` : ''}<div><span>Total HT</span><b>${fmtMoney(t.ht)}</b></div>
      ${Object.entries(t.byRate).sort((a, b) => b[0] - a[0]).map(([r, x]) => `<div><span>TVA ${fmtPct(Number(r), Number(r) % 1 ? 1 : 0)}</span><b>${fmtMoney(x.tva)}</b></div>`).join('')}
      <div class="ttc"><span>Total TTC</span><b>${fmtMoney(t.ttc)}</b></div></div>`;
}
function printDevis(d) {
  const c = clientById(d.clientId);
  const html = docHeader('Devis', `<div class="doc-meta"><div><span>N°</span><b>${esc(d.number)}</b></div><div><span>Date</span><b>${fmtDate(d.date)}</b></div><div><span>Valable jusqu'au</span><b>${fmtDate(d.validUntil)}</b></div></div>`) +
    `<section class="doc-parties">${docClientBlock(c)}<div><h2>Votre interlocuteur</h2><b>${esc(operatorName(d.sellerId) || SESSION_OP?.name || '')}</b><div>${esc(SETTINGS.phone || '')}</div><div>${esc(SETTINGS.email || '')}</div></div></section>` +
    docLinesHTML(d) + (d.comment ? `<p><b>Observations :</b> ${esc(d.comment)}</p>` : '') + (SETTINGS.quoteMentions ? `<p style="font-size:11px;color:#444">${esc(SETTINGS.quoteMentions)}</p>` : '') +
    `<div class="doc-sign"><div>Bon pour accord<br><small>Date, signature et cachet du client</small></div></div>` + docFooter();
  printPreview('Devis ' + d.number, html);
}
function printFacture(f) {
  const c = clientById(f.clientId);
  const paid = facturePaid(f), due = factureDue(f);
  const html = docHeader('Facture', `<div class="doc-meta"><div><span>N°</span><b>${esc(f.number)}</b></div><div><span>Date</span><b>${fmtDate(f.date)}</b></div><div><span>Échéance</span><b>${fmtDate(f.dueDate)}</b></div><div><span>Statut</span><b>${FACT_STATUS[factureStatus(f)].label}</b></div></div>`) +
    `<section class="doc-parties">${docClientBlock(c, 'Facturé à')}<div><h2>Règlement</h2><div>Mode : <b>${esc(f.paymentMethod || 'à définir')}</b></div>${SETTINGS.iban ? `<div>IBAN : <span class="mono">${esc(SETTINGS.iban)}</span></div>` : ''}${devisById(f.quoteId) ? `<div>Selon devis ${esc(devisById(f.quoteId).number)}</div>` : ''}</div></section>` +
    docLinesHTML(f) +
    (paid ? `<div class="doc-totals"><div><span>Déjà réglé</span><b>${fmtMoney(paid)}</b></div><div class="ttc"><span>Reste à payer</span><b>${fmtMoney(due)}</b></div></div>` : '') +
    (f.comment ? `<p><b>Observations :</b> ${esc(f.comment)}</p>` : '') + (SETTINGS.invoiceMentions ? `<p style="font-size:11px;color:#444">${esc(SETTINGS.invoiceMentions)}</p>` : '') + docFooter();
  printPreview('Facture ' + f.number, html);
}
function printAchat(a) {
  const c = clientById(a.clientId);
  const html = docHeader('Récapitulatif d\'achat', `<div class="doc-meta"><div><span>N°</span><b>${esc(a.number)}</b></div><div><span>Date</span><b>${fmtDate(a.date)}</b></div><div><span>Statut</span><b>${ACHAT_STATUS[a.status].label}</b></div></div>`) +
    `<section class="doc-parties">${docClientBlock(c)}<div><h2>Paiement</h2><div>${esc(a.paymentMethod || '—')}</div><div>Vendeur : ${esc(a.seller || '—')}</div></div></section>` + docLinesHTML(a) + docFooter();
  printPreview('Achat ' + a.number, html);
}
/* Fiche de synthèse client (sans les notes internes, par principe) */
function printClientSheet(c) {
  const m = metricsOf(c.id), L = loyaltyOf(c.id);
  const contacts = S.contacts.filter(x => x.clientId === c.id);
  const ach = S.achats.filter(a => a.clientId === c.id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15);
  const html = docHeader('Fiche client', `<div class="doc-meta"><div><span>N°</span><b>${esc(c.number)}</b></div><div><span>Statut</span><b>${esc(CLIENT_STATUS[c.status].label)}</b></div><div><span>Client depuis</span><b>${fmtDate(c.createdAt)}</b></div></div>`) +
    `<section class="doc-parties">${docClientBlock(c, 'Coordonnées')}<div><h2>Synthèse</h2><div>Total dépensé : <b>${fmtMoney(m.spent)}</b> (${m.nAchats} achat(s))</div><div>Panier moyen : <b>${fmtMoney(m.avgBasket)}</b></div><div>Dernière activité : ${fmtDate(m.lastActivity)}</div><div>Fidélité : <b>${TIERS[L.tier].label}</b> · ${fmtNum(L.available, 0)} point(s)</div>${m.unpaid ? `<div>Reste à encaisser : <b>${fmtMoney(m.unpaid)}</b></div>` : ''}</div></section>` +
    (contacts.length ? `<h2 style="font-size:14px;margin:6px 0">Contacts</h2><table class="doc-tbl"><thead><tr><th>Nom</th><th>Fonction</th><th>Téléphone</th><th>E-mail</th></tr></thead><tbody>${contacts.map(x => `<tr><td>${esc(contactName(x))}${x.isPrimary ? ' (principal)' : ''}</td><td>${esc(x.jobTitle || '')}</td><td>${esc(x.phone || '')}</td><td>${esc(x.email || '')}</td></tr>`).join('')}</tbody></table>` : '') +
    (ach.length ? `<h2 style="font-size:14px;margin:6px 0">Derniers achats</h2><table class="doc-tbl"><thead><tr><th>Date</th><th>N°</th><th>Produits</th><th class="r">TTC</th><th>Statut</th></tr></thead><tbody>${ach.map(a => `<tr><td>${fmtDate(a.date)}</td><td class="mono">${esc(a.number)}</td><td>${esc(linesText(a.lines))}</td><td class="r">${fmtMoney(docTotals(a).ttc)}</td><td>${ACHAT_STATUS[a.status].label}</td></tr>`).join('')}</tbody></table>` : '') + docFooter();
  printPreview('Fiche ' + clientName(c), html);
}
function printTable(title, sub, head, rows, note = '') {
  const html = docHeader(title, `<div class="doc-meta">${sub}</div>`) + (note ? `<p>${note}</p>` : '') +
    `<table class="doc-tbl"><thead><tr>${head.map(h => `<th class="${h.r ? 'r' : ''}">${esc(h.t || h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${head[i].r ? 'r' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>` + docFooter();
  printPreview(title, html);
}
