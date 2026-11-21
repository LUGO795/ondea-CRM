/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — store.js
   État central de l'application + règles métier (services).

   Principe (identique à Ondea Stock Intelligence) : toutes les données
   sont chargées en mémoire depuis IndexedDB au démarrage (objet S).
   Chaque opération :
     1. vérifie les règles (champs obligatoires, statuts, droits) ;
     2. prépare les nouveaux objets (copies) ;
     3. les écrit dans UNE transaction IndexedDB ;
     4. seulement si l'écriture réussit, met à jour la mémoire ;
     5. prévient l'interface (événement « change ») qui recalcule
        tableau de bord, badges, fiche ouverte…
   Les documents (devis, factures, achats…) référencent le client par son
   identifiant : renommer un client se reflète partout instantanément.
   ██████████████████████████████████████████████████████████████ */
"use strict";

/* ---------- État en mémoire ---------- */
const DATA_STORES = ['clients', 'contacts', 'achats', 'devis', 'factures', 'interactions', 'notes', 'fidelite', 'documents', 'categories', 'journal'];
const S = Object.fromEntries(DATA_STORES.map(k => [k, []]));
const IDX = Object.fromEntries(DATA_STORES.map(k => [k, new Map()]));
let VERSION = 0;               // incrémenté à chaque modification (clé de cache des calculs)

/* Réglages par défaut (modifiables dans Paramètres) */
const DEFAULT_SETTINGS = {
  companyName: '', logoId: null, address: '', phone: '', email: '', website: '', siret: '', vatNumber: '', iban: '',
  currency: 'EUR', dateFormat: 'fr',
  vatRates: [20, 10, 5.5, 2.1, 0], defaultVat: 20,
  paymentMethods: ['Carte bancaire', 'Virement', 'Espèces', 'Chèque', 'Prélèvement', 'PayPal'],
  sources: ['Bouche-à-oreille', 'Site Internet', 'Réseaux sociaux', 'Salon / événement', 'Prospection', 'Partenaire', 'Publicité', 'Autre'],
  defaultCountry: 'France',
  quoteValidityDays: 30, invoiceDueDays: 30, inactiveDays: 180,
  invoiceMentions: 'En cas de retard de paiement, pénalités au taux de 3 fois le taux d\'intérêt légal et indemnité forfaitaire de 40 € pour frais de recouvrement. Pas d\'escompte pour paiement anticipé.',
  quoteMentions: 'Devis valable jusqu\'à la date indiquée. Bon pour accord : date, signature et cachet.',
  loyalty: {
    enabled: true, pointsPerEuro: 0.1, basis: 'ttc',          // 1 point par tranche de 10 € TTC
    tiers: { bronze: 50, argent: 250, or: 750, platine: 1500 },
    rewards: [
      { id: 'rw_1', name: 'Bon d\'achat de 10 €', cost: 100 },
      { id: 'rw_2', name: 'Template premium offert', cost: 80 },
      { id: 'rw_3', name: 'Bon d\'achat de 50 €', cost: 450 },
      { id: 'rw_4', name: 'Audit SEO offert', cost: 700 }
    ]
  },
  pageSize: 25, createdAt: null
};
let SETTINGS = clone(DEFAULT_SETTINGS);
let OPERATORS = [];            // [{id, name, role, pin, active}]
let COUNTERS = { client: 0, achats: {}, devis: {}, factures: {} };
let SESSION_OP = null;         // opérateur connecté

const ROLE_LABEL = { admin: 'Administrateur', manager: 'Responsable commercial', commercial: 'Commercial' };
/* Droits par rôle — l'administrateur peut tout faire */
const RIGHTS = {
  admin: ['*'],
  manager: ['client.edit', 'client.delete', 'sale.edit', 'sale.delete', 'loyalty.edit', 'loyalty.rules', 'doc.edit', 'doc.delete', 'note.edit', 'export', 'demo', 'category.edit'],
  commercial: ['client.edit', 'sale.edit', 'loyalty.edit', 'doc.edit', 'note.edit', 'export']
};
function can(right) {
  const list = RIGHTS[SESSION_OP?.role || 'commercial'] || [];
  return list.includes('*') || list.includes(right);
}
function requireRight(right, label) {
  if (can(right)) return true;
  throw new Error(`Action réservée : votre profil « ${ROLE_LABEL[SESSION_OP?.role] || 'Commercial'} » ne permet pas de ${label}.`);
}

/* ---------- Chargement initial ---------- */
async function loadAll() {
  for (const k of DATA_STORES) S[k] = await IDB.getAll(k);
  const kv = await IDB.getAll('kv');
  const get = key => kv.find(x => x.key === key)?.value;
  SETTINGS = mergeSettings(get('settings'));
  OPERATORS = get('operators') || [];
  COUNTERS = { client: 0, achats: {}, devis: {}, factures: {}, ...(get('counters') || {}) };
  S.journal.sort((a, b) => (a.at < b.at ? 1 : -1));
  reindex();
}
/* Fusion profonde des réglages (les nouveaux réglages par défaut apparaissent après une mise à jour) */
function mergeSettings(saved) {
  const s = { ...clone(DEFAULT_SETTINGS), ...(saved || {}) };
  s.loyalty = { ...clone(DEFAULT_SETTINGS.loyalty), ...(saved?.loyalty || {}) };
  s.loyalty.tiers = { ...DEFAULT_SETTINGS.loyalty.tiers, ...(saved?.loyalty?.tiers || {}) };
  return s;
}
function reindex() { DATA_STORES.forEach(k => { IDX[k] = new Map(S[k].map(x => [x.id, x])); }); }
const clientById = id => IDX.clients.get(id);
const contactById = id => IDX.contacts.get(id);
const achatById = id => IDX.achats.get(id);
const devisById = id => IDX.devis.get(id);
const factureById = id => IDX.factures.get(id);
const interactionById = id => IDX.interactions.get(id);
const noteById = id => IDX.notes.get(id);
const documentById = id => IDX.documents.get(id);
const categoryById = id => IDX.categories.get(id);
const catName = id => categoryById(id)?.name || 'Sans catégorie';
const operatorName = id => OPERATORS.find(o => o.id === id)?.name || '';

/* Nom affiché d'un client : entreprise, sinon prénom + nom */
function clientName(c) {
  if (typeof c === 'string') c = clientById(c);
  if (!c) return 'Client supprimé';
  const person = [c.firstName, c.lastName].filter(Boolean).join(' ');
  return c.company || person || c.number || 'Client';
}
/* Personne de contact affichée sous le nom (si entreprise) */
function clientPerson(c) {
  if (!c) return '';
  const person = [CIVILITY[c.civility] || '', c.firstName, c.lastName].filter(Boolean).join(' ');
  return c.company ? person : (c.jobTitle || '');
}
const contactName = ct => ct ? [ct.firstName, ct.lastName].filter(Boolean).join(' ') || ct.email || 'Contact' : '—';

/* ---------- Écouteurs de changement (l'interface s'y abonne) ---------- */
const LISTENERS = new Set();
function onChange(fn) { LISTENERS.add(fn); }
function emitChange(info) { VERSION++; LISTENERS.forEach(fn => { try { fn(info); } catch (e) { console.error(e); } }); }

/* ---------- Écriture centralisée ----------
   plan = { put: {store: [objets]}, del: {store: [ids]}, kv: {cle: valeur} }
   Écrit tout dans UNE transaction, puis met à jour la mémoire. */
