'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  User, 
  PlayCircle, 
  Settings, 
  LogOut, 
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { createClient } from '@/utils/supabase';
import { useRouter } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const navItems = [
    { name: 'Dashboard', href: '/front/profile', icon: LayoutDashboard },
    { name: 'New Interview', href: '/', icon: PlayCircle },
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    document.cookie = 'app_session_expires_at=; Path=/; Max-Age=0; SameSite=Lax';
    router.push('/auth/login');
  };

  return (
    <aside className="w-72 bg-[#0a0a0f] border-r border-white/5 flex flex-col h-screen sticky top-0 z-50">
      {/* Branding */}
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
            <ShieldCheck className="text-white w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tighter">InterviewAR</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-2 mt-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.name} 
              href={item.href}
              className={`flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-300 group ${
                isActive 
                  ? 'bg-white/5 text-white border border-white/10 shadow-xl' 
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.02]'
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon size={20} className={isActive ? 'text-purple-500' : 'group-hover:text-gray-300'} />
                <span className="text-sm font-medium">{item.name}</span>
              </div>
              {isActive && <ChevronRight size={14} className="text-purple-500" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer Actions */}
      <div className="p-6 border-t border-white/5">
        <button 
          onClick={handleSignOut}
          className="flex items-center gap-3 px-4 py-3 w-full text-gray-500 hover:text-red-400 hover:bg-red-500/5 rounded-xl transition-all duration-300 group"
        >
          <LogOut size={18} className="group-hover:rotate-12 transition-transform" />
          <span className="text-sm font-medium">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
