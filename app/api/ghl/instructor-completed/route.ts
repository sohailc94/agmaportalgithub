import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server only
);

// simple shared secret so random people can't hit your webhook
function isValid(req: Request) {
  const secret = req.headers.get('x-agm-secret');
  return secret && secret === process.env.GHL_WEBHOOK_SECRET;
}

export async function POST(req: Request) {
  try {
    if (!isValid(req)) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
    }

    const body = await req.json();

    // Expect these from GHL:
    // token, email, full_name, phone, address, medical_info, etc
    const token = String(body.token || '').trim();
    const email = String(body.email || '')
      .trim()
      .toLowerCase();

    if (!token || !email) {
      return NextResponse.json(
        { error: 'token and email are required' },
        { status: 400 }
      );
    }

    // 1) Find invite by token
    const { data: invite, error: invErr } = await supabaseAdmin
      .from('instructor_invites')
      .select('id, franchise_id, email, status')
      .eq('token', token)
      .single();

    if (invErr || !invite) {
      return NextResponse.json({ error: 'invite not found' }, { status: 404 });
    }

    if (invite.status === 'inactive') {
      return NextResponse.json({ error: 'invite inactive' }, { status: 409 });
    }

    // 2) Mark invite completed + active
    const { error: upInviteErr } = await supabaseAdmin
      .from('instructor_invites')
      .update({
        status: 'active',
        completed_at: new Date().toISOString(),
      })
      .eq('id', invite.id);

    if (upInviteErr) {
      return NextResponse.json({ error: upInviteErr.message }, { status: 500 });
    }

    // 3) OPTIONAL: if a profile already exists for that email, upgrade role to instructor
    // NOTE: profiles.id must be auth user id (uuid). We can't create auth users from here without extra work.
    const { data: prof, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    if (prof?.id) {
      const { error: upProfErr } = await supabaseAdmin
        .from('profiles')
        .update({
          role: 'instructor',
          franchise_id: invite.franchise_id,
          full_name: body.full_name ?? null,
        })
        .eq('id', prof.id);

      if (upProfErr) {
        return NextResponse.json({ error: upProfErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'unknown error' },
      { status: 500 }
    );
  }
}