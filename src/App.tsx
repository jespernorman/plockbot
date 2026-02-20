import { useState, useEffect } from 'react';
import SkapaPlocklista from './pages/SkapaPlocklista';
import Regler from './pages/Regler';
import './App.css';

const isRegler = () => typeof window !== 'undefined' && window.location.hash === '#regler';

export default function App() {
  const [view, setView] = useState<'skapa' | 'regler'>(() => (isRegler() ? 'regler' : 'skapa'));

  useEffect(() => {
    const handler = () => setView(isRegler() ? 'regler' : 'skapa');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const goTo = (v: 'skapa' | 'regler') => {
    window.location.hash = v === 'regler' ? '#regler' : '';
    setView(v);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Plockbot</h1>
        <p className="tagline">
          Ladda upp PDF med plockordrar. Plockbot översätter enligt dina regler till plockinstruktioner.
        </p>
        <nav className="app-nav">
          <button
            type="button"
            className={view === 'skapa' ? 'app-nav--active' : ''}
            onClick={() => goTo('skapa')}
          >
            Skapa plocklista
          </button>
          <button
            type="button"
            className={view === 'regler' ? 'app-nav--active' : ''}
            onClick={() => goTo('regler')}
          >
            Regler
          </button>
        </nav>
      </header>
      <main className="main">
        {view === 'regler' ? <Regler /> : <SkapaPlocklista />}
      </main>
    </div>
  );
}
