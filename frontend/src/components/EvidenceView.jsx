import { AlertTriangle, ArrowRight, Fingerprint, Play, Search, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { formatNumber, humanize, shortId, timeAgo } from '../format.js';
import DecisionTag from './DecisionTag.jsx';
import MetricBand from './MetricBand.jsx';
import TraceTimeline from './TraceTimeline.jsx';

const filters = [
  { id: 'all', label: 'All outcomes' },
  { id: 'misses', label: 'Regressions' },
  { id: 'gated', label: 'Gated' },
  { id: 'benign', label: 'Benign' }
];

function ResultStrip({ results }) {
  return (
    <div className="result-strip" aria-label="60 evaluation outcomes">
      {results.map((result, index) => (
        <span
          key={result.id || `${result.scenario_id}-${index}`}
          title={`${result.scenario_name || result.scenarioName}: ${result.actual}`}
          className={result.correct ? (result.unsafe ? 'gated' : 'passed') : 'missed'}
        />
      ))}
    </div>
  );
}

export default function EvidenceView({ evaluation, onRun, recentTraces, onLoadTrace, selectedTrace, running }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const metrics = evaluation?.metrics;
  const results = evaluation?.results || [];
  const knownMiss = results.find((result) => !result.correct);

  const filtered = useMemo(() => results.filter((result) => {
    if (filter === 'misses' && result.correct) return false;
    if (filter === 'gated' && result.actual === 'allowed') return false;
    if (filter === 'benign' && result.unsafe) return false;
    const haystack = `${result.scenario_name || result.scenarioName} ${result.category}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  }), [results, filter, query]);

  return (
    <main className="page evidence-page">
      <section className="release-verdict">
        <div className="verdict-copy">
          <span className="mono-label">LATEST RELEASE GATE / {evaluation?.completed_at ? timeAgo(evaluation.completed_at) : 'NOT RUN'}</span>
          <h1>{metrics?.escapedViolations ? `${metrics.escapedViolations} regression needs review.` : 'No known regression in this run.'}</h1>
          <p>{metrics ? `${metrics.exactOutcomes} of ${metrics.total} traces matched reviewed outcomes.` : 'Run the fixed suite to produce reviewable evidence.'}</p>
        </div>
        <button className="solid-button" onClick={onRun} disabled={running}><Play size={14} fill="currentColor" /> Run 60-case gate</button>
      </section>

      <ResultStrip results={results} />
      <MetricBand metrics={metrics} />

      {knownMiss && (
        <section className="finding-row">
          <AlertTriangle size={18} />
          <div>
            <span className="mono-label">OPEN REGRESSION</span>
            <strong>{knownMiss.scenario_name || knownMiss.scenarioName}</strong>
            <p>Expected {knownMiss.expected}; the baseline semantic detector returned {knownMiss.actual}. Kept visible as a regression target.</p>
          </div>
          <button className="text-button" onClick={() => onLoadTrace(knownMiss.trace_id || knownMiss.traceId)}>
            Replay escape <ArrowRight size={14} />
          </button>
        </section>
      )}

      <section className="evidence-workbench">
        <div className="result-ledger">
          <div className="ledger-toolbar">
            <div>
              <span className="mono-label">SCENARIO LEDGER</span>
              <strong>{filtered.length} visible</strong>
            </div>
            <label className="ledger-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a case" /></label>
          </div>
          <div className="filter-row">
            {filters.map((item) => (
              <button key={item.id} onClick={() => setFilter(item.id)} className={filter === item.id ? 'active' : ''}>
                {filter === item.id && <motion.span layoutId="result-filter" />}
                <b>{item.label}</b>
              </button>
            ))}
          </div>
          <div className="ledger-table-wrap">
            <table className="data-table result-table">
              <thead><tr><th>Case</th><th>Class</th><th>Expected</th><th>Actual</th><th>Guard</th></tr></thead>
              <tbody>
                {filtered.map((result) => (
                  <tr key={result.id} className={result.correct ? '' : 'regression'} onClick={() => onLoadTrace(result.trace_id || result.traceId)}>
                    <td><strong>{result.scenario_name || result.scenarioName}</strong>{!result.correct && <span className="row-finding">OPEN</span>}</td>
                    <td>{humanize(result.category)}</td>
                    <td><DecisionTag decision={result.expected} compact /></td>
                    <td><DecisionTag decision={result.actual} compact /></td>
                    <td><code>{formatNumber(result.latency_ms ?? result.latencyMs)} ms</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="evidence-trace-pane">
          {selectedTrace ? (
            <TraceTimeline traceData={selectedTrace} />
          ) : (
            <div className="trace-start">
              <Fingerprint size={23} />
              <span className="mono-label">TRACE INSPECTOR</span>
              <h2>Select any outcome.</h2>
              <p>The same replay component is used for guided cases and batch evidence.</p>
              {knownMiss && <button className="text-button" onClick={() => onLoadTrace(knownMiss.trace_id || knownMiss.traceId)}>Open the known miss <ArrowRight size={14} /></button>}
            </div>
          )}
          <div className="recent-trace-list">
            <div className="recent-heading"><span>Recent runtime traces</span><ShieldCheck size={14} /></div>
            {recentTraces.slice(0, 6).map((trace) => (
              <button key={trace.trace_id} onClick={() => onLoadTrace(trace.trace_id)}>
                <span><strong>{trace.outcome || 'Policy trace'}</strong><code>{shortId(trace.trace_id, 18)}</code></span>
                <small>{trace.event_count} events · {timeAgo(trace.updated_at)}</small>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
