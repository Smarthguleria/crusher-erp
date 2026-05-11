'use client';

import { useMemo, useState } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import NumberInput from '@/components/NumberInput';
import DateFilter from '@/components/DateFilter';
import { dateRangeFilter, fmt, isPositiveNumber, today } from '@/lib/helpers';
import type { Trip } from '@/lib/types';

interface TripForm {
  trip_id?: number;
  date: string;
  vehicle_id: string;
  driver_id: string;
  material_id: string;
  party_id: string;
  quantity: string;
  unit: string;
  loading_point: string;
  delivery_location: string;
  distance_km: string;
  diesel_used: string;
  diesel_cost: string;
  freight_amount: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  notes: string;
}

const EMPTY: TripForm = {
  date: today(), vehicle_id: '', driver_id: '', material_id: '', party_id: '',
  quantity: '', unit: 'CFT', loading_point: '', delivery_location: '',
  distance_km: '', diesel_used: '', diesel_cost: '', freight_amount: '',
  status: 'completed', notes: '',
};

const STATUS_LABEL: Record<TripForm['status'], string> = {
  planned: 'Planned', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
};
const STATUS_BADGE: Record<TripForm['status'], string> = {
  planned: 'bb', in_progress: 'ba', completed: 'bg', cancelled: 'badge-gray',
};

