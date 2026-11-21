/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — views/reports.js
   Rapports et exports : chaque module s'exporte en CSV (Excel FR),
   en JSON (données réutilisables) et, lorsque c'est utile, en version
   imprimable A4 (PDF via l'impression du navigateur). Accès direct à la
   sauvegarde complète et à la restauration.
   ██████████████████████████████████████████████████████████████ */
"use strict";

VIEWS.reports = (el) => {
  const canX = can('export');
  const card = (id, icon, title, text, count, btns) => `<section class="card pad rep-card" aria-labelledby="rp${id}"><div><div class="row" style="margin-bottom:10px"><div class="kpi-ic">${svg(icon)}</div><div><h3 id="rp${id}">${title}</h3><small class="muted">${count}</small></div></div><p class="soft">${text}</p></div>
    <div class="row wrap rep-btns">${btns.map(([k, l, ic]) => `<button type="button" class="btn sm ${k.endsWith('csv') ? 'gold' : ''}" data-rep="${k}" ${canX ? '' : 'disabled'}>${svg(ic)} ${l}</button>`).join('')}</div></section>`;
  const unpaid = S.factures.filter(isFactureUnpaid);
  el.innerHTML = pageHead('Rapports et exports', crumbFor('exports'), '', canX ? 'CSV compatibles Excel (séparateur « ; », virgule décimale, UTF-8), JSON réutilisables et documents A4 imprimables.' : 'Votre profil ne permet pas les exports.') +
    `<div class="rep-grid">
      ${card('Cli', 'users', 'Clients', 'Fiches complètes avec coordonnées, statut, catégorie, commercial, CA, panier moyen, impayés et fidélité.', `${S.clients.length} client(s)`, [['clients-csv', 'CSV', 'down'], ['clients-json', 'JSON', 'db'], ['clients-print', 'Imprimer', 'printer']])}
      ${card('Ctc', 'user', 'Contacts', 'Tous les interlocuteurs de vos clients, avec le contact principal de chacun.', `${S.contacts.length} contact(s)`, [['contacts-csv', 'CSV', 'down'], ['contacts-json', 'JSON', 'db']])}
      ${card('Ach', 'cart', 'Achats', 'Historique des ventes : produits, montants HT / TVA / TTC, paiement, statut, vendeur.', `${S.achats.length} achat(s)`, [['achats-csv', 'CSV', 'down'], ['achats-json', 'JSON', 'db'], ['achats-print', 'Imprimer', 'printer']])}
      ${card('Dev', 'file', 'Devis', 'Tous les devis avec lignes, remises, totaux et statut (expiration calculée).', `${S.devis.length} devis`, [['devis-csv', 'CSV', 'down'], ['devis-json', 'JSON', 'db']])}
      ${card('Fac', 'receipt', 'Factures', 'Factures, règlements, reste à payer et retards. L\'impression liste les impayés à relancer.', `${S.factures.length} facture(s) · ${unpaid.length} impayée(s)`, [['factures-csv', 'CSV', 'down'], ['factures-json', 'JSON', 'db'], ['impayes-print', 'Impayés', 'printer']])}
      ${card('Int', 'msg', 'Interactions', 'Timeline complète : appels, e-mails, rendez-vous, relances planifiées et réalisées.', `${S.interactions.length} interaction(s)`, [['interactions-csv', 'CSV', 'down'], ['interactions-json', 'JSON', 'db']])}
      ${card('Fid', 'gift', 'Fidélité', 'Soldes de points et niveaux par client, et historique détaillé des mouvements.', `${S.fidelite.length} mouvement(s)`, [['fidelite-csv', 'Soldes CSV', 'down'], ['fidelite-mv-csv', 'Mouvements CSV', 'down'], ['fidelite-json', 'JSON', 'db']])}
      ${card('Not', 'lock', 'Notes internes', 'Usage interne uniquement : à ne pas transmettre aux clients.', `${S.notes.length} note(s)`, [['notes-csv', 'CSV', 'down'], ['notes-json', 'JSON', 'db']])}
      <section class="card pad rep-card" aria-labelledby="rpBk"><div><div class="row" style="margin-bottom:10px"><div class="kpi-ic">${svg('shield')}</div><div><h3 id="rpBk">Sauvegarde complète</h3><small class="muted">dernière : ${PREF.get('ocrm_last_backup') ? fmtDateTime(PREF.get('ocrm_last_backup')) : 'jamais'}</small></div></div>
        <p class="soft">Toutes les données, réglages et fichiers (photos, documents) dans un seul fichier JSON, restaurable par fusion ou remplacement.</p></div>
        <div class="row wrap rep-btns"><button type="button" class="btn sm gold" id="rpBackup">${svg('down')} Exporter</button>${SESSION_OP?.role === 'admin' ? `<label class="btn sm" style="cursor:pointer">${svg('up')} Restaurer…<input type="file" id="rpRestore" accept="application/json,.json" class="sr-only"></label>` : ''}</div></section>
    </div>`;
  const strip = list => list.map(x => clone(x));
  const R = {
    'clients-csv': () => exportClientsCSV(S.clients), 'clients-json': () => saveJSON('clients', strip(S.clients)),
    'clients-print': () => printTable('Liste des clients', `<div><span>Clients</span><b>${S.clients.length}</b></div><div><span>Date</span><b>${fmtDate(todayISO())}</b></div>`, ['N°', 'Client', 'Ville', 'Téléphone', 'E-mail', 'Statut', { t: 'Dépensé', r: 1 }],
      S.clients.slice().sort((a, b) => clientName(a).localeCompare(clientName(b), 'fr')).map(c => [esc(c.number), esc(clientName(c)), esc(c.city || ''), esc(c.phone || ''), esc(c.email || ''), CLIENT_STATUS[c.status].label, fmtMoney(metricsOf(c.id).spent)])),
    'contacts-csv': () => exportContactsCSV(), 'contacts-json': () => saveJSON('contacts', strip(S.contacts)),
    'achats-csv': () => exportAchatsCSV(), 'achats-json': () => saveJSON('achats', strip(S.achats)),
    'achats-print': () => printTable('Historique des achats', `<div><span>Achats</span><b>${S.achats.length}</b></div>`, ['Date', 'N°', 'Client', { t: 'TTC', r: 1 }, 'Paiement', 'Statut'], S.achats.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map(a => [fmtDate(a.date), esc(a.number), esc(clientName(a.clientId)), fmtMoney(docTotals(a).ttc), esc(a.paymentMethod || ''), ACHAT_STATUS[a.status].label])),
    'devis-csv': () => exportDevisCSV(), 'devis-json': () => saveJSON('devis', strip(S.devis)),
    'factures-csv': () => exportFacturesCSV(), 'factures-json': () => saveJSON('factures', strip(S.factures)),
    'impayes-print': () => printTable('Factures impayées', `<div><span>Factures</span><b>${unpaid.length}</b></div><div><span>Total dû</span><b>${fmtMoney(sum(unpaid, factureDue))}</b></div>`, ['N°', 'Client', 'Date', 'Échéance', 'Statut', { t: 'Reste dû', r: 1 }],
      unpaid.slice().sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1)).map(f => [esc(f.number), esc(clientName(f.clientId)), fmtDate(f.date), fmtDate(f.dueDate), FACT_STATUS[factureStatus(f)].label, fmtMoney(factureDue(f))])),
    'interactions-csv': () => exportInteractionsCSV(), 'interactions-json': () => saveJSON('interactions', strip(S.interactions)),
    'fidelite-csv': () => exportFideliteCSV(), 'fidelite-mv-csv': () => exportFideliteMovesCSV(), 'fidelite-json': () => saveJSON('fidelite', strip(S.fidelite)),
    'notes-csv': () => exportNotesCSV(), 'notes-json': () => saveJSON('notes-internes', strip(S.notes))
  };
  $$('[data-rep]', el).forEach(b => b.onclick = () => { try { requireRight('export', 'exporter des données'); R[b.dataset.rep](); } catch (e) { showError(e); } });
  $('#rpBackup', el).onclick = e => guard(e.currentTarget, exportBackup);
  if ($('#rpRestore', el)) $('#rpRestore', el).onchange = e => { const f = e.target.files[0]; if (f) restoreFromFile(f); e.target.value = ''; };
};
