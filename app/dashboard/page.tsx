'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';

type Profile = {
  id: string;
  role: string | null;
};

function withTimeout<T>(promise: Promise<T>, ms = 10000, label = 'Timed out') {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} (${ms}ms)`)), ms)
    ),
  ]);
}

export default function DashboardIndexPage() {
  const router = useRouter();
  const redirectingRef = useRef(false);

  const safeReplace = (path: string) => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    router.replace(path);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1) session
        const { data: s, error: sErr } = await supabase.auth.getSession();
        if (sErr) throw sErr;

        const user = s.session?.user ?? null;
        if (cancelled) return;

        if (!user) {
          safeReplace('/');
          return;
        }

        // 2) profile role
        const profRes = await withTimeout(
          (async () => {
            return await supabase
              .from('profiles')
              .select('id, role')
              .eq('id', user.id)
              .maybeSingle();
          })(),
          10000,
          'profiles query timed out'
        );

        const { data: p, error: pErr } = profRes as any;
        if (pErr) throw pErr;

        if (cancelled) return;

        if (!p) {
          safeReplace('/');
          return;
        }

        const role = (p as Profile).role ?? null;

        // 3) route by role
        if (role === 'hq') safeReplace('/dashboard/hq');
        else if (role === 'franchise_owner') safeReplace('/dashboard/franchise');
        else if (role === 'instructor') safeReplace('/dashboard/instructor');
        else if (role === 'student') safeReplace('/dashboard/student');
        else if (role === 'parent') safeReplace('/dashboard/parent');
        else safeReplace('/');
      } catch {
        if (cancelled) return;
        safeReplace('/');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'system-ui',
      }}
    >
      <div style={{ padding: 18, borderRadius: 12, border: '1px solid #eee' }}>
        <b>Loading dashboard…</b>
      </div>
    </main>
  );
}
