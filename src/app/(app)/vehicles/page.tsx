'use client';

import { useMemo, useState } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import NumberInput from '@/components/NumberInput';
import { expiryBadge, expiryLabel, expiryStatus, isValidPhone, vehicleHasLinkedRecords, vehicleMileage } from '@/lib/helpers';
import type { Vehicle } from '@/lib/types';

interface VehicleForm {
  vehicle_id?: number;
  vehicle_number: string;
  vehicle_type: string;
  owner_name: string;
  driver_id: string;
  phone: string;
  rc_number: string;
  insurance_expiry: string;
  fitness_expiry: string;
  pollution_expiry: string;
  avg_mileage: string;
  status: 'active' | 'inactive';
  notes: string;
}

const EMPTY: VehicleForm = {
  vehicle_number: '', vehicle_type: 'Tipper', owner_name: '', driver_id: '',
  phone: '', rc_number: '', insurance_expiry: '', fitness_expiry: '', pollution_expiry: '',
  avg_mileage: '', status: 'active', notes: '',
};

const VEHICLE_TYPES = ['Tipper', 'Trailer', 'Dumper', 'Truck', 'Mini Truck', 'Tractor', 'JCB', 'Other'];

export default function VehiclesPage() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const [form, setForm] = useState<VehicleForm | null>(null);
  const [search, setSearch] = useState('');
  const [confirmDel, setConfirmDel] = useState<{ id: number; name: string } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return db.vehicles;
    return db.vehicles.filter(v =>
      v.vehicle_number.toLowerCase().includes(q) ||
      v.vehicle_type.toLowerCase().includes(q) ||
      (v.owner_name || '').toLowerCase().includes(q) ||
      (v.rc_number || '').toLowerCase().includes(q)
    );
  }, [db.vehicles, search]);

  // Aggregate alert counts for the header strip. 'critical' (≤7 days) bumps the urgent
  // count alongside expired so the operator sees the most time-sensitive items first.
  const alertStats = useMemo(() => {
    let expired = 0, critical = 0, soon = 0;
    db.vehicles.forEach(v => {
      [v.insurance_expiry, v.fitness_expiry, v.pollution_expiry].forEach(d => {
        const s = expiryStatus(d);
        if (s === 'expired') expired++;
        else if (s === 'critical') critical++;
        else if (s === 'soon') soon++;
      });
    });
    return { expired, critical, soon };
  }, [db.vehicles]);

  const open = (v?: Vehicle) => {
    if (v) {
      setForm({
        vehicle_id: v.vehicle_id,
        vehicle_number: v.vehicle_number,
        vehicle_type: v.vehicle_type,
        owner_name: v.owner_name || '',
        driver_id: v.driver_id ? String(v.driver_id) : '',
        phone: v.phone || '',
        rc_number: v.rc_number || '',
        insurance_expiry: v.insurance_expiry || '',
        fitness_expiry: v.fitness_expiry || '',
        pollution_expiry: v.pollution_expiry || '',
        avg_mileage: v.avg_mileage ? String(v.avg_mileage) : '',
        status: v.status,
        notes: v.notes || '',
      });
    } else {
      setForm({ ...EMPTY });
    }
  };

  const save = () => {
    if (!form) return;
    if (!form.vehicle_number.trim()) { toast('Vehicle number is required', 'error'); return; }
    if (form.phone && !isValidPhone(form.phone)) { toast('Phone must be 10 digits (starts 6-9)', 'error'); return; }

    setDb(prev => {
      const next = { ...prev, vehicles: [...prev.vehicles], drivers: [...prev.drivers], counters: { ...prev.counters } };
      const id = form.vehicle_id || (next.counters.vehicle++);
      const data: Vehicle = {
        vehicle_id: id,
        vehicle_number: form.vehicle_number.toUpperCase().trim(),
        vehicle_type: form.vehicle_type,
        owner_name: form.owner_name.trim(),
        driver_id: form.driver_id ? parseInt(form.driver_id) : undefined,
        phone: form.phone.trim(),
        rc_number: form.rc_number.trim(),
        insurance_expiry: form.insurance_expiry || undefined,
        fitness_expiry: form.fitness_expiry || undefined,
        pollution_expiry: form.pollution_expiry || undefined,
        avg_mileage: form.avg_mileage ? parseFloat(form.avg_mileage) : undefined,
        status: form.status,
        notes: form.notes.trim(),
      };
      if (form.vehicle_id) {
        const i = next.vehicles.findIndex(v => v.vehicle_id === form.vehicle_id);
        if (i >= 0) next.vehicles[i] = data;
      } else {
        next.vehicles.push(data);
      }
      // Bidirectional link cleanup. The relationship is 1:1 — a driver can only be assigned
      // to one vehicle, and vice versa. So when this vehicle now claims a driver, we must
      // (a) clear that driver from any *other* vehicle that still pointed to them, and
      // (b) point the driver back at this vehicle. We must also clear the driver_id of
      // whoever previously held this vehicle's old driver, so no stale links remain.
      if (data.driver_id) {
        next.vehicles.forEach(v => {
          if (v.vehicle_id !== id && v.driver_id === data.driver_id) v.driver_id = undefined;
        });
        const d = next.drivers.find(x => x.driver_id === data.driver_id);
        if (d) d.vehicle_id = id;
      } else {
        // Vehicle now has no driver — clear any driver that was previously pointing here.
        next.drivers.forEach(d => { if (d.vehicle_id === id) d.vehicle_id = undefined; });
      }
      return next;
    });
    toast(form.vehicle_id ? 'Vehicle updated!' : 'Vehicle added!', 'success');
    setForm(null);
  };

  const requestDelete = (v: Vehicle) => {
    const links = vehicleHasLinkedRecords(db, v.vehicle_id);
    if (links.total > 0) {
      const parts = [];
      if (links.trips) parts.push(`${links.trips} trip${links.trips > 1 ? 's' : ''}`);
      if (links.fuel) parts.push(`${links.fuel} fuel log${links.fuel > 1 ? 's' : ''}`);
      if (links.maint) parts.push(`${links.maint} maintenance entry`);
      if (links.tyres) parts.push(`${links.tyres} tyre log${links.tyres > 1 ? 's' : ''}`);
      if (links.expenses) parts.push(`${links.expenses} expense${links.expenses > 1 ? 's' : ''}`);
      if (links.drivers) parts.push(`${links.drivers} driver assignment`);
      toast(`Cannot delete ${v.vehicle_number} — linked to ${parts.join(', ')}.`, 'error', 6000);
      return;
    }
    setConfirmDel({ id: v.vehicle_id, name: v.vehicle_number });
  };

  const performDelete = () => {
    if (!confirmDel) return;
    setDb(prev => ({ ...prev, vehicles: prev.vehicles.filter(v => v.vehicle_id !== confirmDel.id) }));
    toast('Vehicle deleted', 'warning');
    setConfirmDel(null);
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Vehicle Master</div>
          <div className="ps">{db.vehicles.length} vehicles · {db.vehicles.filter(v => v.status === 'active').length} active</div>
        </div>
        <button className="btn btnp" onClick={() => open()}>+ Add Vehicle</button>
      </div>

      <div className="g3" style={{ marginBottom: 14 }}>
        <div className="stat stat-accent">
          <div className="slbl">Active Vehicles</div>
          <div className="sval-sm">{db.vehicles.filter(v => v.status === 'active').length}</div>
          <div className="sval-sub">of {db.vehicles.length} total</div>
        </div>
        <div className="stat stat-red">
          <div className="slbl">⚠ Urgent (expired + ≤7d)</div>
          <div className="sval-sm tx-dr">{alertStats.expired + alertStats.critical}</div>
          <div className="sval-sub">{alertStats.expired} expired · {alertStats.critical} due ≤7d</div>
        </div>
        <div className="stat stat-amber">
          <div className="slbl">🟡 Expiring Soon (8–30d)</div>
          <div className="sval-sm tx-pd">{alertStats.soon}</div>
          <div className="sval-sub">Renew before expiry</div>
        </div>
      </div>

      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <div className="search-wrap" style={{ flex: 1, minWidth: 220 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by number, type, owner, RC…" />
        </div>
        {search && <button className="btn btn-sm" onClick={() => setSearch('')}>Clear</button>}
      </div>

      <div className="card">
        {db.vehicles.length === 0 ? (
          <div className="empty"><div className="empty-icon">🚛</div>No vehicles yet. Add your first vehicle to start tracking trips, fuel and maintenance.</div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">🔍</div>No vehicles match "{search}"</div>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th><th>Type</th><th>Owner</th><th>Driver</th><th>Insurance</th>
                  <th>Fitness</th><th>Pollution</th><th>Mileage</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => {
                  const driver = db.drivers.find(d => d.driver_id === v.driver_id);
                  const ins = expiryStatus(v.insurance_expiry);
                  const fit = expiryStatus(v.fitness_expiry);
                  const pol = expiryStatus(v.pollution_expiry);
                  const mileage = vehicleMileage(db, v.vehicle_id);
                  return (
                    <tr key={v.vehicle_id}>
                      <td className="mono" style={{ fontWeight: 700 }}>{v.vehicle_number}</td>
                      <td><span className="tag-chip">{v.vehicle_type}</span></td>
                      <td style={{ fontSize: 12 }}>{v.owner_name || '—'}</td>
                      <td style={{ fontSize: 12 }}>{driver?.driver_name || <span style={{ color: 'var(--text3)' }}>Unassigned</span>}</td>
                      <td><span className={`badge ${expiryBadge(ins)}`}>{expiryLabel(ins, v.insurance_expiry)}</span></td>
                      <td><span className={`badge ${expiryBadge(fit)}`}>{expiryLabel(fit, v.fitness_expiry)}</span></td>
                      <td><span className={`badge ${expiryBadge(pol)}`}>{expiryLabel(pol, v.pollution_expiry)}</span></td>
                      <td style={{ fontSize: 11.5 }}>
                        {mileage ? `${mileage.kmpl.toFixed(2)} km/L` : v.avg_mileage ? `~${v.avg_mileage} km/L` : '—'}
                      </td>
                      <td>
                        <span className={`badge ${v.status === 'active' ? 'bg' : 'badge-gray'}`}>
                          {v.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => open(v)}>Edit</button>
                        <button className="btn btn-sm" onClick={() => requestDelete(v)} style={{ color: 'var(--red)', borderColor: 'var(--red)', marginLeft: 4 }}>Delete</button>
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
        <Modal title={form.vehicle_id ? 'Edit Vehicle' : 'Add Vehicle'} onClose={() => setForm(null)}>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Vehicle Number <span className="req">*</span></label>
              <input value={form.vehicle_number} onChange={e => setForm({ ...form, vehicle_number: e.target.value.toUpperCase() })} placeholder="PB-10-AB-1234" />
            </div>
            <div className="fg-row">
              <label className="flbl">Vehicle Type</label>
              <select value={form.vehicle_type} onChange={e => setForm({ ...form, vehicle_type: e.target.value })}>
                {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Owner Name</label>
              <input value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Phone (10 digits)</label>
              <NumberInput mode="integer" maxLength={10} value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
            </div>
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Assigned Driver</label>
              <select value={form.driver_id} onChange={e => setForm({ ...form, driver_id: e.target.value })}>
                <option value="">— Unassigned —</option>
                {db.drivers.filter(d => d.status === 'active').map(d =>
                  <option key={d.driver_id} value={d.driver_id}>{d.driver_name}</option>
                )}
              </select>
            </div>
            <div className="fg-row">
              <label className="flbl">RC Number</label>
              <input value={form.rc_number} onChange={e => setForm({ ...form, rc_number: e.target.value.toUpperCase() })} />
            </div>
          </div>
          <div className="g3">
            <div className="fg-row">
              <label className="flbl">Insurance Expiry</label>
              <input type="date" value={form.insurance_expiry} onChange={e => setForm({ ...form, insurance_expiry: e.target.value })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Fitness Expiry</label>
              <input type="date" value={form.fitness_expiry} onChange={e => setForm({ ...form, fitness_expiry: e.target.value })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Pollution Expiry</label>
              <input type="date" value={form.pollution_expiry} onChange={e => setForm({ ...form, pollution_expiry: e.target.value })} />
            </div>
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Average Mileage (km/L)</label>
              <NumberInput mode="decimal" value={form.avg_mileage} onChange={v => setForm({ ...form, avg_mileage: v })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="fg-row">
            <label className="flbl">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btnp" style={{ flex: 1 }} onClick={save}>{form.vehicle_id ? 'Update Vehicle' : 'Add Vehicle'}</button>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Delete vehicle?"
          message={`Permanently delete ${confirmDel.name}?\n\nNo trips, fuel, maintenance, tyre or expense entries are linked. Cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={performDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </>
  );
}
