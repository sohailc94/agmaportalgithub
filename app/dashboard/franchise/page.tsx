'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

/**
 * GHL inbound webhook (you provided)
 */
const GHL_INBOUND_WEBHOOK_URL =
  'https://services.leadconnectorhq.com/hooks/NtEllTqZFiSdrFpRKb4I/webhook-trigger/df5edf43-b89f-46f9-b8de-e13d78424f7a';

type Profile = {
  id: string;
  role: string | null;
  franchise_id: string | null;
  email: string | null;
  full_name: string | null;
};

type Franchise = { id: string; name: string };

type ClassRow = {
  id: string;
  name: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  is_active: boolean | null;
  primary_instructor_id: string | null;
};

type InstructorRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type StudentRow = {
  id: string;
  user_id: string | null;
  franchise_id: string | null;
  home_class_id: string | null;
  first_name: string | null;
  last_name: string | null;
  dob: string | null;
  status: string | null;

  phone: string | null;
  address: string | null;

  guardian_is_registering: boolean | null;
  guardian_name: string | null;
  guardian_relationship: string | null;
  guardian_email: string | null;
  guardian_phone: string | null;
  guardian_address: string | null;

  medical_info: string | null;
  avatar_url: string | null;
};

type StudentDisplay = {
  id: string; // students.id
  user_id: string | null; // profiles.id (nullable)
  name: string;
  email: string; // may be guardian email or blank
  home_class_id: string | null;
  status: string | null;
};

type Belt = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

type FeedbackNote = {
  id: string;
  student_id: string;
  note: string;
  created_by: string;
  created_at: string;
};

type StudentBelt = {
  id: string;
  student_id: string;
  belt_id: string;
  awarded_at: string; // date
  awarded_by: string;
  created_at: string;
};

type InstructorInvite = {
  id: string;
  franchise_id: string;
  invited_by: string;
  email: string;
  full_name: string | null;
  status: 'pending' | 'active' | 'inactive' | 'expired';
  token: string;
  created_at: string;
  completed_at: string | null;
};

export default function FranchiseOwnerPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setError('');
      setLoading(true);

      const { data: auth, error: aErr } = await supabase.auth.getUser();
      if (aErr) {
        setError(aErr.message);
        setLoading(false);
        return;
      }

      const user = auth.user;
      if (!user) {
        window.location.href = '/';
        return;
      }

      const { data, error: pErr } = await supabase
        .from('profiles')
        .select('id, role, franchise_id, email, full_name')
        .eq('id', user.id)
        .single();

      if (pErr) {
        setError(pErr.message);
        setLoading(false);
        return;
      }

      const p = data as Profile;

      if (p.role !== 'franchise_owner') {
        window.location.href = '/dashboard';
        return;
      }

      setProfile(p);
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
            <div style={styles.brandSub}>Franchise Owner Portal</div>
          </div>
        </div>

        <section style={styles.card}>
          <div style={styles.cardTopRow}>
            <div>
              <h1 style={styles.h1}>Franchise Owner Dashboard</h1>
              <p style={styles.p}>
                Signed in as <b>{profile?.email ?? '—'}</b>
              </p>
            </div>

            <div style={styles.badge}>{profile?.role ?? '—'}</div>
          </div>

          {error ? (
            <div style={styles.alertError}>
              <b>Something went wrong:</b> {error}
            </div>
          ) : (
            <>
              <div style={styles.divider} />
              {profile ? <FranchiseOwnerView profile={profile} /> : null}
            </>
          )}
        </section>

        <footer style={styles.footer}>© {new Date().getFullYear()} AG Martial Arts</footer>
      </div>
    </main>
  );
}

/* =========================
   HELPERS
========================= */

function safeLowerEmail(v: string) {
  return String(v || '').trim().toLowerCase();
}

