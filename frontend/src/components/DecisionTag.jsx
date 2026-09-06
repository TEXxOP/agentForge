import { Check, CircleStop, Clock3, CopyCheck, Pause, X } from 'lucide-react';
import { motion } from 'motion/react';
import { decisionLabel } from '../format.js';

const ICONS = {
  allowed: Check,
  blocked: X,
  approval: Pause,
  duplicate: CopyCheck,
  stale: CircleStop,
  failed: Clock3
};

export default function DecisionTag({ decision = 'idle', compact = false }) {
  const Icon = ICONS[decision] || Clock3;
  return (
    <motion.span
      key={decision}
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      className={`decision-tag decision-${decision} ${compact ? 'is-compact' : ''}`}
    >
      <Icon size={compact ? 12 : 13} strokeWidth={2.2} />
      {decisionLabel(decision)}
    </motion.span>
  );
}
