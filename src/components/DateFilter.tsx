'use client';

import { useState } from 'react';
import { getQuickRange, today } from '@/lib/helpers';

interface Props {
  onChange: (from: string | null, to: string | null) => void;
  defaultPreset?: string;
}

export default function DateFilter({ onChange, defaultPreset = 'month' }: Props) {
  const [active, setActive] = useState(defaultPreset);
  const [initialized, setInitialized] = useState(false);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>(today());

  if (!initialized) {
    const [f, t] = getQuickRange(defaultPreset);
    setFrom(f || '');
    setTo(t || today());
    setInitialized(true);
    setTimeout(() => onChange(f, t), 0);
  }

  const apply = (q: string) => {
    setActive(q);
    if (q === 'all') {
      setFrom(''); setTo('');
      onChange(null, null);
      return;
    }
    const [f, t] = getQuickRange(q);
    setFrom(f || ''); setTo(t || '');
    onChange(f, t);
  };

  const onFromChange = (v: string) => {
    setFrom(v); setActive('');
    onChange(v || null, to || null);
  };
  const onToChange = (v: string) => {
    setTo(v); setActive('');
    onChange(from || null, v || null);
  };

  const presets: { key: string; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: '7D' },
    { key: 'month', label: 'Month' },
    { key: 'quarter', label: 'Quarter' },
    { key: 'year', label: 'Year' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="date-filter">
      <label>From</label>
      <input type="date" value={from} onChange={e => onFromChange(e.target.value)} />
      <label>To</label>
      <input type="date" value={to} onChange={e => onToChange(e.target.value)} />
      <div className="quick-dates">
        {presets.map(p => (
          <button
            key={p.key}
            className={`qd-btn ${active === p.key ? 'active' : ''}`}
            onClick={() => apply(p.key)}
            type="button"
          >{p.label}</button>
        ))}
      </div>
    </div>
  );
}
