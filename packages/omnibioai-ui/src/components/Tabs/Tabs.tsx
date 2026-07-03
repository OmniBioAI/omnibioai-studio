import React, { useState } from 'react';
import './Tabs.css';

export interface Tab {
  key: string;
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  onChange?: (key: string) => void;
}

export function Tabs({ tabs, defaultTab, onChange }: TabsProps) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.key ?? '');

  function handleClick(key: string) {
    setActive(key);
    onChange?.(key);
  }

  const current = tabs.find(t => t.key === active);

  return (
    <div className="omni-tabs">
      <div className="omni-tab-nav">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`omni-tab-btn${active === tab.key ? ' active' : ''}`}
            onClick={() => handleClick(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="omni-tab-panel">
        {current?.content}
      </div>
    </div>
  );
}