async function commit(plan, info = {}) {
  const put = plan.put || {}, del = plan.del || {}, kv = plan.kv || {};
  Object.keys(put).forEach(k => { if (!put[k] || !put[k].length) delete put[k]; });
  Object.keys(del).forEach(k => { if (!del[k] || !del[k].length) delete del[k]; });
  const stores = [...Object.keys(put), ...Object.keys(del)];
  if (Object.keys(kv).length) stores.push('kv');
  if (!stores.length) return;
  await IDB.tx(stores, t => {
    for (const [s, list] of Object.entries(put)) list.forEach(o => t.put(s, o));
    for (const [s, ids] of Object.entries(del)) ids.forEach(id => t.del(s, id));
    for (const [k, v] of Object.entries(kv)) t.put('kv', { key: k, value: v });
  });
  /* Écriture réussie → mise à jour de la mémoire */
  for (const [s, list] of Object.entries(put)) {
    if (s === 'media') continue;
    const map = new Map(S[s].map(x => [x.id, x]));
    list.forEach(o => map.set(o.id, o));
    S[s] = [...map.values()];
  }
  for (const [s, ids] of Object.entries(del)) {
    if (s === 'media') { ids.forEach(forgetMediaURL); continue; }
    const set = new Set(ids); S[s] = S[s].filter(x => !set.has(x.id));
  }
  if ('settings' in kv) SETTINGS = mergeSettings(kv.settings);
  if ('operators' in kv) OPERATORS = kv.operators;
  if ('counters' in kv) COUNTERS = kv.counters;
  if (put.journal) { S.journal.sort((a, b) => (a.at < b.at ? 1 : -1)); if (S.journal.length > 3000) trimJournal(); }
  reindex();
  emitChange(info);
  /* Prévient les autres onglets ouverts sur l'application (ils rechargent leurs données) */
  try { TAB_CHANNEL && TAB_CHANNEL.postMessage({ type: 'changed', what: info.what || '' }); } catch (e) { }
}
/* Synchronisation entre onglets : évite qu'un onglet resté ouvert écrive des données périmées */
const TAB_CHANNEL = ('BroadcastChannel' in window) ? new BroadcastChannel('ondea-crm') : null;
if (TAB_CHANNEL) TAB_CHANNEL.onmessage = async (e) => {
  if (!e.data || e.data.type !== 'changed') return;
  try { await loadAll(); emitChange({ what: 'external' }); } catch (err) { console.warn('[Ondea CRM] resynchronisation', err); }
};
function trimJournal() {
  const extra = S.journal.slice(3000).map(j => j.id);
  S.journal = S.journal.slice(0, 3000);
  IDB.tx(['journal'], t => extra.forEach(id => t.del('journal', id))).catch(() => { });
}

/* ---------- Numérotation automatique ----------
   CLI-000123 · CMD-2026-0001 · DEV-2026-0001 · FAC-2026-0001 */
const NUM_PREFIX = { achats: 'CMD', devis: 'DEV', factures: 'FAC' };
function nextNumber(counters, kind, year = new Date().getFullYear()) {
  const c = clone(counters);
  if (kind === 'client') { c.client = (c.client || 0) + 1; return { counters: c, number: 'CLI-' + String(c.client).padStart(6, '0') }; }
  c[kind] = c[kind] || {}; c[kind][year] = (c[kind][year] || 0) + 1;
  return { counters: c, number: `${NUM_PREFIX[kind]}-${year}-${String(c[kind][year]).padStart(4, '0')}` };
}

/* ---------- Journal d'activité ---------- */
function journalEntry(kind, text, ref = {}, extra = {}) {
  return { id: uid('jr'), at: nowStamp(), kind, text, ref, operatorId: SESSION_OP?.id || null, operatorName: SESSION_OP?.name || '', ...extra };
}

/* ══════════════════════════════════════════════════════════════
   RÉFÉRENTIELS
   ══════════════════════════════════════════════════════════════ */
const CIVILITY = { M: 'M.', Mme: 'Mme', Dr: 'Dr', Me: 'Me', '': '' };
const CLIENT_STATUS = {
  prospect: { label: 'Prospect', cls: 'info', icon: 'target' },
  actif: { label: 'Actif', cls: 'ok', icon: 'check' },
  vip: { label: 'VIP', cls: 'gold', icon: 'crown' },
  inactif: { label: 'Inactif', cls: '', icon: 'clock' },
  relance: { label: 'À relancer', cls: 'warn', icon: 'bell' },
  archive: { label: 'Archivé', cls: 'dng', icon: 'archive' }
};
const ACHAT_STATUS = {
  payee: { label: 'Payé', cls: 'ok' },
  attente: { label: 'En attente de paiement', cls: 'warn' },
  remboursee: { label: 'Remboursé', cls: 'info' },
  annulee: { label: 'Annulé', cls: 'dng' }
};
const DEVIS_STATUS = {
  draft: { label: 'Brouillon', cls: '' },
  sent: { label: 'Envoyé', cls: 'info' },
  accepted: { label: 'Accepté', cls: 'ok' },
  refused: { label: 'Refusé', cls: 'dng' },
  expired: { label: 'Expiré', cls: 'warn' }
};
const FACT_STATUS = {
  draft: { label: 'Brouillon', cls: '' },
  issued: { label: 'Émise', cls: 'info' },
  partial: { label: 'Partiellement payée', cls: 'warn' },
  paid: { label: 'Payée', cls: 'ok' },
  late: { label: 'En retard', cls: 'dng' },
  cancelled: { label: 'Annulée', cls: '' }
};
const INTER_TYPES = {
  appel: { label: 'Appel', icon: 'phone' },
  email: { label: 'E-mail', icon: 'mail' },
  rdv: { label: 'Rendez-vous', icon: 'meet' },
  message: { label: 'Message', icon: 'msg' },
  devis: { label: 'Devis', icon: 'file' },
  achat: { label: 'Achat', icon: 'cart' },
  facture: { label: 'Facture', icon: 'receipt' },
  relance: { label: 'Relance', icon: 'bell' },
  autre: { label: 'Autre', icon: 'info' }
};
const NOTE_PRIO = {
  faible: { label: 'Faible', cls: '', rank: 1 },
  normale: { label: 'Normale', cls: 'info', rank: 2 },
  importante: { label: 'Importante', cls: 'warn', rank: 3 },
  urgente: { label: 'Urgente', cls: 'dng', rank: 4 }
};
const NOTE_STATUS = { ouverte: { label: 'Ouverte', cls: 'gold' }, en_cours: { label: 'En cours', cls: 'info' }, traitee: { label: 'Traitée', cls: 'ok' } };
const DOC_KINDS = { contrat: 'Contrat', devis: 'Devis', facture: 'Facture', justificatif: 'Justificatif', administratif: 'Document administratif', autre: 'Autre' };
const LOYALTY_TYPES = { gain: 'Points gagnés (achat)', bonus: 'Bonus', ajustement: 'Ajustement', utilisation: 'Récompense utilisée' };
const TIERS = {
  none: { label: 'Sans niveau', icon: 'award' },
  bronze: { label: 'Bronze', icon: 'award' },
  argent: { label: 'Argent', icon: 'award' },
  or: { label: 'Or', icon: 'crown' },
  platine: { label: 'Platine', icon: 'crown' }
};
const TIER_ORDER = ['none', 'bronze', 'argent', 'or', 'platine'];

/* ══════════════════════════════════════════════════════════════
   CALCULS DE LIGNES (devis, factures, achats)
   ligne = { id, label, qty, unitPrice, discount (%), vatRate (%) }
   ══════════════════════════════════════════════════════════════ */
