import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    
    const res = await fetch(`${process.env.NEXT_PUBLIC_CONVFLOW_URL}/api/admin/sessions/${sessionId}/timeline`);
    if (!res.ok) throw new Error('Failed to fetch timeline');
    const data = await res.json();
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching timeline:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
