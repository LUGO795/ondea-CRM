/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — engine.js
   Calculs à partir des données RÉELLEMENT enregistrées :
     • indicateurs par client (CA, panier moyen, dernière activité,
       impayés, fidélité, niveau) ;
     • clients actifs / inactifs, clients à relancer ;
     • séries pour les graphiques (CA, nouveaux clients, devis…).
   Aucune intelligence artificielle externe : des règles transparentes.
   Les résultats sont mis en cache et recalculés uniquement quand les
   données changent (variable VERSION de store.js) → l'application reste
   rapide avec plusieurs centaines de clients.
   ██████████████████████████████████████████████████████████████ */
"use strict";

/* Achats comptés dans le chiffre d'affaires : payés ou en attente de paiement */
const isRevenue = a => a.status === 'payee' || a.status === 'attente';

/* ---------- Cache des indicateurs par client ---------- */
let _cmCache = { v: -1, map: null };
function clientMetricsAll() {
  if (_cmCache.v === VERSION) return _cmCache.map;
  const map = new Map();
  const blank = c => ({ spent: 0, spentHT: 0, nAchats: 0, firstPurchase: null, lastPurchase: null, lastActivity: dayOf(c.createdAt) || null, unpaid: 0, overdue: 0, nLate: 0, openQuotes: 0, openQuotesValue: 0, nInteractions: 0, nNotes: 0, nDocs: 0, nContacts: 0, earned: 0, used: 0, available: 0, lastLoyalty: null, todo: 0, overdueTasks: 0 });
  S.clients.forEach(c => map.set(c.id, blank(c)));
  const bump = (m, day) => { if (day && (!m.lastActivity || day > m.lastActivity)) m.lastActivity = day; };
  const today = todayISO();
  for (const a of S.achats) {
    const m = map.get(a.clientId); if (!m) continue;
    if (isRevenue(a)) {
      const t = docTotals(a);
      m.spent += t.ttc; m.spentHT += t.ht; m.nAchats++;
      if (!m.firstPurchase || a.date < m.firstPurchase) m.firstPurchase = a.date;
      if (!m.lastPurchase || a.date > m.lastPurchase) m.lastPurchase = a.date;
    }
    bump(m, a.date);
  }
  for (const q of S.devis) {
    const m = map.get(q.clientId); if (!m) continue;
    bump(m, q.date);
    if (devisStatus(q) === 'sent') { m.openQuotes++; m.openQuotesValue += docTotals(q).ttc; }
  }
  for (const f of S.factures) {
    const m = map.get(f.clientId); if (!m) continue;
    bump(m, f.date);
    if (isFactureUnpaid(f)) { const due = factureDue(f); m.unpaid += due; if (factureStatus(f) === 'late') { m.overdue += due; m.nLate++; } }
  }
  for (const i of S.interactions) {
    const m = map.get(i.clientId); if (!m) continue;
    m.nInteractions++;
    if (i.done) bump(m, i.date);
    else { m.todo++; if (i.date < today) m.overdueTasks++; }
  }
  for (const f of S.fidelite) {
    const m = map.get(f.clientId); if (!m) continue;
    if (f.points > 0) m.earned += f.points; else m.used += -f.points;
    if (!m.lastLoyalty || f.date > m.lastLoyalty) m.lastLoyalty = f.date;
    if (!f.auto) bump(m, f.date);
  }
  S.notes.forEach(n => { const m = map.get(n.clientId); if (m) m.nNotes++; });
  S.documents.forEach(d => { const m = map.get(d.clientId); if (m) m.nDocs++; });
  S.contacts.forEach(ct => { const m = map.get(ct.clientId); if (m) m.nContacts++; });
  map.forEach(m => {
    m.spent = round2(m.spent); m.spentHT = round2(m.spentHT); m.unpaid = round2(m.unpaid); m.overdue = round2(m.overdue);
    m.avgBasket = m.nAchats ? round2(m.spent / m.nAchats) : 0;
    m.available = m.earned - m.used;
    m.tier = tierFor(m.earned);
  });
  _cmCache = { v: VERSION, map };
  return map;
}
const metricsOf = id => clientMetricsAll().get(id) || null;

