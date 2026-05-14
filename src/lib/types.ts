export type PaymentStatus = 'paid' | 'pending' | 'debt';
export type PaymentMode = 'cash' | 'online';

export interface Material {
  id: number;
  material_name: string;
  unit: string;
  rate: number;             // Selling price per unit (₹/CFT)
  purchase_price?: number;  // Average / last purchase price per unit (₹/CFT)
  gst_percent: number;
  hsn_code: string;
  stock_tons: number;       // Current available stock in the material's unit (defaults to CFT)
  stock_value: number;      // Inventory valuation in ₹
  min_stock: number;        // Low-stock alert threshold
}

export interface Party {
  party_id: number;
  party_name: string;
  phone?: string;
  state: string;
  gstin?: string;
  address?: string;
  rates: Record<string, number>;
  // GST treatment for this party. true = With GST (CGST+SGST or IGST), false = Without GST.
  gst_enabled: boolean;
}

export interface Slip {
  slip_id: number;
  vehicle_number: string;
  driver_name?: string;
  party_id: number;
  material_id: number;
  quantity: number;
  rate: number;
  gst_percent: number;
  base_amount: number;
  gst_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  final_amount: number;
  party_state: string;
  date: string;
  invoiced: boolean;
  payment_status: PaymentStatus;
  // Snapshot of party.gst_enabled at slip-creation time, so historical slips don't change.
  gst_enabled: boolean;
  // Cash / Online — only present when payment_status = 'paid'.
  payment_mode?: PaymentMode;
}

export interface Invoice {
  invoice_id: number;
  slip_id: number;
  party_id: number;
  material_id: number;
  base_amount: number;
  gst_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  final_amount: number;
  gst_percent: number;
  quantity: number;
  rate: number;
  party_state: string;
  vehicle_number: string;
  driver_name?: string;
  date: string;
  payment_status: PaymentStatus;
  gst_enabled: boolean;
  payment_mode?: PaymentMode;
}

export interface LedgerEntry {
  ledger_id: number;
  party_id: number;
  type: 'credit' | 'debit';
  amount: number;
  note?: string;
  date: string;
  slip_id?: number;
  invoice_id?: number;
  auto?: boolean;
  payment_status?: PaymentStatus;
  payment_mode?: PaymentMode;
}

export interface BizInfo {
  name: string;
  gstin: string;
  address: string;
  phone: string;
}

// ───────────────────────── Fleet ─────────────────────────
export interface Vehicle {
  vehicle_id: number;
  vehicle_number: string;
  vehicle_type: string;       // e.g. 'Tipper', 'Trailer', 'Dumper'
  owner_name?: string;
  driver_id?: number;         // Currently-assigned driver
  phone?: string;
  rc_number?: string;
  insurance_expiry?: string;  // ISO yyyy-mm-dd
  fitness_expiry?: string;
  pollution_expiry?: string;
  avg_mileage?: number;       // KM per litre
  status: 'active' | 'inactive';
  notes?: string;
}

export interface Driver {
  driver_id: number;
  driver_name: string;
  phone?: string;
  license_number?: string;
  license_expiry?: string;
  address?: string;
  vehicle_id?: number;        // Currently-assigned vehicle
  salary_type?: 'monthly' | 'per_trip' | 'daily';
  salary_amount?: number;
  status: 'active' | 'inactive';
}

// Historical timeline of vehicle↔driver assignments. A new row is created when a
// vehicle gets a driver; it is closed (unassigned_at set, status='inactive') when
// the assignment is changed or cleared. The current live link is still tracked on
// vehicle.driver_id / driver.vehicle_id — this table is an audit trail.
export interface VehicleAssignment {
  assignment_id: number;
  vehicle_id: number;
  driver_id: number;
  assigned_at: string;        // ISO datetime
  unassigned_at?: string;     // ISO datetime; absent while status='active'
  status: 'active' | 'inactive';
  notes?: string;
}

export interface Trip {
  trip_id: number;
  date: string;               // ISO datetime
  vehicle_id: number;
  driver_id?: number;
  material_id?: number;
  party_id?: number;          // Customer (optional — used for invoice link)
  invoice_id?: number;        // Linked invoice if billed
  quantity: number;
  unit: string;               // CFT / MT
  loading_point?: string;
  delivery_location?: string;
  distance_km: number;
  diesel_used?: number;       // Litres
  diesel_cost?: number;       // ₹
  freight_amount: number;     // Revenue for this trip (₹)
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
}

export interface FuelLog {
  fuel_id: number;
  date: string;
  vehicle_id: number;
  driver_id?: number;
  quantity: number;           // Litres
  rate: number;               // ₹/L
  total_amount: number;
  odometer?: number;          // KM at fill-up
  station_name?: string;
  notes?: string;
}

export interface MaintenanceLog {
  maint_id: number;
  vehicle_id: number;
  service_date: string;
  service_type: string;       // e.g. 'Oil change', 'Brake job'
  garage_name?: string;
  cost: number;
  next_service_due?: string;
  odometer?: number;
  notes?: string;
}

export interface TyreLog {
  tyre_id: number;
  vehicle_id: number;
  tyre_brand?: string;
  tyre_position?: string;     // 'Front Left', etc.
  installation_date: string;
  removal_date?: string;
  installation_km?: number;
  removal_km?: number;
  cost: number;
  condition?: 'new' | 'good' | 'worn' | 'damaged';
  notes?: string;
}

export type ExpenseCategory =
  | 'diesel' | 'maintenance' | 'salary' | 'office'
  | 'labour' | 'electricity' | 'tyre' | 'misc';

export interface Expense {
  expense_id: number;
  date: string;
  category: ExpenseCategory;
  amount: number;
  paid_to?: string;
  vehicle_id?: number;        // Optional vehicle attribution
  payment_mode?: PaymentMode;
  notes?: string;
}

export interface Supplier {
  supplier_id: number;
  supplier_name: string;
  phone?: string;
  gstin?: string;
  address?: string;
  state?: string;
  notes?: string;
}

export interface Purchase {
  purchase_id: number;
  date: string;               // Arrival date
  supplier_id?: number;
  supplier_name?: string;     // Free-text fallback if not in master
  material_id: number;
  vehicle_number?: string;
  driver_name?: string;
  quantity: number;
  unit: string;
  rate: number;               // Purchase rate ₹/unit
  total_amount: number;
  royalty_number?: string;
  weighbridge_slip?: string;
  notes?: string;
}

export interface DBShape {
  materials: Material[];
  parties: Party[];
  slips: Slip[];
  invoices: Invoice[];
  ledger: LedgerEntry[];
  vehicles: Vehicle[];
  drivers: Driver[];
  vehicle_assignments: VehicleAssignment[];
  trips: Trip[];
  fuel_logs: FuelLog[];
  maintenance_logs: MaintenanceLog[];
  tyre_logs: TyreLog[];
  expenses: Expense[];
  suppliers: Supplier[];
  purchases: Purchase[];
  counters: {
    slip: number; invoice: number; ledger: number;
    vehicle: number; driver: number; trip: number;
    fuel: number; maint: number; tyre: number;
    expense: number; supplier: number; purchase: number;
    assignment: number;
  };
  bizInfo: BizInfo;
}

export const STATES = [
  'Punjab', 'Haryana', 'Himachal Pradesh', 'Uttarakhand', 'Uttar Pradesh',
  'Rajasthan', 'Delhi', 'Chandigarh', 'Jammu & Kashmir', 'Maharashtra',
  'Gujarat', 'Karnataka', 'Tamil Nadu', 'West Bengal', 'Madhya Pradesh',
  'Bihar', 'Other',
];
