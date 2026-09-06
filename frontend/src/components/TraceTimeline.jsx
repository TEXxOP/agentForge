import {
  Bot,
  Check,
  CircleStop,
  CopyCheck,
  Fingerprint,
  Pause,
  RefreshCw,
  ScanText,
  ScrollText,
  TriangleAlert,
  X
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { formatNumber, formatTime, shortId, summarizeEvent } from '../format.js';
import DecisionTag from './DecisionTag.jsx';

const eventIcons = {
  action_proposed: Bot,
  input_analyzed: ScanText,
  policy_evaluated: ScrollText,
  state_revalidated: RefreshCw,
  action_executed: Check,
  action_blocked: X,
  approval_requested: Pause,
  approval_resolved: Pause,
  duplicate_prevented: CopyCheck,
  stale_state_prevented: CircleStop,
  action_failed: TriangleAlert
};

function EventRow({ event, index }) {
  const Icon = eventIcons[event.event_type] || Fingerprint;
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.045, 0.24) }}
      className={`trace-event event-${event.decision || 'neutral'}`}
    >
      <div className="trace-event-index">{String(event.sequence).padStart(2, '0')}</div>
      <div className="trace-event-icon"><Icon size={14} strokeWidth={1.8} /></div>
      <div className="trace-event-copy">
        <div className="trace-event-title">
          <strong>{event.title}</strong>
          <time>{formatTime(event.created_at)}</time>
        </div>
        <p>{summarizeEvent(event)}</p>
        <code>{shortId(event.event_hash, 24)}</code>
      </div>
    </motion.li>
  );
}

export default function TraceTimeline({ traceData, title, emptyCopy = 'Run a case to inspect its evidence chain.' }) {
  const trace = traceData?.trace || [];
  const result = traceData?.result || traceData;
  const finalEvent = [...trace].reverse().find((event) => event.decision);
  const decision = result?.decision || finalEvent?.decision || 'idle';
  const integrity = traceData?.integrity || result?.auditIntegrity;
  const traceId = result?.traceId || traceData?.traceId || trace[0]?.trace_id;

  return (
    <div className="trace-timeline">
      <AnimatePresence mode="wait">
        {!trace.length ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="trace-empty"
          >
            <Fingerprint size={25} strokeWidth={1.4} />
            <h3>No evidence selected</h3>
            <p>{emptyCopy}</p>
          </motion.div>
        ) : (
          <motion.div
            key={traceId}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
          >
            <div className="trace-heading">
              <div>
                <span className="mono-label">ACTION EVIDENCE</span>
                <h2>{title || finalEvent?.title || 'Trace replay'}</h2>
              </div>
              <DecisionTag decision={decision} />
            </div>
            <p className="trace-summary">{result?.summary || finalEvent?.title}</p>
            <div className="trace-meta">
              <code>{shortId(traceId, 23)}</code>
              <span><Fingerprint size={12} /> {integrity?.valid === false ? 'chain invalid' : 'chain verified'}</span>
              <span>{integrity?.checked || trace.length} events</span>
              {result?.latencyMs !== undefined && <span>{formatNumber(result.latencyMs)} ms</span>}
            </div>
            <ol className="trace-events">
              {trace.map((event, index) => <EventRow key={event.id} event={event} index={index} />)}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
