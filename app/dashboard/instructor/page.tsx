'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null; // we’re using profiles.role now (since you synced it)
};

type ClassRow = {
  id: string;
  name: string | null;
};

type StudentDisplay = {
  id: string; // students.id
  user_id: string | null; // profiles.id
  name: string;
  email: string;
  dob: string | null;
  phone: string | null;
  address: string | null;
  status: string | null;
};

type StudentNote = {
  id: string;
  student_id: string;
  note: string;
  created_by: string;
  created_at: string;
  visible_to_student: boolean;
};

function safeLowerEmail(v: string) {
  return String(v || '').trim().toLowerCase();
}

export default function InstructorDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({}); // classId -> active count

  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [students, setStudents] = useState<StudentDisplay[]>([]);

  // Search (top 5 alphabetical like before)
  const [studentQuery, setStudentQuery] = useState('');

  // Student modal (read-only)
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentDisplay | null>(null);

  // Notes (instructors can add; students can see)
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    (async () => {
      setMsg('');
      setLoading(true);

      const { data: auth, error: aErr } = await supabase.auth.getUser();
      if (aErr) {
        setMsg(`Auth error: ${aErr.message}`);
        setLoading(false);
        return;
      }

      const user = auth.user;
      if (!user) {
        window.location.href = '/';
        return;
      }

      // Load profile, ensure instructor
      const { data: p, error: pErr } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .eq('id', user.id)
        .single();

      if (pErr) {
        setMsg(`Profile load error: ${pErr.message}`);
        setLoading(false);
        return;
      }

      if ((p as any).role !== 'instructor') {
        window.location.href = '/dashboard';
        return;
      }

      setProfile(p as ProfileRow);

      /**
       * IMPORTANT DEBUG/FIX:
       * In your franchise owner flow you “assigned instructor” as the class.primary_instructor_id,
       * but your instructor portal is reading instructor_class_assignments.
       *
       * So: load classes where:
       *  A) classes.primary_instructor_id == me
       *  OR
       *  B) I have an instructor_class_assignments row.
       */

      // A) Primary instructor classes
      const { data: primaryClasses, error: pcErr } = await supabase
        .from('classes')
        .select('id, name')
        .eq('primary_instructor_id', user.id);

      if (pcErr) {
        setMsg(`Primary classes load error: ${pcErr.message}`);
        setLoading(false);
        return;
      }

      // B) Assignment-table classes (optional)
      const { data: aRows, error: aErr2 } = await supabase
        .from('instructor_class_assignments')
        .select('class_id, classes:classes(id, name)')
        .eq('instructor_id', user.id);

      // If the assignments table doesn’t exist yet, don’t hard-fail.
      let assignedClasses: ClassRow[] = [];
      if (aErr2) {
        if ((aErr2.message || '').toLowerCase().includes('could not find the table')) {
          assignedClasses = [];
        } else {
          setMsg(`Assignments load error: ${aErr2.message}`);
          setLoading(false);
          return;
        }
      } else {
        assignedClasses = (aRows || []).map((r: any) => r.classes).filter(Boolean);
      }

      // Merge + de-dupe
      const merged = [...(primaryClasses || []), ...assignedClasses] as ClassRow[];
      const byId = new Map<string, ClassRow>();
      for (const c of merged) if (c?.id) byId.set(c.id, c);
      const finalClasses = Array.from(byId.values()).sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' })
      );

      setClasses(finalClasses);

      // Preload counts for each class (active students)
      const nextCounts: Record<string, number> = {};
      for (const c of finalClasses) {
        if (!c?.id) continue;
        const { count, error } = await supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('home_class_id', c.id)
          .eq('status', 'active');

        nextCounts[c.id] = error ? 0 : count || 0;
      }
      setCounts(nextCounts);

      setLoading(false);
    })();
  }, []);

  // Load students when class selected
  useEffect(() => {
    (async () => {
      setMsg('');
      setStudents([]);
      setStudentQuery('');
      setSelectedStudent(null);
      setShowStudentModal(false);

      if (!selectedClassId) return;

      // pull profiles for email/name (requires FK students.user_id -> profiles.id)
      const { data, error } = await supabase
        .from('students')
        .select('id, user_id, first_name, last_name, dob, phone, address, status, profiles:profiles(email, full_name)')
        .eq('home_class_id', selectedClassId);

      if (error) {
        setMsg(`Students load error: ${error.message}`);
        return;
      }

      const mapped: StudentDisplay[] = (data || []).map((r: any) => {
        const prof = r.profiles || {};
        const fallbackName = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();
        const name = (String(prof.full_name || '').trim() || fallbackName || '—').trim();
        const email = String(prof.email || '').trim();

        return {
          id: r.id,
          user_id: r.user_id,
          name,
          email,
          dob: r.dob ?? null,
          phone: r.phone ?? null,
          address: r.address ?? null,
          status: r.status ?? null,
        };
      });

      // sort for stable “top 5 alphabetical”
      mapped.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' }));

      setStudents(mapped);
    })();
  }, [selectedClassId]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const selectedClassName = useMemo(() => {
    const c = classes.find(x => x.id === selectedClassId);
    return c?.name ?? '—';
  }, [classes, selectedClassId]);

  const top5SearchResults = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return [];

    const matches = students.filter(s => {
      const hay = `${s.name} ${s.email}`.toLowerCase();
      return hay.includes(q);
    });

    matches.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' }));
    return matches.slice(0, 5);
  }, [students, studentQuery]);

  async function openStudent(s: StudentDisplay) {
    setMsg('');
    setSelectedStudent(s);
    setShowStudentModal(true);
    setNotes([]);
    setNoteText('');

    // Load notes for this student (visible to instructor)
    const { data, error } = await supabase
      .from('student_notes')
      .select('id, student_id, note, created_by, created_at, visible_to_student')
      .eq('student_id', s.id)
      .order('created_at', { ascending: false })
      .limit(25);

    if (error) {
      setMsg(`Notes load error: ${error.message}`);
      return;
    }

    setNotes((data || []) as StudentNote[]);
  }

  async function addNote() {
    if (!selectedStudent) return;

    const text = noteText.trim();
    if (!text) return;

    setSavingNote(true);
    setMsg('');

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setSavingNote(false);
      setMsg('Not signed in.');
      return;
    }

    const { error } = await supabase.from('student_notes').insert({
      student_id: selectedStudent.id,
      note: text,
      created_by: uid,
      visible_to_student: true,
    });

    setSavingNote(false);

    if (error) {
      setMsg(`Add note error: ${error.message}`);
      return;
    }

    setNoteText('');
    await openStudent(selectedStudent); // refresh modal notes
    setMsg('Note added ✅');
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
            <div style={styles.brandSub}>Instructor Portal</div>
          </div>
        </div>

        <section style={styles.card}>
          <div style={styles.cardTopRow}>
            <div>
              <h1 style={styles.h1}>Instructor Dashboard</h1>
              <p style={styles.p}>
                Signed in as <b>{profile?.email ?? '—'}</b>
              </p>
            </div>

            <div style={styles.badge}>Instructor</div>
          </div>

          {msg && <div style={msg.includes('✅') ? styles.alertOk : styles.alertError}>{msg}</div>}

          <div style={styles.divider} />

          {/* Classes */}
          <div style={styles.innerCard}>
            <div style={styles.sectionTitle}>My Classes</div>

            {classes.length === 0 ? (
              <div style={styles.muted}>
                Nothing assigned yet. (This portal shows classes where you are <b>Primary Instructor</b> or explicitly assigned via <code>instructor_class_assignments</code>.)
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <label style={styles.label}>
                  Choose a class
                  <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)} style={styles.select}>
                    <option value="">Select…</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({counts[c.id] ?? 0} active)
                      </option>
                    ))}
                  </select>
                </label>

                <div style={{ display: 'grid' }}>
                  {classes.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedClassId(c.id)}
                      style={{
                        ...styles.listRowBtn,
                        borderColor: selectedClassId === c.id ? 'rgba(185, 28, 28, 0.35)' : '#e5e7eb',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ fontWeight: 900 }}>{c.name ?? '—'}</div>
                        <div style={styles.pill}>{(counts[c.id] ?? 0) + ' active'}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Students + Search (top 5) */}
          <div style={styles.divider} />

          <div style={styles.innerCard}>
            <div style={styles.sectionTitle}>Student Search</div>

            {!selectedClassId ? (
              <div style={styles.muted}>Select a class first.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={styles.muted}>
                  Class: <b style={{ color: '#111827' }}>{selectedClassName}</b>
                </div>

                <input
                  value={studentQuery}
                  onChange={e => setStudentQuery(e.target.value)}
                  placeholder="Search by name or email…"
                  style={styles.input}
                />

                {studentQuery.trim() ? (
                  top5SearchResults.length ? (
                    <div style={styles.studentList}>
                      {top5SearchResults.map(s => (
                        <button
                          key={s.id}
                          onClick={() => openStudent(s)}
                          style={{ ...styles.studentRow, cursor: 'pointer', background: 'transparent', border: 'none', textAlign: 'left' }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                            <div style={styles.muted}>{s.email || '—'}</div>
                          </div>

                          <div style={styles.studentPill}>{s.status ?? '—'}</div>
                        </button>
                      ))}
                      <div style={styles.muted}>Showing top 5 (alphabetical). Refine your search for more.</div>
                    </div>
                  ) : (
                    <div style={styles.muted}>No students match that search.</div>
                  )
                ) : (
                  <div style={styles.muted}>Type to search. We’ll show the top 5 results.</div>
                )}
              </div>
            )}
          </div>

          {/* Student Modal (read-only + add notes) */}
          {showStudentModal && selectedStudent ? (
            <div
              style={styles.modalOverlay}
              onClick={() => {
                setShowStudentModal(false);
                setSelectedStudent(null);
              }}
            >
              <div style={{ ...styles.modalCard, maxWidth: 720 }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 950, fontSize: 16 }}>{selectedStudent.name || 'Student'}</div>
                    <div style={styles.muted}>{selectedStudent.email || '—'}</div>
                    <div style={styles.muted}>Read-only details. You can add notes (visible to the student).</div>
                  </div>

                  <button
                    onClick={() => {
                      setShowStudentModal(false);
                      setSelectedStudent(null);
                    }}
                    style={styles.smallEditBtn}
                  >
                    Close
                  </button>
                </div>

                <div style={styles.divider} />

                <div style={styles.grid2}>
                  <div style={styles.readonlyField}>
                    <div style={styles.readonlyLabel}>Status</div>
                    <div style={styles.readonlyValue}>{selectedStudent.status ?? '—'}</div>
                  </div>
                  <div style={styles.readonlyField}>
                    <div style={styles.readonlyLabel}>Date of birth</div>
                    <div style={styles.readonlyValue}>{selectedStudent.dob ? String(selectedStudent.dob).slice(0, 10) : '—'}</div>
                  </div>
                </div>

                <div style={styles.grid2}>
                  <div style={styles.readonlyField}>
                    <div style={styles.readonlyLabel}>Phone</div>
                    <div style={styles.readonlyValue}>{selectedStudent.phone ?? '—'}</div>
                  </div>
                  <div style={styles.readonlyField}>
                    <div style={styles.readonlyLabel}>Address</div>
                    <div style={styles.readonlyValue}>{selectedStudent.address ?? '—'}</div>
                  </div>
                </div>

                <div style={styles.divider} />

                <div style={styles.sectionTitle}>Notes (visible to student)</div>

                <label style={styles.label}>
                  Add a note
                  <textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="e.g. Great effort today. Work on posture in closed guard. Next session: 2 rounds focusing on frames."
                    style={styles.textarea}
                  />
                </label>

                <button onClick={addNote} style={styles.primaryBtn} disabled={savingNote}>
                  {savingNote ? 'Saving…' : 'Save note'}
                </button>

                <div style={{ ...styles.studentList, marginTop: 10 }}>
                  {notes.length === 0 ? (
                    <div style={styles.muted}>No notes yet.</div>
                  ) : (
                    notes.map(n => (
                      <div key={n.id} style={{ ...styles.studentRow, alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900 }}>{new Date(n.created_at).toLocaleString('en-GB')}</div>
                          <div style={{ fontSize: 13, color: '#111827', marginTop: 6, whiteSpace: 'pre-wrap' }}>{n.note}</div>
                        </div>
                        <div style={styles.studentPill}>Note</div>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <Link href="/dashboard" style={{ ...styles.muted, textDecoration: 'none' }}>
                    Back to main dashboard
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <footer style={styles.footer}>© {new Date().getFullYear()} AG Martial Arts</footer>
      </div>
    </main>
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
    padding: '28px 18px 40px',
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
  brandTitle: {
    fontSize: 18,
    fontWeight: 800,
    lineHeight: 1.1,
  },
  brandSub: {
    fontSize: 13,
    opacity: 0.85,
    marginTop: 2,
  },
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
  cardTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  h1: {
    margin: 0,
    fontSize: 24,
    fontWeight: 900,
    color: '#111827',
  },
  p: {
    margin: '8px 0 0 0',
    fontSize: 14,
    color: '#374151',
  },
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
  divider: {
    height: 1,
    background: '#e5e7eb',
    margin: '16px 0',
  },
  innerCard: {
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    padding: 16,
    background: 'white',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  muted: {
    fontSize: 13,
    color: '#6b7280',
  },
  label: {
    display: 'grid',
    gap: 6,
    fontSize: 13,
    fontWeight: 800,
    color: '#111827',
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
    padding: '11px 12px',
    borderRadius: 12,
    border: '1px solid #d1d5db',
    outline: 'none',
    fontSize: 14,
    background: 'white',
    minHeight: 90,
    resize: 'vertical',
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
    justifySelf: 'start',
    marginTop: 8,
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
  listRowBtn: {
    width: '100%',
    textAlign: 'left',
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    background: 'white',
    padding: 12,
    cursor: 'pointer',
  },
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
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    marginTop: 10,
  },
  readonlyField: {
    border: '1px solid #e5e7eb',
    borderRadius: 14,
    padding: 12,
    background: 'rgba(17,24,39,0.02)',
  },
  readonlyLabel: {
    fontSize: 12,
    fontWeight: 900,
    color: '#6b7280',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  readonlyValue: {
    fontSize: 14,
    fontWeight: 900,
    color: '#111827',
    wordBreak: 'break-word',
  },
  footer: {
    width: '100%',
    maxWidth: 860,
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
  studentList: {
    border: '1px solid #eee',
    borderRadius: 14,
    padding: 12,
    background: 'white',
    display: 'grid',
    gap: 10,
  },
  studentRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    borderBottom: '1px solid #f2f2f2',
    paddingBottom: 10,
  },
  studentPill: {
    borderRadius: 999,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 900,
    background: 'rgba(17,24,39,0.06)',
    border: '1px solid rgba(17,24,39,0.08)',
    whiteSpace: 'nowrap',
    maxWidth: 220,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
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
    maxWidth: 560,
    background: 'white',
    borderRadius: 18,
    padding: 16,
    border: '1px solid #eee',
    boxShadow: '0 25px 70px rgba(0,0,0,0.35)',
  },
};