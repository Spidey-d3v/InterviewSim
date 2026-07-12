import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    
    // Fetch all events for the session, ordered by timestamp
    const client = await pool.connect();
    const result = await client.query(
      `SELECT id, timestamp_seconds, metric_type, is_red_flag, raw_data_json 
       FROM interview_timeline 
       WHERE session_id = $1 
       ORDER BY timestamp_seconds ASC`,
      [sessionId]
    );
    client.release();
    
    return NextResponse.json({ events: result.rows });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