function lineHT(l) { return round2((Number(l.qty) || 0) * (Number(l.unitPrice) || 0) * (1 - (Number(l.discount) || 0) / 100)); }
function docTotals(doc) {
  const byRate = {};
  let gross = 0, ht = 0;
  (doc.lines || []).forEach(l => {
    const base = lineHT(l), rate = Number(l.vatRate) || 0;
    gross += round2((Number(l.qty) || 0) * (Number(l.unitPrice) || 0)); ht += base;
    byRate[rate] = byRate[rate] || { base: 0, tva: 0 };
    byRate[rate].base = round2(byRate[rate].base + base);
  });
  let tva = 0;
  Object.entries(byRate).forEach(([r, x]) => { x.tva = round2(x.base * Number(r) / 100); tva += x.tva; });
  ht = round2(ht); tva = round2(tva);
  return { ht, tva, ttc: round2(ht + tva), discount: round2(gross - ht), byRate };
}
function validateLines(lines, e) {
  if (!lines?.length) { e.push('Ajoutez au moins une ligne (produit ou prestation).'); return; }
  lines.forEach((l, i) => {
    if (!String(l.label || '').trim()) e.push(`Ligne ${i + 1} : la désignation est obligatoire.`);
    if (!(Number(l.qty) > 0)) e.push(`Ligne ${i + 1} : la quantité doit être un nombre positif.`);
    if (isNaN(l.unitPrice) || Number(l.unitPrice) < 0) e.push(`Ligne ${i + 1} : prix unitaire invalide.`);
    if (isNaN(l.discount) || l.discount < 0 || l.discount > 100) e.push(`Ligne ${i + 1} : la remise doit être comprise entre 0 et 100 %.`);
    if (isNaN(l.vatRate) || l.vatRate < 0 || l.vatRate > 100) e.push(`Ligne ${i + 1} : taux de TVA invalide.`);
  });
}
const cleanLines = lines => lines.map(l => ({ id: l.id || uid('ln'), label: String(l.label).trim(), qty: round3(l.qty), unitPrice: round2(l.unitPrice), discount: round2(l.discount || 0), vatRate: Number(l.vatRate) || 0 }));

/* Statuts effectifs (dépendent de la date du jour) */
function devisStatus(d) { return d.status === 'sent' && d.validUntil && d.validUntil < todayISO() ? 'expired' : d.status; }
function facturePaid(f) { return round2(sum(f.payments || [], p => p.amount)); }
function factureDue(f) { return f.status === 'cancelled' || f.status === 'draft' ? 0 : round2(Math.max(0, docTotals(f).ttc - facturePaid(f))); }
function factureStatus(f) { return ['issued', 'partial'].includes(f.status) && f.dueDate && f.dueDate < todayISO() ? 'late' : f.status; }
const isFactureUnpaid = f => ['issued', 'partial'].includes(f.status);
const statusChip = (map, key, extra = '') => `<span class="chip ${map[key]?.cls || ''} ${extra}">${esc(map[key]?.label || key)}</span>`;

/* ══════════════════════════════════════════════════════════════
   CLIENTS
   ══════════════════════════════════════════════════════════════ */
function validateClient(d, id) {
  const e = [];
  if (!(d.lastName || '').trim() && !(d.company || '').trim()) e.push('Indiquez au moins le nom du client ou le nom de l\'entreprise.');
  if (d.email && !isEmail(d.email)) e.push('L\'adresse e-mail n\'est pas valide (exemple : nom@domaine.fr).');
  else if (d.email && S.clients.some(c => c.id !== id && norm(c.email) === norm(d.email))) e.push(`L'adresse e-mail « ${d.email} » est déjà utilisée par un autre client.`);
  if (d.phone && !isPhone(d.phone)) e.push('Le numéro de téléphone principal n\'est pas valide.');
  if (d.phone2 && !isPhone(d.phone2)) e.push('Le numéro de téléphone secondaire n\'est pas valide.');
  if (d.zip && !/^[A-Za-z0-9 -]{3,10}$/.test(d.zip)) e.push('Le code postal n\'est pas valide.');
  if (d.website && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(d.website)) e.push('L\'adresse du site Internet n\'est pas valide.');
  if (d.birthDate && d.birthDate > todayISO()) e.push('La date de naissance ne peut pas être dans le futur.');
  if (!CLIENT_STATUS[d.status]) e.push('Statut inconnu.');
  return e;
}
const CLIENT_FIELDS = ['civility', 'firstName', 'lastName', 'company', 'jobTitle', 'phone', 'phone2', 'email', 'address', 'address2', 'zip', 'city', 'country', 'website', 'birthDate', 'status', 'categoryId', 'source', 'salesRepId', 'photoId', 'tags'];
async function saveClient(d, id) {
  requireRight('client.edit', 'modifier un client');
  const errs = validateClient(d, id); if (errs.length) throw new Error(errs.join('\n'));
  const clean = {};
  CLIENT_FIELDS.forEach(k => { if (k in d) clean[k] = typeof d[k] === 'string' ? d[k].trim() : d[k]; });
  if (clean.city) clean.city = clean.city.replace(/\s+/g, ' ');
  let c, plan;
  if (id) {
    const cur = clientById(id); if (!cur) throw new Error('Client introuvable.');
    c = { ...clone(cur), ...clean, updatedAt: nowStamp() };
    const changes = [];
    if (clientName(cur) !== clientName(c)) changes.push(`nom : ${clientName(cur)} → ${clientName(c)}`);
    if (cur.status !== c.status) changes.push(`statut : ${CLIENT_STATUS[cur.status].label} → ${CLIENT_STATUS[c.status].label}`);
    plan = { put: { clients: [c], journal: [journalEntry('client', `a modifié la fiche <b>${esc(clientName(c))}</b>${changes.length ? ' (' + esc(changes.join(', ')) + ')' : ''}`, { type: 'client', id })] } };
  } else {
    const { counters, number } = nextNumber(COUNTERS, 'client');
    c = { id: uid('cli'), number, ...Object.fromEntries(CLIENT_FIELDS.map(k => [k, clean[k] ?? ''])), country: clean.country || SETTINGS.defaultCountry, createdAt: nowStamp(), updatedAt: nowStamp(), demo: !!d.demo };
    plan = { put: { clients: [c], journal: [journalEntry('client', `a créé la fiche client <b>${esc(clientName(c))}</b> (${number})`, { type: 'client', id: c.id })] }, kv: { counters } };
  }
  await commit(plan, { what: 'client' });
  return c;
}
/* Archivage / réaffichage (bouton œil) : le statut précédent est mémorisé */
async function setClientArchived(id, archived) {
  requireRight('client.edit', 'archiver un client');
  const cur = clientById(id); if (!cur) throw new Error('Client introuvable.');
  const c = clone(cur);
  if (archived) { c.prevStatus = c.status !== 'archive' ? c.status : (c.prevStatus || 'inactif'); c.status = 'archive'; }
  else { c.status = c.prevStatus && c.prevStatus !== 'archive' ? c.prevStatus : 'actif'; delete c.prevStatus; }
  c.updatedAt = nowStamp();
  await commit({ put: { clients: [c], journal: [journalEntry('client', `a ${archived ? 'archivé' : 'réaffiché'} le client <b>${esc(clientName(c))}</b>`, { type: 'client', id })] } }, { what: 'client' });
  return c;
}
async function setClientStatus(id, status) {
  requireRight('client.edit', 'changer le statut d\'un client');
  const cur = clientById(id); if (!cur || !CLIENT_STATUS[status]) throw new Error('Changement de statut impossible.');
  const c = { ...clone(cur), status, updatedAt: nowStamp() };
  await commit({ put: { clients: [c], journal: [journalEntry('client', `a passé <b>${esc(clientName(c))}</b> au statut « ${CLIENT_STATUS[status].label} »`, { type: 'client', id })] } }, { what: 'client' });
}
/* Données rattachées à un client (pour la confirmation de suppression) */
function clientLinkedCounts(id) {
  const n = k => S[k].filter(x => x.clientId === id).length;
  return { contacts: n('contacts'), achats: n('achats'), devis: n('devis'), factures: n('factures'), interactions: n('interactions'), notes: n('notes'), fidelite: n('fidelite'), documents: n('documents') };
}
/* Suppression en cascade : rien d'orphelin ne subsiste (lecture par index dans IndexedDB) */
async function deleteClient(id) {
  requireRight('client.delete', 'supprimer un client');
  const c = clientById(id); if (!c) return;
  const linked = ['contacts', 'achats', 'devis', 'factures', 'interactions', 'notes', 'fidelite', 'documents'];
  const del = {};
  for (const k of linked) {
    const fromDb = IDB.persistent ? (await IDB.byIndex(k, 'clientId', id)).map(x => x.id) : [];
    del[k] = [...new Set(fromDb.concat(S[k].filter(x => x.clientId === id).map(x => x.id)))];
  }
  del.clients = [id];
  const mediaIds = S.documents.filter(x => x.clientId === id).map(x => x.mediaId).filter(Boolean);
  if (c.photoId) mediaIds.push(c.photoId);
  del.media = mediaIds;
  /* Entrées du journal pointant vers les éléments supprimés : on retire le lien */
  const goneIds = new Set(Object.values(del).flat());
  const journal = S.journal.filter(j => j.ref?.id && goneIds.has(j.ref.id)).map(j => ({ ...clone(j), ref: {} }));
  journal.push(journalEntry('client', `a supprimé le client <b>${esc(clientName(c))}</b> (${esc(c.number)}) et ses données associées`, {}));
  await commit({ del, put: { journal } }, { what: 'client' });
}