function makeToken(len = 48) {
  // url-safe-ish token using browser crypto
  const bytes = new Uint8Array(Math.ceil(len / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, len);
}

/* =========================
   VIEW
========================= */

function FranchiseOwnerView({ profile }: { profile: Profile }) {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const [franchise, setFranchise] = useState<Franchise | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [instructors, setInstructors] = useState<InstructorRow[]>([]);
  const [students, setStudents] = useState<StudentDisplay[]>([]);
  const [studentRowsById, setStudentRowsById] = useState<Map<string, StudentRow>>(new Map());

  const [belts, setBelts] = useState<Belt[]>([]);

  // INVITES
  const [invites, setInvites] = useState<InstructorInvite[]>([]);

  // Search students (top 5)
  const [studentQuery, setStudentQuery] = useState('');

  // Modal: create class
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Modal: invite instructor
  const [showInviteInstructorModal, setShowInviteInstructorModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  // Defaults requested
  const DEFAULT_CLASS_NAME = 'Shirley - Infants';
  const DEFAULT_LOCATION = 'Tauntons College, Hill Ln, Southampton SO15 5RL';

  // Create class form
  const [name, setName] = useState(DEFAULT_CLASS_NAME);
  const [dayOfWeek, setDayOfWeek] = useState<number>(1); // Monday
  const [startTime, setStartTime] = useState('17:00');
  const [endTime, setEndTime] = useState('17:30');
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [isActive, setIsActive] = useState(true);
  const [primaryInstructorId, setPrimaryInstructorId] = useState<string>('');

  // Inline edit class
  const [editingId, setEditingId] = useState<string>('');
  const [edit, setEdit] = useState<{
    name: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    location: string;
    is_active: boolean;
    primary_instructor_id: string;
  } | null>(null);

  // Class members panel
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  // Student modal
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(''); // students.id
  const [selectedStudentUserId, setSelectedStudentUserId] = useState<string>(''); // profiles.id (may be empty)
  const [studentEmail, setStudentEmail] = useState<string>('');
  const [studentFullName, setStudentFullName] = useState<string>('');

  const [studentEditMode, setStudentEditMode] = useState(false);
  const [savingStudent, setSavingStudent] = useState(false);

  const [feedbackNotes, setFeedbackNotes] = useState<FeedbackNote[]>([]);
  const [feedbackText, setFeedbackText] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);

  const [beltHistory, setBeltHistory] = useState<StudentBelt[]>([]);
  const [selectedBeltId, setSelectedBeltId] = useState('');
  const [awardDate, setAwardDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [awardingBelt, setAwardingBelt] = useState(false);

  const franchiseId = profile.franchise_id;

  const instructorMap = useMemo(() => {
    const m = new Map<string, InstructorRow>();
    for (const i of instructors) m.set(i.id, i);
    return m;
  }, [instructors]);

  function instructorLabel(id: string | null) {
    if (!id) return '—';
    const i = instructorMap.get(id);
    return i ? (i.full_name || i.email || i.id) : 'Unknown';
  }

  function dayLabel(d: number | null) {
    const map: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
    return d ? map[d] ?? String(d) : '—';
  }

  function dayLabelLong(d: number | null) {
    const map: Record<number, string> = {
      1: 'Monday',
      2: 'Tuesday',
      3: 'Wednesday',
      4: 'Thursday',
      5: 'Friday',
      6: 'Saturday',
      7: 'Sunday',
    };
    return d ? map[d] ?? String(d) : '—';
  }

  const classCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of students) {
      if (!s.home_class_id) continue;
      m.set(s.home_class_id, (m.get(s.home_class_id) || 0) + 1);
    }
    return m;
  }, [students]);

  const totalStudents = students.length;

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

  // ---- INVITE STATUS MAP (by email) ----
  const inviteStatusByEmail = useMemo(() => {
    const m = new Map<string, InstructorInvite['status']>();
    for (const inv of invites) m.set(safeLowerEmail(inv.email), inv.status);
    return m;
  }, [invites]);

  // Active instructors list
  const activeInstructors = useMemo(() => {
    const list = [...instructors];
    list.sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '', 'en', { sensitivity: 'base' }));
    return list;
  }, [instructors]);

  // Assignable instructors (not inactive in invites)
  const assignableInstructors = useMemo(() => {
    return activeInstructors.filter(i => {
      const email = safeLowerEmail(i.email || '');
      const status = inviteStatusByEmail.get(email);
      return status ? status === 'active' : true;
    });
  }, [activeInstructors, inviteStatusByEmail]);

  const pendingInvites = useMemo(() => invites.filter(i => i.status === 'pending'), [invites]);
  const inactiveInvites = useMemo(() => invites.filter(i => i.status === 'inactive'), [invites]);

  const membersInSelectedClass = useMemo(() => {
    if (!selectedClassId) return [];
    return students
      .filter(s => s.home_class_id === selectedClassId)
      .filter(s => (s.status ?? '').toLowerCase() === 'active')
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' }));
  }, [students, selectedClassId]);

  const beltsById = useMemo(() => {
    const m = new Map<string, Belt>();
    for (const b of belts) m.set(b.id, b);
    return m;
  }, [belts]);

  const currentBelt = useMemo(() => {
    if (!beltHistory.length) return null;
    const sorted = [...beltHistory].sort((a, b) => {
      const da = a.awarded_at || '0000-00-00';
      const db = b.awarded_at || '0000-00-00';
      return db.localeCompare(da);
    });
    const top = sorted[0];
    return top ? beltsById.get(top.belt_id) ?? null : null;
  }, [beltHistory, beltsById]);

  // Preview string requested: "Monday - Shirley - Infants"
  const createPreview = useMemo(() => {
    const d = dayLabelLong(dayOfWeek);
    const n = (name || '').trim() || DEFAULT_CLASS_NAME;
    return `${d} - ${n}`;
  }, [dayOfWeek, name]);

  const editPreview = useMemo(() => {
    if (!edit) return '';
    const d = dayLabelLong(edit.day_of_week);
    const n = (edit.name || '').trim() || DEFAULT_CLASS_NAME;
    return `${d} - ${n}`;
  }, [edit]);

  async function load() {
    setError('');
    setMsg('');
    setLoading(true);

    if (!franchiseId) {
      setError('Your profile has no franchise_id set.');
      setLoading(false);
      return;
    }

    // Franchise
    const { data: fr, error: frErr } = await supabase
      .from('franchises')
      .select('id, name')
      .eq('id', franchiseId)
      .single();

    if (frErr) {
      setError(frErr.message);
      setLoading(false);
      return;
    }

    // Instructors (role-based)
    const { data: ins, error: insErr } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'instructor')
      .eq('franchise_id', franchiseId)
      .order('full_name');

    if (insErr) {
      setError(insErr.message);
      setLoading(false);
      return;
    }

    // Instructor invites
    const { data: inv, error: invErr } = await supabase
      .from('instructor_invites')
      .select('id, franchise_id, invited_by, email, full_name, status, token, created_at, completed_at')
      .eq('franchise_id', franchiseId)
      .order('created_at', { ascending: false });

    if (invErr) {
      if ((invErr.message || '').toLowerCase().includes('could not find the table')) {
        setInvites([]);
      } else {
        setError(invErr.message);
        setLoading(false);
        return;
      }
    } else {
      setInvites((inv || []) as InstructorInvite[]);
    }

    // Classes (THIS is what powers the dashboard)
    const { data: cl, error: clErr } = await supabase
      .from('classes')
      .select('id, name, day_of_week, start_time, end_time, location, is_active, primary_instructor_id')
      .eq('franchise_id', franchiseId)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (clErr) {
      setError(clErr.message);
      setLoading(false);
      return;
    }

    // Belts (optional)
    const { data: bl, error: blErr } = await supabase
      .from('belts')
      .select('id, name, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (blErr) {
      if ((blErr.message || '').toLowerCase().includes('could not find the table')) {
        setBelts([]);
      } else {
        setError(blErr.message);
        setLoading(false);
        return;
      }
    } else {
      setBelts((bl || []) as Belt[]);
    }

    // Students
    const { data: st, error: stErr } = await supabase
      .from('students')
      .select(
        'id, user_id, franchise_id, home_class_id, first_name, last_name, dob, status, phone, address, guardian_is_registering, guardian_name, guardian_relationship, guardian_email, guardian_phone, guardian_address, medical_info, avatar_url'
      )
      .eq('franchise_id', franchiseId)
      .order('last_name', { ascending: true });

    if (stErr) {
      setError(stErr.message);
      setLoading(false);
      return;
    }

    const stRows = (st || []) as StudentRow[];

    // Profiles for those students (email/full_name) — ONLY if user_id exists
    const userIds = stRows.map(x => x.user_id).filter(Boolean) as string[];
    const profilesById = new Map<string, { email: string; full_name: string }>();

    if (userIds.length) {
      const { data: sp, error: spErr } = await supabase.from('profiles').select('id, email, full_name').in('id', userIds);

      if (!spErr && sp) {
        for (const p of sp as any[]) {
          profilesById.set(p.id, { email: p.email ?? '', full_name: p.full_name ?? '' });
        }
      }
    }

    // Include ALL students (don’t filter by user_id)
    const display: StudentDisplay[] = stRows.map(s => {
      const prof = s.user_id ? profilesById.get(s.user_id) : undefined;

      const fallbackName = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();
      const guardianName = (s.guardian_name ?? '').trim();

      const name = (prof?.full_name?.trim() || fallbackName || guardianName || '—').trim();
      const email = (prof?.email?.trim() || (s.guardian_email ?? '').trim() || '').trim();

      return {
        id: s.id,
        user_id: s.user_id ?? null,
        name,
        email,
        home_class_id: s.home_class_id ?? null,
        status: s.status ?? null,
      };
    });

    const mapById = new Map<string, StudentRow>();
    for (const row of stRows) mapById.set(row.id, row);

    setFranchise(fr as Franchise);
    setInstructors((ins || []) as InstructorRow[]);
    setClasses((cl || []) as ClassRow[]);
    setStudents(display);
    setStudentRowsById(mapById);

    // if selected class no longer exists, clear it
    if (selectedClassId && !(cl || []).some(c => c.id === selectedClassId)) setSelectedClassId('');

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  async function createClass() {
    setMsg('');
    setError('');

    if (!franchiseId) return;

    const cleanName = name.trim();
    if (!cleanName) return setMsg('Enter a class name.');
    if (!primaryInstructorId) return setMsg('Select a primary instructor.');

    const payload = {
      franchise_id: franchiseId,
      name: cleanName,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      location: (location || '').trim() || DEFAULT_LOCATION,
      is_active: isActive,
      primary_instructor_id: primaryInstructorId,
    };

    const { error: iErr } = await supabase.from('classes').insert(payload);
    if (iErr) return setError(iErr.message);

    setMsg('Class created ✅');
    setShowCreateModal(false);

    // reset to requested defaults
    setName(DEFAULT_CLASS_NAME);
    setLocation(DEFAULT_LOCATION);
    setPrimaryInstructorId('');
    setDayOfWeek(1);
    setStartTime('17:00');
    setEndTime('17:30');
    setIsActive(true);

    await load();
  }

  function startEdit(c: ClassRow) {
    setEditingId(c.id);
    setEdit({
      name: c.name ?? '',
      day_of_week: c.day_of_week ?? 1,
      start_time: String(c.start_time ?? '17:00').slice(0, 5),
      end_time: String(c.end_time ?? '17:30').slice(0, 5),
      location: c.location ?? DEFAULT_LOCATION,
      is_active: Boolean(c.is_active ?? true),
      primary_instructor_id: c.primary_instructor_id ?? '',
    });
  }

  function cancelEdit() {
    setEditingId('');
    setEdit(null);
    setMsg('');
    setError('');
  }

  async function saveEdit() {
    setMsg('');
    setError('');

    if (!editingId || !edit) return;
    if (!edit.name.trim()) return setMsg('Class name required.');
    if (!edit.primary_instructor_id) return setMsg('Primary instructor required.');

    const { error: uErr } = await supabase
      .from('classes')
      .update({
        name: edit.name.trim(),
        day_of_week: edit.day_of_week,
        start_time: edit.start_time,
        end_time: edit.end_time,
        location: edit.location.trim() || DEFAULT_LOCATION,
        is_active: edit.is_active,
        primary_instructor_id: edit.primary_instructor_id,
      })
      .eq('id', editingId);

    if (uErr) return setError(uErr.message);

    setMsg('Class updated ✅');
    cancelEdit();
    await load();
  }

  /**
   * Invite instructor (name + email), create invite row, then fire GHL webhook.
   */
  async function inviteInstructor() {
    setMsg('');
    setError('');

    if (!franchiseId) return;
    const fullName = inviteName.trim();
    const email = safeLowerEmail(inviteEmail);

    if (!fullName) return setMsg('Enter instructor name.');
    if (!email || !email.includes('@')) return setMsg('Enter a valid email address.');

    // Don’t invite same email twice if already pending/active
    const existing = invites.find(i => safeLowerEmail(i.email) === email && (i.status === 'pending' || i.status === 'active'));
    if (existing) return setMsg('That email already has an invite (pending or active).');

    setInviting(true);

    const token = makeToken(48);

    // 1) Create invite row in Supabase
    const { data: created, error: invErr } = await supabase
      .from('instructor_invites')
      .insert({
        franchise_id: franchiseId,
        invited_by: profile.id,
        email,
        full_name: fullName,
        status: 'pending',
        token,
      })
      .select('id, franchise_id, invited_by, email, full_name, status, token, created_at, completed_at')
      .single();

    if (invErr) {
      setInviting(false);
      return setError(invErr.message);
    }

    // 2) Fire webhook to GHL
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const registrationUrl = `${origin}/register-instructor?token=${token}`;

      const payload = {
        type: 'instructor_invite_created',
        invite_id: created?.id,
        franchise_id: franchiseId,
        franchise_name: franchise?.name ?? '',
        invited_by: profile.id,
        full_name: fullName,
        email,
        token,
        registration_url: registrationUrl,
      };

      const resp = await fetch(GHL_INBOUND_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        setMsg('Invite created ✅ (but GHL webhook failed — check the webhook + workflow)');
      } else {
        setMsg('Invite sent ✅');
      }
    } catch (e: any) {
      setMsg('Invite created ✅ (but could not reach GHL — check your connection)');
    }

    setInviteName('');
    setInviteEmail('');
    setShowInviteInstructorModal(false);
    setInviting(false);
    await load();
  }

  async function deactivateInstructorByEmail(emailRaw: string) {
    setMsg('');
    setError('');
    if (!franchiseId) return;

    const email = safeLowerEmail(emailRaw);
    if (!email) return;

    // 1) mark invite inactive if exists
    await supabase.from('instructor_invites').update({ status: 'inactive' }).eq('franchise_id', franchiseId).eq('email', email);

    // 2) if they have a profile currently instructor, demote them
    const target = instructors.find(i => safeLowerEmail(i.email || '') === email);
    if (target?.id) {
      const { error: upProfErr } = await supabase.from('profiles').update({ role: 'student', franchise_id: franchiseId }).eq('id', target.id);

      if (upProfErr) return setError(upProfErr.message);
    }

    setMsg('Instructor set to inactive ✅');
    await load();
  }

  function openStudent(student: StudentDisplay) {
    setMsg('');
    setError('');

    setSelectedStudentId(student.id);
    setSelectedStudentUserId(student.user_id ?? '');
    setStudentEmail(student.email);
    setStudentFullName(student.name);

    setStudentEditMode(false);

    setFeedbackNotes([]);
    setFeedbackText('');
    setBeltHistory([]);
    setSelectedBeltId('');
    setAwardDate(new Date().toISOString().slice(0, 10));

    setShowStudentModal(true);

    void loadStudentExtras(student.id);
  }

  async function loadStudentExtras(studentId: string) {
    // feedback (optional table)
    const { data: fb, error: fbErr } = await supabase
      .from('feedback_notes')
      .select('id, student_id, note, created_by, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(25);

    if (!fbErr) setFeedbackNotes((fb || []) as FeedbackNote[]);

    // belts history (optional table)
    const { data: sb, error: sbErr } = await supabase
      .from('student_belts')
      .select('id, student_id, belt_id, awarded_at, awarded_by, created_at')
      .eq('student_id', studentId)
      .order('awarded_at', { ascending: false })
      .limit(50);

    if (!sbErr) setBeltHistory((sb || []) as StudentBelt[]);
  }

  async function saveStudentEdits() {
    setMsg('');
    setError('');
    if (!selectedStudentId) return;

    const row = studentRowsById.get(selectedStudentId);
    if (!row) return setError('Student row not found in state. Refresh the page and try again.');

    setSavingStudent(true);

    const { error: upErr } = await supabase
      .from('students')
      .update({
        first_name: row.first_name,
        last_name: row.last_name,
        dob: row.dob || null,
        status: row.status || null,
        home_class_id: row.home_class_id || null,
        phone: row.phone || null,
        address: row.address || null,
        medical_info: row.medical_info || null,
      })
      .eq('id', selectedStudentId);

    setSavingStudent(false);

    if (upErr) return setError(upErr.message);

    setMsg('Student updated ✅');
    setStudentEditMode(false);
    await load();
    await loadStudentExtras(selectedStudentId);
  }

  async function addFeedback() {
    setMsg('');
    setError('');

    const note = feedbackText.trim();
    if (!note) return;
    if (!selectedStudentId) return;

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return setError('Not signed in.');

    setSavingFeedback(true);

    const { error: insErr } = await supabase.from('feedback_notes').insert({
      student_id: selectedStudentId,
      note,
      created_by: uid,
    });

    setSavingFeedback(false);

    if (insErr) return setError(insErr.message);

    setFeedbackText('');
    await loadStudentExtras(selectedStudentId);
    setMsg('Feedback saved ✅');
  }

  async function awardBelt() {
    setMsg('');
    setError('');

    if (!selectedStudentId) return;
    if (!selectedBeltId) return setMsg('Select a belt first.');

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return setError('Not signed in.');

    setAwardingBelt(true);

    const { error: insErr } = await supabase.from('student_belts').insert({
      student_id: selectedStudentId,
      belt_id: selectedBeltId,
      awarded_at: awardDate || new Date().toISOString().slice(0, 10),
      awarded_by: uid,
    });

    setAwardingBelt(false);

    if (insErr) return setError(insErr.message);

    setSelectedBeltId('');
    setMsg('Belt awarded ✅');
    await loadStudentExtras(selectedStudentId);
  }

  function updateStudentRow(studentId: string, patch: Partial<StudentRow>) {
    setStudentRowsById(prev => {
      const next = new Map(prev);
      const cur = next.get(studentId);
      if (!cur) return prev;
      next.set(studentId, { ...cur, ...patch });
      return next;
    });
  }

  if (loading) return <div style={styles.innerCard}>Loading franchise dashboard…</div>;
  if (error) return <div style={styles.alertError}>Error: {error}</div>;

  return (
    <div style={styles.innerCard}>
      <div style={styles.sectionTitle}>Your Franchise</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={styles.muted}>
          Area: <b style={{ color: '#111827' }}>{franchise?.name}</b>
        </div>

        <div style={styles.muted}>
          Total students: <b style={{ color: '#111827' }}>{totalStudents}</b>
        </div>
      </div>

      {msg ? <div style={msg.includes('✅') ? styles.alertOk : styles.alertError}>{msg}</div> : null}

      <div style={styles.divider} />

      {/* SEARCH */}
      <div style={styles.subTitle}>Search students</div>
      <div style={{ display: 'grid', gap: 10 }}>
        <input value={studentQuery} onChange={e => setStudentQuery(e.target.value)} placeholder="Search by name or email…" style={styles.input} />

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

                  <div style={styles.studentPill}>
                    {s.home_class_id ? classes.find(c => c.id === s.home_class_id)?.name || 'Class' : 'No class'}
                  </div>
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

      <div style={styles.divider} />

      {/* INSTRUCTORS */}
      <div style={styles.subTitleRow}>
        <div style={{ ...styles.subTitle, marginBottom: 0 }}>Instructors</div>
        <button onClick={() => setShowInviteInstructorModal(true)} style={styles.secondaryBtn}>
          + Add instructor
        </button>
      </div>

      {/* ACTIVE */}
      <div style={{ fontWeight: 950, marginBottom: 8 }}>Active instructors</div>
      <div style={styles.instructorBox}>
        {activeInstructors.length === 0 ? (
          <div style={styles.muted}>No active instructors found.</div>
        ) : (
          activeInstructors.map(i => {
            const email = safeLowerEmail(i.email || '');
            const status = inviteStatusByEmail.get(email) ?? 'active';
            const isInactive = status === 'inactive';

            return (
              <div key={i.id} style={styles.instructorRow}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.full_name || '—'}</div>
                  <div style={styles.muted}>{i.email || i.id}</div>
                  <div style={styles.muted}>
                    Status:{' '}
                    <b style={{ color: isInactive ? '#7f1d1d' : '#065f46' }}>{isInactive ? 'inactive (not assignable)' : 'active'}</b>
                  </div>
                </div>

                <button onClick={() => deactivateInstructorByEmail(i.email || '')} style={styles.smallDangerBtn}>
                  Remove
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* PENDING */}
      <div style={{ fontWeight: 950, marginTop: 14, marginBottom: 8 }}>Pending invites</div>
      <div style={styles.instructorBox}>
        {pendingInvites.length === 0 ? (
          <div style={styles.muted}>No pending invites.</div>
        ) : (
          pendingInvites.map(p => (
            <div key={p.id} style={styles.instructorRow}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.full_name || '—'}</div>
                <div style={styles.muted}>{p.email}</div>
                <div style={styles.muted}>
                  Invited: <b style={{ color: '#111827' }}>{new Date(p.created_at).toLocaleString('en-GB')}</b>
                </div>
              </div>

              <button onClick={() => deactivateInstructorByEmail(p.email)} style={styles.smallDangerBtn}>
                Set inactive
              </button>
            </div>
          ))
        )}
      </div>

      {/* INACTIVE */}
      <div style={{ fontWeight: 950, marginTop: 14, marginBottom: 8 }}>Inactive instructors</div>
      <div style={styles.instructorBox}>
        {inactiveInvites.length === 0 ? (
          <div style={styles.muted}>No inactive instructors.</div>
        ) : (
          inactiveInvites.map(p => (
            <div key={p.id} style={styles.instructorRow}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.full_name || '—'}</div>
                <div style={styles.muted}>{p.email}</div>
                <div style={styles.muted}>
                  Status: <b style={{ color: '#7f1d1d' }}>inactive</b>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* INVITE INSTRUCTOR MODAL */}
      {showInviteInstructorModal ? (
        <div style={styles.modalOverlay} onClick={() => setShowInviteInstructorModal(false)}>
          <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div style={{ fontWeight: 950, fontSize: 16 }}>Add instructor</div>
              <button onClick={() => setShowInviteInstructorModal(false)} style={styles.smallEditBtn}>
                Close
              </button>
            </div>

            <div style={styles.divider} />

            <div style={{ display: 'grid', gap: 10 }}>
              <label style={styles.label}>
                Full name
                <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="e.g. John Smith" style={styles.input} autoFocus />
              </label>

              <label style={styles.label}>
                Email
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="e.g. john@example.com" style={styles.input} />
              </label>

              <div style={styles.muted}>
                This will create a <b>pending</b> invite in Supabase and fire your GHL webhook to send the welcome email.
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={inviteInstructor} style={styles.primaryBtn} disabled={inviting}>
                  {inviting ? 'Sending…' : 'Send invite'}
                </button>
                <button onClick={() => setShowInviteInstructorModal(false)} style={styles.secondaryBtn} disabled={inviting}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div style={styles.divider} />

      {/* CLASSES */}
      <div style={styles.subTitleRow}>
        <div style={{ ...styles.subTitle, marginBottom: 0 }}>Classes</div>
        <button onClick={() => setShowCreateModal(true)} style={styles.primaryBtn}>
          + Create class
        </button>
      </div>

      {/* Create preview requested */}
      <div style={styles.previewBox}>
        <div style={{ fontWeight: 950 }}>Preview</div>
        <div style={styles.previewText}>{createPreview}</div>
        <div style={styles.muted}>Location: {location?.trim() ? location.trim() : DEFAULT_LOCATION}</div>
      </div>

      {classes.length === 0 ? <div style={styles.muted}>No classes found for this franchise.</div> : null}

      <div style={{ display: 'grid' }}>
        {classes.map(c => {
          const isEditing = editingId === c.id && edit;
          const count = classCounts.get(c.id) || 0;
          const isSelected = selectedClassId === c.id;

          return (
            <div key={c.id} style={styles.classRowCard}>
              {!isEditing ? (
                <div style={styles.rowTop}>
                  <button
                    onClick={() => setSelectedClassId(isSelected ? '' : c.id)}
                    style={{
                      minWidth: 0,
                      cursor: 'pointer',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      textAlign: 'left',
                      flex: 1,
                    }}
                    title="Click to view class members"
                  >
                    <div style={styles.rowTitle}>
                      {c.name || '—'}{' '}
                      <span style={styles.muted}>
                        — {dayLabel(c.day_of_week)} {String(c.start_time ?? '').slice(0, 5)}–{String(c.end_time ?? '').slice(0, 5)}
                      </span>
                    </div>
                    <div style={styles.muted}>
                      {c.location || 'No location'} · {c.is_active ? 'Active' : 'Inactive'} · Primary:{' '}
                      <b style={{ color: '#111827' }}>{instructorLabel(c.primary_instructor_id)}</b> · Students:{' '}
                      <b style={{ color: '#111827' }}>{count}</b>
                      {isSelected ? <span style={{ marginLeft: 8, fontWeight: 900 }}> (open)</span> : null}
                    </div>
                  </button>

                  <button onClick={() => startEdit(c)} style={styles.smallEditBtn}>
                    Edit
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={styles.subTitle}>Edit class</div>

                  {/* Edit preview requested */}
                  <div style={styles.previewBox}>
                    <div style={{ fontWeight: 950 }}>Preview</div>
                    <div style={styles.previewText}>{editPreview}</div>
                    <div style={styles.muted}>Location: {edit?.location?.trim() ? edit.location.trim() : DEFAULT_LOCATION}</div>
                  </div>

                  <label style={styles.label}>
                    Name
                    <input value={edit!.name} onChange={e => setEdit({ ...edit!, name: e.target.value })} style={styles.input} placeholder="Shirley - Infants" />
                  </label>

                  <label style={styles.label}>
                    Day of week
                    <select value={edit!.day_of_week} onChange={e => setEdit({ ...edit!, day_of_week: Number(e.target.value) })} style={styles.select}>
                      <option value={1}>Monday</option>
                      <option value={2}>Tuesday</option>
                      <option value={3}>Wednesday</option>
                      <option value={4}>Thursday</option>
                      <option value={5}>Friday</option>
                      <option value={6}>Saturday</option>
                      <option value={7}>Sunday</option>
                    </select>
                  </label>

                  <div style={styles.grid2}>
                    <label style={styles.label}>
                      Start time
                      <input type="time" value={edit!.start_time} onChange={e => setEdit({ ...edit!, start_time: e.target.value })} style={styles.input} />
                    </label>

                    <label style={styles.label}>
                      End time
                      <input type="time" value={edit!.end_time} onChange={e => setEdit({ ...edit!, end_time: e.target.value })} style={styles.input} />
                    </label>
                  </div>

                  <label style={styles.label}>
                    Location
                    <input
                      value={edit!.location}
                      onChange={e => setEdit({ ...edit!, location: e.target.value })}
                      style={styles.input}
                      placeholder={DEFAULT_LOCATION}
                    />
                  </label>

                  <label style={styles.label}>
                    Primary instructor (active only)
                    <select value={edit!.primary_instructor_id} onChange={e => setEdit({ ...edit!, primary_instructor_id: e.target.value })} style={styles.select}>
                      <option value="">Select…</option>
                      {assignableInstructors.map(i => (
                        <option key={i.id} value={i.id}>
                          {(i.full_name ? i.full_name : i.email) ?? i.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" checked={edit!.is_active} onChange={e => setEdit({ ...edit!, is_active: e.target.checked })} />
                    Active
                  </label>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={saveEdit} style={styles.primaryBtn}>
                      Save changes
                    </button>
                    <button onClick={cancelEdit} style={styles.secondaryBtn}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* MEMBERS PANEL */}
              {selectedClassId === c.id ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 950 }}>Active members in this class</div>
                    <div style={styles.muted}>{membersInSelectedClass.length} active</div>
                  </div>

                  <div style={{ ...styles.studentList, marginTop: 10 }}>
                    {membersInSelectedClass.length === 0 ? (
                      <div style={styles.muted}>No active students found in this class.</div>
                    ) : (
                      membersInSelectedClass.map(s => (
                        <button
                          key={s.id}
                          onClick={() => openStudent(s)}
                          style={{
                            ...styles.studentRow,
                            cursor: 'pointer',
                            background: 'transparent',
                            border: 'none',
                            textAlign: 'left',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                            <div style={styles.muted}>{s.email || '—'}</div>
                          </div>

                          <div style={styles.studentPill}>{s.status ?? '—'}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* CREATE CLASS MODAL */}
      {showCreateModal ? (
        <div style={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div style={{ fontWeight: 950, fontSize: 16 }}>Create class</div>
              <button onClick={() => setShowCreateModal(false)} style={styles.smallEditBtn}>
                Close
              </button>
            </div>

            <div style={styles.divider} />

            <div style={styles.previewBox}>
              <div style={{ fontWeight: 950 }}>Preview</div>
              <div style={styles.previewText}>{createPreview}</div>
              <div style={styles.muted}>Location: {location?.trim() ? location.trim() : DEFAULT_LOCATION}</div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <label style={styles.label}>
                Name
                <input value={name} onChange={e => setName(e.target.value)} style={styles.input} placeholder={DEFAULT_CLASS_NAME} />
              </label>

              <label style={styles.label}>
                Day of week
                <select value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))} style={styles.select}>
                  <option value={1}>Monday</option>
                  <option value={2}>Tuesday</option>
                  <option value={3}>Wednesday</option>
                  <option value={4}>Thursday</option>
                  <option value={5}>Friday</option>
                  <option value={6}>Saturday</option>
                  <option value={7}>Sunday</option>
                </select>
              </label>

              <div style={styles.grid2}>
                <label style={styles.label}>
                  Start time
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={styles.input} />
                </label>

                <label style={styles.label}>
                  End time
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={styles.input} />
                </label>
              </div>

              <label style={styles.label}>
                Location
                <input value={location} onChange={e => setLocation(e.target.value)} style={styles.input} placeholder={DEFAULT_LOCATION} />
              </label>

              <label style={styles.label}>
                Primary instructor (active only)
                <select value={primaryInstructorId} onChange={e => setPrimaryInstructorId(e.target.value)} style={styles.select}>
                  <option value="">Select…</option>
                  {assignableInstructors.map(i => (
                    <option key={i.id} value={i.id}>
                      {(i.full_name ? i.full_name : i.email) ?? i.id}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                Active
              </label>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={createClass} style={styles.primaryBtn}>
                  Create class
                </button>
                <button onClick={() => setShowCreateModal(false)} style={styles.secondaryBtn}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* STUDENT MODAL */}
      {showStudentModal ? (
        <div
          style={styles.modalOverlay}
          onClick={() => {
            setShowStudentModal(false);
            setSelectedStudentId('');
            setSelectedStudentUserId('');
          }}
        >
          <div style={{ ...styles.modalCard, maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 950, fontSize: 16 }}>{studentFullName || 'Student'}</div>
                <div style={styles.muted}>{studentEmail || '—'}</div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => setStudentEditMode(v => !v)} style={styles.smallEditBtn}>
                  {studentEditMode ? 'Stop editing' : 'Edit'}
                </button>
                <button onClick={() => setShowStudentModal(false)} style={styles.smallEditBtn}>
                  Close
                </button>
              </div>
            </div>

            <div style={styles.divider} />

            {/* STUDENT DETAILS */}
            {(() => {
              const row = selectedStudentId ? studentRowsById.get(selectedStudentId) : null;
              if (!row) return <div style={styles.muted}>Loading student details…</div>;

              const className = row.home_class_id ? classes.find(c => c.id === row.home_class_id)?.name || '—' : '—';

              return (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div style={styles.sectionTitle}>Student profile</div>

                  <div style={styles.grid2}>
                    <label style={styles.label}>
                      First name
                      <input
                        value={row.first_name ?? ''}
                        onChange={e => updateStudentRow(row.id, { first_name: e.target.value })}
                        style={styles.input}
                        disabled={!studentEditMode}
                      />
                    </label>

                    <label style={styles.label}>
                      Last name
                      <input
                        value={row.last_name ?? ''}
                        onChange={e => updateStudentRow(row.id, { last_name: e.target.value })}
                        style={styles.input}
                        disabled={!studentEditMode}
                      />
                    </label>
                  </div>

                  <div style={styles.grid2}>
                    <label style={styles.label}>
                      Date of birth
                      <input
                        type="date"
                        value={row.dob ?? ''}
                        onChange={e => updateStudentRow(row.id, { dob: e.target.value })}
                        style={styles.input}
                        disabled={!studentEditMode}
                      />
                    </label>

                    <label style={styles.label}>
                      Status
                      <select
                        value={row.status ?? 'inactive'}
                        onChange={e => updateStudentRow(row.id, { status: e.target.value })}
                        style={styles.select}
                        disabled={!studentEditMode}
                      >
                        <option value="active">active</option>
                        <option value="inactive">inactive</option>
                      </select>
                    </label>
                  </div>

                  <label style={styles.label}>
                    Home class
                    <select
                      value={row.home_class_id ?? ''}
                      onChange={e => updateStudentRow(row.id, { home_class_id: e.target.value || null })}
                      style={styles.select}
                      disabled={!studentEditMode}
                    >
                      <option value="">Select…</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name || '—'}
                        </option>
                      ))}
                    </select>
                    <div style={styles.muted}>Current: {className}</div>
                  </label>

                  <div style={styles.grid2}>
                    <label style={styles.label}>
                      Phone
                      <input value={row.phone ?? ''} onChange={e => updateStudentRow(row.id, { phone: e.target.value })} style={styles.input} disabled={!studentEditMode} />
                    </label>

                    <label style={styles.label}>
                      Address
                      <input value={row.address ?? ''} onChange={e => updateStudentRow(row.id, { address: e.target.value })} style={styles.input} disabled={!studentEditMode} />
                    </label>
                  </div>

                  <label style={styles.label}>
                    Medical information
                    <textarea
                      value={row.medical_info ?? ''}
                      onChange={e => updateStudentRow(row.id, { medical_info: e.target.value })}
                      style={styles.textarea}
                      disabled={!studentEditMode}
                      placeholder="e.g. asthma, allergies, knee injury, medications…"
                    />
                  </label>

                  {studentEditMode ? (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button onClick={saveStudentEdits} style={styles.primaryBtn} disabled={savingStudent}>
                        {savingStudent ? 'Saving…' : 'Save changes'}
                      </button>
                      <button onClick={() => setStudentEditMode(false)} style={styles.secondaryBtn}>
                        Cancel
                      </button>
                    </div>
                  ) : null}

                  <div style={styles.divider} />

                  {/* BELTS */}
                  <div style={styles.sectionTitle}>Belts</div>
                  <div style={styles.muted}>
                    Current belt: <b style={{ color: '#111827' }}>{currentBelt?.name ?? '—'}</b>
                  </div>

                  <div style={styles.grid2}>
                    <label style={styles.label}>
                      Award belt
                      <select value={selectedBeltId} onChange={e => setSelectedBeltId(e.target.value)} style={styles.select} disabled={!belts.length}>
                        <option value="">{belts.length ? 'Select…' : 'Belts not configured'}</option>
                        {belts.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={styles.label}>
                      Date awarded
                      <input type="date" value={awardDate} onChange={e => setAwardDate(e.target.value)} style={styles.input} />
                    </label>
                  </div>

                  <button onClick={awardBelt} style={styles.primaryBtn} disabled={awardingBelt || !belts.length}>
                    {awardingBelt ? 'Awarding…' : 'Award belt'}
                  </button>

                  <div style={{ ...styles.studentList, marginTop: 10 }}>
                    {beltHistory.length === 0 ? (
                      <div style={styles.muted}>No belt history yet.</div>
                    ) : (
                      beltHistory.map(bh => (
                        <div key={bh.id} style={styles.studentRow}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 900 }}>{beltsById.get(bh.belt_id)?.name ?? 'Unknown belt'}</div>
                            <div style={styles.muted}>Awarded: {bh.awarded_at}</div>
                          </div>
                          <div style={styles.studentPill}>History</div>
                        </div>
                      ))
                    )}
                  </div>

                  <div style={styles.divider} />

                  {/* FEEDBACK */}
                  <div style={styles.sectionTitle}>Feedback notes</div>
                  <label style={styles.label}>
                    Add feedback (short note)
                    <textarea
                      value={feedbackText}
                      onChange={e => setFeedbackText(e.target.value)}
                      style={styles.textarea}
                      placeholder="e.g. Great guard retention today. Work on posture in closed guard. 2x rounds focusing on frames."
                    />
                  </label>

                  <button onClick={addFeedback} style={styles.primaryBtn} disabled={savingFeedback}>
                    {savingFeedback ? 'Saving…' : 'Save feedback'}
                  </button>

                  <div style={{ ...styles.studentList, marginTop: 10 }}>
                    {feedbackNotes.length === 0 ? (
                      <div style={styles.muted}>No feedback yet.</div>
                    ) : (
                      feedbackNotes.map(n => (
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
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}
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
  sectionTitle: { fontSize: 14, fontWeight: 900, letterSpacing: 0.3, marginBottom: 10 },
  subTitle: { fontSize: 13, fontWeight: 900, marginBottom: 6 },
  muted: { fontSize: 13, color: '#6b7280' },

  subTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 10,
  },

  label: { display: 'grid', gap: 6, fontSize: 13, fontWeight: 800, color: '#111827' },
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
  select: {
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
    justifySelf: 'start',
  },
  secondaryBtn: {
    borderRadius: 999,
    padding: '10px 12px',
    fontSize: 13,
    fontWeight: 900,
    cursor: 'pointer',
    color: '#111827',
    background: 'white',
    border: '1px solid #d1d5db',
    height: 38,
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

  classRowCard: {
    border: '1px solid #eee',
    borderRadius: 14,
    padding: 14,
    background: 'white',
    marginTop: 10,
  },
  rowTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  rowTitle: { fontWeight: 900, fontSize: 14 },

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
  smallDangerBtn: {
    borderRadius: 999,
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    color: '#7f1d1d',
    background: 'rgba(185, 28, 28, 0.08)',
    border: '1px solid rgba(185, 28, 28, 0.25)',
    height: 34,
    flexShrink: 0,
  },

  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },

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

  instructorBox: {
    border: '1px solid #eee',
    borderRadius: 14,
    padding: 12,
    background: 'white',
    display: 'grid',
    gap: 10,
  },
  instructorRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    borderBottom: '1px solid #f2f2f2',
    paddingBottom: 10,
  },

  previewBox: {
    border: '1px solid rgba(17,24,39,0.10)',
    background: 'rgba(17,24,39,0.03)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    display: 'grid',
    gap: 6,
  },
  previewText: { fontSize: 14, fontWeight: 950, color: '#111827' },

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
    maxWidth: 560,
    background: 'white',
    borderRadius: 18,
    padding: 16,
    border: '1px solid #eee',
    boxShadow: '0 25px 70px rgba(0,0,0,0.35)',
  },
};