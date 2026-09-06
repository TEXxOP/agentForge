import { ArrowRight, Check, ChevronRight, FlaskConical, ListChecks, Play, ShieldAlert, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { humanize } from '../format.js';
import DecisionTag from './DecisionTag.jsx';

const phases = ['Bind', 'Isolate', 'Evaluate', 'Deduplicate', 'Approve', 'Revalidate', 'Execute', 'Record'];

export default function PolicyView({
  policyMeta,
  policies,
  evaluation,
  generator,
  drafts,
  onGenerate,
  generating,
  onRunDraft,
  draftReplays,
  replayingDraftId,
  mutationProof,
  onProveMutation,
  mutationRunning,
  onOpenEvidence
}) {
  const [selectedId, setSelectedId] = useState(policies[0]?.id);
  const selected = policies.find((policy) => policy.id === selectedId) || policies[0];
  const coverage = evaluation?.metrics?.coverage || {};
  const latestReplay = Object.values(draftReplays).at(-1);

  return (
    <main className="page policy-page">
      <section className="page-heading">
        <div>
          <span className="mono-label">{policyMeta?.name || 'MERCHANT POLICY'} / V{policyMeta?.version || '—'}</span>
          <h1>One policy. Test and runtime.</h1>
          <p>AI proposes new cases; deterministic controls retain authority over money.</p>
        </div>
      </section>

      <section className="execution-path">
        <span className="mono-label">MANDATORY EXECUTION PATH</span>
        <div>
          {phases.map((phase, index) => (
            <span key={phase}><i>{String(index + 1).padStart(2, '0')}</i><b>{phase}</b>{index < phases.length - 1 && <ArrowRight size={13} />}</span>
          ))}
        </div>
      </section>

      <section className="policy-workbench">
        <div className="policy-ledger">
          <div className="ledger-toolbar"><div><span className="mono-label">ACTIVE CONTROLS</span><strong>{policies.length} enforced</strong></div></div>
          <table className="data-table policy-table">
            <thead><tr><th>ID</th><th>Control</th><th>Applies to</th><th>Effect</th><th>Coverage</th></tr></thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.id} className={selected?.id === policy.id ? 'selected' : ''} onClick={() => setSelectedId(policy.id)}>
                  <td><code>{policy.id}</code></td>
                  <td><strong>{policy.name}</strong></td>
                  <td>{humanize(policy.tool)}</td>
                  <td><span className={`effect effect-${policy.effect}`}>{humanize(policy.effect)}</span></td>
                  <td><b>{coverage[policy.id] || 0}</b> traces</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="policy-inspector">
          <AnimatePresence mode="wait">
            {selected && (
              <motion.div key={selected.id} initial={{ opacity: 0, x: 7 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -5 }}>
                <span className="mono-label">CONTROL DETAIL / {selected.id}</span>
                <h2>{selected.name}</h2>
                <p>{selected.description}</p>
                <dl>
                  <div><dt>Scope</dt><dd>{humanize(selected.tool)}</dd></div>
                  <div><dt>Enforcement</dt><dd>{humanize(selected.effect)}</dd></div>
                  <div><dt>Severity</dt><dd>{selected.severity}</dd></div>
                  <div><dt>Observed coverage</dt><dd>{coverage[selected.id] || 0} traces</dd></div>
                </dl>
                <div className="inspector-proof"><Check size={14} /><span>The same control object is named in the runtime trace and release-gate result.</span></div>
                <div className="mutation-trigger">
                  <div><span className="mono-label">COUNTERFACTUAL PROOF</span><p>Remove this one control inside an isolated 60-case replay and measure the blast radius.</p></div>
                  <button className="outline-button" onClick={() => onProveMutation(selected.id)} disabled={mutationRunning}>
                    <FlaskConical size={14} /> {mutationRunning ? 'Measuring…' : 'Prove blast radius'}
                  </button>
                </div>
                {mutationProof?.ruleId === selected.id && (
                  <motion.div className={`mutation-result ${mutationProof.delta.newlyEscaped ? 'has-escapes' : ''}`} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="mutation-result-head"><ShieldAlert size={15} /><strong>{mutationProof.delta.newlyEscaped ? `${mutationProof.delta.newlyEscaped} unsafe escapes exposed` : 'No new unsafe escapes'}</strong></div>
                    <div className="mutation-metrics">
                      <span><b>{mutationProof.baseline.unsafeEscapes}</b> baseline escapes</span>
                      <span><b>{mutationProof.counterfactual.unsafeEscapes}</b> without {selected.id}</span>
                      <span><b>{mutationProof.delta.unsafeDetectionPoints} pts</b> detection change</span>
                    </div>
                    {mutationProof.escapedExamples.length > 0 && <p>{mutationProof.escapedExamples.map((item) => item.name).join(' · ')}</p>}
                    <small>Contained counterfactual. No provider calls or merchant data.</small>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </section>

      <section className="scenario-lab">
        <div className="lab-heading">
          <div>
            <span className="mono-label">ADVERSARIAL SCENARIO LAB</span>
            <h2>Expand the regression set.</h2>
            <p>{generator?.note || 'Model-generated cases remain drafts until human review.'}</p>
          </div>
          <button className="outline-button" onClick={onGenerate} disabled={generating}><Sparkles size={15} /> {generating ? 'Generating…' : 'Generate drafts'}</button>
        </div>
        {drafts.length ? (
          <div className="draft-ledger">
            {drafts.map((draft, index) => (
              <motion.div key={draft.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.035 }}>
                {(() => {
                  const replay = draftReplays[draft.id];
                  return <>
                    <span className="draft-index">{String(index + 1).padStart(2, '0')}</span>
                    <div><strong>{draft.title}</strong><p>{draft.adversarialInput}</p></div>
                    <span className="draft-tool">{humanize(draft.proposedTool)}</span>
                    <span className={`draft-status ${replay?.verdict || draft.reviewStatus}`}>{replay?.verdict === 'gap_exposed' ? 'gap exposed' : replay?.verdict === 'covered' ? 'covered in replay' : humanize(draft.reviewStatus)}</span>
                    <button className="draft-run" onClick={() => onRunDraft(draft)} disabled={replayingDraftId === draft.id} title="Run contained replay">
                      {replayingDraftId === draft.id ? <FlaskConical size={14} /> : <Play size={14} />}
                    </button>
                  </>;
                })()}
              </motion.div>
            ))}
          </div>
        ) : (
          <button className="lab-empty" onClick={onGenerate}><ListChecks size={18} /><span>Generate a review queue from the registered tools and active controls.</span><ChevronRight size={15} /></button>
        )}
        {latestReplay && (
          <motion.section className={`contained-replay ${latestReplay.verdict}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <div><span className="mono-label">CONTAINED RED-TEAM REPLAY / {latestReplay.compiler}</span><h3>{latestReplay.verdict === 'covered' ? 'Control coverage confirmed.' : 'New policy gap surfaced.'}</h3><p>{latestReplay.note}</p></div>
            <div className="contained-replay-result"><span>Expected</span><DecisionTag decision={latestReplay.expectedDecision} compact /><span>Observed</span><DecisionTag decision={latestReplay.observedDecision} compact /><button className="text-button" onClick={onOpenEvidence}>Open evidence <ChevronRight size={14} /></button></div>
          </motion.section>
        )}
      </section>
    </main>
  );
}
