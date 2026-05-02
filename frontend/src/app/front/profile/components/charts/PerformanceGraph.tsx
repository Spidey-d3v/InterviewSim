'use client';

import React from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';

interface PerformanceGraphProps {
  sessions: any[];
}

export default function PerformanceGraph({ sessions }: PerformanceGraphProps) {
  // Map last 15 sessions for the graph
  const data = sessions.slice(0, 15).reverse().map((s, idx) => {
    const gaze = s.overall_gaze_distribution || {};
    const focus = (gaze.forward || 0) + (gaze.left || 0) + (gaze.right || 0);
    
    return {
      name: `S${idx + 1}`,
      confidence: Math.round((s.overall_confidence_score || 0) * 100),
      focus: Math.round(focus * 100),
      voice: Math.round((s.overall_voice_score || 0) * 100),
    };
  });

  if (sessions.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-600 font-medium italic border-2 border-dashed border-white/5 rounded-2xl">
        No sortie data available yet. Complete an interview to begin tracking.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorConf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorFocus" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ec4899" stopOpacity={0.2}/>
            <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
        <XAxis 
          dataKey="name" 
          stroke="#4b5563" 
          fontSize={10} 
          tickLine={false} 
          axisLine={false} 
          dy={10}
        />
        <YAxis 
          stroke="#4b5563" 
          fontSize={10} 
          tickLine={false} 
          axisLine={false} 
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: '#0f0f15', 
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            fontSize: '12px'
          }}
          itemStyle={{ padding: '2px 0' }}
        />
        <Area 
          type="monotone" 
          dataKey="confidence" 
          stroke="#8b5cf6" 
          strokeWidth={3}
          fillOpacity={1} 
          fill="url(#colorConf)" 
          animationDuration={1500}
        />
        <Area 
          type="monotone" 
          dataKey="focus" 
          stroke="#ec4899" 
          strokeWidth={3}
          fillOpacity={1} 
          fill="url(#colorFocus)" 
          animationDuration={2000}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
