import { Check, ChevronRight, Play, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { humanize } from '../format.js';
import ActionStage from './ActionStage.jsx';
import DecisionTag from './DecisionTag.jsx';
import MetricBand from './MetricBand.jsx';
import TraceTimeline from './TraceTimeline.jsx';

export default function ProofRunner({
  scenarios,
  results,
  selectedId,
  onSelect,
  onRun,
  onRunAll,
  onReset,
  runningId,
  evaluation,
  approvals,
  onResolve
}) {
  const selected = scenarios.find((scenario) => scenario.id === selectedId) || scenarios[0];
  const result = selected ? results[selected.id] : null;
  const approval = result?.approval?.id
    ? approvals.find((item) => item.id === result.approval.id) || result.approval
    : null;
  const completed = Object.keys(results).length;
  const metrics = evaluation?.metrics;

  return (
    <main className="page proof-page">
      <section className="page-heading proof-heading">
        <div>
          <span className="mono-label">RELEASE CANDIDATE / RECOVERY-AGENT-0.9.2</span>
          <h1>Prove the action path.</h1>
          <p>Five cases. One gateway. No consequential action bypasses policy.</p>
        </div>
        <div className="page-actions">
          <button className="text-button" onClick={onReset}><RotateCcw size={14} /> Reset</button>
          <button className="solid-button" onClick={onRunAll}><Play size={14} fill="currentColor" /> Run all five</button>
        </div>
      </section>

      <MetricBand metrics={metrics} />

      <section className="proof-workbench">
        <aside className="scenario-rail">
          <div className="rail-heading">
            <span>Proof runbook</span>
            <strong>{completed}/{scenarios.length}</strong>
          </div>
          <div className="runbook-progress"><motion.span animate={{ width: `${(completed / Math.max(scenarios.length, 1)) * 100}%` }} /></div>
          <div className="scenario-rows">
            {scenarios.map((scenario) => {
              const scenarioResult = results[scenario.id];
              const selectedRow = scenario.id === selected?.id;
              return (
                <button
                  className={`scenario-row ${selectedRow ? 'selected' : ''}`}
                  key={scenario.id}
                  onClick={() => onSelect(scenario.id)}
                >
                  {selectedRow && <motion.span layoutId="scenario-selection" className="scenario-selection" />}
                  <span className="scenario-number">{scenarioResult ? <Check size={14} /> : String(scenario.order).padStart(2, '0')}</span>
                  <span className="scenario-row-copy">
                    <strong>{scenario.shortName}</strong>
                    <small>{humanize(scenario.tool)}</small>
                  </span>
                  {scenarioResult ? <DecisionTag decision={scenarioResult.decision} compact /> : <ChevronRight size={14} />}
                </button>
              );
            })}
          </div>
          <div className="rail-note">
            <span>Environment</span>
            <strong>Isolated payment fixtures</strong>
            <small>Simulated outcomes are never presented as merchant revenue.</small>
          </div>
        </aside>

        <section className="decision-stage">
          <ActionStage
            scenario={selected}
            result={result}
            running={runningId === selected?.id}
            onRun={() => onRun(selected.id)}
            approval={approval?.status === 'pending' ? approval : null}
            onResolve={onResolve}
          />
        </section>

        <aside className="evidence-inspector">
          <TraceTimeline
            traceData={result}
            title={selected?.name}
            emptyCopy="The event chain will appear here as the gateway evaluates this case."
          />
        </aside>
      </section>
    </main>
  );
}
