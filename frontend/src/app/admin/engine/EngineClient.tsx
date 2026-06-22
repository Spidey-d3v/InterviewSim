'use client';

import React, { useState } from 'react';
import { updateEngineConfig } from './actions';
import { Settings2, Cpu, Eye, Save, CheckCircle2, AlertCircle } from 'lucide-react';

export default function EngineClient({ config }: { config: any }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Local state for sliders
  const [temperature, setTemperature] = useState(config?.llm_temperature ?? 0.4);
  const [maxTokens, setMaxTokens] = useState(config?.llm_max_tokens ?? 700);
  const [focusThreshold, setFocusThreshold] = useState(config?.vision_focus_threshold ?? 0.3);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');
    
    const formData = new FormData(e.currentTarget);
    const res = await updateEngineConfig(formData);
    
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg('Engine Configuration updated successfully! Applied to next interview.');
      setTimeout(() => setSuccessMsg(''), 4000);
    }
    setLoading(false);
  };

  const hasChanges = 
    temperature !== config?.llm_temperature || 
    maxTokens !== config?.llm_max_tokens || 
    focusThreshold !== config?.vision_focus_threshold;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3 mb-2">
          <Settings2 className="w-8 h-8 text-indigo-500" />
          Engine Tuning
        </h2>
        <p className="text-gray-400">Dynamically adjust the LLM properties and Vision Tracking thresholds.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* LLM Config Panel */}
        <div className="bg-[#0a0a0f] border border-white/10 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
          <div className="flex items-center gap-3 mb-6">
            <Cpu className="w-6 h-6 text-indigo-400" />
            <h3 className="text-xl font-bold text-white">Language Model (LLM)</h3>
          </div>

          <div className="space-y-8">
            {/* Temperature Slider */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <div>
                  <label className="text-sm font-medium text-gray-200">Temperature</label>
                  <p className="text-xs text-gray-500 mt-1">Controls the creativity and randomness of the AI's responses.</p>
                </div>
                <div className="text-indigo-400 font-mono font-bold bg-indigo-500/10 px-3 py-1 rounded-lg border border-indigo-500/20">
                  {temperature.toFixed(2)}
                </div>
              </div>
              <input 
                type="range" 
                name="llm_temperature"
                min="0.0" max="1.0" step="0.05" 
                value={temperature}
                onChange={e => setTemperature(parseFloat(e.target.value))}
                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-xs text-gray-600 mt-2 font-mono">
                <span>0.0 (Strict/Deterministic)</span>
                <span>1.0 (Creative/Random)</span>
              </div>
            </div>

            {/* Max Tokens Slider */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <div>
                  <label className="text-sm font-medium text-gray-200">Max Tokens</label>
                  <p className="text-xs text-gray-500 mt-1">Maximum length of the AI's generated response per turn.</p>
                </div>
                <div className="text-indigo-400 font-mono font-bold bg-indigo-500/10 px-3 py-1 rounded-lg border border-indigo-500/20">
                  {maxTokens}
                </div>
              </div>
              <input 
                type="range" 
                name="llm_max_tokens"
                min="50" max="2000" step="50" 
                value={maxTokens}
                onChange={e => setMaxTokens(parseInt(e.target.value))}
                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-xs text-gray-600 mt-2 font-mono">
                <span>50 (Very Short)</span>
                <span>2000 (Very Long)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Vision Config Panel */}
        <div className="bg-[#0a0a0f] border border-white/10 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <div className="flex items-center gap-3 mb-6">
            <Eye className="w-6 h-6 text-emerald-400" />
            <h3 className="text-xl font-bold text-white">Vision Tracking (L2CS-Net)</h3>
          </div>

          <div>
            <div className="flex justify-between items-end mb-2">
              <div>
                <label className="text-sm font-medium text-gray-200">Focus Loss Threshold</label>
                <p className="text-xs text-gray-500 mt-1">If the candidate's forward gaze drops below this percentage, it flags a focus warning.</p>
              </div>
              <div className="text-emerald-400 font-mono font-bold bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20">
                {(focusThreshold * 100).toFixed(0)}%
              </div>
            </div>
            <input 
              type="range" 
              name="vision_focus_threshold"
              min="0.0" max="1.0" step="0.05" 
              value={focusThreshold}
              onChange={e => setFocusThreshold(parseFloat(e.target.value))}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-2 font-mono">
              <span>0% (Lenient)</span>
              <span>100% (Extremely Strict)</span>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between bg-[#13131a] border border-white/10 p-4 rounded-2xl shadow-xl sticky bottom-6">
          <div className="flex-1">
            {successMsg && (
              <span className="text-green-400 text-sm flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-5 h-5" /> {successMsg}
              </span>
            )}
            {error && (
              <span className="text-red-400 text-sm flex items-center gap-2">
                <AlertCircle className="w-5 h-5" /> {error}
              </span>
            )}
          </div>
          
          <button 
            type="submit"
            disabled={!hasChanges || loading}
            className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all ${
              hasChanges 
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)] hover:shadow-[0_0_30px_rgba(79,70,229,0.6)]' 
                : 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/5'
            }`}
          >
            <Save className="w-5 h-5" />
            {loading ? 'Applying...' : hasChanges ? 'Apply Tuning Changes' : 'Up to Date'}
          </button>
        </div>
        
      </form>

    </div>
  );
}
