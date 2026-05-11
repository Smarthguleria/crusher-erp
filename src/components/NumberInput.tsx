'use client';

import { ChangeEvent, InputHTMLAttributes, KeyboardEvent } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: string;
  onChange: (next: string) => void;
  // 'integer' = digits only (no decimals, no minus); 'decimal' = digits + single decimal point.
  mode?: 'integer' | 'decimal';
  maxLength?: number;
}

// Sanitises typed input on every keystroke:
//   • blocks alphabets and symbols other than 0-9 / single dot
//   • blocks negative sign — quantities and rates are never negative
//   • blocks more than one decimal point
//   • respects optional maxLength (used for phone = 10 digits, GSTIN = 15)
export default function NumberInput({
  value, onChange, mode = 'decimal', maxLength, onKeyDown, ...rest
}: Props) {
  const sanitise = (raw: string): string => {
    let s = raw.replace(/[^\d.]/g, '');
    if (mode === 'integer') s = s.replace(/\./g, '');
    if (mode === 'decimal') {
      // Allow only one decimal point — keep the first.
      const i = s.indexOf('.');
      if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
    }
    // Strip leading zeros so that typing "5" into a field showing "0" gives "5", not "05".
    // Preserve a single leading "0." for decimals (e.g. "0.5") and a literal "0".
    if (s.length > 1 && s[0] === '0' && s[1] !== '.') {
      s = s.replace(/^0+/, '') || '0';
    }
    if (maxLength != null && s.length > maxLength) s = s.slice(0, maxLength);
    return s;
  };

  const handle = (e: ChangeEvent<HTMLInputElement>) => onChange(sanitise(e.target.value));

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // Block the minus key entirely, and dot when in integer mode.
    if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') e.preventDefault();
    if (mode === 'integer' && e.key === '.') e.preventDefault();
    onKeyDown?.(e);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode={mode === 'integer' ? 'numeric' : 'decimal'}
      value={value}
      onChange={handle}
      onKeyDown={handleKey}
    />
  );
}
