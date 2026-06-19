'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDB } from '@/store/DBContext';
import { useTheme } from '@/store/ThemeContext';
import { expiryStatus, fmt, stockRemaining } from '@/lib/helpers';

interface SearchHit { label: string; sub: string; href: string; icon: string; }

// Quick-create shortcuts. These mirror existing pages only — no new routes, no
// renamed destinations, so the sidebar contract is untouched.
const QUICK_ACTIONS = [
  { label: 'New Slip', href: '/slip', icon: '📄' },
  { label: 'New Invoice', href: '/invoice', icon: '🧾' },
  { label: 'Ledger Entry', href: '/ledger', icon: '📒' },
  { label: 'Add Material', href: '/materials', icon: '📦' },
  { label: 'Add Purchase', href: '/purchases', icon: '📥' },
  { label: 'Add Party', href: '/parties', icon: '🤝' },
];

export default function Topbar({ userEmail }: { userEmail?: string }) {
  const { db } = useDB();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<null | 'search' | 'quick' | 'notif' | 'profile'>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Cmd/Ctrl+K (and "/") focuses global search — a SaaS convention users expect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA')) {
        e.preventDefault();
        searchRef.current?.focus();
        setOpen('search');
      }
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close any popover on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Unified search index across the main masters/records. Read-only — purely a
  // navigation aid that deep-links into the existing pages.
  const hits: SearchHit[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const out: SearchHit[] = [];
    db.materials.forEach(m => {
      if (m.material_name.toLowerCase().includes(term) || (m.hsn_code || '').includes(term))
        out.push({ label: m.material_name, sub: `Material · HSN ${m.hsn_code}`, href: '/materials', icon: '📦' });
    });
    db.parties.forEach(p => {
      if (p.party_name.toLowerCase().includes(term) || (p.gstin || '').toLowerCase().includes(term))
        out.push({ label: p.party_name, sub: `Party · ${p.state}`, href: '/parties', icon: '🤝' });
    });
    db.vehicles.forEach(v => {
      if (v.vehicle_number.toLowerCase().includes(term))
        out.push({ label: v.vehicle_number, sub: `Vehicle · ${v.vehicle_type}`, href: '/vehicles', icon: '🚚' });
    });
    db.slips.forEach(s => {
      if (String(s.slip_id).includes(term) || s.vehicle_number.toLowerCase().includes(term))
        out.push({ label: `Slip #${s.slip_id}`, sub: `${s.vehicle_number} · ₹${fmt(s.final_amount)}`, href: '/slips', icon: '📄' });
    });
    db.invoices.forEach(i => {
      if (String(i.invoice_id).includes(term) || i.vehicle_number.toLowerCase().includes(term))
        out.push({ label: `Invoice #${i.invoice_id}`, sub: `${i.vehicle_number} · ₹${fmt(i.final_amount)}`, href: '/invoices', icon: '🧾' });
    });
    return out.slice(0, 8);
  }, [q, db]);

  // Notification feed derived live from the data — low stock, receivables, doc expiry.
  const notifs = useMemo(() => {
    const list: { icon: string; bg: string; color: string; title: string; sub: string; href: string }[] = [];
    db.materials.forEach(m => {
      const rem = stockRemaining(db, m.id);
      if ((m.min_stock || 0) > 0 && rem <= (m.min_stock || 0))
        list.push({ icon: '⚠', bg: 'var(--red-light)', color: 'var(--red)', title: `${m.material_name} low on stock`, sub: `${fmt(rem)} CFT left · min ${fmt(m.min_stock)} CFT`, href: '/materials' });
    });
    const outstanding = db.slips.filter(s => s.payment_status !== 'paid').reduce((a, s) => a + s.final_amount, 0);
    if (outstanding > 0)
      list.push({ icon: '₹', bg: 'var(--amber-light)', color: 'var(--amber)', title: 'Outstanding receivable', sub: `₹${fmt(outstanding)} pending collection`, href: '/ledger' });
    db.vehicles.forEach(v => {
      (['insurance_expiry', 'fitness_expiry', 'pollution_expiry'] as const).forEach(k => {
        const st = expiryStatus(v[k]);
        if (st === 'expired' || st === 'critical')
          list.push({ icon: '🚚', bg: 'var(--red-light)', color: 'var(--red)', title: `${v.vehicle_number} ${k.replace('_expiry', '')} ${st === 'expired' ? 'expired' : 'due soon'}`, sub: 'Renew vehicle document', href: '/vehicles' });
      });
    });
    return list.slice(0, 12);
  }, [db]);

  const go = (href: string) => { setOpen(null); setQ(''); router.push(href); };
  const initials = (userEmail || 'U').slice(0, 2).toUpperCase();

  return (
    <div className="topbar" ref={wrapRef}>
      {/* Global search */}
      <div className="tb-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
        <input
          ref={searchRef}
          value={q}
          placeholder="Search materials, parties, slips, invoices…"
          onFocus={() => setOpen('search')}
          onChange={e => { setQ(e.target.value); setOpen('search'); }}
          onKeyDown={e => { if (e.key === 'Enter' && hits[0]) go(hits[0].href); }}
        />
        {!q && <kbd>⌘K</kbd>}
        {open === 'search' && q && (
          <div className="tb-pop tb-pop-wide" style={{ left: 0, right: 'auto', width: '100%' }}>
            {hits.length === 0
              ? <div className="tb-pop-item" style={{ color: 'var(--text3)', cursor: 'default' }}>No matches for “{q}”</div>
              : hits.map((h, i) => (
                <div key={i} className="tb-pop-item" onClick={() => go(h.href)}>
                  <span style={{ fontSize: 15 }}>{h.icon}</span>
                  <span style={{ flex: 1 }}>{h.label}<div style={{ fontSize: 10.5, color: 'var(--text3)', fontWeight: 500 }}>{h.sub}</div></span>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="tb-spacer" />

      <div className="tb-actions">
        {/* Quick actions */}
        <div style={{ position: 'relative' }}>
          <button className="tb-btn" title="Quick actions" onClick={() => setOpen(open === 'quick' ? null : 'quick')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          {open === 'quick' && (
            <div className="tb-pop">
              <div className="tb-pop-hd">Quick Create</div>
              {QUICK_ACTIONS.map(a => (
                <Link key={a.href + a.label} href={a.href} className="tb-pop-item" onClick={() => setOpen(null)}>
                  <span style={{ fontSize: 15 }}>{a.icon}</span>{a.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button className="tb-btn" title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'} onClick={toggle}>
          {theme === 'dark'
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.2" y1="4.2" x2="5.6" y2="5.6" /><line x1="18.4" y1="18.4" x2="19.8" y2="19.8" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.2" y1="19.8" x2="5.6" y2="18.4" /><line x1="18.4" y1="5.6" x2="19.8" y2="4.2" /></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>}
        </button>

        {/* Notifications */}
        <div style={{ position: 'relative' }}>
          <button className="tb-btn" title="Notifications" onClick={() => setOpen(open === 'notif' ? null : 'notif')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            {notifs.length > 0 && <span className="tb-dot" />}
          </button>
          {open === 'notif' && (
            <div className="tb-pop tb-pop-wide">
              <div className="tb-pop-hd">Notifications {notifs.length > 0 && `(${notifs.length})`}</div>
              {notifs.length === 0
                ? <div className="tb-notif"><div className="tb-notif-t" style={{ color: 'var(--text3)' }}>All caught up 🎉</div></div>
                : notifs.map((n, i) => (
                  <Link key={i} href={n.href} className="tb-notif" onClick={() => setOpen(null)} style={{ textDecoration: 'none' }}>
                    <div className="tb-notif-ico" style={{ background: n.bg, color: n.color }}>{n.icon}</div>
                    <div><div className="tb-notif-t">{n.title}</div><div className="tb-notif-s">{n.sub}</div></div>
                  </Link>
                ))}
            </div>
          )}
        </div>

        {/* Profile */}
        <div style={{ position: 'relative' }}>
          <div className="tb-profile" onClick={() => setOpen(open === 'profile' ? null : 'profile')}>
            <div className="tb-avatar">{initials}</div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text3)' }}><polyline points="6 9 12 15 18 9" /></svg>
          </div>
          {open === 'profile' && (
            <div className="tb-pop">
              <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>{db.bizInfo.name || 'Your Crusher'}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{userEmail}</div>
              </div>
              <Link href="/settings" className="tb-pop-item" onClick={() => setOpen(null)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                Business Settings
              </Link>
              <form action="/auth/logout" method="post">
                <button type="submit" className="tb-pop-item" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontFamily: 'inherit' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
