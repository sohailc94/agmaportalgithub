'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

type Area = { id: string; name: string };
type ClassRow = { id: string; name: string; franchise_id: string };

// ---------- Types for form ----------
type ParentForm = {
  email: string;
  password: string;
  fullName: string;
  dob: string; // yyyy-mm-dd
  phone: string;
  address: string;
};

type ChildForm = {
  firstName: string;
  lastName: string;
  dob: string; // yyyy-mm-dd
  medicalInfo: string;
  areaId: string;
  classId: string;
};

export default function SignupPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [areas, setAreas] = useState<Area[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);

  // Parent registering student(s)?
  const [isParentRegistering, setIsParentRegistering] = useState<'yes' | 'no'>('no');

  // Parent form (only used when yes)
  const [parent, setParent] = useState<ParentForm>({
    email: '',
    password: '',
    fullName: '',
    dob: '',
    phone: '',
    address: '',
  });

  // Child accounts (only used when yes)
  const [children, setChildren] = useState<ChildForm[]>([
    {
      firstName: '',
      lastName: '',
      dob: '',
      medicalInfo: '',
      areaId: '',
      classId: '',
    },
  ]);

  // If NOT parent registering (student self-register)
  const [studentEmail, setStudentEmail] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [studentFirstName, setStudentFirstName] = useState('');
  const [studentLastName, setStudentLastName] = useState('');
  const [studentDob, setStudentDob] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [studentAddress, setStudentAddress] = useState('');
  const [studentMedicalInfo, setStudentMedicalInfo] = useState('');
  const [studentAreaId, setStudentAreaId] = useState('');
  const [studentClassId, setStudentClassId] = useState('');

  // ✅ hard lock to prevent double submit (fixes Supabase AbortError/locks)
  const submitLock = useRef(false);

  const filteredClassesFor = useMemo(() => {
    const map = new Map<string, ClassRow[]>();
    for (const a of areas) map.set(a.id, []);
    for (const c of classes) {
      const arr = map.get(c.franchise_id) || [];
      arr.push(c);
      map.set(c.franchise_id, arr);
    }
    return map;
  }, [areas, classes]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setMsg('');
        setLoading(true);

        const { data: frData, error: frErr } = await supabase
          .from('franchises')
          .select('id, name')
          .order('name');

        if (frErr) throw frErr;

        const { data: clData, error: clErr } = await supabase
          .from('classes')
          .select('id, name, franchise_id')
          .eq('is_active', true)
          .order('name');

        if (clErr) throw clErr;

        if (!cancelled) {
          setAreas((frData || []) as Area[]);
          setClasses((clData || []) as ClassRow[]);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setMsg(e?.message || 'Failed to load classes.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Actions ----------
  function addAnotherChild() {
    setChildren(prev => [
      ...prev,
      {
        firstName: '',
        lastName: '',
        dob: '',
        medicalInfo: '',
        areaId: '',
        classId: '',
      },
    ]);
  }

  function removeChild(idx: number) {
    setChildren(prev => prev.filter((_, i) => i !== idx));
  }

  // ---------- Submit ----------
  async function submit() {
    // ✅ prevent double submit + aborted auth locks
    if (submitLock.current) return;
    submitLock.current = true;
    setSaving(true);
    setMsg('');

    try {
      // =========================================================
      // Parent registering student(s)
      // =========================================================
      if (isParentRegistering === 'yes') {
        // Parent validation
        if (!parent.email.trim() || !parent.password) throw new Error('Please enter parent email + password.');
        if (!parent.fullName.trim()) throw new Error('Please enter parent/guardian full name.');
        if (!parent.dob) throw new Error('Please enter parent/guardian date of birth.');
        if (!parent.phone.trim()) throw new Error('Please enter parent/guardian phone.');
        if (!parent.address.trim()) throw new Error('Please enter parent/guardian address.');

        // Children validation
        if (!children.length) throw new Error('Please add at least one child.');
        for (let i = 0; i < children.length; i++) {
          const c = children[i];
          if (!c.firstName.trim() || !c.lastName.trim()) throw new Error(`Child ${i + 1}: please enter first + last name.`);
          if (!c.dob) throw new Error(`Child ${i + 1}: please enter date of birth.`);
          if (!c.areaId || !c.classId) throw new Error(`Child ${i + 1}: please choose an area and class.`);
          if (!c.medicalInfo.trim())
            throw new Error(`Child ${i + 1}: please enter medical information (use "None" if not applicable).`);
        }

        // 1) Create auth user for parent
        const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
          email: parent.email.trim(),
          password: parent.password,
          options: { data: { full_name: parent.fullName.trim() } },
        });

        if (signUpErr) throw signUpErr;

        const user = signUp.user;
        if (!user) throw new Error('Sign up succeeded but no user returned. Try logging in.');

        // 2) Upsert parent profile (role = parent)
        const { error: parentProfErr } = await supabase.from('profiles').upsert(
          {
            id: user.id,
            role: 'parent',
            email: parent.email.trim(),
            full_name: parent.fullName.trim(),
            franchise_id: null,
            avatar_url: null,
            is_active: true,
            account_status: 'active',
          },
          { onConflict: 'id' }
        );

        if (parentProfErr) throw new Error(`Parent profile error: ${parentProfErr.message}`);

        // 3) Insert children in students table (no auth users)
        // NOTE: we set guardian_is_registering true + parent_user_id link
        for (const c of children) {
          const { error: childInsertErr } = await supabase.from('students').insert({
            parent_user_id: user.id,
            user_id: null,
            franchise_id: c.areaId,
            home_class_id: c.classId,
            first_name: c.firstName.trim(),
            last_name: c.lastName.trim(),
            dob: c.dob,
            status: 'inactive',
            medical_info: c.medicalInfo.trim(),
            avatar_url: null,

            guardian_is_registering: true,
            guardian_name: parent.fullName.trim(),
            guardian_relationship: 'Parent/Guardian',
            guardian_email: parent.email.trim(),
            guardian_phone: parent.phone.trim(),
            guardian_address: parent.address.trim(),
          });

          if (childInsertErr) throw new Error(`Student error: ${childInsertErr.message}`);
        }

        // IMPORTANT: your /dashboard router must handle role=parent or you'll loop.
        window.location.href = '/dashboard';
        return;
      }

      // =========================================================
      // Student registering themselves (not a parent)
      // =========================================================
      if (!studentEmail.trim() || !studentPassword) throw new Error('Please enter email + password.');
      if (!studentFirstName.trim() || !studentLastName.trim()) throw new Error('Please enter first + last name.');
      if (!studentAreaId || !studentClassId) throw new Error('Please choose an area and a class.');
      if (!studentPhone.trim()) throw new Error('Please enter your phone number.');
      if (!studentAddress.trim()) throw new Error('Please enter your address.');
      if (!studentMedicalInfo.trim()) throw new Error('Please enter medical information (use "None" if not applicable).');

      const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
        email: studentEmail.trim(),
        password: studentPassword,
        options: { data: { full_name: `${studentFirstName} ${studentLastName}`.trim() } },
      });

      if (signUpErr) throw signUpErr;

      const user = signUp.user;
      if (!user) throw new Error('Sign up succeeded but no user returned. Try logging in.');

      // profile
      const { error: profErr } = await supabase.from('profiles').upsert(
        {
          id: user.id,
          role: 'student',
          email: studentEmail.trim(),
          full_name: `${studentFirstName} ${studentLastName}`.trim(),
          franchise_id: null,
          avatar_url: null,
          is_active: true,
          account_status: 'active',
        },
        { onConflict: 'id' }
      );

      if (profErr) throw new Error(`Profile error: ${profErr.message}`);

      // student row
      const { error: studErr } = await supabase.from('students').upsert(
        {
          user_id: user.id,
          franchise_id: studentAreaId,
          home_class_id: studentClassId,
          first_name: studentFirstName.trim(),
          last_name: studentLastName.trim(),
          dob: studentDob || null,
          status: 'inactive',
          phone: studentPhone.trim(),
          address: studentAddress.trim(),
          medical_info: studentMedicalInfo.trim(),
          guardian_is_registering: false,
          avatar_url: null,
        },
        { onConflict: 'user_id' }
      );

      if (studErr) throw new Error(`Student error: ${studErr.message}`);

      window.location.href = '/dashboard';
    } catch (e: any) {
      // Supabase internal lock aborts often show like this
      if (e?.name === 'AbortError') {
        setMsg('AbortError: request was interrupted (usually double-submit or redirect loop). Try once, and check /dashboard routing for role=parent.');
      } else {
        setMsg(e?.message || 'Something went wrong.');
      }
    } finally {
      setSaving(false);
      submitLock.current = false;
    }
  }

  // ---------- UI ----------
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

          <h1 style={styles.h1}>Register as a New Student</h1>
          <p style={styles.p}>Tell us whether you’re registering as a parent/guardian, then we’ll collect the right info.</p>

          {msg && <p style={styles.error}>{msg}</p>}

          <div style={styles.form}>
            <label style={styles.label}>
              Are you a parent/guardian registering student(s)?
              <select
                value={isParentRegistering}
                onChange={e => setIsParentRegistering(e.target.value as 'yes' | 'no')}
                style={styles.select}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>

            <div style={styles.hr} />

            {isParentRegistering === 'yes' ? (
              <>
                <div style={styles.sectionTitle}>Parent / Guardian account</div>

                <label style={styles.label}>
                  Email
                  <input
                    value={parent.email}
                    onChange={e => setParent(p => ({ ...p, email: e.target.value }))}
                    style={styles.input}
                    placeholder="parent@example.com"
                    autoComplete="email"
                  />
                </label>

                <label style={styles.label}>
                  Password
                  <input
                    type="password"
                    value={parent.password}
                    onChange={e => setParent(p => ({ ...p, password: e.target.value }))}
                    style={styles.input}
                    placeholder="Create a password"
                    autoComplete="new-password"
                  />
                </label>

                <label style={styles.label}>
                  Full name
                  <input
                    value={parent.fullName}
                    onChange={e => setParent(p => ({ ...p, fullName: e.target.value }))}
                    style={styles.input}
                    placeholder="Full name"
                  />
                </label>

                <label style={styles.label}>
                  Date of birth
                  <input
                    type="date"
                    value={parent.dob}
                    onChange={e => setParent(p => ({ ...p, dob: e.target.value }))}
                    style={styles.input}
                  />
                </label>

                <label style={styles.label}>
                  Phone
                  <input
                    value={parent.phone}
                    onChange={e => setParent(p => ({ ...p, phone: e.target.value }))}
                    style={styles.input}
                    placeholder="07..."
                  />
                </label>

                <label style={styles.label}>
                  Address
                  <input
                    value={parent.address}
                    onChange={e => setParent(p => ({ ...p, address: e.target.value }))}
                    style={styles.input}
                    placeholder="Address"
                  />
                </label>

                <div style={styles.hr} />

                <div style={styles.sectionTitle}>Student details</div>

                {children.map((c, idx) => {
                  const childClasses = filteredClassesFor.get(c.areaId) || [];

                  return (
                    <div key={idx} style={styles.panel}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                        <div style={{ fontWeight: 900 }}>Child {idx + 1}</div>
                        {children.length > 1 ? (
                          <button type="button" onClick={() => removeChild(idx)} style={styles.smallDangerBtn}>
                            Remove
                          </button>
                        ) : null}
                      </div>

                      <div style={styles.twoCol}>
                        <label style={styles.label}>
                          First name
                          <input
                            value={c.firstName}
                            onChange={e =>
                              setChildren(prev => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], firstName: e.target.value };
                                return next;
                              })
                            }
                            style={styles.input}
                          />
                        </label>

                        <label style={styles.label}>
                          Last name
                          <input
                            value={c.lastName}
                            onChange={e =>
                              setChildren(prev => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], lastName: e.target.value };
                                return next;
                              })
                            }
                            style={styles.input}
                          />
                        </label>
                      </div>

                      <label style={styles.label}>
                        Date of birth
                        <input
                          type="date"
                          value={c.dob}
                          onChange={e =>
                            setChildren(prev => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], dob: e.target.value };
                              return next;
                            })
                          }
                          style={styles.input}
                        />
                      </label>

                      <label style={styles.label}>
                        Medical information (required)
                        <textarea
                          value={c.medicalInfo}
                          onChange={e =>
                            setChildren(prev => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], medicalInfo: e.target.value };
                              return next;
                            })
                          }
                          style={styles.textarea}
                          placeholder="e.g. asthma, allergies, injuries, medication. Type 'None' if not applicable."
                        />
                      </label>

                      <div style={styles.twoCol}>
                        <label style={styles.label}>
                          Area
                          <select
                            value={c.areaId}
                            onChange={e =>
                              setChildren(prev => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], areaId: e.target.value, classId: '' };
                                return next;
                              })
                            }
                            style={styles.select}
                          >
                            <option value="">Select…</option>
                            {areas.map(a => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label style={styles.label}>
                          Class
                          <select
                            value={c.classId}
                            onChange={e =>
                              setChildren(prev => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], classId: e.target.value };
                                return next;
                              })
                            }
                            disabled={!c.areaId}
                            style={{ ...styles.select, opacity: c.areaId ? 1 : 0.6 }}
                          >
                            <option value="">Select…</option>
                            {childClasses.map(k => (
                              <option key={k.id} value={k.id}>
                                {k.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  );
                })}

                <button type="button" onClick={addAnotherChild} style={styles.secondaryBtn}>
                  + Add another child account
                </button>

                <button onClick={submit} disabled={saving} style={styles.primaryBtn}>
                  {saving ? 'Submitting…' : 'Create parent account & register student(s)'}
                </button>

                <div style={styles.smallNote}>
                  Already have an account?{' '}
                  <Link href="/" style={styles.inlineLink}>
                    Log in
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div style={styles.sectionTitle}>Account</div>

                <label style={styles.label}>
                  Email
                  <input
                    value={studentEmail}
                    onChange={e => setStudentEmail(e.target.value)}
                    style={styles.input}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </label>

                <label style={styles.label}>
                  Password
                  <input
                    type="password"
                    value={studentPassword}
                    onChange={e => setStudentPassword(e.target.value)}
                    style={styles.input}
                    placeholder="Create a password"
                    autoComplete="new-password"
                  />
                </label>

                <div style={styles.hr} />

                <div style={styles.sectionTitle}>Student details</div>

                <div style={styles.twoCol}>
                  <label style={styles.label}>
                    First name
                    <input value={studentFirstName} onChange={e => setStudentFirstName(e.target.value)} style={styles.input} />
                  </label>
                  <label style={styles.label}>
                    Last name
                    <input value={studentLastName} onChange={e => setStudentLastName(e.target.value)} style={styles.input} />
                  </label>
                </div>

                <label style={styles.label}>
                  Date of birth (optional)
                  <input type="date" value={studentDob} onChange={e => setStudentDob(e.target.value)} style={styles.input} />
                </label>

                <label style={styles.label}>
                  Phone
                  <input value={studentPhone} onChange={e => setStudentPhone(e.target.value)} style={styles.input} placeholder="07..." />
                </label>

                <label style={styles.label}>
                  Address
                  <input value={studentAddress} onChange={e => setStudentAddress(e.target.value)} style={styles.input} placeholder="Address" />
                </label>

                <label style={styles.label}>
                  Medical information (required)
                  <textarea
                    value={studentMedicalInfo}
                    onChange={e => setStudentMedicalInfo(e.target.value)}
                    style={styles.textarea}
                    placeholder="e.g. asthma, allergies, injuries, medication. Type 'None' if not applicable."
                  />
                </label>

                <div style={styles.hr} />

                <div style={styles.sectionTitle}>Choose class</div>

                <label style={styles.label}>
                  Area
                  <select
                    value={studentAreaId}
                    onChange={e => {
                      setStudentAreaId(e.target.value);
                      setStudentClassId('');
                    }}
                    style={styles.select}
                  >
                    <option value="">Select…</option>
                    {areas.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={styles.label}>
                  Class
                  <select
                    value={studentClassId}
                    onChange={e => setStudentClassId(e.target.value)}
                    disabled={!studentAreaId}
                    style={{ ...styles.select, opacity: studentAreaId ? 1 : 0.6 }}
                  >
                    <option value="">Select…</option>
                    {(filteredClassesFor.get(studentAreaId) || []).map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>

                <button onClick={submit} disabled={saving} style={styles.primaryBtn}>
                  {saving ? 'Submitting…' : 'Create account & register'}
                </button>

                <div style={styles.smallNote}>
                  Already have an account?{' '}
                  <Link href="/" style={styles.inlineLink}>
                    Log in
                  </Link>
                </div>
              </>
            )}
          </div>
        </section>

        <footer style={styles.footer}>© {new Date().getFullYear()} AG Martial Arts</footer>
      </div>
    </main>
  );
}

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
    alignContent: 'center',
    justifyItems: 'center',
    padding: '40px 18px',
    gap: 14,
  },
  brandRow: {
    width: '100%',
    maxWidth: 720,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    color: 'white',
  },
  brandTitle: { fontSize: 18, fontWeight: 800, lineHeight: 1.1 },
  brandSub: { fontSize: 13, opacity: 0.85, marginTop: 2 },
  card: {
    width: '100%',
    maxWidth: 720,
    background: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    padding: 22,
    border: '1px solid rgba(255,255,255,0.55)',
    boxShadow: '0 25px 70px rgba(0,0,0,0.35)',
    backdropFilter: 'blur(8px)',
  },
  backLink: { width: '100%', marginBottom: 12, fontSize: 14 },
  backAnchor: {
    textDecoration: 'none',
    color: '#b7280f',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    opacity: 0.9,
  },
  h1: { margin: 0, fontSize: 24, fontWeight: 800, color: '#111827' },
  p: { margin: '8px 0 0 0', fontSize: 14, color: '#374151' },
  form: { marginTop: 16, display: 'grid', gap: 12 },
  sectionTitle: { fontSize: 13, fontWeight: 900, color: '#111827', letterSpacing: 0.2, marginTop: 6 },
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
  textarea: {
    width: '100%',
    minHeight: 92,
    padding: '11px 12px',
    borderRadius: 12,
    border: '1px solid #d1d5db',
    outline: 'none',
    fontSize: 14,
    background: 'white',
    resize: 'vertical',
  },
  select: {
    width: '100%',
    padding: '11px 12px',
    borderRadius: 12,
    border: '1px solid #d1d5db',
    outline: 'none',
    fontSize: 14,
    background: 'white',
  },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  panel: {
    display: 'grid',
    gap: 10,
    padding: 12,
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.65)',
  },
  hr: { height: 1, background: '#e5e7eb', margin: '6px 0' },
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
    opacity: 1,
  },
  secondaryBtn: {
    borderRadius: 999,
    padding: '12px 14px',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    color: '#111827',
    background: 'white',
    border: '1px solid #d1d5db',
  },
  smallDangerBtn: {
    borderRadius: 999,
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    color: '#7f1d1d',
    background: 'rgba(185,28,28,0.08)',
    border: '1px solid rgba(185,28,28,0.25)',
  },
  error: { margin: '12px 0 0 0', fontSize: 13, color: '#b91c1c', fontWeight: 800 },
  smallNote: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  inlineLink: { color: '#b7280f', fontWeight: 800, textDecoration: 'none' },
  footer: {
  width: '100%',
  maxWidth: 720,
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
