'use client';

import React from 'react';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer 
} from 'recharts';

export default function FocusRadar({ gazeDistribution }: { gazeDistribution: any }) {
  const data = [
    { subject: 'Forward', A: (gazeDistribution.forward || 0) * 100, fullMark: 100 },
    { subject: 'Left', A: (gazeDistribution.left || 0) * 100, fullMark: 100 },
    { subject: 'Right', A: (gazeDistribution.right || 0) * 100, fullMark: 100 },
    { subject: 'Down', A: (gazeDistribution.down || 0) * 100, fullMark: 100 },
    { subject: 'Away', A: (gazeDistribution.away || 0) * 100, fullMark: 100 },
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
        <PolarGrid stroke="#ffffff10" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: '#4b5563', fontSize: 10 }} />
        <Radar
          name="Focus"
          dataKey="A"
          stroke="#ec4899"
          fill="#ec4899"
          fillOpacity={0.3}
          animationDuration={1500}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