/* ══════════════════════════════════════════════════════════════
   CONTACTS
   ══════════════════════════════════════════════════════════════ */
async function saveContact(d, id) {
  requireRight('client.edit', 'modifier un contact');
  const e = [];
  if (!d.clientId || !clientById(d.clientId)) e.push('Choisissez le client concerné.');
  if (!(d.lastName || '').trim() && !(d.firstName || '').trim()) e.push('Le nom du contact est obligatoire.');
  if (d.email && !isEmail(d.email)) e.push('L\'adresse e-mail du contact n\'est pas valide.');
  if (d.phone && !isPhone(d.phone)) e.push('Le numéro de téléphone du contact n\'est pas valide.');
  if (e.length) throw new Error(e.join('\n'));
  const fields = { clientId: d.clientId, civility: d.civility || '', firstName: (d.firstName || '').trim(), lastName: (d.lastName || '').trim(), jobTitle: (d.jobTitle || '').trim(), phone: (d.phone || '').trim(), email: (d.email || '').trim(), notes: (d.notes || '').trim(), isPrimary: !!d.isPrimary };
  const put = [];
  let ct;
  if (id) {
    const cur = contactById(id); if (!cur) throw new Error('Contact introuvable.');
    const changed = Object.keys(fields).filter(k => k !== 'isPrimary' && String(cur[k] ?? '') !== String(fields[k] ?? ''));
    ct = { ...clone(cur), ...fields, updatedAt: nowStamp() };
    ct.history = (ct.history || []).concat(changed.length ? [{ at: nowStamp(), by: SESSION_OP?.name || '', text: 'Modification : ' + changed.map(k => CONTACT_FIELD_LABEL[k] || k).join(', ') }] : []);
  } else {
    ct = { id: uid('ctc'), ...fields, history: [{ at: nowStamp(), by: SESSION_OP?.name || '', text: 'Création du contact' }], createdAt: nowStamp(), updatedAt: nowStamp(), demo: !!d.demo };
  }
  /* Premier contact d'un client = contact principal ; un seul principal par client */
  const siblings = S.contacts.filter(x => x.clientId === ct.clientId && x.id !== ct.id);
  if (!siblings.length) ct.isPrimary = true;
  if (ct.isPrimary) siblings.filter(x => x.isPrimary).forEach(x => put.push({ ...clone(x), isPrimary: false, history: (x.history || []).concat([{ at: nowStamp(), by: SESSION_OP?.name || '', text: 'N\'est plus le contact principal' }]) }));
  put.push(ct);
  await commit({ put: { contacts: put, journal: id ? [] : [journalEntry('contact', `a ajouté le contact <b>${esc(contactName(ct))}</b> chez ${esc(clientName(ct.clientId))}`, { type: 'client', id: ct.clientId })] } }, { what: 'contact' });
  return ct;
}
const CONTACT_FIELD_LABEL = { clientId: 'client', civility: 'civilité', firstName: 'prénom', lastName: 'nom', jobTitle: 'fonction', phone: 'téléphone', email: 'e-mail', notes: 'notes' };
async function setPrimaryContact(id) {
  const ct = contactById(id); if (!ct) return;
  await saveContact({ ...ct, isPrimary: true }, id);
}
async function deleteContact(id) {
  requireRight('client.edit', 'supprimer un contact');
  const ct = contactById(id); if (!ct) return;
  const put = { contacts: [], interactions: [] };
  /* Si l'on supprime le principal, le contact suivant devient principal */
  if (ct.isPrimary) { const next = S.contacts.find(x => x.clientId === ct.clientId && x.id !== id); if (next) put.contacts.push({ ...clone(next), isPrimary: true }); }
  /* Les interactions qui citaient ce contact sont conservées, sans lien orphelin */
  S.interactions.filter(i => i.contactId === id).forEach(i => put.interactions.push({ ...clone(i), contactId: null, contactLabel: contactName(ct) }));
  put.journal = [journalEntry('contact', `a supprimé le contact <b>${esc(contactName(ct))}</b> (${esc(clientName(ct.clientId))})`, { type: 'client', id: ct.clientId })];
  await commit({ put, del: { contacts: [id] } }, { what: 'contact' });
}

/* ══════════════════════════════════════════════════════════════
   INTERACTIONS (timeline) — certaines sont créées automatiquement
   par les devis, factures et achats (auto: true, ref: {type, id})
   ══════════════════════════════════════════════════════════════ */
function autoInteraction(clientId, type, title, ref, { date = todayISO(), description = '', time } = {}) {
  return { id: uid('itr'), clientId, contactId: null, type, date, time: time || hhmmNow(), title, description, userId: SESSION_OP?.id || null, userName: SESSION_OP?.name || '', done: true, auto: true, ref, createdAt: nowStamp() };
}
const autoInteractionsOf = refId => S.interactions.filter(i => i.auto && i.ref?.id === refId);
async function saveInteraction(d, id) {
  requireRight('client.edit', 'enregistrer une interaction');
  const e = [];
  if (!d.clientId || !clientById(d.clientId)) e.push('Choisissez le client concerné.');
  if (!INTER_TYPES[d.type]) e.push('Choisissez le type d\'interaction.');
  if (!d.date) e.push('La date est obligatoire.');
  if (d.time && !/^\d{2}:\d{2}$/.test(d.time)) e.push('L\'heure doit être au format HH:MM.');
  if (!(d.title || '').trim()) e.push('Le titre est obligatoire.');
  if (e.length) throw new Error(e.join('\n'));
  const base = id ? clone(interactionById(id)) : { id: uid('itr'), auto: false, createdAt: nowStamp(), demo: !!d.demo };
  const it = { ...base, clientId: d.clientId, contactId: d.contactId || null, type: d.type, date: d.date, time: d.time || '', title: d.title.trim(), description: (d.description || '').trim(), done: d.done !== false, userId: d.userId || SESSION_OP?.id || null, userName: d.userName || operatorName(d.userId) || SESSION_OP?.name || '', updatedAt: nowStamp() };
  await commit({ put: { interactions: [it], journal: id ? [] : [journalEntry('interaction', `a ${it.done ? 'enregistré' : 'planifié'} ${INTER_TYPES[it.type].label.toLowerCase()} « ${esc(it.title)} » avec <b>${esc(clientName(it.clientId))}</b>`, { type: 'client', id: it.clientId })] } }, { what: 'interaction' });
  return it;
}
async function toggleInteractionDone(id) {
  const cur = interactionById(id); if (!cur) return;
  await commit({ put: { interactions: [{ ...clone(cur), done: !cur.done, updatedAt: nowStamp() }] } }, { what: 'interaction' });
}
async function deleteInteraction(id) {
  requireRight('client.edit', 'supprimer une interaction');
  await commit({ del: { interactions: [id] } }, { what: 'interaction' });
}

