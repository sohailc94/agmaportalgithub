'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from './lib/supabaseClient';

export default function LoginPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // stop double redirects in dev/StrictMode
  const redirectingRef = useRef(false);

  const goDashboard = () => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    window.location.assign('/dashboard');
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setMsg('');
        setLoading(true);

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (cancelled) return;

        if (data.session?.user) {
          goDashboard();
          return;
        }

        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setMsg(e?.message || 'Auth check failed.');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function login() {
    setMsg('');

    if (!email.trim() || !password) {
      setMsg('Please enter email and password.');
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      // redirect ONCE after successful sign-in
      goDashboard();
    } catch (e: any) {
      setMsg(e?.message || 'Login failed.');
    }
  }

  if (loading) {
    return (
      <main style={styles.loadingWrap}>
        <div style={styles.loadingCard}>Loading…</div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.bg} />
      <div style={styles.overlay} />

      <div style={styles.container}>
        <div style={styles.brandRow}>
          <div>
            <div style={styles.brandTitle}>AG Martial Arts</div>
            <div style={styles.brandSub}>Student Portal</div>
          </div>
        </div>

        <section style={styles.card}>
          <div style={styles.backLink}>
            <a href="https://agmartialarts.co.uk" style={styles.backAnchor}>
              ← Return to main site
            </a>
          </div>

          <h1 style={styles.h1}>Log in</h1>
          <p style={styles.p}>Access your profile, membership details and belt history.</p>

          <div style={styles.form}>
            <label style={styles.label}>
              Email
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={styles.input}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>

            <label style={styles.label}>
              Password
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={styles.input}
                placeholder="Your password"
                autoComplete="current-password"
              />
            </label>

            <button onClick={login} style={styles.primaryBtn}>
              Log in
            </button>

            {msg && <p style={styles.error}>{msg}</p>}

            <div style={styles.dividerRow}>
              <span style={styles.dividerLine} />
              <span style={styles.dividerText}>New here?</span>
              <span style={styles.dividerLine} />
            </div>

            <Link href="/signup" style={styles.linkBtn}>
              Register as a New Student
            </Link>

            <div style={styles.smallNote}>
              Having trouble? Speak to your instructor and we’ll sort it.
            </div>
          </div>
        </section>

        <footer style={styles.footer}>© {new Date().getFullYear()} AG Martial Arts</footer>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backLink: { width: '100%', maxWidth: 420, marginBottom: 12, fontSize: 14 },
  backAnchor: {
    textDecoration: 'none',
    color: '#b7280f',
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    opacity: 0.75,
    transition: 'opacity 0.2s ease',
  },
  page: {
    minHeight: '100vh',
    position: 'relative',
    overflow: 'hidden',
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    color: '#111827',
  },
  bg: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'linear-gradient(135deg, #0b0f19 0%, #111827 40%, #1f2937 100%)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    transform: 'scale(1.02)',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    background:
      'radial-gradient(1200px circle at 20% 10%, rgba(220, 38, 38, 0.25), transparent 50%), rgba(0,0,0,0.45)',
  },
  container: {
    position: 'relative',
    zIndex: 1,
    minHeight: '100vh',
    display: 'grid',
    alignContent: 'center',
    justifyItems: 'center',
    padding: '40px 18px',
    gap: 14,
  },
  brandRow: { width: '100%', maxWidth: 520, display: 'flex', alignItems: 'center', gap: 12, color: 'white' },
  brandTitle: { fontSize: 18, fontWeight: 800, lineHeight: 1.1 },
  brandSub: { fontSize: 13, opacity: 0.85, marginTop: 2 },
  card: {
    width: '100%',
    maxWidth: 520,
    background: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    padding: 22,
    border: '1px solid rgba(255,255,255,0.55)',
    boxShadow: '0 25px 70px rgba(0,0,0,0.35)',
    backdropFilter: 'blur(8px)',
  },
  h1: { margin: 0, fontSize: 24, fontWeight: 800, color: '#111827' },
  p: { margin: '8px 0 0 0', fontSize: 14, color: '#374151' },
  form: { marginTop: 16, display: 'grid', gap: 12 },
  label: { display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#111827' },
  input: {
    width: '100%',
    padding: '11px 12px',
    borderRadius: 12,
    border: '1px solid #d1d5db',
    outline: 'none',
    fontSize: 14,
    background: 'white',
  },
  primaryBtn: {
    marginTop: 4,
    border: 'none',
    borderRadius: 999,
    padding: '12px 14px',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    color: 'white',
    background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
    boxShadow: '0 12px 30px rgba(185, 28, 28, 0.35)',
  },
  error: { margin: 0, fontSize: 13, color: '#b91c1c', fontWeight: 700 },
  dividerRow: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 },
  dividerLine: { height: 1, background: '#e5e7eb', flex: 1 },
  dividerText: { fontSize: 12, color: '#6b7280', fontWeight: 700 },
  linkBtn: {
    display: 'inline-block',
    textAlign: 'center',
    borderRadius: 999,
    padding: '12px 14px',
    fontSize: 14,
    fontWeight: 800,
    textDecoration: 'none',
    color: '#111827',
    background: 'white',
    border: '1px solid #d1d5db',
    cursor: 'pointer',
  },
  smallNote: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  footer: {
    width: '100%',
    maxWidth: 520,
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 8,
  },
  loadingWrap: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
    background: '#0b0f19',
    color: 'white',
  },
  loadingCard: {
    padding: 18,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.06)',
  },
};