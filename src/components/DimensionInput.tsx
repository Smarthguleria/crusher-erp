'use client';

import NumberInput from './NumberInput';

interface Props {
  feet: string;
  inches: string;
  onFeetChange: (v: string) => void;
  onInchesChange: (v: string) => void;
  label?: string;
}

// Dimension input pair: whole-number feet + 0-11 inches. The conversion to a single
// decimal-feet value is the caller's responsibility (it lives in the component that
// owns the state, alongside the L × W × H multiplication).
//
// Inches are clamped to 0-11 on commit (the typed value is also caught on every
// keystroke). Anything ≥12 is rejected — if the user means "2 feet", they should type
// it in the feet box.
export default function DimensionInput({ feet, inches, onFeetChange, onInchesChange, label }: Props) {
  const handleInches = (v: string) => {
    // NumberInput already strips non-digits; we just clamp the numeric value to 0-11.
    if (v === '') { onInchesChange(''); return; }
    const n = parseInt(v, 10);
    if (isNaN(n)) { onInchesChange(''); return; }
    onInchesChange(String(Math.min(11, Math.max(0, n))));
  };

  return (
    <div>
      {label && <label className="flbl" style={{ display: 'block', marginBottom: 4 }}>{label}</label>}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <NumberInput
          mode="integer"
          value={feet}
          onChange={onFeetChange}
          placeholder="0"
          style={{ flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 12, textAlign: 'right' }}
          aria-label={label ? `${label} feet` : 'feet'}
        />
        <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700 }}>ft</span>
        <NumberInput
          mode="integer"
          value={inches}
          onChange={handleInches}
          placeholder="0"
          maxLength={2}
          style={{ flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 12, textAlign: 'right' }}
          aria-label={label ? `${label} inches` : 'inches'}
        />
        <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700 }}>in</span>
      </div>
    </div>
  );
}

// Shared converter used by both callers to guarantee bit-identical math. Takes raw
// string inputs from the form state, returns total feet as a decimal.
export function toDecimalFeet(feet: string, inches: string): number {
  const f = parseInt(feet, 10);
  const i = parseInt(inches, 10);
  const safeF = isNaN(f) ? 0 : Math.max(0, f);
  const safeI = isNaN(i) ? 0 : Math.min(11, Math.max(0, i));
  return safeF + safeI / 12;
}