/* ---------- Fidélité d'un client ---------- */
function loyaltyOf(id) {
  const m = metricsOf(id) || { earned: 0, used: 0, available: 0, tier: 'none', lastLoyalty: null };
  const T = SETTINGS.loyalty.tiers;
  const idx = TIER_ORDER.indexOf(m.tier);
  const next = TIER_ORDER[idx + 1] || null;
  const nextAt = next ? T[next] : null;
  const prevAt = m.tier === 'none' ? 0 : T[m.tier];
  return {
    available: m.available, earned: m.earned, used: m.used, tier: m.tier, lastActivity: m.lastLoyalty,
    next, toNext: next ? Math.max(0, nextAt - m.earned) : 0,
    progress: next ? clamp((m.earned - prevAt) / Math.max(1, nextAt - prevAt) * 100, 0, 100) : 100
  };
}
const tierChip = (tier, xs = false) => `<span class="tier ${tier} ${xs ? 'xs' : ''}">${svg(TIERS[tier].icon)}${TIERS[tier].label}</span>`;
const clientStatusChip = (c, xs = false) => { const s = CLIENT_STATUS[c.status] || CLIENT_STATUS.actif; return `<span class="chip ${s.cls} ${xs ? 'xs' : ''}">${svg(s.icon)}${s.label}</span>`; };

/* ---------- Activité : actif / inactif ----------
   Un client (non archivé) est « actif » s'il a eu une activité (achat, devis,
   facture, interaction réalisée) depuis moins de N jours (Paramètres). */
function daysSinceActivity(c) { const m = metricsOf(c.id); return m?.lastActivity ? daysBetween(m.lastActivity, todayISO()) : Infinity; }
const isArchived = c => c.status === 'archive';
const isActiveClient = c => !isArchived(c) && daysSinceActivity(c) <= (Number(SETTINGS.inactiveDays) || 180);
const isInactiveClient = c => !isArchived(c) && !isActiveClient(c);

/* ---------- Clients à relancer (raisons expliquées) ---------- */
let _followCache = { v: -1, list: [] };
function clientsToFollow() {
  if (_followCache.v === VERSION) return _followCache.list;
  const out = [];
  S.clients.filter(c => !isArchived(c)).forEach(c => {
    const m = metricsOf(c.id); const reasons = []; let prio = 0;
    if (m.nLate) { reasons.push(`${m.nLate} facture(s) en retard (${fmtMoney(m.overdue)})`); prio = Math.max(prio, 4); }
    if (m.overdueTasks) { reasons.push(`${m.overdueTasks} relance(s) planifiée(s) dépassée(s)`); prio = Math.max(prio, 3); }
    if (c.status === 'relance') { reasons.push('Statut « À relancer »'); prio = Math.max(prio, 3); }
    const exp = S.devis.filter(q => q.clientId === c.id && devisStatus(q) === 'sent' && q.validUntil && daysBetween(todayISO(), q.validUntil) <= 7);
    if (exp.length) { reasons.push(`${exp.length} devis expire(nt) sous 7 jours`); prio = Math.max(prio, 2); }
    if ((c.status === 'vip' || c.status === 'actif') && isInactiveClient(c)) { reasons.push(`Aucune activité depuis ${daysSinceActivity(c) === Infinity ? 'la création' : daysSinceActivity(c) + ' jours'}`); prio = Math.max(prio, c.status === 'vip' ? 3 : 2); }
    if (reasons.length) out.push({ client: c, reasons, prio });
  });
  out.sort((a, b) => b.prio - a.prio || (metricsOf(b.client.id).spent - metricsOf(a.client.id).spent));
  _followCache = { v: VERSION, list: out };
  return out;
}

/* ---------- Tâches planifiées (interactions non réalisées) ---------- */
function pendingTasks() { return S.interactions.filter(i => !i.done).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))); }
const isTaskOverdue = i => !i.done && i.date < todayISO();
/* Nombre affiché sur la cloche : relances dues aujourd'hui ou en retard + factures en retard */
function bellCount() { const t = todayISO(); return S.interactions.filter(i => !i.done && i.date <= t).length + S.factures.filter(f => factureStatus(f) === 'late').length; }

