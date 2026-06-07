import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { searchYouTube, searchYouTubeMulti } from '@/lib/youtube-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const limitRaw = request.nextUrl.searchParams.get('limit');
  const multi = limitRaw !== null;

  if (multi) {
    const limit = Math.max(1, Math.min(10, parseInt(limitRaw!, 10) || 5));
    const result = await searchYouTubeMulti(q, limit);
    if ('error' in result && result.error === 'bad_query') {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result, { status: 200 });
  }

  const result = await searchYouTube(q);
  if ('error' in result && result.error === 'bad_query') {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result, { status: 200 });
}
