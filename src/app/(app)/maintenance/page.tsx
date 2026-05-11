'use client';

import { useMemo, useState } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import NumberInput from '@/components/NumberInput';
import { expiryBadge, expiryLabel, expiryStatus, fmt, isPositiveNumber, today } from '@/lib/helpers';
import type { MaintenanceLog } from '@/lib/types';

interface MaintForm {
  maint_id?: number;
  vehicle_id: string;
  service_date: string;
  service_type: string;
  garage_name: string;
  cost: string;
  next_service_due: string;
  odometer: string;
  notes: string;
}

const EMPTY: MaintForm = {
  vehicle_id: '', service_date: today(), service_type: '', garage_name: '',
  cost: '', next_service_due: '', odometer: '', notes: '',
};

const SERVICE_TYPES = ['Oil Change', 'Brake Service', 'Engine Repair', 'Tyre Rotation', 'Battery', 'Clutch', 'AC', 'General Service', 'Other'];

export default function MaintenancePage() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const [form, setForm] = useState<MaintForm | null>(null);
  const [confirmDel, setConfirmDel] = useState<MaintenanceLog | null>(null);
  const [vehicleFilter, setVehicleFilter] = useState('all');

  const filtered = useMemo(() => {
    if (vehicleFilter === 'all') return db.maintenance_logs;
    return db.maintenance_logs.filter(m => m.vehicle_id === parseInt(vehicleFilter));
  }, [db.maintenance_logs, vehicleFilter]);

  const totalCost = filtered.reduce((a, m) => a + m.cost, 0);

  // Upcoming services within 30 days or overdue.
  const upcoming = useMemo(() => {
    return db.maintenance_logs
      .filter(m => m.next_service_due)
      .filter(m => ['expired', 'soon'].includes(expiryStatus(m.next_service_due)))
      .sort((a, b) => new Date(a.next_service_due!).getTime() - new Date(b.next_service_due!).getTime());
  }, [db.maintenance_logs]);

  const open = (m?: MaintenanceLog) => {
    if (m) {
      setForm({
        maint_id: m.maint_id,
        vehicle_id: String(m.vehicle_id),
        service_date: m.service_date.split('T')[0],
        service_type: m.service_type,
        garage_name: m.garage_name || '',
        cost: String(m.cost),
        next_service_due: m.next_service_due || '',
        odometer: m.odometer ? String(m.odometer) : '',
        notes: m.notes || '',
      });
    } else {
      setForm({ ...EMPTY });
    }
  };

  const save = () => {
    if (!form) return;
    if (!form.vehicle_id) { toast('Select a vehicle', 'error'); return; }
    if (!form.service_type.trim()) { toast('Service type required', 'error'); return; }
    if (!isPositiveNumber(form.cost)) { toast('Cost must be a positive number', 'error'); return; }

    setDb(prev => {
      const next = { ...prev, maintenance_logs: [...prev.maintenance_logs], counters: { ...prev.counters } };
      const id = form.maint_id || (next.counters.maint++);
      const data: MaintenanceLog = {
        maint_id: id,
        vehicle_id: parseInt(form.vehicle_id),
        service_date: new Date(form.service_date).toISOString(),
        service_type: form.service_type.trim(),
        garage_name: form.garage_name.trim(),
        cost: parseFloat(form.cost),
        next_service_due: form.next_service_due || undefined,
        odometer: form.odometer ? parseFloat(form.odometer) : undefined,
        notes: form.notes.trim(),
      };
      if (form.maint_id) {
        const i = next.maintenance_logs.findIndex(x => x.maint_id === form.maint_id);
        if (i >= 0) next.maintenance_logs[i] = data;
      } else {
        next.maintenance_logs.push(data);
      }
      return next;
    });
    toast(form.maint_id ? 'Maintenance updated' : 'Maintenance recorded', 'success');
    setForm(null);
  };

  const performDelete = () => {
    if (!confirmDel) return;
    setDb(prev => ({ ...prev, maintenance_logs: prev.maintenance_logs.filter(m => m.maint_id !== confirmDel.maint_id) }));
    toast('Entry deleted', 'warning');
    setConfirmDel(null);
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Vehicle Maintenance</div>
          <div className="ps">{db.maintenance_logs.length} service entries · ₹{fmt(totalCost)} total</div>
        </div>
        <button className="btn btnp" onClick={() => open()} disabled={db.vehicles.length === 0}>+ Add Service</button>
      </div>

      {upcoming.length > 0 && (
        <div className="card" style={{ marginBottom: 12, borderLeft: '4px solid var(--amber)' }}>
          <div className="section-hdr" style={{ color: 'var(--amber)' }}>🔧 {upcoming.length} service{upcoming.length > 1 ? 's' : ''} due soon or overdue</div>
          <div className="g3">
            {upcoming.slice(0, 6).map(m => {
              const v = db.vehicles.find(x => x.vehicle_id === m.vehicle_id);
              const status = expiryStatus(m.next_service_due);
              return (
                <div key={m.maint_id} style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', padding: 10 }}>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 12 }}>{v?.vehicle_number}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>{m.service_type}</div>
                  <div style={{ marginTop: 4 }}><span className={`badge ${expiryBadge(status)}`}>{expiryLabel(status, m.next_service_due)}</span></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)} style={{ width: 200 }}>
          <option value="all">All Vehicles</option>
          {db.vehicles.map(v => <option key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_number}</option>)}
        </select>
      </div>

      <div className="card">
        {db.maintenance_logs.length === 0 ? (
          <div className="empty"><div className="empty-icon">🔧</div>No maintenance records yet</div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">🔍</div>No entries for this vehicle</div>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr><th>Date</th><th>Vehicle</th><th>Service Type</th><th>Garage</th><th>Cost</th><th>Odometer</th><th>Next Due</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {[...filtered].reverse().map(m => {
                  const v = db.vehicles.find(x => x.vehicle_id === m.vehicle_id);
                  const nextStatus = expiryStatus(m.next_service_due);
                  return (
                    <tr key={m.maint_id}>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(m.service_date).toLocaleDateString('en-IN')}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{v?.vehicle_number || '—'}</td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{m.service_type}</td>
                      <td style={{ fontSize: 11.5 }}>{m.garage_name || '—'}</td>
                      <td style={{ fontWeight: 700 }}>₹{fmt(m.cost)}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{m.odometer ? `${m.odometer} km` : '—'}</td>
                      <td>{m.next_service_due ? <span className={`badge ${expiryBadge(nextStatus)}`}>{expiryLabel(nextStatus, m.next_service_due)}</span> : '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => open(m)}>Edit</button>
                        <button className="btn btn-xs" onClick={() => setConfirmDel(m)} style={{ color: 'var(--red)', borderColor: 'var(--red)', marginLeft: 4 }}>✕</button>
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
        <Modal title={form.maint_id ? 'Edit Service' : 'Add Service'} onClose={() => setForm(null)}>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Vehicle <span className="req">*</span></label>
              <select value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })}>
                <option value="">— Select —</option>
                {db.vehicles.map(v => <option key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_number}</option>)}
              </select>
            </div>
            <div className="fg-row">
              <label className="flbl">Service Date <span className="req">*</span></label>
              <input type="date" value={form.service_date} onChange={e => setForm({ ...form, service_date: e.target.value })} />
            </div>
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Service Type <span className="req">*</span></label>
              <select value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value })}>
                <option value="">— Select —</option>
                {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="fg-row">
              <label className="flbl">Garage Name</label>
              <input value={form.garage_name} onChange={e => setForm({ ...form, garage_name: e.target.value })} />
            </div>
          </div>
          <div className="g3">
            <div className="fg-row">
              <label className="flbl">Cost (₹) <span className="req">*</span></label>
              <NumberInput mode="decimal" value={form.cost} onChange={v => setForm({ ...form, cost: v })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Odometer (km)</label>
              <NumberInput mode="decimal" value={form.odometer} onChange={v => setForm({ ...form, odometer: v })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Next Service Due</label>
              <input type="date" value={form.next_service_due} onChange={e => setForm({ ...form, next_service_due: e.target.value })} />
            </div>
          </div>
          <div className="fg-row">
            <label className="flbl">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btnp" style={{ flex: 1 }} onClick={save}>{form.maint_id ? 'Update' : 'Save Service'}</button>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmDialog title="Delete maintenance entry?" message={`Delete this ${confirmDel.service_type} entry (₹${fmt(confirmDel.cost)})? This cannot be undone.`}
          confirmLabel="Delete" danger onConfirm={performDelete} onCancel={() => setConfirmDel(null)} />
      )}
    </>
  );
}