export default function TripsPage() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const [form, setForm] = useState<TripForm | null>(null);
  const [confirmDel, setConfirmDel] = useState<Trip | null>(null);
  const [search, setSearch] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(today());

  const filtered = useMemo(() => {
    let f = dateRangeFilter(db.trips, from, to);
    if (vehicleFilter !== 'all') f = f.filter(t => t.vehicle_id === parseInt(vehicleFilter));
    if (statusFilter !== 'all') f = f.filter(t => t.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) f = f.filter(t => {
      const v = db.vehicles.find(x => x.vehicle_id === t.vehicle_id);
      const d = db.drivers.find(x => x.driver_id === t.driver_id);
      const p = db.parties.find(x => x.party_id === t.party_id);
      return (v?.vehicle_number || '').toLowerCase().includes(q) ||
        (d?.driver_name || '').toLowerCase().includes(q) ||
        (p?.party_name || '').toLowerCase().includes(q) ||
        (t.loading_point || '').toLowerCase().includes(q) ||
        (t.delivery_location || '').toLowerCase().includes(q) ||
        String(t.trip_id).includes(q);
    });
    return f;
  }, [db.trips, db.vehicles, db.drivers, db.parties, from, to, search, vehicleFilter, statusFilter]);

  const totalRevenue = filtered.reduce((a, t) => a + t.freight_amount, 0);
  const totalDieselCost = filtered.reduce((a, t) => a + (t.diesel_cost || 0), 0);
  const totalDistance = filtered.reduce((a, t) => a + t.distance_km, 0);

  const open = (t?: Trip) => {
    if (t) {
      setForm({
        trip_id: t.trip_id,
        date: t.date.split('T')[0],
        vehicle_id: String(t.vehicle_id),
        driver_id: t.driver_id ? String(t.driver_id) : '',
        material_id: t.material_id ? String(t.material_id) : '',
        party_id: t.party_id ? String(t.party_id) : '',
        quantity: String(t.quantity || ''),
        unit: t.unit || 'CFT',
        loading_point: t.loading_point || '',
        delivery_location: t.delivery_location || '',
        distance_km: String(t.distance_km || ''),
        diesel_used: t.diesel_used ? String(t.diesel_used) : '',
        diesel_cost: t.diesel_cost ? String(t.diesel_cost) : '',
        freight_amount: String(t.freight_amount || ''),
        status: t.status,
        notes: t.notes || '',
      });
    } else {
      setForm({ ...EMPTY });
    }
  };

  // When the user picks a vehicle, default driver to the vehicle's currently assigned driver.
  const onVehicleChange = (vid: string) => {
    if (!form) return;
    const v = db.vehicles.find(x => x.vehicle_id === parseInt(vid));
    setForm({ ...form, vehicle_id: vid, driver_id: v?.driver_id ? String(v.driver_id) : form.driver_id });
  };

  const save = () => {
    if (!form) return;
    if (!form.vehicle_id) { toast('Select a vehicle', 'error'); return; }
    if (!isPositiveNumber(form.distance_km)) { toast('Distance must be a positive number', 'error'); return; }

    setDb(prev => {
      const next = { ...prev, trips: [...prev.trips], counters: { ...prev.counters } };
      const id = form.trip_id || (next.counters.trip++);
      const data: Trip = {
        trip_id: id,
        date: new Date(form.date).toISOString(),
        vehicle_id: parseInt(form.vehicle_id),
        driver_id: form.driver_id ? parseInt(form.driver_id) : undefined,
        material_id: form.material_id ? parseInt(form.material_id) : undefined,
        party_id: form.party_id ? parseInt(form.party_id) : undefined,
        quantity: parseFloat(form.quantity) || 0,
        unit: form.unit,
        loading_point: form.loading_point.trim(),
        delivery_location: form.delivery_location.trim(),
        distance_km: parseFloat(form.distance_km),
        diesel_used: form.diesel_used ? parseFloat(form.diesel_used) : undefined,
        diesel_cost: form.diesel_cost ? parseFloat(form.diesel_cost) : undefined,
        freight_amount: parseFloat(form.freight_amount) || 0,
        status: form.status,
        notes: form.notes.trim(),
      };
      if (form.trip_id) {
        const i = next.trips.findIndex(t => t.trip_id === form.trip_id);
        if (i >= 0) next.trips[i] = data;
      } else {
        next.trips.push(data);
      }
      return next;
    });
    toast(form.trip_id ? 'Trip updated!' : 'Trip recorded!', 'success');
    setForm(null);
  };

  const performDelete = () => {
    if (!confirmDel) return;
    setDb(prev => ({ ...prev, trips: prev.trips.filter(t => t.trip_id !== confirmDel.trip_id) }));
    toast('Trip deleted', 'warning');
    setConfirmDel(null);
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Trip Management</div>
          <div className="ps">{db.trips.length} trips recorded · {filtered.length} match filters</div>
        </div>
        <button className="btn btnp" onClick={() => open()} disabled={db.vehicles.length === 0}>+ New Trip</button>
      </div>

      <div className="g4" style={{ marginBottom: 14 }}>
        <div className="stat stat-accent">
          <div className="slbl">Trip Revenue</div>
          <div className="sval-sm tx-cr">₹{fmt(totalRevenue)}</div>
        </div>
        <div className="stat stat-red">
          <div className="slbl">Diesel Cost</div>
          <div className="sval-sm tx-dr">₹{fmt(totalDieselCost)}</div>
        </div>
        <div className="stat stat-blue">
          <div className="slbl">Total Distance</div>
          <div className="sval-sm" style={{ color: 'var(--blue)' }}>{fmt(totalDistance)} km</div>
        </div>
        <div className="stat stat-green">
          <div className="slbl">Net (Revenue − Diesel)</div>
          <div className="sval-sm" style={{ color: 'var(--green)' }}>₹{fmt(totalRevenue - totalDieselCost)}</div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <DateFilter onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>
      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <div className="search-wrap" style={{ flex: 1, minWidth: 220 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by trip#, vehicle, driver, party, location…" />
        </div>
        <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)} style={{ width: 160 }}>
          <option value="all">All Vehicles</option>
          {db.vehicles.map(v => <option key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_number}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 130 }}>
          <option value="all">All Status</option>
          <option value="planned">Planned</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="card">
        {db.trips.length === 0 ? (
          <div className="empty"><div className="empty-icon">🛣️</div>No trips recorded yet. Add a vehicle first, then record your first trip.</div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">🔍</div>No trips match your filters</div>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Trip #</th><th>Date</th><th>Vehicle</th><th>Driver</th>
                  <th>Material</th><th>Qty</th><th>Route</th><th>Distance</th>
                  <th>Diesel ₹</th><th>Freight ₹</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...filtered].reverse().map(t => {
                  const v = db.vehicles.find(x => x.vehicle_id === t.vehicle_id);
                  const d = db.drivers.find(x => x.driver_id === t.driver_id);
                  const m = db.materials.find(x => x.id === t.material_id);
                  const p = db.parties.find(x => x.party_id === t.party_id);
                  return (
                    <tr key={t.trip_id}>
                      <td className="mono" style={{ fontWeight: 700, fontSize: 11 }}>T-{t.trip_id}</td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(t.date).toLocaleDateString('en-IN')}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{v?.vehicle_number || '—'}</td>
                      <td style={{ fontSize: 12 }}>{d?.driver_name || '—'}</td>
                      <td style={{ fontSize: 12 }}>{m?.material_name || '—'}{p ? <div style={{ fontSize: 10, color: 'var(--text3)' }}>{p.party_name}</div> : null}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{t.quantity ? `${t.quantity} ${t.unit}` : '—'}</td>
                      <td style={{ fontSize: 11 }}>
                        {t.loading_point || t.delivery_location
                          ? <>{t.loading_point || '?'} → {t.delivery_location || '?'}</>
                          : '—'}
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>{t.distance_km} km</td>
                      <td style={{ fontSize: 11 }}>{t.diesel_cost ? `₹${fmt(t.diesel_cost)}` : '—'}</td>
                      <td style={{ fontWeight: 700 }}>₹{fmt(t.freight_amount)}</td>
                      <td><span className={`badge ${STATUS_BADGE[t.status]}`}>{STATUS_LABEL[t.status]}</span></td>
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
        <Modal title={form.trip_id ? `Edit Trip T-${form.trip_id}` : 'New Trip'} onClose={() => setForm(null)}>
          <div className="g3">
            <div className="fg-row">
              <label className="flbl">Date <span className="req">*</span></label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Vehicle <span className="req">*</span></label>
              <select value={form.vehicle_id} onChange={e => onVehicleChange(e.target.value)}>
                <option value="">— Select —</option>
                {db.vehicles.filter(v => v.status === 'active').map(v =>
                  <option key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_number}</option>
                )}
              </select>
            </div>
            <div className="fg-row">
              <label className="flbl">Driver</label>
              <select value={form.driver_id} onChange={e => setForm({ ...form, driver_id: e.target.value })}>
                <option value="">— Select —</option>
                {db.drivers.filter(d => d.status === 'active').map(d =>
                  <option key={d.driver_id} value={d.driver_id}>{d.driver_name}</option>
                )}
              </select>
            </div>
          </div>
          <div className="g3">
            <div className="fg-row">
              <label className="flbl">Material</label>
              <select value={form.material_id} onChange={e => setForm({ ...form, material_id: e.target.value })}>
                <option value="">— None —</option>
                {db.materials.map(m => <option key={m.id} value={m.id}>{m.material_name}</option>)}
              </select>
            </div>
            <div className="fg-row">
              <label className="flbl">Quantity</label>
              <NumberInput mode="decimal" value={form.quantity} onChange={v => setForm({ ...form, quantity: v })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Unit</label>
              <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
            </div>
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Loading Point</label>
              <input value={form.loading_point} onChange={e => setForm({ ...form, loading_point: e.target.value })} placeholder="e.g. Crusher Plant" />
            </div>
            <div className="fg-row">
              <label className="flbl">Delivery Location</label>
              <input value={form.delivery_location} onChange={e => setForm({ ...form, delivery_location: e.target.value })} placeholder="e.g. Site, City" />
            </div>
          </div>
          <div className="fg-row">
            <label className="flbl">Customer (Party)</label>
            <select value={form.party_id} onChange={e => setForm({ ...form, party_id: e.target.value })}>
              <option value="">— None —</option>
              {db.parties.map(p => <option key={p.party_id} value={p.party_id}>{p.party_name}</option>)}
            </select>
          </div>
          <div className="g3">
            <div className="fg-row">
              <label className="flbl">Distance (KM) <span className="req">*</span></label>
              <NumberInput mode="decimal" value={form.distance_km} onChange={v => setForm({ ...form, distance_km: v })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Diesel Used (L)</label>
              <NumberInput mode="decimal" value={form.diesel_used} onChange={v => setForm({ ...form, diesel_used: v })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Diesel Cost (₹)</label>
              <NumberInput mode="decimal" value={form.diesel_cost} onChange={v => setForm({ ...form, diesel_cost: v })} />
            </div>
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Freight Amount (₹)</label>
              <NumberInput mode="decimal" value={form.freight_amount} onChange={v => setForm({ ...form, freight_amount: v })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
                <option value="planned">Planned</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="fg-row">
            <label className="flbl">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btnp" style={{ flex: 1 }} onClick={save}>{form.trip_id ? 'Update Trip' : 'Save Trip'}</button>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Delete trip?"
          message={`Permanently delete Trip T-${confirmDel.trip_id}?\n\nThis cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={performDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </>
  );
}
