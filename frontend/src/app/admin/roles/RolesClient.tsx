'use client';

import React, { useState } from 'react';
import { createRole, updateRole, deleteRole } from './actions';

export default function RolesClient({ roles }: { roles: any[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Dynamic Questions State
  const [questions, setQuestions] = useState([{ topic: '', question: '' }]);

  const openAdd = () => {
    setIsAdding(true);
    setEditingRole(null);
    setQuestions([{ topic: '', question: '' }]);
    setError('');
  };

  const openEdit = (role: any) => {
    setIsAdding(true);
    setEditingRole(role);
    setError('');
    
    let parsedQuestions = [];
    try {
      parsedQuestions = typeof role.question_bank_json === 'string' 
        ? JSON.parse(role.question_bank_json) 
        : role.question_bank_json;
      if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
        parsedQuestions = [{ topic: '', question: '' }];
      }
    } catch (e) {
      parsedQuestions = [{ topic: '', question: '' }];
    }
    setQuestions(parsedQuestions);
  };

  const closeForm = () => {
    setIsAdding(false);
    setEditingRole(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const formData = new FormData(e.currentTarget);
    
    // Filter out empty questions before saving
    const validQuestions = questions.filter(q => q.topic.trim() !== '' || q.question.trim() !== '');
    formData.set('question_bank_json', JSON.stringify(validQuestions));
    
    let res;
    if (editingRole) {
      res = await updateRole(editingRole.id, formData);
    } else {
      res = await createRole(formData);
    }
    
    if (res.error) {
      setError(res.error);
    } else {
      closeForm();
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this role?')) return;
    await deleteRole(id);
  };

  const addQuestion = () => {
    setQuestions([...questions, { topic: '', question: '' }]);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: 'topic' | 'question', value: string) => {
    const newQuestions = [...questions];
    newQuestions[index][field] = value;
    setQuestions(newQuestions);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Job Roles</h2>
          <p className="text-gray-400">Manage predefined roles and question banks.</p>
        </div>
        <button 
          onClick={isAdding ? closeForm : openAdd}
          className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {isAdding ? 'Cancel' : '+ Add Role'}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="bg-[#0f0f15] border border-white/10 p-6 rounded-2xl space-y-6">
          <h3 className="text-xl font-bold">{editingRole ? 'Edit Role' : 'Create New Role'}</h3>
          {error && <div className="text-red-400 text-sm bg-red-500/10 p-3 rounded">{error}</div>}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Role Name</label>
              <input 
                name="role_name" 
                defaultValue={editingRole?.role_name || ''} 
                required 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500" 
                placeholder="e.g. Senior Frontend Engineer" 
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <input 
                name="description" 
                defaultValue={editingRole?.description || ''} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500" 
                placeholder="Brief description of the role" 
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-end mb-2">
              <label className="block text-sm text-gray-400">Question Bank</label>
              <button 
                type="button" 
                onClick={addQuestion}
                className="text-xs bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded transition-colors"
              >
                + Add Question
              </button>
            </div>
            
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={i} className="flex items-start gap-3 bg-[#1a1a24] p-3 rounded-lg border border-white/5">
                  <div className="flex-1 space-y-2">
                    <input 
                      placeholder="Topic (e.g. React Hooks)" 
                      value={q.topic}
                      onChange={e => updateQuestion(i, 'topic', e.target.value)}
                      className="w-full bg-transparent border-b border-white/10 px-2 py-1 text-sm text-white focus:outline-none focus:border-purple-500" 
                    />
                    <textarea 
                      placeholder="Question..." 
                      rows={2}
                      value={q.question}
                      onChange={e => updateQuestion(i, 'question', e.target.value)}
                      className="w-full bg-transparent border-b border-white/10 px-2 py-1 text-sm text-white focus:outline-none focus:border-purple-500 resize-none" 
                    />
                  </div>
                  <button 
                    type="button" 
                    onClick={() => removeQuestion(i)}
                    className="text-gray-500 hover:text-red-400 p-2"
                  >
                    ×
                  </button>
                </div>
              ))}
              {questions.length === 0 && (
                <div className="text-sm text-gray-500 py-4 text-center border border-dashed border-white/10 rounded">
                  No questions added.
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button disabled={loading} type="submit" className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium transition-colors">
              {loading ? 'Saving...' : (editingRole ? 'Update Role' : 'Save Role')}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {roles.map(role => {
          let qCount = 0;
          try {
            const parsed = typeof role.question_bank_json === 'string' ? JSON.parse(role.question_bank_json) : role.question_bank_json;
            qCount = Array.isArray(parsed) ? parsed.length : 0;
          } catch (e) {}

          return (
            <div key={role.id} className="bg-[#0f0f15] border border-white/10 p-6 rounded-2xl flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold text-white">{role.role_name}</h3>
                  <p className="text-sm text-gray-400">{role.description || 'No description'}</p>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <button onClick={() => openEdit(role)} className="text-blue-400 hover:text-blue-300 text-sm px-2 py-1">Edit</button>
                  <button onClick={() => handleDelete(role.id)} className="text-red-400 hover:text-red-300 text-sm px-2 py-1">Delete</button>
                </div>
              </div>
              
              <div className="mt-auto pt-4 border-t border-white/5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Bank Size:</span>
                  <span className="text-gray-300 font-mono">{qCount} Questions</span>
                </div>
              </div>
            </div>
          );
        })}
        {roles.length === 0 && !isAdding && (
          <div className="col-span-full p-8 text-center text-gray-500 border border-dashed border-white/10 rounded-2xl">
            No roles created yet. Click "Add Role" to get started.
          </div>
        )}
      </div>
    </div>
  );
}
