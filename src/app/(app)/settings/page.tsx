'use client';

import { useState, useRef } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import { today } from '@/lib/helpers';

export default function SettingsPage() {
  const { db, setDb, replaceDb, resetDb } = useDB();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(db.bizInfo.name);
  const [gstin, setGstin] = useState(db.bizInfo.gstin);
  const [addr, setAddr] = useState(db.bizInfo.address);
  const [phone, setPhone] = useState(db.bizInfo.phone);
  const [savedMsg, setSavedMsg] = useState(false);

  const saveBiz = () => {
    if (!name || !gstin) { toast('Business name and GSTIN are required', 'error'); return; }
    setDb(prev => ({ ...prev, bizInfo: { name, gstin, address: addr, phone } }));
    toast('Business info saved!', 'success');
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  };

  const exportData = () => {
    const data = JSON.stringify(db, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crusher_erp_backup_${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup exported!', 'success');
  };

  const importData = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const d = JSON.parse(e.target!.result as string);
        replaceDb(d);
        toast('Data imported successfully!', 'success');
      } catch {
        toast('Invalid backup file', 'error');
      }
    };
    reader.readAsText(file);
  };

  const clearAll = () => {
    const c1 = prompt('Type RESET to permanently delete all data:');
    if (c1 !== 'RESET') { toast('Reset cancelled', 'warning'); return; }
    const c2 = prompt('Type CONFIRM to confirm:');
    if (c2 !== 'CONFIRM') { toast('Reset cancelled', 'warning'); return; }
    resetDb();
    toast('All data cleared', 'warning');
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Business Settings</div>
          <div className="ps">Configure your crusher plant information</div>
        </div>
      </div>

      <div className="settings-group">
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 16 }}>Business Information</div>
        <div className="fg-row"><label className="flbl">Business / Plant Name <span className="req">*</span></label>
          <input value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="fg-row"><label className="flbl">GSTIN <span className="req">*</span></label>
          <input className="mono" value={gstin} onChange={e => setGstin(e.target.value)} placeholder="03XXXXXXXXXXXXXZX" /></div>
        <div className="fg-row"><label className="flbl">Business Address</label>
          <input value={addr} onChange={e => setAddr(e.target.value)} placeholder="Village/Mohalla, District, Punjab" /></div>
        <div className="fg-row"><label className="flbl">Contact Phone</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="98765XXXXX" /></div>
        <button className="btn btnp" onClick={saveBiz}>✓ Save Business Info</button>
        {savedMsg && <div className="alert alert-success" style={{ marginTop: 8 }}>✓ Business information saved successfully.</div>}
      </div>

      <div className="settings-group">
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 16 }}>Data Management</div>
        <div className="g2">
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Export All Data</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>Download a complete backup of all your data as JSON</div>
            <button className="btn btng" onClick={exportData}>📥 Export Backup</button>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Import Data</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>Restore from a previously exported JSON backup</div>
            <input type="file" ref={fileRef} accept=".json" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) importData(f); }} />
            <button className="btn btnb" onClick={() => fileRef.current?.click()}>📤 Import Backup</button>
          </div>
        </div>
        <div className="divider" />
        <div style={{ background: 'var(--red-light)', border: '1px solid #f4bbb8', borderRadius: 'var(--r)', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>⚠ Danger Zone</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>This will permanently delete all slips, invoices, ledger entries, parties and materials. This cannot be undone.</div>
          <button className="btn btnr" onClick={clearAll}>Reset All Data</button>
        </div>
      </div>

      <div className="settings-group">
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>System Information</div>
        <div className="settings-row"><span style={{ fontSize: 12, color: 'var(--text3)' }}>Version</span><span className="mono" style={{ fontSize: 12 }}>Crusher ERP v7.0 — Next.js</span></div>
        <div className="settings-row"><span style={{ fontSize: 12, color: 'var(--text3)' }}>Total Slips</span><span style={{ fontSize: 12, fontWeight: 700 }}>{db.slips.length}</span></div>
        <div className="settings-row"><span style={{ fontSize: 12, color: 'var(--text3)' }}>Total Invoices</span><span style={{ fontSize: 12, fontWeight: 700 }}>{db.invoices.length}</span></div>
        <div className="settings-row"><span style={{ fontSize: 12, color: 'var(--text3)' }}>Total Parties</span><span style={{ fontSize: 12, fontWeight: 700 }}>{db.parties.length}</span></div>
        <div className="settings-row"><span style={{ fontSize: 12, color: 'var(--text3)' }}>Ledger Entries</span><span style={{ fontSize: 12, fontWeight: 700 }}>{db.ledger.length}</span></div>
        <div className="settings-row"><span style={{ fontSize: 12, color: 'var(--text3)' }}>Storage Used</span><span style={{ fontSize: 12, fontWeight: 700 }}>{(JSON.stringify(db).length / 1024).toFixed(1)} KB</span></div>
      </div>
    </>
  );
}
