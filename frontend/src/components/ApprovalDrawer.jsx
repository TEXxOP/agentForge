import { Fingerprint, ShieldCheck, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { formatMoney, humanize, shortId } from '../format.js';

export default function ApprovalDrawer({ open, approvals, onClose, onResolve }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button className="drawer-scrim" aria-label="Close approval drawer" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside className="approval-drawer" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.25 }}>
            <header><div><span className="mono-label">HUMAN CHECKPOINT</span><h2>Pending review</h2></div><button onClick={onClose} aria-label="Close"><X size={18} /></button></header>
            {approvals.length ? approvals.map((approval) => (
              <article key={approval.id} className="approval-record">
                <div className="approval-record-title"><span>{formatMoney(approval.arguments.amount)}</span><div><strong>{humanize(approval.tool)}</strong><code>{shortId(approval.case_id, 22)}</code></div></div>
                <p>{approval.reason}</p>
                <dl>
                  {Object.entries(approval.arguments).map(([key, value]) => <div key={key}><dt>{humanize(key)}</dt><dd>{String(value)}</dd></div>)}
                  <div><dt>Rule</dt><dd>{approval.rule_id}</dd></div>
                  <div><dt>Binding</dt><dd className="mono"><Fingerprint size={12} /> {shortId(approval.idempotency_key, 24)}</dd></div>
                </dl>
                <div className="approval-safety"><ShieldCheck size={15} /><span>Approval is exact, single-use, and followed by fresh-state revalidation.</span></div>
                <div className="drawer-actions"><button className="text-button" onClick={() => onResolve(approval.id, 'rejected')}>Reject</button><button className="solid-button" onClick={() => onResolve(approval.id, 'approved')}>Approve exact action</button></div>
              </article>
            )) : (
              <div className="drawer-empty"><ShieldCheck size={24} /><h3>No action is waiting.</h3><p>Run the high-value refund case to create a bound approval.</p></div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
