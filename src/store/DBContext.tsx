'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DBShape } from '@/lib/types';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { useToast } from '@/store/ToastContext';

const LEGACY_KEYS = ['crusher_erp_v6', 'crusher_erp_v5'];

const DEFAULT_DB: DBShape = {
  materials: [
    { id: 1, material_name: '20mm', unit: 'CFT', rate: 0, purchase_price: 0, gst_percent: 5, hsn_code: '251710', stock_tons: 0, stock_value: 0, min_stock: 0 },
    { id: 2, material_name: '10mm', unit: 'CFT', rate: 0, purchase_price: 0, gst_percent: 5, hsn_code: '251710', stock_tons: 0, stock_value: 0, min_stock: 0 },
    { id: 3, material_name: '40mm', unit: 'CFT', rate: 0, purchase_price: 0, gst_percent: 5, hsn_code: '251710', stock_tons: 0, stock_value: 0, min_stock: 0 },
    { id: 4, material_name: '65mm', unit: 'CFT', rate: 0, purchase_price: 0, gst_percent: 5, hsn_code: '251710', stock_tons: 0, stock_value: 0, min_stock: 0 },
    { id: 5, material_name: 'River Sand', unit: 'CFT', rate: 0, purchase_price: 0, gst_percent: 5, hsn_code: '250510', stock_tons: 0, stock_value: 0, min_stock: 0 },
  ],
  parties: [],
  slips: [],
  invoices: [],
  ledger: [],
  vehicles: [],
  drivers: [],
  trips: [],
  fuel_logs: [],
  maintenance_logs: [],
  tyre_logs: [],
  expenses: [],
  suppliers: [],
  purchases: [],
  counters: {
    slip: 1000, invoice: 100, ledger: 1,
    vehicle: 1, driver: 1, trip: 1,
    fuel: 1, maint: 1, tyre: 1,
    expense: 1, supplier: 1, purchase: 1,
  },
  bizInfo: {
    name: 'Your Crusher & Aggregates',
    gstin: '03XXXXX0000X0XX',
    address: 'Village/Area, Dist., Punjab',
    phone: '',
  },
};

function migrate(db: DBShape): DBShape {
  db.materials.forEach(m => {
    if (m.stock_tons === undefined) m.stock_tons = 0;
    if (m.stock_value === undefined) m.stock_value = 0;
    if (m.min_stock === undefined) m.min_stock = 0;
    if (m.purchase_price === undefined) m.purchase_price = 0;
    if (!m.hsn_code) m.hsn_code = '251710';
  });
  db.parties.forEach(p => {
    if (!p.rates) p.rates = {};
    const nr: Record<string, number> = {};
    Object.keys(p.rates).forEach(k => { nr[String(k)] = parseFloat(String((p.rates as any)[k])); });
    p.rates = nr;
    if (p.gst_enabled === undefined) p.gst_enabled = true;
  });
  db.slips.forEach(s => { if (s.gst_enabled === undefined) s.gst_enabled = true; });
  db.invoices.forEach(i => { if (i.gst_enabled === undefined) i.gst_enabled = true; });

  // Backfill new top-level arrays + counters introduced by the fleet/inventory upgrade.
  if (!db.vehicles) db.vehicles = [];
  if (!db.drivers) db.drivers = [];
  if (!db.trips) db.trips = [];
  if (!db.fuel_logs) db.fuel_logs = [];
  if (!db.maintenance_logs) db.maintenance_logs = [];
  if (!db.tyre_logs) db.tyre_logs = [];
  if (!db.expenses) db.expenses = [];
  if (!db.suppliers) db.suppliers = [];
  if (!db.purchases) db.purchases = [];

  if (!db.bizInfo) db.bizInfo = { ...DEFAULT_DB.bizInfo };
  if (!db.counters) db.counters = { ...DEFAULT_DB.counters };
  // Old DBs may be missing newer counter keys — fill from defaults without overwriting existing.
  const c = db.counters as any;
  for (const k of Object.keys(DEFAULT_DB.counters) as (keyof typeof DEFAULT_DB.counters)[]) {
    if (c[k] === undefined) c[k] = DEFAULT_DB.counters[k];
  }
  return db;
}

