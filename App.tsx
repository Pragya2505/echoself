import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { MirrorSelf } from './components/MirrorSelf';
import { FutureSelf } from './components/FutureSelf';
import type { View } from './types';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('mirror');

  return (
    <div className="flex h-screen w-full font-sans text-gray-100">
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />
      <main className="flex-1 flex flex-col h-screen overflow-y-auto">
        {currentView === 'mirror' && <MirrorSelf />}
        {currentView === 'future' && <FutureSelf />}
      </main>
    </div>
  );
};

export default App;