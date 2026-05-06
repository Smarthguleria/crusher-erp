'use client';

import { useState, FormEvent, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    router.replace(next);
    router.refresh();
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
      <h1 className="auth-title">Sign in</h1>
      <p className="auth-sub">Welcome back. Enter your credentials to continue.</p>

      <div className="fg-row">
        <label className="flbl">Email<span className="req">*</span></label>
        <input type="email" required autoComplete="email" value={email}
               onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
      </div>
      <div className="fg-row">
        <label className="flbl">Password<span className="req">*</span></label>
        <input type="password" required autoComplete="current-password" value={password}
               onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
      </div>

      {err && <div className="auth-err">{err}</div>}

      <button type="submit" className="btn btnp auth-submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="auth-foot">
        New here? <Link href="/signup">Create an account</Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-card">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