/* ══════════════════════════════════════════════════════════════
   FIDÉLITÉ
   ══════════════════════════════════════════════════════════════ */
/* Points d'un achat payé : (TTC ou HT) × points par euro, arrondi à l'inférieur */
function pointsForAchat(a) {
  const L = SETTINGS.loyalty;
  if (!L.enabled || a.status !== 'payee') return 0;
  const t = docTotals(a);
  return Math.floor((L.basis === 'ht' ? t.ht : t.ttc) * (Number(L.pointsPerEuro) || 0));
}
function loyaltyMoveForAchat(a) {
  const pts = pointsForAchat(a);
  if (pts <= 0) return null;
  return { id: uid('fid'), clientId: a.clientId, date: a.date, type: 'gain', points: pts, label: `Achat ${a.number}`, ref: { type: 'achat', id: a.id }, auto: true, userName: SESSION_OP?.name || '', createdAt: nowStamp(), demo: !!a.demo };
}
function tierFor(earned) {
  const t = SETTINGS.loyalty.tiers;
  if (earned >= t.platine) return 'platine';
  if (earned >= t.or) return 'or';
  if (earned >= t.argent) return 'argent';
  if (earned >= t.bronze) return 'bronze';
  return 'none';
}
async function addLoyaltyMovement({ clientId, type, points, label, rewardId = null, date = todayISO() }) {
  requireRight('loyalty.edit', 'modifier les points de fidélité');
  const c = clientById(clientId); if (!c) throw new Error('Choisissez un client.');
  const p = Math.round(Number(points));
  if (!p || isNaN(p)) throw new Error('Le nombre de points doit être un entier non nul.');
  if (!LOYALTY_TYPES[type]) throw new Error('Type de mouvement inconnu.');
  if (type === 'utilisation' && p > 0) throw new Error('Une utilisation de points doit être négative.');
  const L = loyaltyOf(clientId);
  if (p < 0 && L.available + p < 0) throw new Error(`Solde insuffisant : ${fmtNum(L.available, 0)} point(s) disponible(s).`);
  if (!(label || '').trim()) throw new Error('Indiquez le motif du mouvement.');
  const mv = { id: uid('fid'), clientId, date, type, points: p, label: label.trim(), rewardId, ref: null, auto: false, userName: SESSION_OP?.name || '', createdAt: nowStamp() };
  await commit({ put: { fidelite: [mv], journal: [journalEntry('fidelite', `a ${p > 0 ? 'crédité' : 'débité'} ${fmtNum(Math.abs(p), 0)} point(s) ${p > 0 ? 'à' : 'de'} <b>${esc(clientName(c))}</b> (${esc(label)})`, { type: 'client', id: clientId })] } }, { what: 'fidelite' });
  return mv;
}
async function deleteLoyaltyMovement(id) {
  requireRight('loyalty.edit', 'supprimer un mouvement de points');
  const mv = S.fidelite.find(x => x.id === id); if (!mv) return;
  if (mv.auto) throw new Error('Ce mouvement provient d\'un achat : modifiez ou supprimez l\'achat correspondant.');
  if (mv.points > 0 && loyaltyOf(mv.clientId).available - mv.points < 0) throw new Error('Impossible : ces points ont déjà été utilisés.');
  await commit({ del: { fidelite: [id] } }, { what: 'fidelite' });
}
/* Recalcul global (ex. après changement des règles) des points issus des achats */
async function recomputeLoyaltyFromAchats() {
  const del = S.fidelite.filter(f => f.auto).map(f => f.id);
  const put = S.achats.map(a => { const mv = loyaltyMoveForAchat(a); if (mv) { const old = S.fidelite.find(f => f.auto && f.ref?.id === a.id); if (old) { mv.id = old.id; mv.createdAt = old.createdAt; } } return mv; }).filter(Boolean);
  const keep = new Set(put.map(x => x.id));
  await commit({ put: { fidelite: put }, del: { fidelite: del.filter(x => !keep.has(x)) } }, { what: 'fidelite' });
  return put.length;
}

/* ══════════════════════════════════════════════════════════════
   ACHATS (historique des ventes au client)
   ══════════════════════════════════════════════════════════════ */
function validateAchat(d) {
  const e = [];
  if (!d.clientId || !clientById(d.clientId)) e.push('Choisissez le client.');
  if (!d.date) e.push('La date de l\'achat est obligatoire.');
  if (!ACHAT_STATUS[d.status]) e.push('Statut inconnu.');
  validateLines(d.lines, e);
  return e;
}
async function saveAchat(d, id) {
  requireRight('sale.edit', 'enregistrer un achat');
  const errs = validateAchat(d); if (errs.length) throw new Error(errs.join('\n'));
  const fields = { clientId: d.clientId, date: d.date, lines: cleanLines(d.lines), paymentMethod: d.paymentMethod || '', status: d.status, sellerId: d.sellerId || null, seller: operatorName(d.sellerId) || d.seller || SESSION_OP?.name || '', comment: (d.comment || '').trim() };
  let a; const plan = { put: { achats: [], interactions: [], fidelite: [] }, del: { fidelite: [], interactions: [] } };
  if (id) {
    const cur = achatById(id); if (!cur) throw new Error('Achat introuvable.');
    a = { ...clone(cur), ...fields, updatedAt: nowStamp() };
    if (cur.clientId !== a.clientId && cur.invoiceId) throw new Error('Cet achat est lié à une facture : le client ne peut pas être changé.');
  } else {
    const { counters, number } = nextNumber(COUNTERS, 'achats', Number(String(d.date).slice(0, 4)) || undefined);
    a = { id: uid('ach'), number, ...fields, invoiceId: d.invoiceId || null, fromInvoice: !!d.fromInvoice, createdAt: nowStamp(), updatedAt: nowStamp(), demo: !!d.demo };
    plan.kv = { counters };
    plan.put.journal = [journalEntry('achat', `a enregistré l'achat <b>${number}</b> de ${esc(clientName(a.clientId))} (${fmtMoney(docTotals(a).ttc)})`, { type: 'achat', id: a.id })];
  }
  plan.put.achats.push(a);
  /* Points de fidélité : recalculés à chaque enregistrement */
  S.fidelite.filter(f => f.auto && f.ref?.id === a.id).forEach(f => plan.del.fidelite.push(f.id));
  const mv = loyaltyMoveForAchat(a); if (mv) plan.put.fidelite.push(mv);
  /* Interaction automatique « Achat » (créée ou mise à jour) */
  const title = `Achat ${a.number} — ${fmtMoney(docTotals(a).ttc)} (${ACHAT_STATUS[a.status].label.toLowerCase()})`;
  const ex = autoInteractionsOf(a.id)[0];
  plan.put.interactions.push(ex ? { ...clone(ex), clientId: a.clientId, date: a.date, title } : autoInteraction(a.clientId, 'achat', title, { type: 'achat', id: a.id }, { date: a.date, description: a.lines.map(l => `${fmtNum(l.qty)} × ${l.label}`).join('\n') }));
  /* Facture liée en attente : l'achat payé règle la facture */
  if (a.invoiceId && a.status === 'payee') {
    const f = factureById(a.invoiceId);
    if (f && isFactureUnpaid(f)) { const due = factureDue(f); const nf = clone(f); nf.payments = (nf.payments || []).concat([{ id: uid('pay'), date: a.date, amount: due, method: a.paymentMethod, note: 'Règlement de l\'achat ' + a.number }]); nf.status = 'paid'; nf.paidDate = a.date; nf.paymentMethod = a.paymentMethod; plan.put.factures = [nf]; }
  }
  await commit(plan, { what: 'achat' });
  return a;
}
async function deleteAchat(id) {
  requireRight('sale.delete', 'supprimer un achat');
  const a = achatById(id); if (!a) return;
  const put = {};
  if (a.invoiceId && factureById(a.invoiceId)) put.factures = [{ ...clone(factureById(a.invoiceId)), achatId: null }];
  put.journal = [journalEntry('achat', `a supprimé l'achat <b>${esc(a.number)}</b> (${esc(clientName(a.clientId))})`, {})];
  await commit({ put, del: { achats: [id], fidelite: S.fidelite.filter(f => f.ref?.id === id).map(f => f.id), interactions: autoInteractionsOf(id).map(i => i.id) } }, { what: 'achat' });
}

