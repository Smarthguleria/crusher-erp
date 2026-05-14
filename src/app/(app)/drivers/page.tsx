'use client';

import { useMemo, useState } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import NumberInput from '@/components/NumberInput';
import { driverHasLinkedRecords, expiryBadge, expiryLabel, expiryStatus, fmt, isValidPhone, recordAssignmentChange } from '@/lib/helpers';
import type { Driver } from '@/lib/types';

interface DriverForm {
  driver_id?: number;
  driver_name: string;
  phone: string;
  license_number: string;
  license_expiry: string;
  address: string;
  vehicle_id: string;
  salary_type: 'monthly' | 'per_trip' | 'daily';
  salary_amount: string;
  status: 'active' | 'inactive';
}

const EMPTY: DriverForm = {
  driver_name: '', phone: '', license_number: '', license_expiry: '',
  address: '', vehicle_id: '', salary_type: 'monthly', salary_amount: '', status: 'active',
};

export default function DriversPage() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const [form, setForm] = useState<DriverForm | null>(null);
  const [search, setSearch] = useState('');
  const [confirmDel, setConfirmDel] = useState<{ id: number; name: string } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return db.drivers;
    return db.drivers.filter(d =>
      d.driver_name.toLowerCase().includes(q) ||
      (d.phone || '').includes(q) ||
      (d.license_number || '').toLowerCase().includes(q)
    );
  }, [db.drivers, search]);

  const open = (d?: Driver) => {
    if (d) {
      setForm({
        driver_id: d.driver_id,
        driver_name: d.driver_name,
        phone: d.phone || '',
        license_number: d.license_number || '',
        license_expiry: d.license_expiry || '',
        address: d.address || '',
        vehicle_id: d.vehicle_id ? String(d.vehicle_id) : '',
        salary_type: d.salary_type || 'monthly',
        salary_amount: d.salary_amount ? String(d.salary_amount) : '',
        status: d.status,
      });
    } else {
      setForm({ ...EMPTY });
    }
  };

  const save = () => {
    if (!form) return;
    if (!form.driver_name.trim()) { toast('Driver name is required', 'error'); return; }
    if (form.phone && !isValidPhone(form.phone)) { toast('Phone must be 10 digits (starts 6-9)', 'error'); return; }

    setDb(prev => {
      const next = { ...prev, drivers: [...prev.drivers], vehicles: [...prev.vehicles], vehicle_assignments: [...prev.vehicle_assignments], counters: { ...prev.counters } };
      const id = form.driver_id || (next.counters.driver++);
      const data: Driver = {
        driver_id: id,
        driver_name: form.driver_name.trim(),
        phone: form.phone.trim(),
        license_number: form.license_number.trim().toUpperCase(),
        license_expiry: form.license_expiry || undefined,
        address: form.address.trim(),
        vehicle_id: form.vehicle_id ? parseInt(form.vehicle_id) : undefined,
        salary_type: form.salary_type,
        salary_amount: form.salary_amount ? parseFloat(form.salary_amount) : undefined,
        status: form.status,
      };
      if (form.driver_id) {
        const i = next.drivers.findIndex(d => d.driver_id === form.driver_id);
        if (i >= 0) next.drivers[i] = data;
      } else {
        next.drivers.push(data);
      }
      // Bidirectional link cleanup — symmetric to the Vehicles page logic.
      if (data.vehicle_id) {
        next.drivers.forEach(d => {
          if (d.driver_id !== id && d.vehicle_id === data.vehicle_id) d.vehicle_id = undefined;
        });
        const v = next.vehicles.find(x => x.vehicle_id === data.vehicle_id);
        if (v) v.driver_id = id;
      } else {
        // Driver no longer assigned — clear any vehicle that still pointed here.
        next.vehicles.forEach(v => { if (v.driver_id === id) v.driver_id = undefined; });
      }
      // Audit trail: open / close history rows to mirror the new live pairing.
      recordAssignmentChange(next);
      return next;
    });
    toast(form.driver_id ? 'Driver updated!' : 'Driver added!', 'success');
    setForm(null);
  };

  const requestDelete = (d: Driver) => {
    const links = driverHasLinkedRecords(db, d.driver_id);
    if (links.total > 0) {
      const parts = [];
      if (links.trips) parts.push(`${links.trips} trip${links.trips > 1 ? 's' : ''}`);
      if (links.fuel) parts.push(`${links.fuel} fuel log${links.fuel > 1 ? 's' : ''}`);
      if (links.vehicles) parts.push(`${links.vehicles} vehicle assignment`);
      toast(`Cannot delete ${d.driver_name} — linked to ${parts.join(', ')}.`, 'error', 6000);
      return;
    }
    setConfirmDel({ id: d.driver_id, name: d.driver_name });
  };

  const performDelete = () => {
    if (!confirmDel) return;
    setDb(prev => ({ ...prev, drivers: prev.drivers.filter(d => d.driver_id !== confirmDel.id) }));
    toast('Driver deleted', 'warning');
    setConfirmDel(null);
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Driver Management</div>
          <div className="ps">{db.drivers.length} drivers · {db.drivers.filter(d => d.status === 'active').length} active</div>
        </div>
        <button className="btn btnp" onClick={() => open()}>+ Add Driver</button>
      </div>

      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <div className="search-wrap" style={{ flex: 1, minWidth: 220 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, license…" />
        </div>
        {search && <button className="btn btn-sm" onClick={() => setSearch('')}>Clear</button>}
      </div>

      <div className="card">
        {db.drivers.length === 0 ? (
          <div className="empty"><div className="empty-icon">👨‍✈️</div>No drivers yet. Add drivers to assign them to vehicles and trips.</div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">🔍</div>No drivers match "{search}"</div>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Driver</th><th>Phone</th><th>License</th><th>License Expiry</th>
                  <th>Vehicle</th><th>Salary</th><th>Trips</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => {
                  const v = db.vehicles.find(x => x.vehicle_id === d.vehicle_id);
                  const lic = expiryStatus(d.license_expiry);
                  const tripCount = db.trips.filter(t => t.driver_id === d.driver_id).length;
                  return (
                    <tr key={d.driver_id}>
                      <td style={{ fontWeight: 700 }}>{d.driver_name}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{d.phone || '—'}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{d.license_number || '—'}</td>
                      <td><span className={`badge ${expiryBadge(lic)}`}>{expiryLabel(lic, d.license_expiry)}</span></td>
                      <td className="mono" style={{ fontSize: 11 }}>{v?.vehicle_number || <span style={{ color: 'var(--text3)', fontFamily: 'inherit' }}>Unassigned</span>}</td>
                      <td style={{ fontSize: 11.5 }}>
                        {d.salary_amount ? `₹${fmt(d.salary_amount)} / ${d.salary_type === 'per_trip' ? 'trip' : d.salary_type}` : '—'}
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>{tripCount}</td>
                      <td>
                        <span className={`badge ${d.status === 'active' ? 'bg' : 'badge-gray'}`}>
                          {d.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => open(d)}>Edit</button>
                        <button className="btn btn-sm" onClick={() => requestDelete(d)} style={{ color: 'var(--red)', borderColor: 'var(--red)', marginLeft: 4 }}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && (
        <Modal title={form.driver_id ? 'Edit Driver' : 'Add Driver'} onClose={() => setForm(null)}>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Driver Name <span className="req">*</span></label>
              <input value={form.driver_name} onChange={e => setForm({ ...form, driver_name: e.target.value })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Phone (10 digits)</label>
              <NumberInput mode="integer" maxLength={10} value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
            </div>
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">License Number</label>
              <input className="mono" value={form.license_number} onChange={e => setForm({ ...form, license_number: e.target.value.toUpperCase() })} />
            </div>
            <div className="fg-row">
              <label className="flbl">License Expiry</label>
              <input type="date" value={form.license_expiry} onChange={e => setForm({ ...form, license_expiry: e.target.value })} />
            </div>
          </div>
          <div className="fg-row">
            <label className="flbl">Address</label>
            <textarea rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={{ resize: 'vertical' }} />
          </div>
          <div className="g3">
            <div className="fg-row">
              <label className="flbl">Assigned Vehicle</label>
              <select value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })}>
                <option value="">— Unassigned —</option>
                {db.vehicles.filter(v => v.status === 'active').map(v =>
                  <option key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_number} ({v.vehicle_type})</option>
                )}
              </select>
            </div>
            <div className="fg-row">
              <label className="flbl">Salary Type</label>
              <select value={form.salary_type} onChange={e => setForm({ ...form, salary_type: e.target.value as any })}>
                <option value="monthly">Monthly</option>
                <option value="per_trip">Per Trip</option>
                <option value="daily">Daily</option>
              </select>
            </div>
            <div className="fg-row">
              <label className="flbl">Salary Amount (₹)</label>
              <NumberInput mode="decimal" value={form.salary_amount} onChange={v => setForm({ ...form, salary_amount: v })} />
            </div>
          </div>
          <div className="fg-row">
            <label className="flbl">Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btnp" style={{ flex: 1 }} onClick={save}>{form.driver_id ? 'Update Driver' : 'Add Driver'}</button>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Delete driver?"
          message={`Permanently delete "${confirmDel.name}"?\n\nNo trips, fuel logs or vehicle assignments are linked. Cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={performDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </>
  );
}
