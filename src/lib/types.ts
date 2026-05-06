export type PaymentStatus = 'paid' | 'pending' | 'debt';

export interface Material {
  id: number;
  material_name: string;
  unit: string;
  rate: number;
  gst_percent: number;
  hsn_code: string;
  stock_tons: number;
  stock_value: number;
  min_stock: number;
}

export interface Party {
  party_id: number;
  party_name: string;
  phone?: string;
  state: string;
  gstin?: string;
  address?: string;
  rates: Record<string, number>;
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
}

export interface LedgerEntry {
  ledger_id: number;
  party_id: number;
  type: 'credit' | 'debit';
  amount: number;
  note?: string;
  date: string;
  slip_id?: number;
  auto?: boolean;
  payment_status?: PaymentStatus;
}

export interface BizInfo {
  name: string;
  gstin: string;
  address: string;
  phone: string;
}

export interface DBShape {
  materials: Material[];
  parties: Party[];
  slips: Slip[];
  invoices: Invoice[];
  ledger: LedgerEntry[];
  counters: { slip: number; invoice: number; ledger: number };
  bizInfo: BizInfo;
}

export const STATES = [
  'Punjab', 'Haryana', 'Himachal Pradesh', 'Uttarakhand', 'Uttar Pradesh',
  'Rajasthan', 'Delhi', 'Chandigarh', 'Jammu & Kashmir', 'Maharashtra',
  'Gujarat', 'Karnataka', 'Tamil Nadu', 'West Bengal', 'Madhya Pradesh',
  'Bihar', 'Other',
];
