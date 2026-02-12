'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Profile = {
  id: string;
  role: string | null;
  franchise_id: string | null;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type Franchise = { id: string; name: string };

type StudentRow = {
  id: string;
  user_id: string | null;
  franchise_id: string | null;
  home_class_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: string | null;
  dob: string | null;
};

type ClassRow = {
  id: string;
  name: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
};

type StudentDisplay = {
  student_id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  franchise_id: string | null;
  home_class_id: string | null;
};

type OwnerDisplay = {
  id: string; // profiles.id
  full_name: string;
  email: string;
  franchise_id: string | null;
};

export default function HQDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const [hqProfile, setHqProfile] = useState<Profile | null>(null);

  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentDisplay[]>([]);
  const [owners, setOwners] = useState<OwnerDisplay[]>([]);

  // student search
  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentDisplay | null>(null);
  const [studentDetails, setStudentDetails] = useState<{
    student: StudentRow | null;
    franchiseName: string;
    classLabel: string;
    avatarSignedUrl: string;
  }>({ student: null, franchiseName: '—', classLabel: '—', avatarSignedUrl: '' });
  const [showStudentModal, setShowStudentModal] = useState(false);

  // owner edit
  const [editingOwnerId, setEditingOwnerId] = useState<string>('');
  const [ownerEdit, setOwnerEdit] = useState<{ full_name: string; franchise_id: string }>({ full_name: '', franchise_id: '' });

  // add owner modal
  const [showAddOwnerModal, setShowAddOwnerModal] = useState(false);
  const [addOwnerSearch, setAddOwnerSearch] = useState('');
  const [addOwnerAreaName, setAddOwnerAreaName] = useState('');
  const [addOwnerSelectedUserId, setAddOwnerSelectedUserId] = useState<string>('');
  const [savingAddOwner, setSavingAddOwner] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  function dayLabel(d: number | null) {
    const map: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
    return d ? map[d] ?? String(d) : '—';
  }

  function timeShort(t: string | null) {
    if (!t) return '';
    return String(t).slice(0, 5);
  }

  async function signedAvatar(path: string | null) {
    if (!path) return '';
    const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path, 60 * 60);
    if (error) return '';
    return data?.signedUrl || '';
  }

  const franchiseMap = useMemo(() => {
    const m = new Map<string, Franchise>();
    for (const f of franchises) m.set(f.id, f);
    return m;
  }, [franchises]);

  const classMap = useMemo(() => {
    const m = new Map<string, ClassRow>();
    for (const c of classes) m.set(c.id, c);
    return m;
  }, [classes]);

  const studentCountsByFranchise = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of students) {
      if (!s.franchise_id) continue;
      m.set(s.franchise_id, (m.get(s.franchise_id) || 0) + 1);
    }
    return m;
  }, [students]);

  const top5StudentResults = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return [];
    const matches = students.filter(s => `${s.name} ${s.email}`.toLowerCase().includes(q));
    matches.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' }));
    return matches.slice(0, 5);
  }, [students, studentQuery]);

  const top5AddOwnerCandidates = useMemo(() => {
    const q = addOwnerSearch.trim().toLowerCase();
    const ownerIds = new Set(owners.map(o => o.id)); // profiles.id already owners

    const pool = students
      .filter(s => !ownerIds.has(s.user_id)) // don’t show existing owners
      .map(s => ({
        user_id: s.user_id,
        name: s.name,
        email: s.email,
        avatar_url: s.avatar_url,
      }));

    const filtered = q ? pool.filter(p => `${p.name} ${p.email}`.toLowerCase().includes(q)) : pool;
    filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' }));
    return filtered.slice(0, 5);
  }, [students, owners, addOwnerSearch]);

  async function loadAll() {
    setError('');
    setMsg('');
    setLoading(true);

    // Auth
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

    // HQ profile
    const { data: p, error: pErr } = await supabase
      .from('profiles')
      .select('id, role, franchise_id, email, full_name, avatar_url')
      .eq('id', user.id)
      .single();

    if (pErr) {
      setError(pErr.message);
      setLoading(false);
      return;
    }

    // You can tighten this once you decide what the HQ role is.
    // For now: allow 'hq' OR 'admin' OR a specific email list.
    const role = (p as any)?.role;
    if (!['hq', 'admin'].includes(role || '')) {
      // If you want to allow franchise_owner to view HQ too, add it above
      setError('You do not have permission to view HQ.');
      setLoading(false);
      return;
    }

    setHqProfile(p as Profile);

    // Franchises
    const { data: fr, error: frErr } = await supabase.from('franchises').select('id, name').order('name');
    if (frErr) {
      setError(frErr.message);
      setLoading(false);
      return;
    }

    // Classes (all, so student details can show class label)
    const { data: cl, error: clErr } = await supabase
      .from('classes')
      .select('id, name, day_of_week, start_time, end_time, location')
      .order('name');
    if (clErr) {
      setError(clErr.message);
      setLoading(false);
      return;
    }

    // Franchise owners (DEBUG + DATA)
const { count: ownersCount, error: ownersCountErr } = await supabase
.from('profiles')
.select('id', { count: 'exact', head: true })
.eq('role', 'franchise_owner');

if (ownersCountErr) {
// This usually screams RLS
setError(`Owners count error: ${ownersCountErr.message}`);
setLoading(false);
return;
}

const { data: ow, error: owErr } = await supabase
.from('profiles')
.select('id, full_name, email, franchise_id, role')
.eq('role', 'franchise_owner')
.order('full_name', { ascending: true });

if (owErr) {
setError(`Owners load error: ${owErr.message}`);
setLoading(false);
return;
}

// Put the debug info somewhere visible
setMsg(`Debug: ownersCount=${ownersCount ?? 0}, ownersRows=${ow?.length ?? 0}`);

    // Students (all)
    const { data: st, error: stErr } = await supabase
      .from('students')
      .select('id, user_id, franchise_id, home_class_id, first_name, last_name')
      .order('last_name');

    if (stErr) {
      setError(stErr.message);
      setLoading(false);
      return;
    }

    // Profiles for those students (name/email/avatar)
    const userIds = (st || []).map((x: any) => x.user_id).filter(Boolean) as string[];
    let studentProfiles: any[] = [];
    if (userIds.length) {
      const { data: sp } = await supabase.from('profiles').select('id, email, full_name, avatar_url').in('id', userIds);
      studentProfiles = (sp || []) as any[];
    }
    const profMap = new Map<string, { email: string; full_name: string; avatar_url: string | null }>();
    for (const pr of studentProfiles) {
      profMap.set(pr.id, { email: pr.email ?? '', full_name: pr.full_name ?? '', avatar_url: pr.avatar_url ?? null });
    }

    const displayStudents: StudentDisplay[] = (st || [])
      .filter((s: any) => Boolean(s.user_id))
      .map((s: any) => {
        const prof = profMap.get(s.user_id);
        const fallbackName = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();
        const name = (prof?.full_name?.trim() || fallbackName || '—').trim();
        const email = (prof?.email || '').trim();
        return {
          student_id: s.id,
          user_id: s.user_id,
          name,
          email,
          avatar_url: prof?.avatar_url ?? null,
          franchise_id: s.franchise_id ?? null,
          home_class_id: s.home_class_id ?? null,
        };
      });

    setFranchises((fr || []) as Franchise[]);
    setClasses((cl || []) as ClassRow[]);
    setOwners((ow || []).map((x: any) => ({ id: x.id, full_name: x.full_name ?? '—', email: x.email ?? '', franchise_id: x.franchise_id ?? null })));
    setStudents(displayStudents);

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openStudentDetails(s: StudentDisplay) {
    setSelectedStudent(s);
    setShowStudentModal(true);

    // Load student row (phone/address/dob live from students table)
    const { data: sr, error: sErr } = await supabase
      .from('students')
      .select('id, user_id, franchise_id, home_class_id, first_name, last_name, phone, address, dob')
      .eq('id', s.student_id)
      .single();

    if (sErr) {
      setMsg(`Student details error: ${sErr.message}`);
      return;
    }

    const franchiseName = s.franchise_id ? franchiseMap.get(s.franchise_id)?.name ?? '—' : '—';

    const cls = s.home_class_id ? classMap.get(s.home_class_id) : null;
    const classLabel = cls?.name
      ? `${cls.name}${cls.day_of_week ? ` • ${dayLabel(cls.day_of_week)}` : ''}${cls.start_time ? ` • ${timeShort(cls.start_time)}` : ''}`
      : '—';

    const avatarSignedUrl = await signedAvatar(s.avatar_url);

    setStudentDetails({
      student: sr as StudentRow,
      franchiseName,
      classLabel,
      avatarSignedUrl,
    });
  }

  function startOwnerEdit(o: OwnerDisplay) {
    setEditingOwnerId(o.id);
    setOwnerEdit({
      full_name: o.full_name || '',
      franchise_id: o.franchise_id || '',
    });
    setMsg('');
    setError('');
  }

  function cancelOwnerEdit() {
    setEditingOwnerId('');
    setOwnerEdit({ full_name: '', franchise_id: '' });
  }

  async function saveOwnerEdit(ownerId: string) {
    setMsg('');
    setError('');

    if (!ownerEdit.full_name.trim()) return setMsg('Owner name is required.');
    if (!ownerEdit.franchise_id) return setMsg('Select an area.');

    const { error: upErr } = await supabase
      .from('profiles')
      .update({ full_name: ownerEdit.full_name.trim(), franchise_id: ownerEdit.franchise_id })
      .eq('id', ownerId);

    if (upErr) return setError(upErr.message);

    setMsg('Franchise owner updated ✅');
    cancelOwnerEdit();
    await loadAll();
  }

  async function ensureFranchiseByName(areaName: string): Promise<string> {
    const clean = areaName.trim();
    if (!clean) throw new Error('Area name is required.');

    // Try exact match (case-insensitive-ish via ilike)
    const { data: existing, error: exErr } = await supabase
      .from('franchises')
      .select('id, name')
      .ilike('name', clean)
      .limit(1);

    if (!exErr && existing && existing.length) return existing[0].id;

    // Create new
    const { data: created, error: crErr } = await supabase.from('franchises').insert({ name: clean }).select('id').single();
    if (crErr) throw new Error(crErr.message);
    return created.id as string;
  }

  async function addFranchiseOwner() {
    setMsg('');
    setError('');

    if (!addOwnerSelectedUserId) return setMsg('Select a student.');
    if (!addOwnerAreaName.trim()) return setMsg('Enter an area name.');

    setSavingAddOwner(true);

    try {
      const franchiseId = await ensureFranchiseByName(addOwnerAreaName);

      const { error: upErr } = await supabase
        .from('profiles')
        .update({
          role: 'franchise_owner',
          franchise_id: franchiseId,
        })
        .eq('id', addOwnerSelectedUserId);

      if (upErr) throw new Error(upErr.message);

      setMsg('Franchise owner added ✅');
      setShowAddOwnerModal(false);
      setAddOwnerSearch('');
      setAddOwnerAreaName('');
      setAddOwnerSelectedUserId('');
      await loadAll();
    } catch (e: any) {
      setError(e?.message || 'Failed to add franchise owner.');
    } finally {
      setSavingAddOwner(false);
    }
  }

  if (loading) {
    return (
      <main style={styles.loadingWrap}>
        <div style={styles.loadingCard}>Loading…</div>
      </main>
    );
  }

  if (!hqProfile) {
    return (
      <main style={styles.page}>
        <div style={styles.bg} />
        <div style={styles.overlay} />
        <div style={styles.container}>
          <section style={styles.card}>
            <div style={styles.alertError}>{error || 'Could not load HQ profile.'}</div>
            <button onClick={signOut} style={styles.secondaryBtn}>Sign out</button>
          </section>
        </div>
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
            <div style={styles.brandSub}>HQ Portal</div>
          </div>
        </div>

        <section style={styles.card}>
          <div style={styles.cardTopRow}>
            <div>
              <h1 style={styles.h1}>HQ Dashboard</h1>
              <p style={styles.p}>
                Signed in as <b>{hqProfile.email ?? '—'}</b>
              </p>
            </div>
            <div style={styles.badge}>HQ</div>
          </div>

          {(msg || error) ? (
            <div style={(error ? styles.alertError : styles.alertOk)}>
              {error ? <b>Something went wrong:</b> : null} {error || msg}
            </div>
          ) : null}

          <div style={styles.divider} />

          {/* STUDENT SEARCH */}
          <div style={styles.sectionTitle}>Student search</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <input
              value={studentQuery}
              onChange={e => setStudentQuery(e.target.value)}
              placeholder="Search students by name or email…"
              style={styles.input}
            />

            {studentQuery.trim() ? (
              top5StudentResults.length ? (
                <div style={styles.resultsCard}>
                  {top5StudentResults.map(s => (
                    <button
                      key={s.student_id}
                      onClick={() => openStudentDetails(s)}
                      style={styles.resultRowBtn}
                      type="button"
                    >
                      <div style={styles.avatarSm}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {s.avatar_url ? (
                          <img
                            src={''}
                            alt=""
                            style={{ display: 'none' }}
                          />
                        ) : null}
                        <AvatarFallback name={s.name} />
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={styles.resultName}>{s.name}</div>
                        <div style={styles.muted}>{s.email || '—'}</div>
                      </div>

                      <div style={styles.pillRight}>
                        {s.franchise_id ? franchiseMap.get(s.franchise_id)?.name ?? 'Area' : 'No area'}
                      </div>
                    </button>
                  ))}
                  <div style={styles.muted}>Showing top 5 (alphabetical). Refine your search for more.</div>
                </div>
              ) : (
                <div style={styles.muted}>No matches.</div>
              )
            ) : (
              <div style={styles.muted}>Type to search. We’ll show the top 5 results.</div>
            )}
          </div>

          {/* STUDENT MODAL */}
          {showStudentModal ? (
            <div style={styles.modalOverlay} onClick={() => setShowStudentModal(false)}>
              <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
                <div style={styles.modalHeader}>
                  <div style={{ fontWeight: 950, fontSize: 16 }}>Student details</div>
                  <button onClick={() => setShowStudentModal(false)} style={styles.smallBtn}>
                    Close
                  </button>
                </div>

                <div style={styles.divider} />

                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={styles.avatarLg}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {studentDetails.avatarSignedUrl ? (
                      <img src={studentDetails.avatarSignedUrl} alt="Avatar" style={styles.avatarImg as any} />
                    ) : (
                      <AvatarFallback name={selectedStudent?.name || '—'} big />
                    )}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 950, fontSize: 16 }}>
                      {selectedStudent?.name || '—'}
                    </div>
                    <div style={styles.muted}>{selectedStudent?.email || '—'}</div>
                    <div style={{ ...styles.muted, marginTop: 6 }}>
                      <b style={{ color: '#111827' }}>Area:</b> {studentDetails.franchiseName}
                    </div>
                    <div style={{ ...styles.muted, marginTop: 6 }}>
                      <b style={{ color: '#111827' }}>Registered class:</b> {studentDetails.classLabel}
                    </div>
                  </div>
                </div>

                <div style={styles.divider} />

                <div style={styles.detailGrid}>
                  <Detail label="Phone" value={studentDetails.student?.phone || '—'} />
                  <Detail label="Address" value={studentDetails.student?.address || '—'} />
                  <Detail label="DOB" value={studentDetails.student?.dob ? String(studentDetails.student.dob).slice(0, 10) : '—'} />
                  <Detail label="Student ID" value={selectedStudent?.student_id || '—'} mono />
                </div>
              </div>
            </div>
          ) : null}

          <div style={styles.divider} />

          {/* FRANCHISE OWNERS */}
          <div style={styles.sectionRow}>
            <div style={styles.sectionTitle}>Franchise owners</div>
            <button onClick={() => setShowAddOwnerModal(true)} style={styles.primaryBtn} type="button">
              + Add franchise owner
            </button>
          </div>

          {owners.length === 0 ? (
            <div style={styles.muted}>No franchise owners found.</div>
          ) : (
            <div style={styles.resultsCard}>
              {owners.map(o => {
                const isEditing = editingOwnerId === o.id;
                const areaName = o.franchise_id ? franchiseMap.get(o.franchise_id)?.name ?? '—' : '—';
                const count = o.franchise_id ? (studentCountsByFranchise.get(o.franchise_id) || 0) : 0;

                return (
                  <div key={o.id} style={styles.ownerRow}>
                    {!isEditing ? (
                      <>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {o.full_name || '—'}
                            <span style={styles.ownerMeta}> · {o.email || '—'}</span>
                          </div>
                          <div style={styles.muted}>
                            Area: <b style={{ color: '#111827' }}>{areaName}</b> · Students: <b style={{ color: '#111827' }}>{count}</b>
                          </div>
                        </div>

                        <button onClick={() => startOwnerEdit(o)} style={styles.smallBtn} type="button">
                          Edit
                        </button>
                      </>
                    ) : (
                      <div style={{ width: '100%', display: 'grid', gap: 10 }}>
                        <div style={{ display: 'grid', gap: 10 }}>
                          <label style={styles.label}>
                            Owner name
                            <input
                              value={ownerEdit.full_name}
                              onChange={e => setOwnerEdit({ ...ownerEdit, full_name: e.target.value })}
                              style={styles.input}
                            />
                          </label>

                          <label style={styles.label}>
                            Area
                            <select
                              value={ownerEdit.franchise_id}
                              onChange={e => setOwnerEdit({ ...ownerEdit, franchise_id: e.target.value })}
                              style={styles.select}
                            >
                              <option value="">Select…</option>
                              {franchises.map(f => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <button onClick={() => saveOwnerEdit(o.id)} style={styles.primaryBtn} type="button">
                            Save
                          </button>
                          <button onClick={cancelOwnerEdit} style={styles.secondaryBtn} type="button">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ADD OWNER MODAL */}
          {showAddOwnerModal ? (
            <div style={styles.modalOverlay} onClick={() => setShowAddOwnerModal(false)}>
              <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
                <div style={styles.modalHeader}>
                  <div style={{ fontWeight: 950, fontSize: 16 }}>Add franchise owner</div>
                  <button onClick={() => setShowAddOwnerModal(false)} style={styles.smallBtn}>
                    Close
                  </button>
                </div>

                <div style={styles.divider} />

                <div style={{ display: 'grid', gap: 10 }}>
                  <label style={styles.label}>
                    Select student (top 5 alphabetical)
                    <input
                      value={addOwnerSearch}
                      onChange={e => setAddOwnerSearch(e.target.value)}
                      placeholder="Search by name or email…"
                      style={styles.input}
                      autoFocus
                    />
                  </label>

                  {addOwnerSearch.trim() ? (
                    top5AddOwnerCandidates.length ? (
                      <div style={styles.resultsCard}>
                        {top5AddOwnerCandidates.map(c => (
                          <button
                            key={c.user_id}
                            type="button"
                            onClick={() => setAddOwnerSelectedUserId(c.user_id)}
                            style={{
                              ...styles.resultRowBtn,
                              borderColor: addOwnerSelectedUserId === c.user_id ? 'rgba(185, 28, 28, 0.5)' : 'rgba(17,24,39,0.08)',
                              background: addOwnerSelectedUserId === c.user_id ? 'rgba(185, 28, 28, 0.06)' : 'white',
                            }}
                          >
                            <div style={styles.avatarSm}>
                              <AvatarFallback name={c.name} />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={styles.resultName}>{c.name}</div>
                              <div style={styles.muted}>{c.email || '—'}</div>
                            </div>
                            <div style={styles.pillRight}>{addOwnerSelectedUserId === c.user_id ? 'Selected' : 'Select'}</div>
                          </button>
                        ))}
                        <div style={styles.muted}>Showing top 5 (alphabetical). Refine your search for more.</div>
                      </div>
                    ) : (
                      <div style={styles.muted}>No matches.</div>
                    )
                  ) : (
                    <div style={styles.muted}>Type to search. We’ll show the top 5 results.</div>
                  )}

                  <label style={styles.label}>
                    Area name
                    <input
                      value={addOwnerAreaName}
                      onChange={e => setAddOwnerAreaName(e.target.value)}
                      placeholder="e.g. Southampton – Bitterne"
                      style={styles.input}
                    />
                    <div style={styles.muted}>If this area doesn’t exist, we’ll create it.</div>
                  </label>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={addFranchiseOwner} style={styles.primaryBtn} disabled={savingAddOwner} type="button">
                      {savingAddOwner ? 'Adding…' : 'Add franchise owner'}
                    </button>
                    <button onClick={() => setShowAddOwnerModal(false)} style={styles.secondaryBtn} type="button">
                      Cancel
                    </button>
                  </div>
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
   LITTLE UI BITS
========================= */

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={styles.detailItem}>
      <div style={styles.detailLabel}>{label}</div>
      <div style={{ ...styles.detailValue, ...(mono ? styles.mono : {}) }}>{value}</div>
    </div>
  );
}

function AvatarFallback({ name, big }: { name: string; big?: boolean }) {
  const letter = (name || '—').trim().slice(0, 1).toUpperCase() || '—';
  return (
    <div style={{ ...(big ? styles.avatarFallbackBig : styles.avatarFallbackSm) }}>
      {letter}
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
    maxWidth: 980,
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
    maxWidth: 980,
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
    maxWidth: 980,
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

  sectionRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  sectionTitle: { fontSize: 14, fontWeight: 900, letterSpacing: 0.3, marginBottom: 10 },
  muted: { fontSize: 13, color: '#6b7280' },

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

  resultsCard: {
    border: '1px solid rgba(17,24,39,0.08)',
    borderRadius: 16,
    padding: 12,
    background: 'white',
    display: 'grid',
    gap: 10,
  },
  resultRowBtn: {
    width: '100%',
    textAlign: 'left',
    borderRadius: 14,
    padding: 12,
    border: '1px solid rgba(17,24,39,0.08)',
    background: 'white',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    cursor: 'pointer',
  },
  avatarSm: {
    width: 42,
    height: 42,
    borderRadius: 14,
    border: '1px solid rgba(17,24,39,0.1)',
    background: 'rgba(17,24,39,0.03)',
    overflow: 'hidden',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
  },
  avatarLg: {
    width: 78,
    height: 78,
    borderRadius: 18,
    border: '1px solid rgba(17,24,39,0.12)',
    background: 'rgba(17,24,39,0.03)',
    overflow: 'hidden',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },

  avatarFallbackSm: {
    width: '100%',
    height: '100%',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 950,
    color: '#111827',
  },
  avatarFallbackBig: {
    width: '100%',
    height: '100%',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 950,
    fontSize: 22,
    color: '#111827',
  },

  resultName: {
    fontWeight: 950,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pillRight: {
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
    flexShrink: 0,
  },

  ownerRow: {
    borderRadius: 14,
    padding: 12,
    border: '1px solid rgba(17,24,39,0.08)',
    background: 'white',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
  },
  ownerMeta: {
    fontWeight: 800,
    color: '#6b7280',
    fontSize: 13,
  },

  smallBtn: {
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
    maxWidth: 640,
    background: 'white',
    borderRadius: 18,
    padding: 16,
    border: '1px solid #eee',
    boxShadow: '0 25px 70px rgba(0,0,0,0.35)',
  },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },

  detailGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  detailItem: {
    border: '1px solid rgba(17,24,39,0.08)',
    borderRadius: 14,
    padding: 12,
    background: 'rgba(17,24,39,0.02)',
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: 900,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  detailValue: { fontSize: 14, fontWeight: 900, color: '#111827', wordBreak: 'break-word' },
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' },

  footer: { width: '100%', maxWidth: 980, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 8 },

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