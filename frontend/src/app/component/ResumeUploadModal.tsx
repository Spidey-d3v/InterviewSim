'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, UploadCloud } from 'lucide-react';
import { createClient } from '@/utils/supabase'; 

interface ResumeUploadModalProps {
  onClose: () => void;
  onUploadSuccess?: () => void;
}

export default function ResumeUploadModal({ onClose, onUploadSuccess }: ResumeUploadModalProps) {
  const [mounted, setMounted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success'>('idle');
  
  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type === 'application/pdf') {
      setFile(selected);
    } else {
      alert("Please upload a PDF file.");
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setStatus('uploading');
      
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error("Please log in to upload a resume!");
      }

      // DEBUG: Look at your browser console to see exactly where your name is stored
      console.log("Current User Metadata:", user.user_metadata);

      // Try to find the name in metadata, fallback to email prefix if empty
      const displayName = user.user_metadata?.full_name || 
                          user.user_metadata?.name || 
                          user.user_metadata?.first_name || 
                          user.email?.split('@')[0] || 
                          "User";

      const formData = new FormData();
      formData.append('file', file);
      formData.append('user_id', user.id); 
      formData.append('user_email', user.email || "");
      formData.append('user_full_name', displayName); // Sent from Auth, not AI

      const response = await fetch(`${process.env.NEXT_PUBLIC_CONVFLOW_URL}/api/parse-resume`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to parse resume');
      }

      onUploadSuccess?.();
      setStatus('success');
      setTimeout(() => onClose(), 1500);
      
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      console.error("Upload error:", error);
      alert(message);
      setStatus('idle');
    }
  };

  if (!mounted) return null;

  const modalUI = (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', zIndex: 999999998 }} onClick={onClose} />
      <div style={{ position: 'relative', zIndex: 1000000000, width: '100%', maxWidth: '28rem', backgroundColor: '#0a0a0f', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '1rem', padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', padding: '0.5rem', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
          <X size={20} />
        </button>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'white' }}>Upload Resume</h2>
        <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' }}>We&apos;ll use this to personalize your AI interview experience.</p>
        <div onClick={() => document.getElementById('fileInput')?.click()} style={{ border: '2px dashed #374151', borderRadius: '0.75rem', padding: '2rem', textAlign: 'center', marginBottom: '1.5rem', cursor: 'pointer' }}>
          <UploadCloud size={32} style={{ margin: '0 auto 0.75rem', color: '#6b7280' }} />
          <p style={{ color: 'white', fontWeight: '500', marginBottom: '0.25rem' }}>Click to browse or drag and drop</p>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>PDF files only (Max 5MB)</p>
          <input id="fileInput" type="file" accept=".pdf" onChange={handleFileChange} style={{ display: 'none' }} />
        </div>
        {file && (
          <div style={{ marginBottom: '1.5rem', padding: '0.75rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.875rem', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
            <button onClick={() => setFile(null)} style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>
          </div>
        )}
        <button onClick={handleUpload} disabled={!file || status !== 'idle'} style={{ width: '100%', padding: '0.75rem', backgroundColor: !file || status !== 'idle' ? 'rgba(255, 255, 255, 0.5)' : 'white', color: 'black', fontWeight: '600', borderRadius: '0.5rem', border: 'none', cursor: !file || status !== 'idle' ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          {status === 'uploading' && (
            <div style={{ width: '1.25rem', height: '1.25rem', border: '2px solid black', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          )}
          {status === 'idle' ? 'Start Parsing' : status === 'uploading' ? 'Analyzing...' : 'Done!'}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return createPortal(modalUI, document.body);
}