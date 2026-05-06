'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [bizName, setBizName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);

    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setErr('Passwords do not match.'); return; }

    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { biz_name: bizName.trim() || 'Your Crusher & Aggregates' },
      },
    });

    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }

    if (data.session) {
      router.replace('/');
      router.refresh();
      return;
    }

    setInfo('Check your email to confirm your account, then sign in.');
    setBusy(false);
  }

  return (
    <form className="auth-card" onSubmit={onSubmit}>
      <div className="auth-brand">
        <div className="auth-brand-icon">🪨</div>
        <div>
          <div className="auth-brand-t">Crusher ERP</div>
          <div className="auth-brand-s">PUNJAB GST v6</div>
        </div>
      </div>
      <h1 className="auth-title">Create account</h1>
      <p className="auth-sub">Set up your crusher business workspace.</p>

      <div className="fg-row">
        <label className="flbl">Business name</label>
        <input type="text" value={bizName} onChange={e => setBizName(e.target.value)}
               placeholder="My Crusher & Aggregates" />
      </div>
      <div className="fg-row">
        <label className="flbl">Email<span className="req">*</span></label>
        <input type="email" required autoComplete="email" value={email}
               onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
      </div>
      <div className="fg-row">
        <label className="flbl">Password<span className="req">*</span></label>
        <input type="password" required autoComplete="new-password" value={password}
               onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" />
      </div>
      <div className="fg-row">
        <label className="flbl">Confirm password<span className="req">*</span></label>
        <input type="password" required autoComplete="new-password" value={confirm}
               onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" />
      </div>

      {err && <div className="auth-err">{err}</div>}
      {info && <div className="auth-info">{info}</div>}

      <button type="submit" className="btn btnp auth-submit" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </button>

      <div className="auth-foot">
        Already have an account? <Link href="/login">Sign in</Link>
      </div>
    </form>
  );
}
