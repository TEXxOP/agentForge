import { CheckCircle2, FlaskConical, Menu, RefreshCw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { CommandHint } from './CommandPalette.jsx';

const navItems = [
  { id: 'run', label: 'Proof runner' },
  { id: 'attack', label: 'Attack lab' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'policy', label: 'Policy' },
  { id: 'architecture', label: 'Architecture' }
];

export default function Chrome({ activeView, onView, product, pendingApprovals, onApprovals, onRefresh, busy, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const chooseView = (id) => {
    onView(id);
    setMobileOpen(false);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="mobile-menu" onClick={() => setMobileOpen((value) => !value)} aria-label="Toggle navigation">
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <button className="wordmark" onClick={() => chooseView('run')}>
          <span className="wordmark-mark">AP</span>
          <span>AgentProof</span>
        </button>

        <nav className={mobileOpen ? 'is-open' : ''} aria-label="Product views">
          {navItems.map((item) => (
            <button key={item.id} onClick={() => chooseView(item.id)} className={activeView === item.id ? 'active' : ''}>
              {activeView === item.id && <motion.span layoutId="active-navigation" className="nav-active" />}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="header-tools">
          <span className="environment"><span></span>{product?.adapterMode === 'razorpay_test' ? 'Razorpay test' : 'Simulator'}</span>
          <CommandHint />
          <button className="approval-trigger" onClick={onApprovals}>
            <CheckCircle2 size={15} />
            Review
            {pendingApprovals > 0 && <b>{pendingApprovals}</b>}
          </button>
          <button className="icon-control" onClick={onRefresh} aria-label="Refresh evidence"><RefreshCw size={16} /></button>
        </div>

        <AnimatePresence>
          {busy && (
            <motion.div
              className="activity-line"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
        </AnimatePresence>
      </header>
      {busy && (
        <div className="activity-caption"><FlaskConical size={13} /> {busy.label}</div>
      )}
      {children}
    </div>
  );
}