/* ══════════════════════════════════════════════════════════════
   PÉRIODES ET SÉRIES (même moteur que la suite Ondea)
   ══════════════════════════════════════════════════════════════ */
function periodFromKey(key, custom = {}) {
  const t = todayISO();
  if (key === '30') return { from: addDays(t, -29), to: t, label: '30 derniers jours' };
  if (key === '90') return { from: addDays(t, -89), to: t, label: '90 derniers jours' };
  if (key === '365') return { from: addDays(t, -364), to: t, label: '12 derniers mois' };
  if (key === 'year') return { from: t.slice(0, 4) + '-01-01', to: t, label: 'Année ' + t.slice(0, 4) };
  if (key === 'all') { const first = [...S.clients.map(c => dayOf(c.createdAt)), ...S.achats.map(a => a.date)].filter(Boolean).sort()[0] || addDays(t, -364); return { from: first < t ? first : addDays(t, -29), to: t, label: 'Depuis le début' }; }
  if (key === 'custom' && custom.from && custom.to) {
    const [a, b] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
    return { from: a, to: b, label: `Du ${fmtDate(a)} au ${fmtDate(b)}` };
  }
  return { from: addDays(t, -364), to: t, label: '12 derniers mois' };
}
const inP = (day, P) => !!day && day >= P.from && day <= P.to;

/* Regroupement automatique : jour (≤ 31 j), semaine (≤ 120 j), mois au-delà */
function bucketsFor(P, forced) {
  const days = daysBetween(P.from, P.to) + 1;
  const mode = forced || (days <= 31 ? 'day' : days <= 120 ? 'week' : 'month');
  const out = [];
  if (mode === 'day') {
    for (let d = P.from; d <= P.to; d = addDays(d, 1)) out.push({ from: d, to: d, label: fmtDayShort(d) });
  } else if (mode === 'week') {
    let d = P.from;
    while (d <= P.to) { const e = addDays(d, 6) > P.to ? P.to : addDays(d, 6); out.push({ from: d, to: e, label: 'Sem. ' + fmtDayShort(d) }); d = addDays(e, 1); }
  } else {
    let d = P.from;
    while (d <= P.to) {
      const dt = new Date(d + 'T12:00:00');
      const end = localISO(new Date(dt.getFullYear(), dt.getMonth() + 1, 0));
      const e = end > P.to ? P.to : end;
      out.push({ from: d, to: e, label: dt.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }) });
      d = addDays(e, 1);
    }
  }
  return { mode, buckets: out };
}
function bucketIndex(buckets, day) {
  let lo = 0, hi = buckets.length - 1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (day < buckets[mid].from) hi = mid - 1; else if (day > buckets[mid].to) lo = mid + 1; else return mid; }
  return -1;
}

/* Série commerciale : CA (TTC), nombre d'achats, devis émis, nouveaux clients, panier moyen */
function salesSeries(P, forced) {
  const { mode, buckets } = bucketsFor(P, forced);
  const z = () => buckets.map(() => 0);
  const ca = z(), caHT = z(), nAch = z(), quotes = z(), newC = z(), accepted = z();
  S.achats.forEach(a => { if (!isRevenue(a)) return; const i = bucketIndex(buckets, a.date); if (i < 0) return; const t = docTotals(a); ca[i] += t.ttc; caHT[i] += t.ht; nAch[i]++; });
  S.devis.forEach(q => { const i = bucketIndex(buckets, q.date); if (i < 0) return; quotes[i] += docTotals(q).ttc; if (q.status === 'accepted') accepted[i] += docTotals(q).ttc; });
  S.clients.forEach(c => { const i = bucketIndex(buckets, dayOf(c.createdAt)); if (i >= 0) newC[i]++; });
  return { mode, buckets, ca: ca.map(round2), caHT: caHT.map(round2), nAch, quotes: quotes.map(round2), accepted: accepted.map(round2), newC, basket: ca.map((v, i) => nAch[i] ? round2(v / nAch[i]) : 0) };
}
/* Nombre total de clients à la fin de chaque période */
function clientCountSeries(P) {
  const { buckets } = bucketsFor(P);
  const days = S.clients.map(c => dayOf(c.createdAt)).sort();
  return { buckets, values: buckets.map(b => { let n = 0; for (const d of days) { if (d <= b.to) n++; else break; } return n; }) };
}

