'use client';

import { useMemo, useState } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import NumberInput from '@/components/NumberInput';
import DateFilter from '@/components/DateFilter';
import { dateRangeFilter, fmt, isPositiveNumber, today, vehicleMileage } from '@/lib/helpers';
import type { FuelLog } from '@/lib/types';

interface FuelForm {
  fuel_id?: number;
  date: string;
  vehicle_id: string;
  driver_id: string;
  quantity: string;
  rate: string;
  total_amount: string;
  odometer: string;
  station_name: string;
  notes: string;
}

const EMPTY: FuelForm = {
  date: today(), vehicle_id: '', driver_id: '', quantity: '', rate: '',
  total_amount: '', odometer: '', station_name: '', notes: '',
};

export default function FuelPage() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const [form, setForm] = useState<FuelForm | null>(null);
  const [confirmDel, setConfirmDel] = useState<FuelLog | null>(null);
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(today());

  const filtered = useMemo(() => {
    let f = dateRangeFilter(db.fuel_logs, from, to);
    if (vehicleFilter !== 'all') f = f.filter(l => l.vehicle_id === parseInt(vehicleFilter));
    return f;
  }, [db.fuel_logs, from, to, vehicleFilter]);

  const totalLitres = filtered.reduce((a, l) => a + l.quantity, 0);
  const totalCost = filtered.reduce((a, l) => a + l.total_amount, 0);
  const avgRate = totalLitres > 0 ? totalCost / totalLitres : 0;

  // Per-vehicle mileage from odometer-tagged logs.
  const fleetMileage = useMemo(() => {
    return db.vehicles
      .map(v => ({ v, m: vehicleMileage(db, v.vehicle_id) }))
      .filter(x => x.m != null);
  }, [db.vehicles, db.fuel_logs]);

  const open = (l?: FuelLog) => {
    if (l) {
      setForm({
        fuel_id: l.fuel_id,
        date: l.date.split('T')[0],
        vehicle_id: String(l.vehicle_id),
        driver_id: l.driver_id ? String(l.driver_id) : '',
        quantity: String(l.quantity),
        rate: String(l.rate),
        total_amount: String(l.total_amount),
        odometer: l.odometer ? String(l.odometer) : '',
        station_name: l.station_name || '',
        notes: l.notes || '',
      });
    } else {
      setForm({ ...EMPTY });
    }
  };

  const save = () => {
    if (!form) return;
    if (!form.vehicle_id) { toast('Select a vehicle', 'error'); return; }
    if (!isPositiveNumber(form.quantity)) { toast('Quantity must be positive', 'error'); return; }
    if (!isPositiveNumber(form.rate)) { toast('Rate must be positive', 'error'); return; }

    setDb(prev => {
      const next = { ...prev, fuel_logs: [...prev.fuel_logs], counters: { ...prev.counters } };
      const id = form.fuel_id || (next.counters.fuel++);
      const qty = parseFloat(form.quantity);
      const rate = parseFloat(form.rate);
      const data: FuelLog = {
        fuel_id: id,
        date: new Date(form.date).toISOString(),
        vehicle_id: parseInt(form.vehicle_id),
        driver_id: form.driver_id ? parseInt(form.driver_id) : undefined,
        quantity: qty,
        rate,
        total_amount: form.total_amount ? parseFloat(form.total_amount) : (qty * rate),
        odometer: form.odometer ? parseFloat(form.odometer) : undefined,
        station_name: form.station_name.trim(),
        notes: form.notes.trim(),
      };
      if (form.fuel_id) {
        const i = next.fuel_logs.findIndex(l => l.fuel_id === form.fuel_id);
        if (i >= 0) next.fuel_logs[i] = data;
      } else {
        next.fuel_logs.push(data);
      }
      return next;
    });
    toast(form.fuel_id ? 'Fuel entry updated' : 'Fuel entry added', 'success');
    setForm(null);
  };

  const performDelete = () => {
    if (!confirmDel) return;
    setDb(prev => ({ ...prev, fuel_logs: prev.fuel_logs.filter(l => l.fuel_id !== confirmDel.fuel_id) }));
    toast('Fuel entry deleted', 'warning');
    setConfirmDel(null);
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Fuel / Diesel Log</div>
          <div className="ps">{db.fuel_logs.length} fill-ups recorded</div>
        </div>
        <button className="btn btnp" onClick={() => open()} disabled={db.vehicles.length === 0}>+ Add Fuel Entry</button>
      </div>

      <div className="g4" style={{ marginBottom: 14 }}>
        <div className="stat stat-blue"><div className="slbl">Total Litres</div><div className="sval-sm" style={{ color: 'var(--blue)' }}>{fmt(totalLitres)} L</div></div>
        <div className="stat stat-red"><div className="slbl">Total Cost</div><div className="sval-sm tx-dr">₹{fmt(totalCost)}</div></div>
        <div className="stat stat-amber"><div className="slbl">Avg Rate</div><div className="sval-sm tx-pd">₹{avgRate.toFixed(2)}/L</div></div>
        <div className="stat stat-green"><div className="slbl">Vehicles Tracked</div><div className="sval-sm" style={{ color: 'var(--green)' }}>{fleetMileage.length}</div><div className="sval-sub">with mileage data</div></div>
      </div>

      {fleetMileage.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="section-hdr">⛽ Per-Vehicle Mileage</div>
          <div className="g4">
            {fleetMileage.map(({ v, m }) => (
              <div key={v.vehicle_id} style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', padding: 12 }}>
                <div className="mono" style={{ fontWeight: 700, fontSize: 12 }}>{v.vehicle_number}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', marginTop: 2 }}>{m!.kmpl.toFixed(2)} km/L</div>
                <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{m!.samples} fill-ups · {v.vehicle_type}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <DateFilter onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>
      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)} style={{ width: 200 }}>
          <option value="all">All Vehicles</option>
          {db.vehicles.map(v => <option key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_number}</option>)}
        </select>
      </div>

      <div className="card">
        {db.fuel_logs.length === 0 ? (
          <div className="empty"><div className="empty-icon">⛽</div>No fuel entries yet</div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">🔍</div>No entries match your filters</div>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Vehicle</th><th>Driver</th><th>Litres</th><th>Rate</th>
                  <th>Total</th><th>Odometer</th><th>Station</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...filtered].reverse().map(l => {
                  const v = db.vehicles.find(x => x.vehicle_id === l.vehicle_id);
                  const d = db.drivers.find(x => x.driver_id === l.driver_id);
                  return (
                    <tr key={l.fuel_id}>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(l.date).toLocaleDateString('en-IN')}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{v?.vehicle_number || '—'}</td>
                      <td style={{ fontSize: 12 }}>{d?.driver_name || '—'}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{l.quantity} L</td>
                      <td style={{ fontSize: 11 }}>₹{l.rate}/L</td>
                      <td style={{ fontWeight: 700 }}>₹{fmt(l.total_amount)}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{l.odometer ? `${l.odometer} km` : '—'}</td>
                      <td style={{ fontSize: 11 }}>{l.station_name || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => open(l)}>Edit</button>
                        <button className="btn btn-xs" onClick={() => setConfirmDel(l)} style={{ color: 'var(--red)', borderColor: 'var(--red)', marginLeft: 4 }}>✕</button>
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
        <Modal title={form.fuel_id ? 'Edit Fuel Entry' : 'Add Fuel Entry'} onClose={() => setForm(null)}>
          <div className="g3">
            <div className="fg-row">
              <label className="flbl">Date <span className="req">*</span></label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Vehicle <span className="req">*</span></label>
              <select value={form.vehicle_id} onChange={e => {
                const v = db.vehicles.find(x => x.vehicle_id === parseInt(e.target.value));
                setForm({ ...form, vehicle_id: e.target.value, driver_id: v?.driver_id ? String(v.driver_id) : form.driver_id });
              }}>
                <option value="">— Select —</option>
                {db.vehicles.map(v => <option key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_number}</option>)}
              </select>
            </div>
            <div className="fg-row">
              <label className="flbl">Driver</label>
              <select value={form.driver_id} onChange={e => setForm({ ...form, driver_id: e.target.value })}>
                <option value="">— Select —</option>
                {db.drivers.map(d => <option key={d.driver_id} value={d.driver_id}>{d.driver_name}</option>)}
              </select>
            </div>
          </div>
          <div className="g3">
            <div className="fg-row">
              <label className="flbl">Quantity (Litres) <span className="req">*</span></label>
              <NumberInput mode="decimal" value={form.quantity}
                           onChange={v => {
                             const q = parseFloat(v) || 0;
                             const r = parseFloat(form.rate) || 0;
                             setForm({ ...form, quantity: v, total_amount: q > 0 && r > 0 ? (q * r).toFixed(2) : form.total_amount });
                           }} />
            </div>
            <div className="fg-row">
              <label className="flbl">Rate (₹/L) <span className="req">*</span></label>
              <NumberInput mode="decimal" value={form.rate}
                           onChange={v => {
                             const r = parseFloat(v) || 0;
                             const q = parseFloat(form.quantity) || 0;
                             setForm({ ...form, rate: v, total_amount: q > 0 && r > 0 ? (q * r).toFixed(2) : form.total_amount });
                           }} />
            </div>
            <div className="fg-row">
              <label className="flbl">Total (₹)</label>
              <NumberInput mode="decimal" value={form.total_amount} onChange={v => setForm({ ...form, total_amount: v })} placeholder="Auto" />
            </div>
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Odometer (km)</label>
              <NumberInput mode="decimal" value={form.odometer} onChange={v => setForm({ ...form, odometer: v })} placeholder="Required for mileage tracking" />
            </div>
            <div className="fg-row">
              <label className="flbl">Fuel Station</label>
              <input value={form.station_name} onChange={e => setForm({ ...form, station_name: e.target.value })} />
            </div>
          </div>
          <div className="fg-row">
            <label className="flbl">Notes</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btnp" style={{ flex: 1 }} onClick={save}>{form.fuel_id ? 'Update' : 'Save Entry'}</button>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmDialog title="Delete fuel entry?" message={`Delete this fill-up of ${confirmDel.quantity}L (₹${fmt(confirmDel.total_amount)})? This cannot be undone.`}
          confirmLabel="Delete" danger onConfirm={performDelete} onCancel={() => setConfirmDel(null)} />
      )}
    </>
  );
}
