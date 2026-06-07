import { NextRequest, NextResponse } from 'next/server';
import { searchRecipe } from '@/lib/recipe-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query');
  if (!query || query.trim().length < 2) {
    return NextResponse.json({ recipe: null, error: 'bad_query' }, { status: 400 });
  }
  const recipe = await searchRecipe(query);
  return NextResponse.json({ recipe });
}
