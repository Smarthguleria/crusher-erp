'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDB } from '@/store/DBContext';

interface NavItem {
  href: string;
  label: string;
  section?: string;
  icon: JSX.Element;
}

const NAV: NavItem[] = [
  { section: 'Operations', href: '/', label: 'Dashboard', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
  )},
  { href: '/slip', label: 'Generate Slip', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
  )},
  { href: '/invoice', label: 'Generate Invoice', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
  )},
  { section: 'Finance', href: '/ledger', label: 'Credit / Debit Ledger', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
  )},
  { section: 'Analytics', href: '/analytics', label: 'Sales Analytics', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
  )},
  { href: '/stock', label: 'Stock Overview', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
  )},
  { section: 'Records', href: '/slips', label: 'All Slips', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
  )},
  { href: '/invoices', label: 'All Invoices', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
  )},
  { section: 'Fleet', href: '/vehicles', label: 'Vehicles', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 18V6a2 2 0 00-2-2H4a2 2 0 00-2 2v11a1 1 0 001 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 001-1v-3.65a1 1 0 00-.22-.624l-3.48-4.35A1 1 0 0017.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>
  )},
  { href: '/drivers', label: 'Drivers', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
  )},
  { href: '/trips', label: 'Trips', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 00-8 8c0 1.892.402 3.13 1.5 4.5L12 22l6.5-7.5C19.598 13.13 20 11.892 20 10a8 8 0 00-8-8z"/></svg>
  )},
  { href: '/fuel', label: 'Fuel / Diesel', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 22V4a2 2 0 012-2h8a2 2 0 012 2v18"/><path d="M3 14h12"/><path d="M15 11l4-3v9a2 2 0 01-2 2 2 2 0 01-2-2v-2"/></svg>
  )},
  { href: '/maintenance', label: 'Maintenance', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
  )},
  { href: '/tyres', label: 'Tyres', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
  )},

  { section: 'Inventory', href: '/purchases', label: 'Purchases', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="M5 12l7 7 7-7"/></svg>
  )},
  { href: '/suppliers', label: 'Suppliers', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9h18v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path d="M3 9l2-5h14l2 5"/><line x1="12" y1="13" x2="12" y2="17"/></svg>
  )},
  { href: '/expenses', label: 'Expenses', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
  )},

  { section: 'Master Data', href: '/materials', label: 'Materials', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/></svg>
  )},
  { href: '/ctf-calculator', label: 'CTF Calculator', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>
  )},
  { href: '/parties', label: 'Parties', icon: (
    <svg className="nsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
  )},
];

export default function Sidebar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const { db, syncing } = useDB();
  return (
    <div className="sidebar">
      <div className="brand">
        <div className="brand-logo">
          <div className="brand-icon">🪨</div>
          <div>
            <div className="brand-t">Crusher ERP</div>
            <div className="brand-s">PUNJAB GST v6{syncing ? ' • saving…' : ''}</div>
          </div>
        </div>
      </div>
      <nav className="snav">
        {NAV.map((item, i) => {
          const isActive = pathname === item.href;
          return (
            <div key={i}>
              {item.section && <div className="ns">{item.section}</div>}
              <Link href={item.href} className={`ni ${isActive ? 'active' : ''}`}>
                {item.icon}
                <span>{item.label}</span>
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <Link href="/settings" className="biz-pill" style={{ display: 'block' }}>
          <div className="biz-name">{db.bizInfo.name || 'Your Crusher'}</div>
          <div className="biz-gstin">{db.bizInfo.gstin || '—'}</div>
        </Link>
        {userEmail && (
          <form action="/auth/logout" method="post" className="user-pill">
            <span className="user-pill-email" title={userEmail}>{userEmail}</span>
            <button type="submit" className="user-pill-logout">Sign out</button>
          </form>
        )}
      </div>
    </div>
  );
}
