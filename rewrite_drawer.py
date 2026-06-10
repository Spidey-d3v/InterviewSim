import re

with open("frontend/src/app/front/profile/components/SessionDrawer.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Normalize Gaze Data and remove phaseEvaluations definition
target_vars = """  const rawMetrics = session.question_metrics_json?.[0] || {};
  const phaseEvaluations = session.llm_evaluation_json || (isV2 ? rawMetrics.phase_evaluations : null);"""

replacement_vars = """  const rawMetrics = session.question_metrics_json?.[0] || {};
  const phaseEvaluations = null;

  let gazeData = session.overall_gaze_distribution || {};
  const totalGaze = Object.values(gazeData).reduce((a, b) => a + Number(b), 0);
  if (totalGaze > 1.01) {
    gazeData = {
      forward: (gazeData.forward || 0) / totalGaze,
      away: (gazeData.away || 0) / totalGaze,
      left: (gazeData.left || 0) / totalGaze,
      right: (gazeData.right || 0) / totalGaze,
      down: (gazeData.down || 0) / totalGaze,
    };
  }"""
content = content.replace(target_vars, replacement_vars)

# 2. Use gazeData
content = content.replace("gazeDistribution={session.overall_gaze_distribution || {}}", "gazeDistribution={gazeData}")
content = content.replace("Math.round((session.overall_gaze_distribution?.forward || 0) * 100)", "Math.round((gazeData?.forward || 0) * 100)")
content = content.replace("Math.round((session.overall_gaze_distribution?.[key.toLowerCase()] || 0) * 100)", "Math.round((gazeData?.[key.toLowerCase()] || 0) * 100)")

with open("frontend/src/app/front/profile/components/SessionDrawer.tsx", "w", encoding="utf-8") as f:
    f.write(content)
