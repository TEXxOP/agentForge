import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import ApprovalDrawer from './components/ApprovalDrawer.jsx';
import ArchitectureView from './components/ArchitectureView.jsx';
import AttackConsole from './components/AttackConsole.jsx';
import Chrome from './components/Chrome.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import EvidenceView from './components/EvidenceView.jsx';
import Feedback from './components/Feedback.jsx';
import PolicyView from './components/PolicyView.jsx';
import ProofRunner from './components/ProofRunner.jsx';

const validViews = new Set(['run', 'attack', 'evidence', 'policy', 'architecture']);

function initialView() {
  const value = window.location.hash.replace('#', '');
  return validViews.has(value) ? value : 'run';
}

export default function App() {
  const [view, setView] = useState(initialView);
  const [dashboard, setDashboard] = useState(null);
  const [policyMeta, setPolicyMeta] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [results, setResults] = useState({});
  const [selectedScenarioId, setSelectedScenarioId] = useState('prompt_injection_refund');
  const [evaluation, setEvaluation] = useState(null);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [draftReplays, setDraftReplays] = useState({});
  const [mutationProof, setMutationProof] = useState(null);
  const [busy, setBusy] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback((title, message, type = 'success') => {
    clearTimeout(toastTimer.current);
    setToast({ title, message, type });
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const loadInitial = useCallback(async () => {
    setLoadError(null);
    try {
      const [dashboardData, policyData, scenarioData] = await Promise.all([
        api('/api/dashboard'),
        api('/api/policies'),
        api('/api/scenarios')
      ]);
      setDashboard(dashboardData);
      setEvaluation(dashboardData.latestEvaluation);
      setPolicyMeta({ name: policyData.name, version: policyData.version });
      setPolicies(policyData.policies);
      setScenarios(scenarioData.scenarios);
      setSelectedScenarioId((current) => (
        scenarioData.scenarios.some((scenario) => scenario.id === current)
          ? current
          : scenarioData.scenarios[0]?.id || null
      ));
    } catch (error) {
      setLoadError(error.message);
    }
  }, []);

  useEffect(() => {
    loadInitial();
    return () => clearTimeout(toastTimer.current);
  }, [loadInitial]);

  useEffect(() => {
    const onHash = () => {
      const next = initialView();
      if (next !== view) setView(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [view]);

  const changeView = (next) => {
    if (!validViews.has(next)) return;
    setView(next);
    window.history.replaceState(null, '', `#${next}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const refreshDashboard = useCallback(async (quiet = false) => {
    try {
      const next = await api('/api/dashboard');
      setDashboard(next);
      setEvaluation((current) => next.latestEvaluation || current);
      if (!quiet) notify('Evidence refreshed', 'The latest gateway state is loaded.');
      return next;
    } catch (error) {
      notify('Refresh failed', error.message, 'error');
      return null;
    }
  }, [notify]);

  const runScenario = useCallback(async (id, { quiet = false } = {}) => {
    const scenario = scenarios.find((item) => item.id === id);
    if (!scenario) return null;
    setSelectedScenarioId(id);
    setBusy({ type: 'scenario', id, label: `Evaluating ${scenario.shortName.toLowerCase()}…` });
    try {
      const result = await api(`/api/scenarios/${encodeURIComponent(id)}/run`, { method: 'POST', body: '{}' });
      setResults((current) => ({ ...current, [id]: result }));
      if (result.decision === 'approval') setDrawerOpen(true);
      await refreshDashboard(true);
      if (!quiet) notify(result.decision === 'blocked' ? 'Action blocked' : 'Case complete', result.summary);
      return result;
    } catch (error) {
      notify('Case failed safely', error.message, 'error');
      return null;
    } finally {
      setBusy(null);
    }
  }, [notify, refreshDashboard, scenarios]);

  const runAll = useCallback(async () => {
    changeView('run');
    for (let index = 0; index < scenarios.length; index += 1) {
      const scenario = scenarios[index];
      setBusy({ type: 'suite', id: scenario.id, label: `${index + 1}/${scenarios.length} · ${scenario.name}` });
      await runScenario(scenario.id, { quiet: true });
    }
    setBusy(null);
    notify('Five-part proof complete', 'Every guided outcome has a replayable evidence chain.');
  }, [notify, runScenario, scenarios]);

  const runEvaluation = useCallback(async () => {
    changeView('evidence');
    setBusy({ type: 'evaluation', label: 'Running 60 isolated payment traces…' });
    try {
      const data = await api('/api/evaluations/run', { method: 'POST', body: '{}' });
      setEvaluation(data.evaluation);
      setDashboard(data.dashboard);
      const knownMiss = data.evaluation.results.find((result) => !result.correct);
      if (knownMiss) {
        const trace = await api(`/api/traces/${encodeURIComponent(knownMiss.trace_id || knownMiss.traceId)}`);
        setSelectedTrace(trace);
      }
      notify('Release gate complete', `${data.evaluation.metrics.exactOutcomes} of ${data.evaluation.metrics.total} outcomes matched.`);
    } catch (error) {
      notify('Evaluation failed safely', error.message, 'error');
    } finally {
      setBusy(null);
    }
  }, [notify]);

  const loadTrace = useCallback(async (traceId) => {
    try {
      const data = await api(`/api/traces/${encodeURIComponent(traceId)}`);
      setSelectedTrace(data);
      return data;
    } catch (error) {
      notify('Trace unavailable', error.message, 'error');
      return null;
    }
  }, [notify]);

  useEffect(() => {
    if (view !== 'evidence' || selectedTrace || !evaluation?.results?.length) return;
    const knownMiss = evaluation.results.find((result) => !result.correct) || evaluation.results[0];
    if (knownMiss) loadTrace(knownMiss.trace_id || knownMiss.traceId);
  }, [evaluation, loadTrace, selectedTrace, view]);

  const resolveApproval = useCallback(async (approvalId, resolution) => {
    setBusy({ type: 'approval', label: `${resolution === 'approved' ? 'Approving' : 'Rejecting'} exact action…` });
    try {
      const data = await api(`/api/approvals/${encodeURIComponent(approvalId)}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolution, reviewer: 'hackathon_reviewer' })
      });
      setDashboard(data.dashboard);
      setSelectedTrace({ traceId: data.result.traceId, trace: data.trace, integrity: data.result.auditIntegrity, result: data.result });
      setResults((current) => Object.fromEntries(Object.entries(current).map(([id, item]) => {
        if (item.traceId !== data.result.traceId) return [id, item];
        return [id, { ...item, ...data.result, trace: data.trace }];
      })));
      if (!data.dashboard.approvals.length) setDrawerOpen(false);
      notify('Approval resolved', data.result.summary);
    } catch (error) {
      notify('Approval failed', error.message, 'error');
    } finally {
      setBusy(null);
    }
  }, [notify]);

  const resetDemo = useCallback(async () => {
    setBusy({ type: 'reset', label: 'Recreating isolated payment fixtures…' });
    try {
      const data = await api('/api/demo/reset', { method: 'POST', body: '{}' });
      setDashboard(data.dashboard);
      setEvaluation(null);
      setResults({});
      setSelectedTrace(null);
      setDraftReplays({});
      setMutationProof(null);
      setDrawerOpen(false);
      setSelectedScenarioId('prompt_injection_refund');
      notify('Evidence reset', 'Guided cases are ready for a clean run.');
    } catch (error) {
      notify('Reset failed', error.message, 'error');
    } finally {
      setBusy(null);
    }
  }, [notify]);

  const generateDrafts = useCallback(async () => {
    setBusy({ type: 'generation', label: 'Generating defensive scenario drafts…' });
    try {
      const data = await api('/api/ai/scenarios', { method: 'POST', body: JSON.stringify({ count: 6 }) });
      setDrafts(data.drafts);
      notify(data.source === 'live_model' ? 'AI drafts generated' : 'Seeded drafts loaded', data.note);
    } catch (error) {
      notify('Generation failed safely', error.message, 'error');
    } finally {
      setBusy(null);
    }
  }, [notify]);

  const replayDraft = useCallback(async (draft) => {
    setBusy({ type: 'draft_replay', id: draft.id, label: 'Running a contained red-team replay…' });
    try {
      const data = await api('/api/ai/replay', { method: 'POST', body: JSON.stringify({ draft }) });
      setDraftReplays((current) => ({ ...current, [draft.id]: data }));
      setSelectedTrace(data.trace);
      notify(
        data.verdict === 'covered' ? 'Control coverage confirmed' : 'Policy gap exposed',
        data.verdict === 'covered'
          ? `${data.compiler} matched the expected ${data.observedDecision} decision.`
          : `${data.compiler} expected ${data.expectedDecision}, but observed ${data.observedDecision}.`
      );
      return data;
    } catch (error) {
      notify('Contained replay failed safely', error.message, 'error');
      return null;
    } finally {
      setBusy(null);
    }
  }, [notify]);

  const proveMutation = useCallback(async (ruleId) => {
    setBusy({ type: 'mutation', id: ruleId, label: `Removing ${ruleId} inside a counterfactual test…` });
    try {
      const data = await api(`/api/mutations/${encodeURIComponent(ruleId)}/run`, { method: 'POST', body: '{}' });
      setMutationProof(data);
      notify(
        'Control dependency measured',
        data.delta.newlyEscaped
          ? `${data.delta.newlyEscaped} additional unsafe traces escape without ${ruleId}.`
          : `No additional escapes were found for ${ruleId} in this fixture set.`
      );
      return data;
    } catch (error) {
      notify('Counterfactual proof failed safely', error.message, 'error');
      return null;
    } finally {
      setBusy(null);
    }
  }, [notify]);

  if (loadError) {
    return (
      <div className="load-failure">
        <AlertTriangle size={24} />
        <h1>Gateway unavailable</h1>
        <p>{loadError}</p>
        <button className="solid-button" onClick={loadInitial}><RefreshCw size={14} /> Retry connection</button>
      </div>
    );
  }

  if (!dashboard || !scenarios.length) {
    return <div className="app-loading"><span className="wordmark-mark">AP</span><p>Loading release evidence…</p></div>;
  }

  const approvals = dashboard.approvals || [];

  const commands = [
    { id: 'go-run', group: 'Navigate', label: 'Open proof runner', hint: 'Five guided money-moving cases', keys: ['G', 'R'], run: () => changeView('run') },
    { id: 'go-attack', group: 'Navigate', label: 'Open attack lab', hint: 'Fire your own untrusted text at the gateway', keys: ['G', 'A'], run: () => changeView('attack') },
    { id: 'go-evidence', group: 'Navigate', label: 'Open evidence', hint: '60-case release gate and trace replay', keys: ['G', 'E'], run: () => changeView('evidence') },
    { id: 'go-policy', group: 'Navigate', label: 'Open policy', hint: 'AP-001 to AP-010, red-team replay, counterfactuals', keys: ['G', 'P'], run: () => changeView('policy') },
    { id: 'go-architecture', group: 'Navigate', label: 'Open architecture', hint: 'Interactive system walkthrough', keys: ['G', 'D'], run: () => changeView('architecture') },
    { id: 'run-all', group: 'Prove', label: 'Run the five-part guided proof', hint: 'Allowed, blocked, approval, duplicate, stale', run: runAll },
    { id: 'run-eval', group: 'Prove', label: 'Run the 60-case release gate', hint: 'Isolated fixtures against the real gateway', run: runEvaluation },
    { id: 'run-injection', group: 'Prove', label: 'Run the prompt-injection case', hint: 'AP-008 blocks it before the adapter', run: () => runScenario('prompt_injection_refund') },
    { id: 'gen-drafts', group: 'Prove', label: 'Generate adversarial drafts', hint: 'Model-drafted cases, human review required', run: generateDrafts },
    { id: 'approvals', group: 'Session', label: 'Review pending approvals', hint: approvals.length ? `${approvals.length} waiting` : 'Nothing pending', run: () => setDrawerOpen(true) },
    { id: 'refresh', group: 'Session', label: 'Refresh evidence', hint: 'Reload gateway state', run: () => refreshDashboard(false) },
    { id: 'reset', group: 'Session', label: 'Reset demo evidence', hint: 'Recreate isolated payment fixtures', run: resetDemo }
  ];

  return (
    <Chrome
      activeView={view}
      onView={changeView}
      product={dashboard.product}
      pendingApprovals={approvals.length}
      onApprovals={() => setDrawerOpen(true)}
      onRefresh={() => refreshDashboard(false)}
      busy={busy}
    >
      <AnimatePresence mode="wait">
        <motion.div key={view} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}>
          {view === 'run' && (
            <ProofRunner
              scenarios={scenarios}
              results={results}
              selectedId={selectedScenarioId}
              onSelect={setSelectedScenarioId}
              onRun={runScenario}
              onRunAll={runAll}
              onReset={resetDemo}
              runningId={busy?.id}
              evaluation={evaluation}
              approvals={approvals}
              onResolve={resolveApproval}
            />
          )}
          {view === 'attack' && (
            <AttackConsole
              cases={dashboard.cases || []}
              onTrace={setSelectedTrace}
              notify={notify}
              onView={changeView}
            />
          )}
          {view === 'evidence' && (
            <EvidenceView
              evaluation={evaluation}
              onRun={runEvaluation}
              recentTraces={dashboard.recentTraces || []}
              onLoadTrace={loadTrace}
              selectedTrace={selectedTrace}
              running={busy?.type === 'evaluation'}
            />
          )}
          {view === 'policy' && (
            <PolicyView
              policyMeta={policyMeta}
              policies={policies}
              evaluation={evaluation}
              generator={dashboard.product.ai}
              drafts={drafts}
              onGenerate={generateDrafts}
              generating={busy?.type === 'generation'}
              onRunDraft={replayDraft}
              draftReplays={draftReplays}
              replayingDraftId={busy?.type === 'draft_replay' ? busy.id : null}
              mutationProof={mutationProof}
              onProveMutation={proveMutation}
              mutationRunning={busy?.type === 'mutation'}
              onOpenEvidence={() => changeView('evidence')}
            />
          )}
          {view === 'architecture' && (
            <ArchitectureView
              product={dashboard.product}
              evaluation={evaluation}
              trace={selectedTrace?.trace || null}
              onView={changeView}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <footer className="app-footer">
        <span>AgentProof · Open Track</span>
        <span>Test mode only</span>
        <span>Evidence, not a formal guarantee.</span>
      </footer>

      <ApprovalDrawer open={drawerOpen} approvals={approvals} onClose={() => setDrawerOpen(false)} onResolve={resolveApproval} />
      <CommandPalette commands={commands} />
      <Feedback toast={toast} />
    </Chrome>
  );
}
