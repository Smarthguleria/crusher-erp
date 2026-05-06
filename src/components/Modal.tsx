'use client';

import { ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ title, onClose, children }: Props) {
  return (
    <div className="mo-ov" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mo-box">
        <div className="mo-title">
          {title}
          <span className="mo-close" onClick={onClose}>✕</span>
        </div>
        {children}
      </div>
    </div>
  );
}
