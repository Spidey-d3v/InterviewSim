import re

with open("frontend/src/app/front/profile/components/SessionDrawer.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. DELETE lines 120-165 (Legacy Phase-Wise Breakdown)
legacy_pattern = r"\{\/\*\s*Phase-Wise Breakdown \(Legacy\)\s*\*\/\}.*?\{\/\*\s*V2 Feedback"
content = re.sub(legacy_pattern, "{/* V2 Feedback", content, flags=re.DOTALL)


# 2. REPLACE the Performance Observations grid to include Focus and STAR Method Pie Chart
perf_grid_pattern = r"<div className=\"grid grid-cols-2 gap-4 mb-6\">\s*<div className=\"p-4 bg-white/\[0\.02\].*?</div>\s*</div>"
# Wait, regex is risky. Let's do it cleanly by targeting specific strings.

new_perf_grid = """
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                   <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">Pace</p>
                   <p className="text-2xl font-black text-gray-200">{v2Feedback.observations.pace?.wpm || 0} <span className="text-xs text-gray-500">WPM</span></p>
                   <p className="text-xs text-purple-400 capitalize font-bold mt-1">{v2Feedback.observations.pace?.status || "Balanced"}</p>
                </div>
                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                   <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">Focus</p>
                   <p className="text-2xl font-black text-gray-200">{Math.round((v2Feedback.observations.camera_engagement?.average || 0) * 100)}%</p>
                   <p className="text-xs text-emerald-400 font-bold mt-1">Direct Eye Contact</p>
                </div>
                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                   <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">Length</p>
                   <p className="text-xl font-black text-gray-200 capitalize">{v2Feedback.observations.response_length?.status || 'Balanced'}</p>
                </div>
                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                   <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">Vocabulary</p>
                   <p className="text-xl font-black text-gray-200 capitalize">{v2Feedback.observations.vocabulary?.status || 'Confident'}</p>
                   <p className="text-xs text-gray-500 mt-1">{v2Feedback.observations.vocabulary?.strong_words_used || 0} Strong | {v2Feedback.observations.vocabulary?.weak_words_used || 0} Weak</p>
                </div>
              </div>

              {v2Feedback.observations.star_coverage && (
                <div className="mt-8 p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
                   <div className="flex items-center justify-between mb-6">
                     <div>
                       <h4 className="text-sm font-bold text-gray-200 tracking-tight uppercase">STAR Method Adherence</h4>
                       <p className="text-xs text-gray-500 mt-1">Breakdown of how you structured your answers</p>
                     </div>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                     <div className="relative h-64 w-full flex items-center justify-center">
                       {(() => {
                         const s = v2Feedback.observations.star_coverage.situation || 0;
                         const t = v2Feedback.observations.star_coverage.task || 0;
                         const a = v2Feedback.observations.star_coverage.action || 0;
                         const r = v2Feedback.observations.star_coverage.result || 0;
                         const total = s + t + a + r || 1; // Prevent division by zero
                         const sp = (s / total) * 100;
                         const tp = (t / total) * 100;
                         const ap = (a / total) * 100;
                         const rp = (r / total) * 100;
                         
                         const gradient = `conic-gradient(
                           #818cf8 0% ${sp}%,
                           #c084fc ${sp}% ${sp + tp}%,
                           #34d399 ${sp + tp}% ${sp + tp + ap}%,
                           #f472b6 ${sp + tp + ap}% 100%
                         )`;

                         return (
                           <div className="relative w-48 h-48 rounded-full shadow-2xl" style={{ background: gradient }}>
                             <div className="absolute inset-2 rounded-full bg-[#111827] flex items-center justify-center">
                               <div className="text-center">
                                 <span className="block text-2xl font-black text-white">{Math.round(total)}%</span>
                                 <span className="text-[10px] text-gray-500 font-bold">COVERAGE</span>
                               </div>
                             </div>
                           </div>
                         );
                       })()}
                     </div>
                     <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-indigo-400 font-bold block mb-1">Situation (Target: ~10%)</span>
                          <span className="text-gray-500">Setting the scene. You achieved: <strong className="text-gray-300">{v2Feedback.observations.star_coverage.situation || 0}%</strong></span>
                        </div>
                        <div>
                          <span className="text-purple-400 font-bold block mb-1">Task (Target: ~10%)</span>
                          <span className="text-gray-500">Describing your responsibility. You achieved: <strong className="text-gray-300">{v2Feedback.observations.star_coverage.task || 0}%</strong></span>
                        </div>
                        <div>
                          <span className="text-emerald-400 font-bold block mb-1">Action (Target: ~60%)</span>
                          <span className="text-gray-500">What YOU actually did. You achieved: <strong className="text-gray-300">{v2Feedback.observations.star_coverage.action || 0}%</strong></span>
                        </div>
                        <div>
                          <span className="text-pink-400 font-bold block mb-1">Result (Target: ~20%)</span>
                          <span className="text-gray-500">The positive outcome. You achieved: <strong className="text-gray-300">{v2Feedback.observations.star_coverage.result || 0}%</strong></span>
                        </div>
                     </div>
                   </div>
                </div>
              )}
"""

# Find the start and end of the performance grid
start_idx = content.find('<div className="grid grid-cols-2 gap-4 mb-6">')
end_idx = content.find('<div className="flex items-center gap-2 mb-6 mt-8">')

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + new_perf_grid + content[end_idx:]


# 3. FIX THE PDF BUTTON
pdf_button = """
            <button 
              onClick={async () => {
                const { jsPDF } = await import('jspdf');
                const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
                const margin = 40;
                const pageWidth = pdf.internal.pageSize.getWidth();
                const contentWidth = pageWidth - margin * 2;
                let y = margin;

                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(22);
                pdf.setTextColor(255, 255, 255);
                pdf.setFillColor(17, 24, 39);
                pdf.rect(0, 0, pageWidth, 100, 'F');
                pdf.text('INTERVIEW AI DOSSIER', margin, margin + 25);
                y = 120;

                if (v2Feedback && v2Feedback.version === 2) {
                  const obs = v2Feedback.observations;
                  pdf.setFont('helvetica', 'bold');
                  pdf.setFontSize(14);
                  pdf.setTextColor(17, 24, 39);
                  pdf.text('OVERALL OBSERVATIONS', margin, y);
                  y += 20;

                  pdf.setFillColor(243, 244, 246);
                  pdf.rect(margin, y, contentWidth, 70, 'F');
                  pdf.setFontSize(10);
                  
                  if (obs.pace) {
                    pdf.text(`PACE: ${obs.pace.wpm} WPM (${obs.pace.status})`, margin + 15, y + 20);
                  }
                  if (obs.camera_engagement) {
                    pdf.text(`FOCUS: ${Math.round(obs.camera_engagement.average * 100)}%`, margin + 150, y + 20);
                  }
                  if (obs.vocabulary) {
                    pdf.text(`VOCAB: ${obs.vocabulary.strong_words_used} Strong | ${obs.vocabulary.weak_words_used} Weak`, margin + 15, y + 40);
                  }
                  if (obs.response_length) {
                    pdf.text(`LENGTH: ${obs.response_length.status}`, margin + 150, y + 40);
                  }
                  y += 100;

                  if (v2Feedback.technical_evaluation && v2Feedback.technical_evaluation.length > 0) {
                    pdf.setFontSize(14);
                    pdf.text('TECHNICAL EVALUATION', margin, y);
                    y += 20;
                    v2Feedback.technical_evaluation.forEach((tech: any) => {
                      if (y > pdf.internal.pageSize.getHeight() - 50) { pdf.addPage(); y = margin; }
                      pdf.setFontSize(9);
                      pdf.setFont('helvetica', 'bold');
                      pdf.setTextColor(99, 102, 241);
                      pdf.text(`Q${tech.question_index + 1} - Score: ${tech.accuracy_score_out_of_5}/5`, margin, y);
                      pdf.setFont('helvetica', 'normal');
                      pdf.setTextColor(17, 24, 39);
                      const techLines = pdf.splitTextToSize(tech.feedback, contentWidth - 40);
                      techLines.forEach((al: string) => { pdf.text(al, margin + 20, y += 12); });
                      y += 20;
                    });
                  }
                }

                pdf.save(`interview-dossier-${session.session_id.slice(0, 8)}.pdf`);
              }}
              className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-2xl font-black text-lg text-white transition-all flex items-center justify-center gap-3 shadow-2xl"
            >
              <Download size={20} />
              DOWNLOAD PDF DOSSIER
            </button>
"""
disabled_btn_idx = content.find('PDF DOSSIER ONLY AVAILABLE POST-INTERVIEW')
if disabled_btn_idx != -1:
    btn_start = content.rfind('<button', 0, disabled_btn_idx)
    btn_end = content.find('</button>', disabled_btn_idx) + 9
    content = content[:btn_start] + pdf_button + content[btn_end:]

with open("frontend/src/app/front/profile/components/SessionDrawer.tsx", "w", encoding="utf-8") as f:
    f.write(content)
