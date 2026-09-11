import { Bot, Cpu, Play, UserCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import './architecture.css';

const LANES = [
  { id: 'ai', label: 'AI may', icon: Bot, note: 'Generative and untrusted. Never authorizes money.' },
  { id: 'code', label: 'Deterministic code must', icon: Cpu, note: 'The mandatory path. Plain code, no model in the loop.' },
  { id: 'human', label: 'A human must', icon: UserCheck, note: 'Owns policy, approvals, and accepted residual risk.' }
];

const NODES = [
  { id: 'source', lane: 'ai', title: 'Webhook / customer note', file: 'src/scenarios.mjs', does: 'Delivers untrusted text and payment events into the agent.', not: 'Is never treated as an instruction with authority.' },
  { id: 'agent', lane: 'ai', title: 'Payment agent (deliberately imperfect)', file: 'src/scenarios.mjs', does: 'Proposes a tool call: refund, payment link, or customer message.', not: 'Cannot call a provider directly. It only produces intent.' },
  { id: 'generator', lane: 'ai', title: 'Scenario generator (optional)', file: 'src/scenario-generator.mjs', does: 'Drafts new adversarial cases from tool schemas and policies.', not: 'Never promotes a draft to an active policy on its own.' },
  { id: 'bind', lane: 'code', title: 'Schema + case binding', file: 'src/gateway.mjs', does: 'Validates arguments and binds the action to trusted payment state.', not: 'Does not trust any amount or recipient the agent supplied.', step: 1 },
  { id: 'isolate', lane: 'code', title: 'Untrusted-input isolation', file: 'src/risk-analyzer.mjs', does: 'Flags instruction-override patterns in the source text.', not: 'Is a transparent baseline detector, not a jailbreak solver.', step: 2 },
  { id: 'policy', lane: 'code', title: 'Policy engine · AP-001…AP-010', file: 'src/policy-engine.mjs', does: 'Evaluates amount, recipient, status, expiry, and contact invariants.', not: 'Contains no prompt. Rules are code and reviewable JSON.', step: 3 },
  { id: 'idem', lane: 'code', title: 'Idempotency check', file: 'src/gateway.mjs', does: 'Collapses duplicate business actions from replayed webhooks.', not: 'Does not dedupe on transport id alone.', step: 4 },
  { id: 'decision', lane: 'code', title: 'Allow · block · approval', file: 'src/gateway.mjs', does: 'Returns exactly one of three outcomes for every action.', not: 'Has no fourth "probably fine" branch.', step: 5 },
  { id: 'revalidate', lane: 'code', title: 'Fresh-state revalidation', file: 'src/gateway.mjs', does: 'Re-reads source-of-truth state immediately before execution.', not: 'Does not reuse the state the agent planned against.', step: 6 },
  { id: 'adapter', lane: 'code', title: 'Simulator / Razorpay test adapter', file: 'src/adapters.mjs', does: 'Executes the approved action in test mode only.', not: 'Never receives live credentials or model-visible secrets.', step: 7 },
  { id: 'audit', lane: 'code', title: 'Hash-chained SQLite audit', file: 'src/database.mjs', does: 'Appends a tamper-evident event for every stage and decision.', not: 'Is not a defence against an operator who replaces the whole host.', step: 8 },
  { id: 'approval', lane: 'human', title: 'Bounded approval', file: 'src/gateway.mjs', does: 'Grants one exact, single-use approval for a refund above ₹1,000.', not: 'Cannot be reused for a different amount or recipient.' },
  { id: 'review', lane: 'human', title: 'Policy review', file: 'policies/merchant-policies.json', does: 'Owns rule changes and the accepted residual risk.', not: 'Is not delegated to the model.' }
];

const PATH = ['source', 'agent', 'bind', 'isolate', 'policy', 'idem', 'decision', 'revalidate', 'adapter', 'audit'];

export default function ArchitectureView({ product, evaluation, trace, onView }) {
  const [selected, setSelected] = useState('policy');
  const [active, setActive] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const walk = (index = 0) => {
    if (index >= PATH.length) { setActive(null); return; }
    setActive(PATH[index]);
    setSelected(PATH[index]);
    timer.current = setTimeout(() => walk(index + 1), 420);
  };

  const metrics = evaluation?.metrics || null;
  const node = NODES.find((item) => item.id === selected) || NODES[0];
  const traceEvents = Array.isArray(trace) ? trace : [];

  const stats = [
    ['Adapter', product?.environmentLabel || 'Payment simulator'],
    ['Policy rules', '10'],
    ['Guided cases', '5'],
    ['Release gate', metrics ? `${metrics.exactOutcomes ?? '-'} / ${metrics.total ?? '-'}` : '-'],
    ['Unsafe gated', metrics ? `${metrics.unsafeGated ?? '-'} / ${metrics.unsafeTotal ?? metrics.unsafe ?? '-'}` : '-'],
    ['Median guard', metrics?.medianLatencyMs != null ? `${Number(metrics.medianLatencyMs).toFixed(2)} ms` : '-']
  ];

  return (
    <div className="page arch-page">
      <div className="page-heading">
        <div>
          <span className="mono-label">Architecture · explain it here</span>
          <h1>One mandatory path between intent and money.</h1>
          <p>Every consequential action crosses the same eight deterministic stages. Click any node to see what it guarantees, and what it deliberately does not.</p>
        </div>
        <div className="arch-controls">
          <button className="solid-button" onClick={() => { clearTimeout(timer.current); walk(0); }}><Play size={13} /> Trace a request</button>
          {traceEvents.length > 0 && <span className="mono-label">{traceEvents.length} real audit events loaded</span>}
        </div>
      </div>

      <div className="arch-stats">
        {stats.map(([label, value]) => (
          <div key={label}><span className="mono-label">{label}</span><b>{value}</b></div>
        ))}
      </div>

      <div className="arch-grid">
        <div className="arch-lanes" role="group" aria-label="AgentProof action path">
          {LANES.map((lane) => (
            <section key={lane.id} className={`lane is-${lane.id}`}>
              <header><lane.icon size={14} /><h2>{lane.label}</h2><p>{lane.note}</p></header>
              <div className="lane-nodes">
                {NODES.filter((item) => item.lane === lane.id).map((item) => (
                  <button
                    key={item.id}
                    className={`arch-node${selected === item.id ? ' is-selected' : ''}${active === item.id ? ' is-active' : ''}`}
                    aria-pressed={selected === item.id}
                    onClick={() => { clearTimeout(timer.current); setActive(null); setSelected(item.id); }}
                  >
                    {item.step && <span className="step mono">{item.step}</span>}
                    <span className="node-title">{item.title}</span>
                    {active === item.id && <motion.span layoutId="arch-pulse" className="pulse" transition={{ type: 'spring', stiffness: 260, damping: 24 }} />}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="arch-detail">
          <AnimatePresence mode="wait">
            <motion.div key={node.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <span className="mono-label">{node.lane === 'code' ? 'Deterministic stage' : node.lane === 'ai' ? 'Untrusted input' : 'Human authority'}</span>
              <h3>{node.title}</h3>
              <code>{node.file}</code>
              <dl>
                <dt>Guarantees</dt><dd>{node.does}</dd>
                <dt>Does not</dt><dd>{node.not}</dd>
              </dl>
            </motion.div>
          </AnimatePresence>
          <div className="arch-links">
            <button className="ghost-button" onClick={() => onView?.('attack')}>Try to break this stage</button>
            <button className="ghost-button" onClick={() => onView?.('evidence')}>See the evidence</button>
          </div>
        </aside>
      </div>

      <section className="arch-why">
        <div><span className="mono-label">Separation of authority</span><p>The model proposes, code decides, a human approves. No prompt can widen a limit, because the limits are not written in a prompt.</p></div>
        <div><span className="mono-label">Mandatory, not advisory</span><p>The gateway is the only route to an adapter. A guard the agent can skip is a suggestion, and suggestions do not survive an injected instruction.</p></div>
        <div><span className="mono-label">Evidence, not assertion</span><p>Each stage appends a hash-linked event, so a decision can be replayed and checked after the fact instead of taken on trust.</p></div>
      </section>
      <p className="honesty-note">Simulated payment outcomes on isolated fixtures. Tamper-evident at the application level, not a formal guarantee.</p>
    </div>
  );
}
