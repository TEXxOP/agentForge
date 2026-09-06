import { Check, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export default function Feedback({ toast }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div className={`feedback ${toast.type || 'success'}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}>
          {toast.type === 'error' ? <X size={15} /> : <Check size={15} />}
          <div><strong>{toast.title}</strong><span>{toast.message}</span></div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
