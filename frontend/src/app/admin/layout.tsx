import Link from 'next/link';
import React from 'react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0a0a0f] border-r border-white/10 flex flex-col hidden md:flex">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
            InterviewAR Admin
          </h1>
        </div>
        <nav className="flex-1 p-4 flex flex-col gap-2">
          <Link href="/admin" className="px-4 py-2 rounded-lg hover:bg-white/5 transition-colors text-sm font-medium text-gray-300 hover:text-white">
            Dashboard
          </Link>
          <Link href="/admin/interviews" className="px-4 py-2 rounded-lg hover:bg-white/5 transition-colors text-sm font-medium text-gray-300 hover:text-white">
            Interviews
          </Link>
          <Link href="/admin/roles" className="px-4 py-2 rounded-lg hover:bg-white/5 transition-colors text-sm font-medium text-gray-300 hover:text-white">
            Roles & Topics
          </Link>
          <Link href="/admin/prompts" className="px-4 py-2 rounded-lg hover:bg-white/5 transition-colors text-sm font-medium text-gray-300 hover:text-white">
            Prompt Editor
          </Link>
          <Link href="/admin/engine" className="px-4 py-2 rounded-lg hover:bg-white/5 transition-colors text-sm font-medium text-gray-300 hover:text-white">
            Engine Tuning
          </Link>
        </nav>
        <div className="p-4 border-t border-white/10 text-xs text-gray-500">
          Admin Panel v1.0
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden p-4 border-b border-white/10 bg-[#0a0a0f] flex justify-between items-center">
          <h1 className="text-lg font-bold">InterviewAR Admin</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/admin">Dashboard</Link>
            <Link href="/admin/interviews">Interviews</Link>
          </nav>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-6 md:p-10">
          {children}
        </div>
      </main>
    </div>
  );
}
