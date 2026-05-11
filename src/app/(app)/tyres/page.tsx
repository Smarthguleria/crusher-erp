'use client';

import { useMemo, useState } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import NumberInput from '@/components/NumberInput';
import { fmt, isPositiveNumber, today } from '@/lib/helpers';
import type { TyreLog } from '@/lib/types';

interface TyreForm {
  tyre_id?: number;
  vehicle_id: string;
  tyre_brand: string;
  tyre_position: string;
  installation_date: string;
  removal_date: string;
  installation_km: string;
  removal_km: string;
  cost: string;
  condition: 'new' | 'good' | 'worn' | 'damaged';
  notes: string;
}

const EMPTY: TyreForm = {
  vehicle_id: '', tyre_brand: '', tyre_position: '', installation_date: today(),
  removal_date: '', installation_km: '', removal_km: '', cost: '', condition: 'new', notes: '',
};

const POSITIONS = ['Front Left', 'Front Right', 'Rear Left Outer', 'Rear Left Inner', 'Rear Right Outer', 'Rear Right Inner', 'Spare', 'Other'];

export default function TyresPage() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const [form, setForm] = useState<TyreForm | null>(null);
  const [confirmDel, setConfirmDel] = useState<TyreLog | null>(null);
  const [vehicleFilter, setVehicleFilter] = useState('all');

  const filtered = useMemo(() => {
    if (vehicleFilter === 'all') return db.tyre_logs;
    return db.tyre_logs.filter(t => t.vehicle_id === parseInt(vehicleFilter));
  }, [db.tyre_logs, vehicleFilter]);

  const totalCost = filtered.reduce((a, t) => a + t.cost, 0);
  const inUse = filtered.filter(t => !t.removal_date).length;

  const open = (t?: TyreLog) => {
    if (t) {
      setForm({
        tyre_id: t.tyre_id,
        vehicle_id: String(t.vehicle_id),
        tyre_brand: t.tyre_brand || '',
        tyre_position: t.tyre_position || '',
        installation_date: t.installation_date.split('T')[0],
        removal_date: t.removal_date ? t.removal_date.split('T')[0] : '',
        installation_km: t.installation_km ? String(t.installation_km) : '',
        removal_km: t.removal_km ? String(t.removal_km) : '',
        cost: String(t.cost),
        condition: t.condition || 'new',
        notes: t.notes || '',
      });
    } else {
      setForm({ ...EMPTY });
    }
  };

  const save = () => {
    if (!form) return;
    if (!form.vehicle_id) { toast('Select a vehicle', 'error'); return; }
    if (!isPositiveNumber(form.cost)) { toast('Cost must be positive', 'error'); return; }

    setDb(prev => {
      const next = { ...prev, tyre_logs: [...prev.tyre_logs], counters: { ...prev.counters } };
      const id = form.tyre_id || (next.counters.tyre++);
      const data: TyreLog = {
        tyre_id: id,
        vehicle_id: parseInt(form.vehicle_id),
        tyre_brand: form.tyre_brand.trim(),
        tyre_position: form.tyre_position,
        installation_date: new Date(form.installation_date).toISOString(),
        removal_date: form.removal_date ? new Date(form.removal_date).toISOString() : undefined,
        installation_km: form.installation_km ? parseFloat(form.installation_km) : undefined,
        removal_km: form.removal_km ? parseFloat(form.removal_km) : undefined,
        cost: parseFloat(form.cost),
        condition: form.condition,
        notes: form.notes.trim(),
      };
      if (form.tyre_id) {
        const i = next.tyre_logs.findIndex(x => x.tyre_id === form.tyre_id);
        if (i >= 0) next.tyre_logs[i] = data;
      } else {
        next.tyre_logs.push(data);
      }
      return next;
    });
    toast(form.tyre_id ? 'Tyre log updated' : 'Tyre log added', 'success');
    setForm(null);
  };

  const performDelete = () => {
    if (!confirmDel) return;
    setDb(prev => ({ ...prev, tyre_logs: prev.tyre_logs.filter(t => t.tyre_id !== confirmDel.tyre_id) }));
    toast('Entry deleted', 'warning');
    setConfirmDel(null);
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Tyre Replacement Log</div>
          <div className="ps">{db.tyre_logs.length} tyre records · {inUse} currently in use</div>
        </div>
        <button className="btn btnp" onClick={() => open()} disabled={db.vehicles.length === 0}>+ Add Tyre Entry</button>
      </div>

      <div className="g3" style={{ marginBottom: 14 }}>
        <div className="stat stat-blue"><div className="slbl">In Use</div><div className="sval-sm" style={{ color: 'var(--blue)' }}>{inUse}</div></div>
        <div className="stat stat-amber"><div className="slbl">Replaced</div><div className="sval-sm tx-pd">{filtered.length - inUse}</div></div>
        <div className="stat stat-red"><div className="slbl">Total Spend</div><div className="sval-sm tx-dr">₹{fmt(totalCost)}</div></div>
      </div>

      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)} style={{ width: 200 }}>
          <option value="all">All Vehicles</option>
          {db.vehicles.map(v => <option key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_number}</option>)}
        </select>
      </div>

      <div className="card">
        {db.tyre_logs.length === 0 ? (
          <div className="empty"><div className="empty-icon">🛞</div>No tyre records yet</div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">🔍</div>No tyres for this vehicle</div>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr><th>Vehicle</th><th>Position</th><th>Brand</th><th>Installed</th><th>Removed</th><th>Distance</th><th>Cost</th><th>Condition</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {[...filtered].reverse().map(t => {
                  const v = db.vehicles.find(x => x.vehicle_id === t.vehicle_id);
                  const dist = t.removal_km && t.installation_km ? t.removal_km - t.installation_km : null;
                  return (
                    <tr key={t.tyre_id}>
                      <td className="mono" style={{ fontSize: 11 }}>{v?.vehicle_number || '—'}</td>
                      <td style={{ fontSize: 11.5 }}>{t.tyre_position || '—'}</td>
                      <td style={{ fontSize: 12 }}>{t.tyre_brand || '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(t.installation_date).toLocaleDateString('en-IN')}{t.installation_km ? ` · ${t.installation_km}km` : ''}</td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{t.removal_date ? `${new Date(t.removal_date).toLocaleDateString('en-IN')}${t.removal_km ? ` · ${t.removal_km}km` : ''}` : <span className="badge bg">In use</span>}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{dist != null ? `${fmt(dist)} km` : '—'}</td>
                      <td style={{ fontWeight: 700 }}>₹{fmt(t.cost)}</td>
                      <td><span className={`badge ${t.condition === 'new' || t.condition === 'good' ? 'bg' : t.condition === 'worn' ? 'ba' : 'br'}`}>{t.condition}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => open(t)}>Edit</button>
                        <button className="btn btn-xs" onClick={() => setConfirmDel(t)} style={{ color: 'var(--red)', borderColor: 'var(--red)', marginLeft: 4 }}>✕</button>
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
        <Modal title={form.tyre_id ? 'Edit Tyre' : 'Add Tyre Entry'} onClose={() => setForm(null)}>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Vehicle <span className="req">*</span></label>
              <select value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })}>
                <option value="">— Select —</option>
                {db.vehicles.map(v => <option key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_number}</option>)}
              </select>
            </div>
            <div className="fg-row">
              <label className="flbl">Position</label>
              <select value={form.tyre_position} onChange={e => setForm({ ...form, tyre_position: e.target.value })}>
                <option value="">— Select —</option>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Brand</label>
              <input value={form.tyre_brand} onChange={e => setForm({ ...form, tyre_brand: e.target.value })} placeholder="e.g. MRF, Apollo, JK" />
            </div>
            <div className="fg-row">
              <label className="flbl">Cost (₹) <span className="req">*</span></label>
              <NumberInput mode="decimal" value={form.cost} onChange={v => setForm({ ...form, cost: v })} />
            </div>
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Installation Date <span className="req">*</span></label>
              <input type="date" value={form.installation_date} onChange={e => setForm({ ...form, installation_date: e.target.value })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Installation Odometer (km)</label>
              <NumberInput mode="decimal" value={form.installation_km} onChange={v => setForm({ ...form, installation_km: v })} />
            </div>
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Removal Date</label>
              <input type="date" value={form.removal_date} onChange={e => setForm({ ...form, removal_date: e.target.value })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Removal Odometer (km)</label>
              <NumberInput mode="decimal" value={form.removal_km} onChange={v => setForm({ ...form, removal_km: v })} />
            </div>
          </div>
          <div className="fg-row">
            <label className="flbl">Condition</label>
            <select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value as any })}>
              <option value="new">New</option>
              <option value="good">Good</option>
              <option value="worn">Worn</option>
              <option value="damaged">Damaged</option>
            </select>
          </div>
          <div className="fg-row">
            <label className="flbl">Notes</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btnp" style={{ flex: 1 }} onClick={save}>{form.tyre_id ? 'Update' : 'Save Tyre'}</button>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmDialog title="Delete tyre log?" message="This cannot be undone."
          confirmLabel="Delete" danger onConfirm={performDelete} onCancel={() => setConfirmDel(null)} />
      )}
    </>
  );
}