function readLegacyLocalStorage(): DBShape | null {
  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return migrate(JSON.parse(raw));
    } catch {}
  }
  return null;
}

interface DBContextValue {
  db: DBShape;
  setDb: (updater: (prev: DBShape) => DBShape) => void;
  replaceDb: (next: DBShape) => void;
  resetDb: () => void;
  ready: boolean;
  syncing: boolean;
}

const DBContext = createContext<DBContextValue | null>(null);

export function DBProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [db, setDbState] = useState<DBShape>(DEFAULT_DB);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSaveRef = useRef(true);
  const lastSaveErrorRef = useRef<string | null>(null);

  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = createSupabaseBrowserClient();
    return supabaseRef.current;
  }, []);

  const loadForUser = useCallback(async (userId: string, bizNameSeed?: string) => {
    skipNextSaveRef.current = true;
    setReady(false);
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('user_data')
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Failed to load user_data', error);
      toast(`Could not load your data: ${error.message}`, 'error', 6000);
      setDbState(DEFAULT_DB);
      setReady(true);
      return;
    }

    if (data?.data) {
      setDbState(migrate(data.data as DBShape));
      setReady(true);
      return;
    }

    // First time for this user — try migrating from local storage (legacy v6 blob)
    const legacy = readLegacyLocalStorage();
    const seed: DBShape = legacy ?? JSON.parse(JSON.stringify(DEFAULT_DB));
    if (!legacy && bizNameSeed) seed.bizInfo.name = bizNameSeed;
    setDbState(seed);
    // Persist seed immediately so the user has a row going forward
    skipNextSaveRef.current = false;
    await supabase.from('user_data').upsert({ user_id: userId, data: seed, updated_at: new Date().toISOString() });
    skipNextSaveRef.current = true;
    setReady(true);
  }, [toast]);

  useEffect(() => {
    const supabase = getSupabase();
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      const user = data.user;
      const uid = user?.id ?? null;
      userIdRef.current = uid;
      if (uid) {
        const bizSeed = (user?.user_metadata as any)?.biz_name as string | undefined;
        loadForUser(uid, bizSeed);
      } else {
        // No user (e.g. on /login or /signup pages). Stay on defaults; don't try to save.
        setReady(true);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      const prev = userIdRef.current;
      userIdRef.current = uid;
      if (uid && uid !== prev) {
        const bizSeed = (session?.user?.user_metadata as any)?.biz_name as string | undefined;
        loadForUser(uid, bizSeed);
      } else if (!uid && prev) {
        skipNextSaveRef.current = true;
        setDbState(DEFAULT_DB);
        setReady(true);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadForUser, getSupabase]);

  // Debounced persistence to Supabase
  useEffect(() => {
    if (!ready) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const uid = userIdRef.current;
    if (!uid) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSyncing(true);
    saveTimerRef.current = setTimeout(async () => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('user_data')
        .upsert({ user_id: uid, data: db, updated_at: new Date().toISOString() });
      if (error) {
        console.warn('Failed to save user_data', error);
        if (lastSaveErrorRef.current !== error.message) {
          lastSaveErrorRef.current = error.message;
          toast(`Save failed: ${error.message}`, 'error', 6000);
        }
      } else {
        lastSaveErrorRef.current = null;
      }
      setSyncing(false);
    }, 600);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [db, ready, getSupabase, toast]);

  const setDb = useCallback((updater: (prev: DBShape) => DBShape) => {
    setDbState(prev => updater(prev));
  }, []);

  const replaceDb = useCallback((next: DBShape) => {
    setDbState(migrate(next));
  }, []);

  const resetDb = useCallback(() => {
    setDbState(JSON.parse(JSON.stringify(DEFAULT_DB)));
  }, []);

  return (
    <DBContext.Provider value={{ db, setDb, replaceDb, resetDb, ready, syncing }}>
      {children}
    </DBContext.Provider>
  );
}

export function useDB() {
  const ctx = useContext(DBContext);
  if (!ctx) throw new Error('useDB must be used within DBProvider');
  return ctx;
}
