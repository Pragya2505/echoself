import React from 'react';
import type { View } from '../types';
import { BrainCircuitIcon, MessageSquareIcon, EchoSelfLogo } from './IconComponents';

interface SidebarProps {
  currentView: View;
  setCurrentView: (view: View) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView }) => {
  const NavItem: React.FC<{
    view: View;
    icon: React.ReactNode;
    label: string;
    description: string;
  }> = ({ view, icon, label, description }) => (
    <button
      onClick={() => setCurrentView(view)}
      className={`flex items-center w-full p-4 rounded-lg text-left transition-all duration-300 transform hover:scale-105 ${
        currentView === view
          ? 'bg-white/10 backdrop-blur-sm text-white'
          : 'hover:bg-white/5 text-gray-400'
      }`}
    >
      <div className="mr-4">{icon}</div>
      <div>
        <p className="font-semibold text-white">{label}</p>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
    </button>
  );

  return (
    <aside className="w-64 md:w-80 h-full bg-black/30 backdrop-blur-lg border-r border-blue-500/50 p-6 flex flex-col shadow-2xl shadow-blue-500/40">
      <div className="flex items-center mb-12">
        <EchoSelfLogo className="w-10 h-10 text-blue-400" />
        <h1 className="ml-3 text-2xl font-bold text-white tracking-wider">EchoSelf</h1>
      </div>
      <nav className="flex flex-col space-y-4">
        <NavItem
          view="mirror"
          icon={<BrainCircuitIcon className="w-6 h-6" />}
          label="Mirror Self"
          description="Real-time voice conversation"
        />
        <NavItem
          view="future"
          icon={<MessageSquareIcon className="w-6 h-6" />}
          label="Future Self"
          description="Voice chat with your wiser self"
        />
      </nav>
      <div className="mt-auto text-center text-gray-500 text-xs">
        <p>Your digital twin, powered by Gemini.</p>
      </div>
    </aside>
  );
};