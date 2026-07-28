/**
 * Examen de fin de formation. GET → les questions (SANS les bonnes réponses). POST { answers } →
 * correction CÔTÉ SERVEUR + enregistrement du résultat. Réservé à qui a l'accès formation ouvert.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hasFormationAccess, setQuizResult, quizPassed } from '@/lib/formation-access';
import { publicQuestions, gradeQuiz } from '@/lib/formation-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasFormationAccess(me.id)) return NextResponse.json({ error: 'not_opened' }, { status: 403 });
  return NextResponse.json({ ok: true, questions: publicQuestions(), passed: quizPassed(me.id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasFormationAccess(me.id)) return NextResponse.json({ error: 'not_opened' }, { status: 403 });
  let b: { answers?: number[] } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const answers = Array.isArray(b.answers) ? b.answers.map((x) => Number(x)) : [];
  const r = gradeQuiz(answers);
  setQuizResult(me.id, r.score, r.passed);
  return NextResponse.json({ ok: true, ...r });
}