/* ══════════════════════════════════════════════════════════════
   DEVIS
   ══════════════════════════════════════════════════════════════ */
function validateDevis(d) {
  const e = [];
  if (!d.clientId || !clientById(d.clientId)) e.push('Choisissez le client.');
  if (!d.date) e.push('La date du devis est obligatoire.');
  if (!d.validUntil) e.push('La date de validité est obligatoire.');
  else if (d.date && d.validUntil < d.date) e.push('La date de validité doit être postérieure à la date du devis.');
  validateLines(d.lines, e);
  return e;
}
async function saveDevis(d, id) {
  requireRight('sale.edit', 'enregistrer un devis');
  const errs = validateDevis(d); if (errs.length) throw new Error(errs.join('\n'));
  const fields = { clientId: d.clientId, date: d.date, validUntil: d.validUntil, lines: cleanLines(d.lines), comment: (d.comment || '').trim(), sellerId: d.sellerId || SESSION_OP?.id || null };
  let q; const plan = { put: { devis: [], interactions: [] } };
  if (id) {
    const cur = devisById(id); if (!cur) throw new Error('Devis introuvable.');
    if (['accepted', 'refused'].includes(cur.status)) throw new Error('Un devis accepté ou refusé ne peut plus être modifié : dupliquez-le.');
    q = { ...clone(cur), ...fields, updatedAt: nowStamp() };
    const ex = autoInteractionsOf(q.id).find(i => i.ref?.event === 'create');
    if (ex) plan.put.interactions.push({ ...clone(ex), clientId: q.clientId, title: `Devis ${q.number} — ${fmtMoney(docTotals(q).ttc)} TTC` });
  } else {
    const { counters, number } = nextNumber(COUNTERS, 'devis', Number(String(d.date).slice(0, 4)) || undefined);
    q = { id: uid('dev'), number, ...fields, status: d.status && DEVIS_STATUS[d.status] ? d.status : 'draft', history: [{ at: nowStamp(), status: 'draft', by: SESSION_OP?.name || '' }], invoiceId: null, createdAt: nowStamp(), updatedAt: nowStamp(), demo: !!d.demo };
    plan.kv = { counters };
    plan.put.interactions.push(autoInteraction(q.clientId, 'devis', `Devis ${number} — ${fmtMoney(docTotals(q).ttc)} TTC`, { type: 'devis', id: q.id, event: 'create' }, { date: q.date }));
    plan.put.journal = [journalEntry('devis', `a créé le devis <b>${number}</b> pour ${esc(clientName(q.clientId))}`, { type: 'devis', id: q.id })];
  }
  plan.put.devis.push(q);
  await commit(plan, { what: 'devis' });
  return q;
}
async function duplicateDevis(id) {
  const src = devisById(id); if (!src) throw new Error('Devis introuvable.');
  return saveDevis({ clientId: src.clientId, date: todayISO(), validUntil: addDays(todayISO(), Number(SETTINGS.quoteValidityDays) || 30), lines: src.lines.map(l => ({ ...l, id: null })), comment: src.comment });
}
async function setDevisStatus(id, status) {
  requireRight('sale.edit', 'changer le statut d\'un devis');
  const cur = devisById(id); if (!cur || !DEVIS_STATUS[status]) throw new Error('Devis introuvable.');
  if (cur.invoiceId && status !== 'accepted') throw new Error('Ce devis a été transformé en facture : son statut ne peut plus changer.');
  const q = clone(cur); q.status = status; q.updatedAt = nowStamp();
  q.history = (q.history || []).concat([{ at: nowStamp(), status, by: SESSION_OP?.name || '' }]);
  if (status === 'sent') {
    q.sentAt = nowStamp();
    /* Devis renvoyé après expiration : nouvelle période de validité */
    if (q.validUntil < todayISO()) q.validUntil = addDays(todayISO(), Number(SETTINGS.quoteValidityDays) || 30);
  }
  const it = autoInteraction(q.clientId, status === 'sent' ? 'email' : 'devis', `Devis ${q.number} : ${DEVIS_STATUS[status].label.toLowerCase()}`, { type: 'devis', id: q.id, event: status });
  await commit({ put: { devis: [q], interactions: ['sent', 'accepted', 'refused'].includes(status) ? [it] : [], journal: [journalEntry('devis', `a passé le devis <b>${q.number}</b> au statut « ${DEVIS_STATUS[status].label} »`, { type: 'devis', id })] } }, { what: 'devis' });
}
async function deleteDevis(id) {
  requireRight('sale.delete', 'supprimer un devis');
  const q = devisById(id); if (!q) return;
  const put = { journal: [journalEntry('devis', `a supprimé le devis <b>${esc(q.number)}</b> (${esc(clientName(q.clientId))})`, {})] };
  if (q.invoiceId && factureById(q.invoiceId)) put.factures = [{ ...clone(factureById(q.invoiceId)), quoteId: null }];
  await commit({ put, del: { devis: [id], interactions: autoInteractionsOf(id).map(i => i.id) } }, { what: 'devis' });
}
/* Devis accepté → facture émise (lignes recopiées, lien conservé) */
async function convertDevisToFacture(id) {
  const q = devisById(id); if (!q) throw new Error('Devis introuvable.');
  if (q.invoiceId && factureById(q.invoiceId)) throw new Error('Ce devis a déjà été transformé en facture.');
  if (['refused', 'expired'].includes(devisStatus(q))) throw new Error('Un devis refusé ou expiré ne peut pas être facturé.');
  const f = await saveFacture({ clientId: q.clientId, date: todayISO(), dueDate: addDays(todayISO(), Number(SETTINGS.invoiceDueDays) || 30), lines: q.lines.map(l => ({ ...l, id: null })), comment: `Selon devis ${q.number}`, status: 'issued', quoteId: q.id });
  const nq = clone(devisById(id)); nq.invoiceId = f.id;
  if (nq.status !== 'accepted') { nq.status = 'accepted'; nq.history = (nq.history || []).concat([{ at: nowStamp(), status: 'accepted', by: SESSION_OP?.name || '' }]); }
  await commit({ put: { devis: [nq] } }, { what: 'devis' });
  return f;
}

