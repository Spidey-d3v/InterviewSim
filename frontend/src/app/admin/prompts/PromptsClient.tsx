'use client';

import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { updatePrompt } from './actions';
import { Save, AlertCircle, CheckCircle2, MessageSquareText } from 'lucide-react';

export default function PromptsClient({ prompts }: { prompts: any[] }) {
  const [selectedPrompt, setSelectedPrompt] = useState<any>(prompts[0] || null);
  const [draftText, setDraftText] = useState(prompts[0]?.prompt_text || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSelect = (p: any) => {
    setSelectedPrompt(p);
    setDraftText(p.prompt_text);
    setError('');
    setSuccessMsg('');
  };

  const handleSave = async () => {
    if (!selectedPrompt) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    
    const res = await updatePrompt(selectedPrompt.id, draftText);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg('Prompt saved successfully!');
      selectedPrompt.prompt_text = draftText;
      setTimeout(() => setSuccessMsg(''), 3000);
    }
    setLoading(false);
  };

  const hasUnsavedChanges = selectedPrompt && selectedPrompt.prompt_text !== draftText;

  // Variables that are injected into the prompt based on the phase
  const getInjectedVariables = (key: string) => {
    const common = ['{interviewer_name}', '{job_role}', '{company_name}', '{candidate_ref}', '{transcript_context}'];
    if (key === 'intro') return [...common, '{resume_context}', '{job_description}'];
    if (key === 'resume') return [...common, '{resume_context}', '{job_description}', '{summary_till_now}'];
    if (key === 'core_tech') return [...common, '{resume_context}', '{job_description}', '{summary_till_now}', '{question_bank}'];
    if (key === 'situational') return [...common, '{resume_context}', '{job_description}', '{summary_till_now}'];
    return common;
  };

  const getAssignedInterviewer = (key: string) => {
    switch(key) {
      case 'intro': return 'Kate';
      case 'resume': return 'Michael';
      case 'core_tech': return 'Bella';
      case 'situational': return 'Alex';
      default: return 'Any';
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">
      
      {/* Sidebar List */}
      <div className="w-full lg:w-72 flex flex-col gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <MessageSquareText className="w-6 h-6 text-purple-500" />
            Prompt Editor
          </h2>
          <p className="text-gray-400 text-sm mt-1">Select an interview phase to tune its AI behavior and strictness.</p>
        </div>
        
        <div className="flex flex-col gap-2 mt-4 overflow-y-auto pr-2 custom-scrollbar">
          {prompts.map(p => (
            <button 
              key={p.id}
              onClick={() => handleSelect(p)}
              className={`text-left p-4 rounded-xl border transition-all duration-200 group ${selectedPrompt?.id === p.id ? 'bg-gradient-to-br from-purple-600/20 to-blue-600/10 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.1)]' : 'bg-[#0f0f15] border-white/5 hover:border-white/20 hover:bg-white/5'}`}
            >
              <div className={`font-mono text-sm font-bold mb-1 transition-colors ${selectedPrompt?.id === p.id ? 'text-purple-300' : 'text-gray-300 group-hover:text-purple-300'}`}>
                {p.prompt_key.toUpperCase()}
              </div>
              <div className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                {p.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex flex-col bg-[#0a0a0f] border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative">
        {selectedPrompt ? (
          <>
            {/* Editor Toolbar */}
            <div className="bg-[#13131a] border-b border-white/10 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="font-mono font-bold text-white text-lg flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                  {selectedPrompt.prompt_key}.prompt
                </h3>
                <div className="flex items-center gap-2 mt-1 mb-2">
                  <span className="text-xs text-gray-400">Assigned Interviewer:</span>
                  <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30">
                    {getAssignedInterviewer(selectedPrompt.prompt_key)}
                  </span>
                </div>
                <div className="text-xs text-gray-400 flex gap-2 flex-wrap items-center">
                  Available Variables:
                  {getInjectedVariables(selectedPrompt.prompt_key).map(v => (
                    <span key={v} className="bg-purple-500/10 text-purple-300 px-1.5 py-0.5 rounded font-mono text-[10px] border border-purple-500/20">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                {successMsg && (
                  <span className="text-green-400 text-sm flex items-center gap-1 animate-in fade-in slide-in-from-right-4">
                    <CheckCircle2 className="w-4 h-4" /> {successMsg}
                  </span>
                )}
                {error && (
                  <span className="text-red-400 text-sm flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" /> {error}
                  </span>
                )}
                <button 
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges || loading}
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all ${
                    hasUnsavedChanges 
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.5)]' 
                      : 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/5'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  {loading ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'Saved'}
                </button>
              </div>
            </div>
            
            {/* Monaco Editor Container */}
            <div className="flex-1 w-full relative">
              <Editor
                height="100%"
                defaultLanguage="markdown"
                theme="vs-dark"
                value={draftText}
                onChange={(val) => setDraftText(val || '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  lineHeight: 1.6,
                  wordWrap: 'on',
                  padding: { top: 24, bottom: 24 },
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  cursorBlinking: "smooth",
                  cursorSmoothCaretAnimation: "on",
                  renderLineHighlight: "all",
                }}
                className="absolute inset-0"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4">
            <MessageSquareText className="w-16 h-16 text-gray-700" />
            <p className="text-lg font-medium">Select a prompt phase to start editing</p>
          </div>
        )}
      </div>

    </div>
  );
}
