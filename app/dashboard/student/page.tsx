'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

/* =========================
   TYPES
========================= */

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
};

type StudentRow = {
  id: string;
  user_id: string;
  franchise_id: string | null;
  home_class_id: string | null;
  first_name: string | null;
  last_name: string | null;
  dob: string | null;
  phone: string | null;
  address: string | null;
  status: string | null;
};

type FranchiseRow = { id: string; name: string };

type ClassRow = {
  id: string;
  name: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
};

type BeltRow = {
  id: string;
  belt_name: string | null;
  awarded_on: string | null;
  created_at: string | null;
};

/* =========================
   PAGE
========================= */

export default function StudentDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setMsg('');
      setLoading(true);

      const { data, error } = await supabase.auth.getUser();
      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      if (!data.user) {
        window.location.href = '/';
        return;
      }

      setUserId(data.user.id);
      setLoading(false);
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
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
        <div style={styles.headerRow}>
          <a href="https://agmartialarts.co.uk" style={styles.backAnchor}>
            ← Return to main site
          </a>

          <button onClick={signOut} style={styles.ghostBtn}>
            Sign out
          </button>
        </div>

        <div style={styles.brandRow}>
          <div>
            <div style={styles.brandTitle}>AG Martial Arts</div>
            <div style={styles.brandSub}>Student Portal</div>
          </div>
        </div>

        <section style={styles.card}>
          <div style={styles.cardTopRow}>
            <div>
              <h1 style={styles.h1}>My Dashboard</h1>
              <p style={styles.p}>Your profile, area and belt history.</p>
            </div>
            <div style={styles.badge}>Student</div>
          </div>

          {msg ? <div style={styles.alertError}>Error: {msg}</div> : null}

          <div style={styles.divider} />

          {userId ? <StudentView userId={userId} /> : <div style={styles.alertError}>No user found.</div>}

          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <Link href="/dashboard" style={{ ...styles.muted, textDecoration: 'none' }}>
              Back to main dashboard
            </Link>
          </div>
        </section>

        <footer style={styles.footer}>© {new Date().getFullYear()} AG Martial Arts</footer>
      </div>
    </main>
  );
}

/* =========================
   VIEW
========================= */