/* ══════════════════════════════════════════════════════════════
   FACTURES
   ══════════════════════════════════════════════════════════════ */
function validateFacture(d) {
  const e = [];
  if (!d.clientId || !clientById(d.clientId)) e.push('Choisissez le client.');
  if (!d.date) e.push('La date de la facture est obligatoire.');
  if (!d.dueDate) e.push('La date d\'échéance est obligatoire.');
  else if (d.date && d.dueDate < d.date) e.push('L\'échéance doit être postérieure à la date de la facture.');
  validateLines(d.lines, e);
  return e;
}
async function saveFacture(d, id) {
  requireRight('sale.edit', 'enregistrer une facture');
  const errs = validateFacture(d); if (errs.length) throw new Error(errs.join('\n'));
  const fields = { clientId: d.clientId, date: d.date, dueDate: d.dueDate, lines: cleanLines(d.lines), paymentMethod: d.paymentMethod || '', comment: (d.comment || '').trim() };
  let f; const plan = { put: { factures: [], interactions: [] } };
  if (id) {
    const cur = factureById(id); if (!cur) throw new Error('Facture introuvable.');
    if (['paid', 'cancelled'].includes(cur.status) || (cur.payments || []).length) throw new Error('Une facture réglée, partiellement réglée ou annulée ne peut plus être modifiée.');
    f = { ...clone(cur), ...fields, updatedAt: nowStamp() };
    const ex = autoInteractionsOf(f.id).find(i => i.ref?.event === 'create');
    if (ex) plan.put.interactions.push({ ...clone(ex), clientId: f.clientId, title: `Facture ${f.number} — ${fmtMoney(docTotals(f).ttc)} TTC` });
  } else {
    const { counters, number } = nextNumber(COUNTERS, 'factures', Number(String(d.date).slice(0, 4)) || undefined);
    const status = ['draft', 'issued'].includes(d.status) ? d.status : 'draft';
    f = { id: uid('fac'), number, ...fields, status, payments: [], paidDate: '', quoteId: d.quoteId || null, achatId: d.achatId || null, history: [{ at: nowStamp(), status, by: SESSION_OP?.name || '' }], createdAt: nowStamp(), updatedAt: nowStamp(), demo: !!d.demo };
    plan.kv = { counters };
    plan.put.interactions.push(autoInteraction(f.clientId, 'facture', `Facture ${number} — ${fmtMoney(docTotals(f).ttc)} TTC`, { type: 'facture', id: f.id, event: 'create' }, { date: f.date }));
    plan.put.journal = [journalEntry('facture', `a créé la facture <b>${number}</b> pour ${esc(clientName(f.clientId))}`, { type: 'facture', id: f.id })];
    if (f.achatId && achatById(f.achatId)) plan.put.achats = [{ ...clone(achatById(f.achatId)), invoiceId: f.id }];
  }
  plan.put.factures.push(f);
  await commit(plan, { what: 'facture' });
  return f;
}
async function setFactureStatus(id, status) {
  requireRight('sale.edit', 'changer le statut d\'une facture');
  const cur = factureById(id); if (!cur) throw new Error('Facture introuvable.');
  const allowed = { draft: ['issued', 'cancelled'], issued: ['cancelled', 'draft'], partial: [], paid: [], cancelled: ['draft'] };
  if (!(allowed[cur.status] || []).includes(status)) throw new Error(`Passage de « ${FACT_STATUS[cur.status].label} » à « ${FACT_STATUS[status].label} » impossible.`);
  if (status === 'cancelled' && (cur.payments || []).length) throw new Error('Des règlements ont été enregistrés : la facture ne peut pas être annulée.');
  const f = clone(cur); f.status = status; f.updatedAt = nowStamp();
  f.history = (f.history || []).concat([{ at: nowStamp(), status, by: SESSION_OP?.name || '' }]);
  await commit({ put: { factures: [f], journal: [journalEntry('facture', `a passé la facture <b>${f.number}</b> au statut « ${FACT_STATUS[status].label} »`, { type: 'facture', id })] } }, { what: 'facture' });
}
/* Règlement (total ou partiel). Facture soldée → achat enregistré (si absent) et points de fidélité */
async function addPayment(id, { date, amount, method, note }) {
  requireRight('sale.edit', 'enregistrer un règlement');
  const cur = factureById(id); if (!cur) throw new Error('Facture introuvable.');
  if (!isFactureUnpaid(cur)) throw new Error('Seule une facture émise ou partiellement payée peut recevoir un règlement.');
  const due = factureDue(cur), amt = round2(amount);
  if (!(amt > 0)) throw new Error('Le montant du règlement doit être positif.');
  if (amt > due + 0.005) throw new Error(`Le montant dépasse le reste à payer (${fmtMoney(due)}).`);
  if (!date) throw new Error('La date du règlement est obligatoire.');
  const f = clone(cur);
  f.payments = (f.payments || []).concat([{ id: uid('pay'), date, amount: amt, method: method || '', note: (note || '').trim() }]);
  const paid = facturePaid(f) >= docTotals(f).ttc - 0.005;
  f.status = paid ? 'paid' : 'partial'; f.paidDate = paid ? date : ''; if (method) f.paymentMethod = method; f.updatedAt = nowStamp();
  f.history = (f.history || []).concat([{ at: nowStamp(), status: f.status, by: SESSION_OP?.name || '', note: `Règlement de ${fmtMoney(amt)}` }]);
  const plan = { put: { factures: [f], interactions: [autoInteraction(f.clientId, 'facture', `Règlement de ${fmtMoney(amt)} — facture ${f.number}${paid ? ' (soldée)' : ''}`, { type: 'facture', id: f.id, event: 'payment' }, { date })], journal: [journalEntry('facture', `a enregistré un règlement de ${fmtMoney(amt)} sur la facture <b>${f.number}</b>`, { type: 'facture', id })] } };
  await commit(plan, { what: 'facture' });
  /* Facture soldée : l'achat correspondant est enregistré ou passé à « Payé » */
  if (paid) {
    if (f.achatId && achatById(f.achatId)) { const a = achatById(f.achatId); if (a.status === 'attente') await saveAchat({ ...a, status: 'payee', paymentMethod: method || a.paymentMethod }, a.id); }
    else await saveAchat({ clientId: f.clientId, date, lines: f.lines, paymentMethod: method || f.paymentMethod, status: 'payee', comment: `Règlement de la facture ${f.number}`, invoiceId: f.id, fromInvoice: true }).then(a => commit({ put: { factures: [{ ...clone(factureById(id)), achatId: a.id }] } }, { what: 'facture' }));
  }
  return factureById(id);
}
async function deleteFacture(id) {
  requireRight('sale.delete', 'supprimer une facture');
  const f = factureById(id); if (!f) return;
  const put = { journal: [journalEntry('facture', `a supprimé la facture <b>${esc(f.number)}</b> (${esc(clientName(f.clientId))})`, {})] };
  if (f.quoteId && devisById(f.quoteId)) put.devis = [{ ...clone(devisById(f.quoteId)), invoiceId: null }];
  if (f.achatId && achatById(f.achatId)) put.achats = [{ ...clone(achatById(f.achatId)), invoiceId: null }];
  await commit({ put, del: { factures: [id], interactions: autoInteractionsOf(id).map(i => i.id) } }, { what: 'facture' });
}
async function duplicateFacture(id) {
  const src = factureById(id); if (!src) throw new Error('Facture introuvable.');
  return saveFacture({ clientId: src.clientId, date: todayISO(), dueDate: addDays(todayISO(), Number(SETTINGS.invoiceDueDays) || 30), lines: src.lines.map(l => ({ ...l, id: null })), paymentMethod: src.paymentMethod, comment: src.comment, status: 'draft' });
}
/* Achat → facture (payée si l'achat est payé) */
async function factureFromAchat(achatId) {
  const a = achatById(achatId); if (!a) throw new Error('Achat introuvable.');
  if (a.invoiceId && factureById(a.invoiceId)) throw new Error('Cet achat a déjà une facture.');
  const f = await saveFacture({ clientId: a.clientId, date: a.date, dueDate: a.status === 'payee' ? a.date : addDays(a.date, Number(SETTINGS.invoiceDueDays) || 30), lines: a.lines.map(l => ({ ...l, id: null })), paymentMethod: a.paymentMethod, comment: `Achat ${a.number}`, status: 'issued', achatId: a.id });
  if (a.status === 'payee') {
    const nf = clone(factureById(f.id)); const t = docTotals(nf).ttc;
    nf.payments = [{ id: uid('pay'), date: a.date, amount: t, method: a.paymentMethod, note: 'Réglé lors de l\'achat ' + a.number }];
    nf.status = 'paid'; nf.paidDate = a.date;
    nf.history.push({ at: nowStamp(), status: 'paid', by: SESSION_OP?.name || '' });
    await commit({ put: { factures: [nf] } }, { what: 'facture' });
  }
  return factureById(f.id);
}

