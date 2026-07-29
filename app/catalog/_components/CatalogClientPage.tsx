'use client';

import { useState } from 'react';
import { BikeModelsTab } from './BikeModelsTab';
import { PartsTab } from './PartsTab';
import { SetsTab } from './SetsTab';
import { LocationsTab } from './LocationsTab';

type Tab = 'models' | 'parts' | 'sets' | 'locations';

const TABS: { key: Tab; label: string }[] = [
  { key: 'models', label: 'Bike Models' },
  { key: 'parts', label: 'Parts' },
  { key: 'sets', label: 'Sets' },
  { key: 'locations', label: 'Locations' },
];

interface Props {
  /**
   * OWNER only. Resolved server-side in page.tsx and threaded down so the tabs
   * never infer permissions themselves. Hiding delete is presentation only —
   * every catalog DELETE route re-checks the role and 403s regardless.
   */
  canDelete: boolean;
}

// Catalog is OWNER + CUTTER — the page guard enforces access server-side.
export function CatalogClientPage({ canDelete }: Props) {
  const [tab, setTab] = useState<Tab>('parts');

  const tabCls = (active: boolean) =>
    [
      'px-4 py-2 text-[13px] font-medium border-b-2 transition-colors duration-100 whitespace-nowrap',
      active
        ? 'border-accent text-accent'
        : 'border-transparent text-text-2 hover:text-text hover:border-border',
    ].join(' ');

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <header>
          <h1 className="text-[20px] font-semibold">Catalog</h1>
          <p className="text-[13px] text-text-3 mt-0.5">
            Bike models, parts, and sticker sets
          </p>
        </header>

        {/* Tab bar */}
        <div className="border-b border-border flex gap-0">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={tabCls(tab === key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {tab === 'models' && <BikeModelsTab canDelete={canDelete} />}
          {tab === 'parts' && <PartsTab canDelete={canDelete} />}
          {tab === 'sets' && <SetsTab canDelete={canDelete} />}
          {tab === 'locations' && <LocationsTab canDelete={canDelete} />}
        </div>
      </div>
    </div>
  );
}
