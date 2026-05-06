'use client';

import { ReactNode } from 'react';
import { useDB } from '@/store/DBContext';

export default function WorkspaceGate({ children }: { children: ReactNode }) {
  const { ready } = useDB();
  if (!ready) {
    return (
      <div className="workspace-loading">
        <div className="workspace-loading-spinner" />
        <div className="workspace-loading-text">Loading your workspace…</div>
      </div>
    );
  }
  return <>{children}</>;
}