/* ══════════════════════════════════════════════════════════════
   NOTES INTERNES (jamais imprimées sur un document client)
   ══════════════════════════════════════════════════════════════ */
async function saveNote(d, id) {
  requireRight('note.edit', 'modifier une note interne');
  const e = [];
  if (!d.clientId || !clientById(d.clientId)) e.push('Choisissez le client concerné.');
  if (!(d.title || '').trim()) e.push('Le titre de la note est obligatoire.');
  if (!(d.content || '').trim()) e.push('Le contenu de la note est obligatoire.');
  if (!NOTE_PRIO[d.priority]) e.push('Choisissez une priorité.');
  if (!NOTE_STATUS[d.status]) e.push('Choisissez un statut.');
  if (e.length) throw new Error(e.join('\n'));
  const base = id ? clone(noteById(id)) : { id: uid('not'), authorId: SESSION_OP?.id || null, authorName: SESSION_OP?.name || '', createdAt: nowStamp(), demo: !!d.demo };
  const n = { ...base, clientId: d.clientId, date: d.date || base.date || todayISO(), title: d.title.trim(), content: d.content.trim(), priority: d.priority, status: d.status, pinned: !!d.pinned, updatedAt: nowStamp() };
  await commit({ put: { notes: [n], journal: id ? [] : [journalEntry('note', `a ajouté une note interne (${NOTE_PRIO[n.priority].label.toLowerCase()}) sur <b>${esc(clientName(n.clientId))}</b>`, { type: 'client', id: n.clientId })] } }, { what: 'note' });
  return n;
}
async function setNoteStatus(id, status) {
  const cur = noteById(id); if (!cur || !NOTE_STATUS[status]) return;
  await commit({ put: { notes: [{ ...clone(cur), status, updatedAt: nowStamp() }] } }, { what: 'note' });
}
async function deleteNote(id) {
  requireRight('note.edit', 'supprimer une note');
  await commit({ del: { notes: [id] } }, { what: 'note' });
}

/* ══════════════════════════════════════════════════════════════
   DOCUMENTS (fichiers stockés dans IndexedDB)
   ══════════════════════════════════════════════════════════════ */
const MAX_DOC_SIZE = 25 * 1048576;
async function addDocuments(clientId, files, { kind = 'autre', comment = '' } = {}) {
  requireRight('doc.edit', 'ajouter un document');
  if (!clientById(clientId)) throw new Error('Choisissez le client.');
  if (!files.length) throw new Error('Choisissez au moins un fichier.');
  const big = files.filter(f => f.size > MAX_DOC_SIZE);
  if (big.length) throw new Error(`Fichier trop volumineux (25 Mo maximum) : ${big.map(f => f.name).join(', ')}.`);
  if (!DOC_KINDS[kind]) throw new Error('Type de document inconnu.');
  const media = [], docs = [];
  files.forEach(f => {
    const mid = uid('media');
    media.push({ id: mid, blob: f, type: f.type || 'application/octet-stream', name: f.name, size: f.size, at: nowStamp(), demo: false });
    docs.push({ id: uid('doc'), clientId, name: f.name, kind, mediaId: mid, size: f.size, type: f.type || '', date: todayISO(), comment: comment.trim(), createdAt: nowStamp(), userName: SESSION_OP?.name || '' });
  });
  await commit({ put: { media, documents: docs, journal: [journalEntry('document', `a ajouté ${docs.length} document(s) au dossier de <b>${esc(clientName(clientId))}</b>`, { type: 'client', id: clientId })] } }, { what: 'document' });
  return docs;
}
async function updateDocument(id, { name, kind, comment }) {
  requireRight('doc.edit', 'modifier un document');
  const cur = documentById(id); if (!cur) throw new Error('Document introuvable.');
  if (!(name || '').trim()) throw new Error('Le nom du document est obligatoire.');
  if (!DOC_KINDS[kind]) throw new Error('Type de document inconnu.');
  await commit({ put: { documents: [{ ...clone(cur), name: name.trim(), kind, comment: (comment || '').trim(), updatedAt: nowStamp() }] } }, { what: 'document' });
}
async function deleteDocument(id) {
  requireRight('doc.delete', 'supprimer un document');
  const d = documentById(id); if (!d) return;
  await commit({ del: { documents: [id], media: d.mediaId ? [d.mediaId] : [] }, put: { journal: [journalEntry('document', `a supprimé le document « ${esc(d.name)} » de <b>${esc(clientName(d.clientId))}</b>`, { type: 'client', id: d.clientId })] } }, { what: 'document' });
}

/* ══════════════════════════════════════════════════════════════
   CATÉGORIES, RÉGLAGES, OPÉRATEURS
   ══════════════════════════════════════════════════════════════ */
async function saveCategory(d, id) {
  requireRight('category.edit', 'modifier les catégories');
  if (!d.name?.trim()) throw new Error('Le nom de la catégorie est obligatoire.');
  if (S.categories.some(c => c.id !== id && norm(c.name) === norm(d.name))) throw new Error('Une catégorie porte déjà ce nom.');
  const c = id ? { ...clone(categoryById(id)), name: d.name.trim(), description: (d.description || '').trim(), color: Number(d.color) || 1 } : { id: uid('cat'), name: d.name.trim(), description: (d.description || '').trim(), color: Number(d.color) || 1, createdAt: nowStamp(), demo: !!d.demo };
  await commit({ put: { categories: [c] } }, { what: 'category' });
  return c;
}
/* Suppression : les clients de la catégorie passent « Sans catégorie » (pas de référence orpheline) */
async function deleteCategory(id) {
  requireRight('category.edit', 'supprimer une catégorie');
  const clients = S.clients.filter(c => c.categoryId === id).map(c => ({ ...clone(c), categoryId: '' }));
  await commit({ del: { categories: [id] }, put: { clients } }, { what: 'category' });
}
async function saveSettings(patch) {
  const s = { ...SETTINGS, ...patch };
  await commit({ kv: { settings: s } }, { what: 'settings' });
}
async function saveOperators(list) { await commit({ kv: { operators: list } }, { what: 'operators' }); }
