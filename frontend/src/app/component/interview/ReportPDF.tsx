'use client';

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

interface PhaseEvaluation {
  overall: number;
  metrics: Record<string, number>;
  advice?: string[];
}

export interface InterviewMetricsV2 {
  version: 2;
  questions: any[];
  phase_evaluations: Record<string, PhaseEvaluation>;
}

const styles = StyleSheet.create({
  page: { 
    padding: 40, 
    backgroundColor: '#FFFFFF', 
    fontFamily: 'Helvetica' 
  },
  header: { 
    marginBottom: 30, 
    borderBottom: 2, 
    borderBottomColor: '#6366F1', 
    paddingBottom: 15 
  },
  title: { 
    fontSize: 26, 
    fontWeight: 'bold', 
    color: '#111827', 
    letterSpacing: -0.5 
  },
  subtitle: { 
    fontSize: 9, 
    color: '#6B7280', 
    textTransform: 'uppercase', 
    marginTop: 6,
    letterSpacing: 1
  },
  
  overallGrid: { 
    flexDirection: 'row', 
    gap: 15, 
    marginBottom: 35 
  },
  scoreCard: { 
    flex: 1, 
    padding: 15, 
    backgroundColor: '#F9FAFB', 
    borderRadius: 10, 
    alignItems: 'center',
    border: 1,
    borderColor: '#F3F4F6'
  },
  scoreVal: { 
    fontSize: 22, 
    fontWeight: 'bold', 
    color: '#4F46E5' 
  },
  scoreLabel: { 
    fontSize: 7, 
    color: '#6B7280', 
    textTransform: 'uppercase', 
    marginTop: 5,
    fontWeight: 'bold'
  },

  sectionTitle: { 
    fontSize: 14, 
    fontWeight: 'bold', 
    color: '#1F2937', 
    marginBottom: 15, 
    marginTop: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  
  phaseBlock: { 
    marginBottom: 20, 
    padding: 15, 
    backgroundColor: '#FFFFFF',
    border: 1, 
    borderColor: '#E5E7EB', 
    borderRadius: 12 
  },
  phaseHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 10,
    borderBottom: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 8
  },
  phaseName: { 
    fontSize: 11, 
    fontWeight: 'bold', 
    textTransform: 'uppercase', 
    color: '#374151' 
  },
  phaseOverall: { 
    fontSize: 11, 
    fontWeight: 'bold', 
    color: '#EC4899' 
  },
  
  metricsRow: { 
    flexDirection: 'row', 
    flexWrap: 'wrap',
    gap: 8, 
    marginBottom: 12 
  },
  metricBadge: { 
    padding: '4 8', 
    backgroundColor: '#F3F4F6', 
    borderRadius: 4, 
    fontSize: 8, 
    color: '#4B5563',
    fontWeight: 'medium'
  },
  
  adviceBox: { 
    marginTop: 5, 
    padding: 10, 
    backgroundColor: '#FEFCE8', 
    borderRadius: 8,
    borderLeft: 3,
    borderLeftColor: '#EAB308'
  },
  adviceTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#854D0E',
    marginBottom: 5,
    textTransform: 'uppercase'
  },
  adviceText: { 
    fontSize: 8.5, 
    color: '#713F12', 
    marginBottom: 4, 
    lineHeight: 1.4 
  },

  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  footerText: {
    fontSize: 7,
    color: '#9CA3AF'
  }
});

interface ReportPDFProps {
  session: any;
  metrics: InterviewMetricsV2;
}

export const ReportPDF = ({ session, metrics }: ReportPDFProps) => {
  const date = new Date(session.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Performance Evaluation Dossier</Text>
          <Text style={styles.subtitle}>
            Session Protocol: {session.session_id.toUpperCase()} • Generated on {date}
          </Text>
        </View>

        {/* Summary Scores */}
        <View style={styles.overallGrid}>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreVal}>{Math.round((session.overall_confidence_score || 0) * 100)}%</Text>
            <Text style={styles.scoreLabel}>Confidence Score</Text>
          </View>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreVal}>{Math.round((session.overall_voice_score || 0) * 100)}%</Text>
            <Text style={styles.scoreLabel}>Voice & Communication</Text>
          </View>
        </View>

        {/* Phase Breakdown */}
        <Text style={styles.sectionTitle}>Phase-Wise Performance Analysis</Text>
        {Object.entries(metrics.phase_evaluations).map(([phase, data]) => (
          <View key={phase} style={styles.phaseBlock} wrap={false}>
            <View style={styles.phaseHeader}>
              <Text style={styles.phaseName}>{phase.replace(/_/g, ' ')}</Text>
              <Text style={styles.phaseOverall}>Efficiency: {data.overall}/10</Text>
            </View>
            
            <View style={styles.metricsRow}>
              {Object.entries(data.metrics).map(([k, v]) => (
                <Text key={k} style={styles.metricBadge}>
                  {k.replace(/_/g, ' ')}: {v}/10
                </Text>
              ))}
            </View>

            {data.advice && data.advice.length > 0 && (
              <View style={styles.adviceBox}>
                <Text style={styles.adviceTitle}>Strategic Advice</Text>
                {data.advice.map((advice, i) => (
                  <Text key={i} style={styles.adviceText}>• {advice}</Text>
                ))}
              </View>
            )}
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2026 InterviewAI Behavioral Analytics Platform</Text>
          <Text style={styles.footerText}>Confidential Report • Ref: {session.id.slice(0, 8)}</Text>
        </View>
      </Page>
    </Document>
  );
};
