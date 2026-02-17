'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

/* =========================
   TYPES
========================= */

type ProfileRow = {
  id: string;
  role: string | null;
  email: string | null;
  full_name: string | null;
};

type StudentRow = {
  id: string;
  user_id: string | null;
  parent_user_id?: string | null;

  first_name: string | null;
  last_name: string | null;
  dob: string | null;

  status: string | null;
  franchise_id: string | null;
  home_class_id: string | null;

  phone: string | null;
  address: string | null;
  medical_info: string | null;

  avatar_url: string | null;
};

type FranchiseRow = { id: string; name: string | null };

type ClassRow = {
  id: string;
  franchise_id?: string | null;
  name: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  is_active?: boolean | null;
};

type BeltRow = {
  id: string;
  belt_name: string | null;
  awarded_on: string | null;
  created_at: string | null;
};

type FeedbackNoteRow = {
  id: string;
  note: string | null;
  created_at: string | null;
};

/* =========================
   PAGE
========================= */

export default function PrimaryDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [profile, setProfile] = useState<ProfileRow | null>(null);

  // If the logged-in user is a student (adult etc), we show their own student row in the Account section
  const [primaryStudent, setPrimaryStudent] = useState<StudentRow | null>(null);

  // Parent-linked children list
  const [children, setChildren] = useState<StudentRow[]>([]);
  const [selectedChild, setSelectedChild] = useState<StudentRow | null>(null);

  // Add child modal
  const [showAddChild, setShowAddChild] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [childForm, setChildForm] = useState<{
    first_name: string;
    last_name: string;
    dob: string;
    phone: string;
    address: string;
    medical_info: string;
    home_class_id: string;
  }>({
    first_name: '',
    last_name: '',
    dob: '',
    phone: '',
    address: '',
    medical_info: '',
    home_class_id: '',
  });

  const isParent = (profile?.role ?? '').toLowerCase() === 'parent';
  const isStudent = (profile?.role ?? '').toLowerCase() === 'student';

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setMsg('');
        setLoading(true);

        const { data: s, error: sErr } = await supabase.auth.getSession();
        if (sErr) throw sErr;

        const user = s.session?.user;
        if (!user) {
          window.location.href = '/';
          return;
        }

        // Profile
        const { data: pr, error: pErr } = await supabase
          .from('profiles')
          .select('id, role, email, full_name')
          .eq('id', user.id)
          .single();

        if (pErr) throw pErr;
        if (cancelled) return;

        const p = pr as ProfileRow;
        setProfile(p);

        // Primary student row (only if role === student)
        let myStudent: StudentRow | null = null;
        if ((p.role ?? '').toLowerCase() === 'student') {
          const { data: st, error: stErr } = await supabase
            .from('students')
            .select('id, user_id, first_name, last_name, dob, status, franchise_id, home_class_id, phone, address, medical_info, avatar_url')
            .eq('user_id', user.id)
            .maybeSingle();

          if (stErr) throw stErr;
          myStudent = (st as StudentRow) ?? null;
        }
        if (cancelled) return;
        setPrimaryStudent(myStudent);

        // Children list (works for parent accounts; if a student has kids too, this still works)
        const { data: kids, error: kErr } = await supabase
          .from('students')
          .select('id, user_id, first_name, last_name, dob, status, franchise_id, home_class_id, phone, address, medical_info, avatar_url')
          .eq('parent_user_id', user.id)
          .order('first_name', { ascending: true });

        if (kErr) throw kErr;
        if (cancelled) return;

        const kidRows = (kids || []) as StudentRow[];
        setChildren(kidRows);

        // keep selected if still exists; else pick first
        setSelectedChild(prev => {
          if (prev && kidRows.some(k => k.id === prev.id)) return prev;
          return kidRows.length ? kidRows[0] : null;
        });

        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setMsg(e?.message || 'Something went wrong loading your dashboard.');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const badgeText = useMemo(() => {
    const r = (profile?.role ?? '').toLowerCase();
    if (r === 'parent') return 'Parent';
    if (r === 'student') return 'Student';
    if (r) return r;
    return 'User';
  }, [profile?.role]);

  const pageTitle = 'Primary User Dashboard';

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
            <div style={styles.brandSub}>{pageTitle}</div>
          </div>
        </div>

        <section style={styles.card}>
          <div style={styles.cardTopRow}>
            <div>
              <h1 style={styles.h1}>{pageTitle}</h1>
              <p style={styles.p}>Manage your account and (if applicable) your children’s memberships.</p>
            </div>
            <div style={styles.badge}>{badgeText}</div>
          </div>

          {msg ? <div style={styles.alertError}>{msg}</div> : null}

          <div style={styles.divider} />

          {/* ACCOUNT DETAILS */}
          <div style={styles.innerCard}>
            <div style={styles.sectionTitle}>Account details</div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div style={styles.infoRow}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={styles.infoLabel}>Name</div>
                  <div style={styles.infoValue}>{profile?.full_name || '—'}</div>
                </div>
              </div>

              <div style={styles.infoRow}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={styles.infoLabel}>Email</div>
                  <div style={styles.infoValue}>{profile?.email || '—'}</div>
                </div>
              </div>

              <div style={styles.infoRow}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={styles.infoLabel}>Account type</div>
                  <div style={styles.infoValue}>{isParent ? 'parent' : isStudent ? 'student' : profile?.role ?? '—'}</div>
                </div>
              </div>

              {/* For parent accounts: no class + status "parent" */}
              {isParent ? (
                <>
                  <div style={styles.infoRow}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={styles.infoLabel}>Status</div>
                      <div style={styles.infoValue}>parent</div>
                    </div>
                  </div>

                  <div style={styles.infoRow}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={styles.infoLabel}>Registered class</div>
                      <div style={styles.infoValue}>—</div>
                      <div style={styles.muted}>Parents don’t have a class assigned. Your children will.</div>
                    </div>
                  </div>
                </>
              ) : null}

              {/* For student accounts: show their student profile inline */}
              {isStudent ? (
                <div style={{ marginTop: 6 }}>
                  {primaryStudent ? (
                    <PrimaryStudentInline
                      title="My membership"
                      student={primaryStudent}
                      onStudentPatched={patch => setPrimaryStudent(prev => (prev ? { ...prev, ...patch } : prev))}
                    />
                  ) : (
                    <div style={styles.muted}>
                      We couldn’t find a student record linked to this account yet.
                      <div style={{ marginTop: 6 }}>If you’ve just registered, it may not have saved or RLS blocked the insert.</div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div style={styles.divider} />

          {/* MY CHILDREN */}
          <div style={styles.innerCard}>
            <div style={styles.cardTopRow}>
              <div>
                <div style={styles.sectionTitle}>My children</div>
                <div style={styles.muted}>{children.length ? 'Select a child to view and manage their details.' : 'No children linked to this account yet.'}</div>
              </div>

              <button onClick={() => setShowAddChild(true)} style={styles.primaryBtn}>
                + Add child
              </button>
            </div>

            <div style={styles.divider} />

            {children.length === 0 ? (
              <div style={styles.muted}>If you expected children here, it can mean the student rows didn’t save, or RLS blocked inserts.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {children.map(k => (
                  <button
                    key={k.id}
                    onClick={() => setSelectedChild(k)}
                    style={{
                      ...styles.listRowBtn,
                      borderColor: selectedChild?.id === k.id ? 'rgba(185, 28, 28, 0.35)' : '#e5e7eb',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ fontWeight: 900 }}>{`${k.first_name ?? ''} ${k.last_name ?? ''}`.trim() || '—'}</div>
                      <div style={styles.pill}>{k.status ?? '—'}</div>
                    </div>

                    <div style={{ ...styles.muted, marginTop: 6 }}>DOB: {k.dob ? String(k.dob).slice(0, 10) : '—'}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* SELECTED CHILD DETAILS */}
          {selectedChild ? (
            <>
              <div style={styles.divider} />

              <div style={styles.innerCard}>
                <div style={styles.cardTopRow}>
                  <div>
                    <div style={styles.sectionTitle}>Child details</div>
                    <div style={styles.subTitle}>{(`${selectedChild.first_name ?? ''} ${selectedChild.last_name ?? ''}`.trim() || '—')}</div>
                    <div style={styles.muted}>You can update contact details, medical info, and change their registered class.</div>
                  </div>

                  <button onClick={() => setSelectedChild(null)} style={styles.secondaryBtn}>
                    Close
                  </button>
                </div>

                <div style={styles.divider} />

                <PrimaryStudentView
                  studentId={selectedChild.id}
                  canChangeClass
                  onStudentPatched={patch => {
                    setSelectedChild(prev => (prev ? { ...prev, ...patch } : prev));
                    setChildren(prev => prev.map(s => (s.id === selectedChild.id ? { ...s, ...patch } : s)));
                  }}
                />

                <div style={{ marginTop: 14, textAlign: 'center' }}>
                  <Link href="/dashboard" style={{ ...styles.muted, textDecoration: 'none' }}>
                    Back to main dashboard
                  </Link>
                </div>
              </div>
            </>
          ) : null}
        </section>

        <footer style={styles.footer}>© {new Date().getFullYear()} AG Martial Arts</footer>
      </div>

      {/* ADD CHILD MODAL */}
      {showAddChild ? (
        <AddChildModal
          open={showAddChild}
          onClose={() => {
            setShowAddChild(false);
            setMsg('');
          }}
          profile={profile}
          childForm={childForm}
          setChildForm={setChildForm}
          addingChild={addingChild}
          setAddingChild={setAddingChild}
          onChildCreated={newChild => {
            setChildren(prev => {
              const next = [...prev, newChild];
              next.sort((a, b) => (a.first_name ?? '').localeCompare(b.first_name ?? '', 'en', { sensitivity: 'base' }));
              return next;
            });
            setSelectedChild(newChild);
          }}
          setMsg={setMsg}
        />
      ) : null}
    </main>
  );
}

/* =========================
   INLINE STUDENT (for "My membership")
========================= */

function PrimaryStudentInline({
  title,
  student,
  onStudentPatched,
}: {
  title: string;
  student: StudentRow;
  onStudentPatched: (patch: Partial<StudentRow>) => void;
}) {
  return (
    <div style={styles.innerCard2}>
      <div style={styles.sectionTitle}>{title}</div>
      <PrimaryStudentView studentId={student.id} canChangeClass onStudentPatched={onStudentPatched} />
    </div>
  );
}

/* =========================
   ADD CHILD MODAL
========================= */

function AddChildModal({
  open,
  onClose,
  profile,
  childForm,
  setChildForm,
  addingChild,
  setAddingChild,
  onChildCreated,
  setMsg,
}: {
  open: boolean;
  onClose: () => void;
  profile: ProfileRow | null;
  childForm: {
    first_name: string;
    last_name: string;
    dob: string;
    phone: string;
    address: string;
    medical_info: string;
    home_class_id: string;
  };
  setChildForm: Dispatch<
    SetStateAction<{
      first_name: string;
      last_name: string;
      dob: string;
      phone: string;
      address: string;
      medical_info: string;
      home_class_id: string;
    }>
  >;
  addingChild: boolean;
  setAddingChild: (v: boolean) => void;
  onChildCreated: (child: StudentRow) => void;
  setMsg: (m: string) => void;
}) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [localMsg, setLocalMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLocalMsg('');
        setLoadingClasses(true);

        const { data: cl, error: clErr } = await supabase
          .from('classes')
          .select('id, name, day_of_week, start_time, end_time, location, franchise_id, is_active')
          .eq('is_active', true)
          .order('day_of_week', { ascending: true })
          .order('start_time', { ascending: true });

        if (clErr) throw clErr;
        if (cancelled) return;

        setClasses((cl || []) as ClassRow[]);
        setLoadingClasses(false);
      } catch (e: any) {
        if (cancelled) return;
        setLocalMsg(e?.message || 'Failed to load classes.');
        setLoadingClasses(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function dayLabelLong(d: number | null) {
    const map: Record<number, string> = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday' };
    return d ? map[d] ?? String(d) : '—';
  }

  function classLabel(c: ClassRow) {
    const time = c.start_time ? String(c.start_time).slice(0, 5) : '';
    const day = dayLabelLong(c.day_of_week);
    return `${c.name || '—'}${day ? ` • ${day}` : ''}${time ? ` • ${time}` : ''}`;
  }

  async function createChild() {
    setLocalMsg('');
    setMsg('');

    const fn = childForm.first_name.trim();
    const ln = childForm.last_name.trim();
    if (!fn) return setLocalMsg('Enter a first name.');
    if (!ln) return setLocalMsg('Enter a last name.');
    if (!childForm.home_class_id) return setLocalMsg('Select a class.');

    setAddingChild(true);

    try {
      const { data: auth, error: aErr } = await supabase.auth.getUser();
      if (aErr) throw aErr;

      const parentId = auth.user?.id;
      if (!parentId) throw new Error('Not signed in.');

      // derive franchise from class
      const chosen = classes.find(c => c.id === childForm.home_class_id);
      const franchise_id = chosen?.franchise_id ?? null;

      const insertPayload: any = {
        parent_user_id: parentId,
        user_id: null,
        first_name: fn,
        last_name: ln,
        dob: childForm.dob ? childForm.dob : null,
        status: 'active',
        home_class_id: childForm.home_class_id,
        franchise_id,
        phone: childForm.phone.trim() || null,
        address: childForm.address.trim() || null,
        medical_info: childForm.medical_info.trim() || null,

        // If your schema has these guardian fields, keep them. If not, remove them.
        guardian_is_registering: true,
        guardian_name: (profile?.full_name ?? '').trim() || null,
        guardian_relationship: 'Parent/Guardian',
        guardian_email: (profile?.email ?? '').trim() || null,
        guardian_phone: childForm.phone.trim() || null,
        guardian_address: childForm.address.trim() || null,
      };

      const { data: created, error: cErr } = await supabase
        .from('students')
        .insert(insertPayload)
        .select('id, user_id, first_name, last_name, dob, status, franchise_id, home_class_id, phone, address, medical_info, avatar_url')
        .single();

      if (cErr) throw cErr;

      onChildCreated(created as StudentRow);

      // reset
      setChildForm({
        first_name: '',
        last_name: '',
        dob: '',
        phone: '',
        address: '',
        medical_info: '',
        home_class_id: '',
      });

      setMsg('Child added ✅');
      onClose();
    } catch (e: any) {
      setLocalMsg(e?.message || 'Failed to add child.');
    } finally {
      setAddingChild(false);
    }
  }

  if (!open) return null;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <div style={{ fontWeight: 950, fontSize: 16 }}>Add child</div>
          <button onClick={onClose} style={styles.smallEditBtn}>
            Close
          </button>
        </div>

        <div style={styles.divider} />

        {localMsg ? <div style={styles.alertError}>{localMsg}</div> : null}

        <div style={{ display: 'grid', gap: 10 }}>
          <div style={styles.grid2}>
            <label style={styles.label}>
              First name
              <input
                value={childForm.first_name}
                onChange={e => setChildForm({ ...childForm, first_name: e.target.value })}
                style={styles.input}
                placeholder="e.g. Aiza"
                autoFocus
              />
            </label>

            <label style={styles.label}>
              Last name
              <input value={childForm.last_name} onChange={e => setChildForm({ ...childForm, last_name: e.target.value })} style={styles.input} placeholder="e.g. Imtiaz" />
            </label>
          </div>

          <label style={styles.label}>
            Date of birth (optional)
            <input type="date" value={childForm.dob} onChange={e => setChildForm({ ...childForm, dob: e.target.value })} style={styles.input} />
          </label>

          <label style={styles.label}>
            Class
            <select value={childForm.home_class_id} onChange={e => setChildForm({ ...childForm, home_class_id: e.target.value })} style={styles.select} disabled={loadingClasses}>
              <option value="">{loadingClasses ? 'Loading classes…' : 'Select a class…'}</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {classLabel(c)}
                </option>
              ))}
            </select>
            <div style={styles.muted}>Franchise area is set automatically from the class.</div>
          </label>

          <div style={styles.grid2}>
            <label style={styles.label}>
              Phone (optional)
              <input value={childForm.phone} onChange={e => setChildForm({ ...childForm, phone: e.target.value })} style={styles.input} />
            </label>

            <label style={styles.label}>
              Address (optional)
              <input value={childForm.address} onChange={e => setChildForm({ ...childForm, address: e.target.value })} style={styles.input} />
            </label>
          </div>

          <label style={styles.label}>
            Medical info (optional)
            <textarea
              value={childForm.medical_info}
              onChange={e => setChildForm({ ...childForm, medical_info: e.target.value })}
              style={styles.textarea}
              placeholder="e.g. asthma, allergies…"
              rows={4}
            />
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={createChild} style={styles.primaryBtn} disabled={addingChild || loadingClasses}>
              {addingChild ? 'Adding…' : 'Add child'}
            </button>
            <button onClick={onClose} style={styles.secondaryBtn} disabled={addingChild}>
              Cancel
            </button>
          </div>

          <div style={styles.muted}>
            If this fails with RLS, you’ll need a policy that allows a parent to insert a student row where <b>parent_user_id = auth.uid()</b>.
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================
   STUDENT VIEW (primary + children)
========================= */

function PrimaryStudentView({
  studentId,
  canChangeClass,
  onStudentPatched,
}: {
  studentId: string;
  canChangeClass: boolean;
  onStudentPatched: (patch: Partial<StudentRow>) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [student, setStudent] = useState<StudentRow | null>(null);
  const [franchise, setFranchise] = useState<FranchiseRow | null>(null);
  const [homeClass, setHomeClass] = useState<ClassRow | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);

  const [belts, setBelts] = useState<BeltRow[]>([]);
  const [notes, setNotes] = useState<FeedbackNoteRow[]>([]);

  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<{
    phone: string;
    address: string;
    medical_info: string;
    home_class_id: string;
  }>({
    phone: '',
    address: '',
    medical_info: '',
    home_class_id: '',
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setMsg('');
        setLoading(true);

        const { data: st, error: sErr } = await supabase
          .from('students')
          .select('id, user_id, first_name, last_name, dob, phone, address, status, franchise_id, home_class_id, medical_info, avatar_url')
          .eq('id', studentId)
          .single();

        if (sErr) throw sErr;
        if (cancelled) return;

        const s = st as StudentRow;
        setStudent(s);

        setForm({
          phone: s.phone ?? '',
          address: s.address ?? '',
          medical_info: s.medical_info ?? '',
          home_class_id: s.home_class_id ?? '',
        });

        // Signed URL for avatar (if present)
        if (s.avatar_url) {
          const { data: signed, error: sigErr } = await supabase.storage.from('student-avatars').createSignedUrl(s.avatar_url, 60 * 60);
          if (!sigErr) setAvatarUrl(signed?.signedUrl || '');
        } else {
          setAvatarUrl('');
        }

        // Franchise
        if (s.franchise_id) {
          const { data: fr, error: frErr } = await supabase.from('franchises').select('id, name').eq('id', s.franchise_id).single();
          if (!frErr) setFranchise(fr as FranchiseRow);
        } else {
          setFranchise(null);
        }

        // Class (current)
        if (s.home_class_id) {
          const { data: hc, error: hcErr } = await supabase
            .from('classes')
            .select('id, name, day_of_week, start_time, end_time, location, franchise_id')
            .eq('id', s.home_class_id)
            .single();
          if (!hcErr) setHomeClass(hc as ClassRow);
        } else {
          setHomeClass(null);
        }

        // Load classes (for dropdown)
        const { data: cl, error: clErr } = await supabase
          .from('classes')
          .select('id, name, day_of_week, start_time, end_time, location, franchise_id, is_active')
          .eq('is_active', true)
          .order('day_of_week', { ascending: true })
          .order('start_time', { ascending: true });

        if (clErr) throw clErr;
        setClasses((cl || []) as ClassRow[]);

        // Belt history
        const { data: br, error: brErr } = await supabase
          .from('belt_records')
          .select('id, belt_name, awarded_on, created_at')
          .eq('student_id', s.id)
          .order('awarded_on', { ascending: false })
          .order('created_at', { ascending: false });

        if (brErr) throw brErr;
        setBelts((br || []) as BeltRow[]);

        // Most recent 3 feedback notes
        const { data: nr, error: nErr } = await supabase
          .from('feedback_notes')
          .select('id, note, created_at')
          .eq('student_id', s.id)
          .order('created_at', { ascending: false })
          .limit(3);

        if (nErr) throw nErr;
        setNotes((nr || []) as FeedbackNoteRow[]);

        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setMsg(e?.message || 'Failed to load student details.');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  function dayLabel(d: number | null) {
    const map: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
    return d ? map[d] ?? String(d) : '';
  }

  function dayLabelLong(d: number | null) {
    const map: Record<number, string> = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday' };
    return d ? map[d] ?? String(d) : '—';
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  const displayName = useMemo(() => {
    const fn = student?.first_name ?? '';
    const ln = student?.last_name ?? '';
    return `${fn} ${ln}`.trim() || '—';
  }, [student?.first_name, student?.last_name]);

  const registeredClassText = homeClass?.name
    ? `${homeClass.name}${homeClass.day_of_week ? ` • ${dayLabel(homeClass.day_of_week)}` : ''}${homeClass.start_time ? ` • ${String(homeClass.start_time).slice(0, 5)}` : ''}${
        homeClass.end_time ? `–${String(homeClass.end_time).slice(0, 5)}` : ''
      }`
    : '—';

  async function changeAvatar(file: File) {
    if (!student) return;
    setMsg('');

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${student.id}/avatar.${ext}`;

    const { error: upErr } = await supabase.storage.from('student-avatars').upload(path, file, {
      upsert: true,
      contentType: file.type || 'image/jpeg',
      cacheControl: '3600',
    });
    if (upErr) return setMsg(`Avatar upload error: ${upErr.message}`);

    const { error: uErr } = await supabase.from('students').update({ avatar_url: path }).eq('id', student.id);
    if (uErr) return setMsg(`Avatar save error: ${uErr.message}`);

    const { data: signed, error: sigErr } = await supabase.storage.from('student-avatars').createSignedUrl(path, 60 * 60);
    if (sigErr) return setMsg(`Avatar link error: ${sigErr.message}`);

    setAvatarUrl(signed?.signedUrl || '');

    setStudent(prev => (prev ? { ...prev, avatar_url: path } : prev));
    onStudentPatched({ avatar_url: path });

    setMsg('Profile picture updated ✅');
  }

  function classLabel(c: ClassRow) {
    const time = c.start_time ? String(c.start_time).slice(0, 5) : '';
    const day = dayLabelLong(c.day_of_week);
    return `${c.name || '—'}${day ? ` • ${day}` : ''}${time ? ` • ${time}` : ''}`;
  }

  async function save() {
    setMsg('');
    if (!student) return;

    setSaving(true);

    try {
      const patch: any = {
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        medical_info: form.medical_info.trim() || null,
      };

      // Class change: allowed, but franchise is derived from the class
      if (canChangeClass) {
        const newClassId = form.home_class_id || null;
        patch.home_class_id = newClassId;

        if (newClassId) {
          const chosen = classes.find(c => c.id === newClassId);
          const derivedFranchiseId = chosen?.franchise_id ?? null;
          patch.franchise_id = derivedFranchiseId;
        }
      }

      const { error } = await supabase.from('students').update(patch).eq('id', student.id);
      if (error) throw error;

      setStudent(prev => (prev ? { ...prev, ...patch } : prev));
      onStudentPatched(patch);

      // refresh class + franchise display bits
      if (patch.franchise_id) {
        const { data: fr } = await supabase.from('franchises').select('id, name').eq('id', patch.franchise_id).maybeSingle();
        if (fr) setFranchise(fr as FranchiseRow);
      }

      if (patch.home_class_id) {
        const { data: hc } = await supabase
          .from('classes')
          .select('id, name, day_of_week, start_time, end_time, location, franchise_id')
          .eq('id', patch.home_class_id)
          .maybeSingle();
        if (hc) setHomeClass(hc as ClassRow);
      } else {
        setHomeClass(null);
      }

      setEditMode(false);
      setMsg('Saved ✅');
    } catch (e: any) {
      setMsg(`Save error: ${e?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={styles.innerCard2}>Loading details…</div>;
  if (!student) return <div style={styles.alertError}>{msg || 'No student profile found.'}</div>;

  return (
    <>
      {msg ? <div style={msg.includes('✅') ? styles.alertOk : styles.alertError}>{msg}</div> : null}

      {/* Profile / Details */}
      <div style={styles.innerCard2}>
        <div style={styles.sectionTitle}>Profile</div>

        <div style={styles.profileTopRow}>
          <button type="button" onClick={() => fileRef.current?.click()} style={styles.avatarButton} aria-label="Change profile photo" title="Change photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {avatarUrl ? <img src={avatarUrl} alt="Student profile" style={styles.avatarImg as any} /> : <div style={styles.muted}>Add</div>}
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

            <div style={{ ...styles.muted, marginTop: 10 }}>
              <b style={{ color: '#111827' }}>DOB:</b> {student.dob ? String(student.dob).slice(0, 10) : '—'}
            </div>

            <div style={{ ...styles.muted, marginTop: 6 }}>
              <b style={{ color: '#111827' }}>Status:</b> {student.status ?? '—'}
            </div>

            <div style={{ ...styles.muted, marginTop: 6 }}>
              <b style={{ color: '#111827' }}>Area:</b> {franchise?.name ?? '—'}
            </div>

            <div style={{ ...styles.muted, marginTop: 6 }}>
              <b style={{ color: '#111827' }}>Registered class:</b> {registeredClassText}
            </div>

            <div style={{ ...styles.muted, marginTop: 6 }}>
              <b style={{ color: '#111827' }}>Location:</b> {homeClass?.location || '—'}
            </div>
          </div>
        </div>

        <div style={styles.divider} />

        {/* Phone */}
        <div style={styles.infoRow}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={styles.infoLabel}>Phone</div>
            {!editMode ? <div style={styles.infoValue}>{student.phone || '—'}</div> : null}
            {editMode ? <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={styles.input} /> : null}
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
            {editMode ? <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={styles.input} /> : null}
          </div>
        </div>

        {/* Medical info */}
        <div style={{ marginTop: 12 }}>
          <div style={styles.infoLabel}>Medical info</div>
          {!editMode ? (
            <div style={styles.infoValue}>{student.medical_info || '—'}</div>
          ) : (
            <textarea value={form.medical_info} onChange={e => setForm({ ...form, medical_info: e.target.value })} style={styles.textarea} rows={4} placeholder="Add any medical notes here…" />
          )}
        </div>

        {/* Change class */}
        {canChangeClass ? (
          <div style={{ marginTop: 12 }}>
            <div style={styles.infoLabel}>Registered class</div>

            {!editMode ? (
              <div style={styles.infoValue}>{registeredClassText}</div>
            ) : (
              <select value={form.home_class_id} onChange={e => setForm({ ...form, home_class_id: e.target.value })} style={styles.select}>
                <option value="">Select a class…</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {classLabel(c)}
                  </option>
                ))}
              </select>
            )}

            <div style={styles.muted}>(Franchise area updates automatically based on class.)</div>
          </div>
        ) : null}

        {/* Save / cancel */}
        {editMode ? (
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={save} style={styles.primaryBtn} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>

            <button
              onClick={() => {
                setEditMode(false);
                setForm({
                  phone: student.phone ?? '',
                  address: student.address ?? '',
                  medical_info: student.medical_info ?? '',
                  home_class_id: student.home_class_id ?? '',
                });
                setMsg('');
              }}
              style={styles.secondaryBtn}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>

      <div style={styles.divider} />

      {/* Belt History */}
      <div style={styles.sectionTitle}>Belt History</div>

      <div style={styles.innerCard2}>
        {belts.length === 0 ? <div style={styles.muted}>No belt records yet.</div> : null}

        {belts.map((b, idx) => (
          <div key={b.id} style={{ ...styles.beltRow, borderBottom: idx === belts.length - 1 ? 'none' : '1px solid #eee' }}>
            <div style={{ fontWeight: 900 }}>{b.belt_name || '—'}</div>
            <div style={styles.muted}>Awarded: {b.awarded_on ? String(b.awarded_on).slice(0, 10) : '—'}</div>
          </div>
        ))}
      </div>

      <div style={styles.divider} />

      {/* Feedback Notes (latest 3) */}
      <div style={styles.sectionTitle}>Feedback Notes</div>

      <div style={styles.innerCard2}>
        {notes.length === 0 ? <div style={styles.muted}>No feedback notes yet.</div> : null}

        {notes.map((n, idx) => (
          <div key={n.id} style={{ ...styles.noteRow, borderBottom: idx === notes.length - 1 ? 'none' : '1px solid #eee' }}>
            <div style={styles.noteTopRow}>
              <div style={{ fontWeight: 900 }}>Note</div>
              <div style={styles.noteDate}>{formatDate(n.created_at)}</div>
            </div>
            <div style={{ ...styles.muted, marginTop: 6, whiteSpace: 'pre-wrap' }}>{n.note || '—'}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/* =========================
   STYLES (reused)
========================= */

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', position: 'relative', overflow: 'hidden', fontFamily: 'system-ui', color: '#111827' },
  bg: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'linear-gradient(135deg, #0b0f19 0%, #111827 40%, #1f2937 100%)',
    transform: 'scale(1.02)',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(1200px circle at 20% 10%, rgba(220, 38, 38, 0.25), transparent 50%), rgba(0,0,0,0.45)',
  },
  container: {
    position: 'relative',
    zIndex: 1,
    minHeight: '100vh',
    display: 'grid',
    alignContent: 'start',
    justifyItems: 'center',
    padding: '28px 18px 40px',
    gap: 14,
  },
  headerRow: { width: '100%', maxWidth: 860, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  backAnchor: { textDecoration: 'none', color: 'rgba(255,255,255,0.9)', fontWeight: 700, fontSize: 13, opacity: 0.9 },
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

  brandRow: { width: '100%', maxWidth: 860, display: 'flex', alignItems: 'center', gap: 12, color: 'white', marginTop: 6 },
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
  subTitle: { fontSize: 13, fontWeight: 900, marginTop: 2 },
  muted: { fontSize: 13, color: '#6b7280' },

  label: { display: 'grid', gap: 6, fontSize: 13, fontWeight: 900, color: '#111827' },

  listRowBtn: { width: '100%', textAlign: 'left', borderRadius: 12, border: '1px solid #e5e7eb', background: 'white', padding: 12, cursor: 'pointer' },
  pill: {
    fontSize: 12,
    fontWeight: 900,
    padding: '6px 10px',
    borderRadius: 999,
    background: 'rgba(17,24,39,0.06)',
    border: '1px solid rgba(17,24,39,0.12)',
    color: '#111827',
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
  },

  profileTopRow: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' },
  nameTitle: { fontSize: 16, fontWeight: 950, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

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

  input: { width: '100%', padding: '11px 12px', borderRadius: 12, border: '1px solid #d1d5db', outline: 'none', fontSize: 14, background: 'white' },
  textarea: { width: '100%', padding: '11px 12px', borderRadius: 12, border: '1px solid #d1d5db', outline: 'none', fontSize: 14, background: 'white', resize: 'vertical' },
  select: { width: '100%', padding: '11px 12px', borderRadius: 12, border: '1px solid #d1d5db', outline: 'none', fontSize: 14, background: 'white' },

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
  secondaryBtn: { borderRadius: 999, padding: '12px 14px', fontSize: 14, fontWeight: 900, cursor: 'pointer', color: '#111827', background: 'white', border: '1px solid #d1d5db' },

  infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  infoLabel: { fontSize: 12, fontWeight: 900, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  infoValue: { fontSize: 14, fontWeight: 800, color: '#111827', wordBreak: 'break-word' },
  smallEditBtn: { borderRadius: 999, padding: '8px 10px', fontSize: 12, fontWeight: 900, cursor: 'pointer', color: '#111827', background: 'white', border: '1px solid #d1d5db', height: 34, flexShrink: 0 },

  beltRow: { padding: '12px 0', display: 'grid', gap: 4 },

  noteRow: { padding: '12px 0' },
  noteTopRow: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' },
  noteDate: { fontSize: 12, fontWeight: 900, color: '#6b7280' },

  alertError: { marginTop: 12, padding: 12, borderRadius: 14, border: '1px solid rgba(185, 28, 28, 0.25)', background: 'rgba(185, 28, 28, 0.08)', color: '#7f1d1d', fontSize: 13, fontWeight: 800 },
  alertOk: { marginTop: 12, padding: 12, borderRadius: 14, border: '1px solid rgba(16, 185, 129, 0.25)', background: 'rgba(16, 185, 129, 0.08)', color: '#065f46', fontSize: 13, fontWeight: 800 },

  footer: { width: '100%', maxWidth: 860, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 8 },
  loadingWrap: { minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui', background: '#0b0f19', color: 'white' },
  loadingCard: { padding: 18, borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)' },

  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'grid',
    placeItems: 'center',
    zIndex: 50,
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 620,
    background: 'white',
    borderRadius: 18,
    padding: 16,
    border: '1px solid #eee',
    boxShadow: '0 25px 70px rgba(0,0,0,0.35)',
  },

  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
};