/* Indicateurs du tableau de bord sur une période */
function dashboardKpis(P) {
  const live = S.clients.filter(c => !isArchived(c));
  const ach = S.achats.filter(a => isRevenue(a) && inP(a.date, P));
  const ca = round2(sum(ach, a => docTotals(a).ttc));
  const unpaid = S.factures.filter(isFactureUnpaid);
  return {
    total: live.length, archived: S.clients.length - live.length,
    newClients: S.clients.filter(c => inP(dayOf(c.createdAt), P)).length,
    active: live.filter(isActiveClient).length, inactive: live.filter(isInactiveClient).length,
    ca, nAchats: ach.length, basket: ach.length ? round2(ca / ach.length) : 0,
    pendingQuotes: S.devis.filter(q => devisStatus(q) === 'sent').length,
    pendingQuotesValue: round2(sum(S.devis.filter(q => devisStatus(q) === 'sent'), q => docTotals(q).ttc)),
    unpaidCount: unpaid.length, unpaidValue: round2(sum(unpaid, factureDue)),
    lateCount: unpaid.filter(f => factureStatus(f) === 'late').length,
    points: sum([...clientMetricsAll().values()], m => m.available)
  };
}

/* Classement du CA par client sur une période */
function revenueByClient(P) {
  const map = new Map();
  S.achats.forEach(a => { if (!isRevenue(a) || !inP(a.date, P)) return; const r = map.get(a.clientId) || { clientId: a.clientId, value: 0, n: 0 }; r.value += docTotals(a).ttc; r.n++; map.set(a.clientId, r); });
  return [...map.values()].map(r => ({ ...r, value: round2(r.value) })).sort((a, b) => b.value - a.value);
}
/* Clients les plus actifs : interactions + achats + devis sur la période */
function mostActiveClients(P) {
  const map = new Map();
  const add = id => map.set(id, (map.get(id) || 0) + 1);
  S.interactions.forEach(i => { if (i.done && inP(i.date, P)) add(i.clientId); });
  S.achats.forEach(a => { if (inP(a.date, P)) add(a.clientId); });
  return [...map.entries()].filter(([id]) => clientById(id)).map(([clientId, value]) => ({ clientId, value })).sort((a, b) => b.value - a.value);
}
/* Répartition par statut / catégorie / niveau de fidélité */
function distribution(keyFn, labelFn) {
  const map = new Map();
  S.clients.forEach(c => { const k = keyFn(c); map.set(k, (map.get(k) || 0) + 1); });
  return [...map.entries()].map(([k, value]) => ({ key: k, name: labelFn(k), value })).sort((a, b) => b.value - a.value);
}
function devisOutcome(P) {
  const r = { draft: 0, sent: 0, accepted: 0, refused: 0, expired: 0 };
  S.devis.forEach(q => { if (inP(q.date, P)) r[devisStatus(q)]++; });
  const decided = r.accepted + r.refused + r.expired;
  return { ...r, rate: decided ? r.accepted / decided * 100 : null };
}
function facturesOutcome(P) {
  const r = { paid: 0, unpaid: 0, late: 0, paidValue: 0, unpaidValue: 0, lateValue: 0 };
  S.factures.forEach(f => {
    if (!inP(f.date, P) || f.status === 'draft' || f.status === 'cancelled') return;
    const st = factureStatus(f);
    if (st === 'paid') { r.paid++; r.paidValue += docTotals(f).ttc; }
    else if (st === 'late') { r.late++; r.lateValue += factureDue(f); r.paidValue += facturePaid(f); }
    else { r.unpaid++; r.unpaidValue += factureDue(f); r.paidValue += facturePaid(f); }
  });
  ['paidValue', 'unpaidValue', 'lateValue'].forEach(k => r[k] = round2(r[k]));
  return r;
}
/* Délai moyen de paiement (jours entre facture et solde) */
function avgPaymentDelay(P) {
  const paid = S.factures.filter(f => f.status === 'paid' && f.paidDate && inP(f.paidDate, P));
  if (!paid.length) return null;
  return sum(paid, f => Math.max(0, daysBetween(f.date, f.paidDate))) / paid.length;
}