function StudentView({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [student, setStudent] = useState<StudentRow | null>(null);

  const [franchise, setFranchise] = useState<FranchiseRow | null>(null);
  const [homeClass, setHomeClass] = useState<ClassRow | null>(null);

  const [belts, setBelts] = useState<BeltRow[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<{ phone: string; address: string }>({ phone: '', address: '' });

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      setMsg('');
      setLoading(true);

      // Profile
      const { data: p, error: pErr } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url, role')
        .eq('id', userId)
        .single();

      if (pErr) {
        setMsg(`Profile load error: ${pErr.message}`);
        setLoading(false);
        return;
      }
      setProfile(p as ProfileRow);

      // Avatar signed URL
      if ((p as any)?.avatar_url) {
        const { data: signed } = await supabase.storage.from('avatars').createSignedUrl((p as any).avatar_url, 60 * 60);
        setAvatarUrl(signed?.signedUrl || '');
      }

      // Student
      const { data: s, error: sErr } = await supabase
        .from('students')
        .select('id, user_id, franchise_id, home_class_id, first_name, last_name, dob, phone, address, status')
        .eq('user_id', userId)
        .single();

      if (sErr) {
        setMsg(`Student load error: ${sErr.message}`);
        setLoading(false);
        return;
      }

      const st = s as StudentRow;
      setStudent(st);
      setForm({ phone: st.phone ?? '', address: st.address ?? '' });

      // Franchise (Area)
      if (st.franchise_id) {
        const { data: fr, error: frErr } = await supabase
          .from('franchises')
          .select('id, name')
          .eq('id', st.franchise_id)
          .single();

        if (!frErr) setFranchise(fr as FranchiseRow);
      }

      // Home class (Registered class)
      if (st.home_class_id) {
        const { data: hc, error: hcErr } = await supabase
          .from('classes')
          .select('id, name, day_of_week, start_time, end_time, location')
          .eq('id', st.home_class_id)
          .single();

        if (!hcErr) setHomeClass(hc as ClassRow);
      }

      // Belt history (newest first)
      const { data: br, error: brErr } = await supabase
        .from('belt_records')
        .select('id, belt_name, awarded_on, created_at')
        .eq('student_id', st.id)
        .order('awarded_on', { ascending: false })
        .order('created_at', { ascending: false });

      if (brErr) {
        setMsg(`Belt history load error: ${brErr.message}`);
        setLoading(false);
        return;
      }

      setBelts((br || []) as BeltRow[]);
      setLoading(false);
    })();
  }, [userId]);

  const displayName = useMemo(() => {
    if (profile?.full_name) return profile.full_name;
    const fn = student?.first_name ?? '';
    const ln = student?.last_name ?? '';
    return `${fn} ${ln}`.trim() || '—';
  }, [profile?.full_name, student?.first_name, student?.last_name]);

  function dayLabel(d: number | null) {
    const map: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
    return d ? map[d] ?? String(d) : '';
  }

  async function changeAvatar(file: File) {
    setMsg('');

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${userId}/avatar.${ext}`;

    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
      upsert: true,
      contentType: file.type || 'image/jpeg',
      cacheControl: '3600',
    });
    if (upErr) return setMsg(`Avatar upload error: ${upErr.message}`);

    const { error: profErr } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', userId);
    if (profErr) return setMsg(`Profile update error: ${profErr.message}`);

    const { data: signed, error: sErr } = await supabase.storage.from('avatars').createSignedUrl(path, 60 * 60);
    if (sErr) return setMsg(`Avatar link error: ${sErr.message}`);

    setAvatarUrl(signed?.signedUrl || '');
    setMsg('Profile picture updated ✅');
  }

  async function save() {
    setMsg('');
    if (!student) return;

    if (!form.phone.trim()) return setMsg('Please enter your phone number.');
    if (!form.address.trim()) return setMsg('Please enter your address.');

    const { error } = await supabase
      .from('students')
      .update({ phone: form.phone.trim(), address: form.address.trim() })
      .eq('user_id', userId);

    if (error) return setMsg(`Save error: ${error.message}`);

    setStudent(prev => (prev ? { ...prev, phone: form.phone.trim(), address: form.address.trim() } : prev));
    setEditMode(false);
    setMsg('Saved ✅');
  }

  if (loading) return <div style={styles.innerCard}>Loading your profile…</div>;
  if (!student) return <div style={styles.alertError}>{msg || 'No student profile found.'}</div>;

  const registeredClassText = homeClass?.name
    ? `${homeClass.name}${homeClass.day_of_week ? ` • ${dayLabel(homeClass.day_of_week)}` : ''}${
        homeClass.start_time ? ` • ${String(homeClass.start_time).slice(0, 5)}` : ''
      }${homeClass.end_time ? `–${String(homeClass.end_time).slice(0, 5)}` : ''}`
    : '—';

  return (
    <div style={styles.innerCard}>
      <div style={styles.sectionTitle}>My Profile</div>

      {msg ? <div style={msg.includes('✅') ? styles.alertOk : styles.alertError}>{msg}</div> : null}

      <div style={styles.innerCard2}>
        <div style={styles.profileTopRow}>
          {/* Click avatar to upload */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={styles.avatarButton}
            aria-label="Change profile photo"
            title="Change photo"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {avatarUrl ? <img src={avatarUrl} alt="Profile" style={styles.avatarImg as any} /> : <div style={styles.muted}>Add</div>}
            <div style={styles.avatarEditBadge}>✎</div>
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) changeAvatar(f);
              e.currentTarget.value = '';
            }}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.nameTitle}>{displayName}</div>
            <div style={styles.muted}>{profile?.email ?? ''}</div>

            <div style={{ ...styles.muted, marginTop: 10 }}>
              <b style={{ color: '#111827' }}>Area:</b> {franchise?.name ?? '—'}
            </div>

            <div style={{ ...styles.muted, marginTop: 6 }}>
              <b style={{ color: '#111827' }}>Registered class:</b> {registeredClassText}
            </div>
          </div>
        </div>

        <div style={styles.divider} />

        {/* Phone */}
        <div style={styles.infoRow}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={styles.infoLabel}>Phone</div>
            {!editMode ? <div style={styles.infoValue}>{student.phone || '—'}</div> : null}
            {editMode ? (
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={styles.input} />
            ) : null}
          </div>

          {!editMode ? (
            <button onClick={() => setEditMode(true)} style={styles.smallEditBtn}>
              Edit
            </button>
          ) : null}
        </div>

        {/* Address */}
        <div style={{ ...styles.infoRow, marginTop: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={styles.infoLabel}>Address</div>
            {!editMode ? <div style={styles.infoValue}>{student.address || '—'}</div> : null}
            {editMode ? (
              <input
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                style={styles.input}
              />
            ) : null}
          </div>
        </div>

        {/* Save / cancel */}
        {editMode ? (
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={save} style={styles.primaryBtn}>
              Save
            </button>

            <button
              onClick={() => {
                setEditMode(false);
                setForm({ phone: student.phone ?? '', address: student.address ?? '' });
                setMsg('');
              }}
              style={styles.secondaryBtn}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>

      <div style={styles.divider} />

      <div style={styles.sectionTitle}>Belt History</div>

      <div style={styles.innerCard2}>
        {belts.length === 0 ? <div style={styles.muted}>No belt records yet.</div> : null}

        {belts.map((b, idx) => (
          <div
            key={b.id}
            style={{
              ...styles.beltRow,
              borderBottom: idx === belts.length - 1 ? 'none' : '1px solid #eee',
            }}
          >
            <div style={{ fontWeight: 900 }}>{b.belt_name || '—'}</div>
            <div style={styles.muted}>
              Awarded: {b.awarded_on ? String(b.awarded_on).slice(0, 10) : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================
   STYLES
========================= */

const styles: Record<string, React.CSSProperties> = {
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
    alignContent: 'start',
    justifyItems: 'center',
    padding: '28px 16px 40px',
    gap: 14,
  },
  headerRow: {
    width: '100%',
    maxWidth: 860,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backAnchor: {
    textDecoration: 'none',
    color: 'rgba(255,255,255,0.9)',
    fontWeight: 700,
    fontSize: 13,
    opacity: 0.9,
  },
  brandRow: {
    width: '100%',
    maxWidth: 860,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    color: 'white',
    marginTop: 6,
  },
  brandTitle: { fontSize: 18, fontWeight: 800, lineHeight: 1.1 },
  brandSub: { fontSize: 13, opacity: 0.85, marginTop: 2 },
  card: {
    width: '100%',
    maxWidth: 860,
    background: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    padding: 22,
    border: '1px solid rgba(255,255,255,0.55)',
    boxShadow: '0 25px 70px rgba(0,0,0,0.35)',
    backdropFilter: 'blur(8px)',
  },
  cardTopRow: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  h1: { margin: 0, fontSize: 24, fontWeight: 900, color: '#111827' },
  p: { margin: '8px 0 0 0', fontSize: 14, color: '#374151' },
  badge: {
    padding: '8px 12px',
    borderRadius: 999,
    background: 'rgba(17,24,39,0.08)',
    border: '1px solid rgba(17,24,39,0.1)',
    fontSize: 12,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: { height: 1, background: '#e5e7eb', margin: '16px 0' },
  innerCard: { border: '1px solid #e5e7eb', borderRadius: 16, padding: 16, background: 'white' },
  innerCard2: { border: '1px solid #e5e7eb', borderRadius: 16, padding: 16, background: 'white' },

  sectionTitle: { fontSize: 14, fontWeight: 900, letterSpacing: 0.3, marginBottom: 10 },
  muted: { fontSize: 13, color: '#6b7280' },

  nameTitle: {
    fontSize: 16,
    fontWeight: 950,
    color: '#111827',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  profileTopRow: {
    display: 'flex',
    gap: 14,
    alignItems: 'center',
    flexWrap: 'wrap',
  },

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
    border: 'none',
    borderRadius: 999,
    padding: '12px 14px',
    fontSize: 14,
    fontWeight: 900,
    cursor: 'pointer',
    color: 'white',
    background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
    boxShadow: '0 12px 30px rgba(185, 28, 28, 0.25)',
  },
  secondaryBtn: {
    borderRadius: 999,
    padding: '12px 14px',
    fontSize: 14,
    fontWeight: 900,
    cursor: 'pointer',
    color: '#111827',
    background: 'white',
    border: '1px solid #d1d5db',
  },
  ghostBtn: {
    borderRadius: 999,
    padding: '10px 12px',
    fontSize: 13,
    fontWeight: 900,
    cursor: 'pointer',
    color: 'rgba(255,255,255,0.9)',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.18)',
  },

  alertError: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    border: '1px solid rgba(185, 28, 28, 0.25)',
    background: 'rgba(185, 28, 28, 0.08)',
    color: '#7f1d1d',
    fontSize: 13,
    fontWeight: 800,
  },
  alertOk: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    border: '1px solid rgba(16, 185, 129, 0.25)',
    background: 'rgba(16, 185, 129, 0.08)',
    color: '#065f46',
    fontSize: 13,
    fontWeight: 800,
  },

  avatarButton: {
    width: 84,
    height: 84,
    borderRadius: 14,
    overflow: 'hidden',
    border: '1px solid #e5e7eb',
    background: 'rgba(17,24,39,0.03)',
    display: 'grid',
    placeItems: 'center',
    position: 'relative',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarEditBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 26,
    height: 26,
    borderRadius: 999,
    background: 'rgba(255,255,255,0.95)',
    border: '1px solid rgba(17,24,39,0.15)',
    display: 'grid',
    placeItems: 'center',
    fontSize: 12,
    fontWeight: 900,
    color: '#111827',
  },

  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: 900,
    color: '#6b7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  infoValue: { fontSize: 14, fontWeight: 800, color: '#111827', wordBreak: 'break-word' },
  smallEditBtn: {
    borderRadius: 999,
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    color: '#111827',
    background: 'white',
    border: '1px solid #d1d5db',
    height: 34,
    flexShrink: 0,
  },

  beltRow: { padding: '12px 0', display: 'grid', gap: 4 },
  footer: { width: '100%', maxWidth: 860, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 8 },

  loadingWrap: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
    background: '#0b0f19',
    color: 'white',
  },
  loadingCard: { padding: 18, borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)' },
};