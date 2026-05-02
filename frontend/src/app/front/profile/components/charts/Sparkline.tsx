'use client';

import React from 'react';
import { 
  LineChart, 
  Line, 
  ResponsiveContainer 
} from 'recharts';

export default function Sparkline({ data, color }: { data: any[], color: string }) {
  if (!data || data.length === 0) return <div className="h-full w-full bg-white/5 rounded animate-pulse" />;

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <LineChart data={data}>
        <Line 
          type="monotone" 
          dataKey="value" 
          stroke={color} 
          strokeWidth={2} 
          dot={false}
          animationDuration={2000}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
