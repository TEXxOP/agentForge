import './src/config.mjs';
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { config } from './src/config.mjs';
import { AgentProofStore } from './src/database.mjs';
import { createPaymentAdapter, SimulatorAdapter } from './src/adapters.mjs';
import { ActionGateway } from './src/gateway.mjs';
import { policies, policyConfig } from './src/policy-engine.mjs';
import { guidedScenarios, runScenario, scenarioSummary } from './src/scenarios.mjs';
import { runEvaluation } from './src/evaluator.mjs';
import { proveControlBlastRadius } from './src/mutation-lab.mjs';
import { compileDraftReplay } from './src/red-team-replay.mjs';
import { generateScenarioDrafts, getGeneratorStatus, toolSchemas } from './src/scenario-generator.mjs';

const store = new AgentProofStore();
const adapter = createPaymentAdapter();
const gateway = new ActionGateway({ store, adapter });
const publicRoot = resolve('public');

if (!store.listCases(1).length) store.seedCoreCases();
if (!store.getLatestEvaluation()) await runEvaluation({ store, gateway, source: 'seeded_startup_evidence' });

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// connect-src stays `'self'` unless ALLOWED_ORIGINS names a cross-origin frontend,
// so the local default policy string is byte-identical to the single-service build.
const connectSrc = ["'self'", ...config.allowedOrigins].join(' ');
const contentSecurityPolicy = `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src ${connectSrc}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;

function securityHeaders(contentType = 'application/json; charset=utf-8') {
  return {
    'Content-Type': contentType,
    'Cache-Control': contentType.startsWith('text/html') ? 'no-store' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': contentSecurityPolicy
  };
}

// Applied to /api/ responses only, and only for an origin that is on the allow-list.
// No wildcard, no reflection of unlisted origins: with ALLOWED_ORIGINS unset this is a no-op.
function applyApiCors(request, response) {
  const origin = request.headers.origin;
  if (!origin || !config.allowedOrigins.includes(origin)) return;
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Max-Age', '600');
}

function sendJson(response, status, data) {
  response.writeHead(status, securityHeaders());
  response.end(JSON.stringify(data));
}

function sendError(response, status, message, details = null) {
  sendJson(response, status, { error: message, details });
}

async function readJson(request, maxBytes = 256_000) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > maxBytes) throw new Error('Request body is too large.');
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function dashboardPayload() {
  return {
    product: {
      name: 'AgentProof',
      tagline: 'Ship payment agents with proof, not promises.',
      track: 'Open Track',
      adapterMode: adapter.mode,
      environmentLabel: adapter.mode === 'razorpay_test' ? 'Razorpay test mode' : 'Payment simulator',
      ai: getGeneratorStatus()
    },
    overview: store.getOverview(),
    latestEvaluation: store.getLatestEvaluation(),
    recentTraces: store.listTraces(18),
    approvals: store.listApprovals('pending'),
    cases: store.listCases(10)
  };
}

async function runContainedDraftReplay(draft) {
  const directory = mkdtempSync(join(tmpdir(), 'agentproof-red-team-'));
  const sandboxStore = new AgentProofStore(join(directory, 'sandbox.db'));
  const sandboxGateway = new ActionGateway({ store: sandboxStore, adapter: new SimulatorAdapter() });

  try {
    const compiled = compileDraftReplay(draft);
    const outcome = await runScenario({ scenario: compiled.scenario, store: sandboxStore, gateway: sandboxGateway });
    const trace = sandboxStore.getTrace(outcome.traceId);
    const integrity = sandboxStore.verifyTrace(outcome.traceId);
    const verdict = outcome.decision === compiled.expectedDecision ? 'covered' : 'gap_exposed';
    const result = {
      ...outcome,
      expectedDecision: compiled.expectedDecision,
      verdict,
      containedReplay: true
    };
    return {
      source: 'contained_red_team_replay',
      contained: true,
      compiler: compiled.compiler,
      expectedDecision: compiled.expectedDecision,
      observedDecision: outcome.decision,
      verdict,
      scenario: scenarioSummary(compiled.scenario),
      result,
      trace: { traceId: outcome.traceId, trace, integrity, result },
      note: 'Ran in an ephemeral SQLite sandbox with the simulator. No merchant data, credentials, or provider action was used.'
    };
  } finally {
    sandboxStore.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

async function handleApi(request, response, url) {
  const method = request.method || 'GET';
  const path = url.pathname;

  if (method === 'GET' && path === '/api/health') {
    return sendJson(response, 200, { ok: true, adapter: adapter.mode, database: 'connected' });
  }

  // Deploy-facing probe used as the Render health check. Always answers 200 while the
  // process is up; `ok` and `database` report a real read against SQLite, and
  // `buildPresent` says whether this instance can also serve the built frontend.
  if (method === 'GET' && path === '/api/health-deep') {
    let database = 'connected';
    try {
      store.listCases(1);
    } catch {
      database = 'unavailable';
    }
    return sendJson(response, 200, {
      ok: database === 'connected',
      adapter: adapter.mode,
      database,
      buildPresent: existsSync(join(publicRoot, 'index.html'))
    });
  }

  if (method === 'GET' && path === '/api/dashboard') {
    return sendJson(response, 200, dashboardPayload());
  }

  if (method === 'GET' && path === '/api/policies') {
    return sendJson(response, 200, { ...policyConfig, policies, toolSchemas });
  }

  if (method === 'GET' && path === '/api/scenarios') {
    return sendJson(response, 200, { scenarios: guidedScenarios().map(scenarioSummary) });
  }

  if (method === 'POST' && path === '/api/demo/reset') {
    store.clearDemoData();
    store.seedCoreCases();
    return sendJson(response, 200, { ok: true, dashboard: dashboardPayload() });
  }

  if (method === 'POST' && path === '/api/demo/run') {
    const results = [];
    for (const scenario of guidedScenarios()) {
      const result = await runScenario({ scenario, store, gateway });
      results.push({
        scenario: scenarioSummary(scenario),
        ...result,
        trace: store.getTrace(result.traceId)
      });
    }
    return sendJson(response, 200, { results, dashboard: dashboardPayload() });
  }

  const scenarioMatch = path.match(/^\/api\/scenarios\/([^/]+)\/run$/);
  if (method === 'POST' && scenarioMatch) {
    const scenario = guidedScenarios().find((item) => item.id === decodeURIComponent(scenarioMatch[1]));
    if (!scenario) return sendError(response, 404, 'Scenario not found.');
    const result = await runScenario({ scenario, store, gateway });
    return sendJson(response, 200, { scenario: scenarioSummary(scenario), ...result, trace: store.getTrace(result.traceId) });
  }

  if (method === 'POST' && path === '/api/evaluations/run') {
    const evaluation = await runEvaluation({ store, gateway });
    return sendJson(response, 200, { evaluation, dashboard: dashboardPayload() });
  }

  if (method === 'GET' && path === '/api/evaluations/latest') {
    const evaluation = store.getLatestEvaluation();
    return evaluation ? sendJson(response, 200, { evaluation }) : sendError(response, 404, 'No evaluation has run yet.');
  }

  const evaluationMatch = path.match(/^\/api\/evaluations\/([^/]+)$/);
  if (method === 'GET' && evaluationMatch) {
    const evaluation = store.getEvaluationRun(decodeURIComponent(evaluationMatch[1]));
    return evaluation ? sendJson(response, 200, { evaluation }) : sendError(response, 404, 'Evaluation not found.');
  }

  const traceMatch = path.match(/^\/api\/traces\/([^/]+)$/);
  if (method === 'GET' && traceMatch) {
    const traceId = decodeURIComponent(traceMatch[1]);
    const trace = store.getTrace(traceId);
    return trace.length
      ? sendJson(response, 200, { traceId, trace, integrity: store.verifyTrace(traceId) })
      : sendError(response, 404, 'Trace not found.');
  }

  if (method === 'GET' && path === '/api/approvals') {
    return sendJson(response, 200, { approvals: store.listApprovals() });
  }

  const approvalMatch = path.match(/^\/api\/approvals\/([^/]+)\/resolve$/);
  if (method === 'POST' && approvalMatch) {
    const body = await readJson(request);
    if (!['approved', 'rejected'].includes(body.resolution)) {
      return sendError(response, 400, 'Resolution must be approved or rejected.');
    }
    const result = await gateway.resolveApproval(decodeURIComponent(approvalMatch[1]), body.resolution, body.reviewer || 'demo_reviewer');
    return sendJson(response, 200, { result, trace: store.getTrace(result.traceId), dashboard: dashboardPayload() });
  }

  if (method === 'POST' && path === '/api/gateway/actions') {
    const body = await readJson(request);
    if (!body.caseId || !body.tool || !body.arguments) {
      return sendError(response, 400, 'caseId, tool, and arguments are required.');
    }
    const result = await gateway.execute({
      caseId: body.caseId,
      tool: body.tool,
      arguments: body.arguments,
      sourceEventId: body.sourceEventId,
      sourceText: body.sourceText,
      idempotencyKey: body.idempotencyKey,
      actor: body.actor || 'api_agent',
      preauthorized: Boolean(body.preauthorized)
    });
    return sendJson(response, 200, { result, trace: store.getTrace(result.traceId) });
  }

  const mutationMatch = path.match(/^\/api\/mutations\/(AP-\d{3})\/run$/);
  if (method === 'POST' && mutationMatch) {
    try {
      return sendJson(response, 200, await proveControlBlastRadius(mutationMatch[1]));
    } catch (error) {
      return sendError(response, 400, 'Counterfactual proof could not run.', error.message);
    }
  }

  if (method === 'POST' && path === '/api/ai/scenarios') {
    const body = await readJson(request);
    try {
      const generated = await generateScenarioDrafts(body.count || 6);
      return sendJson(response, 200, generated);
    } catch (error) {
      return sendError(response, 502, 'Scenario generation failed safely.', error.message);
    }
  }

  if (method === 'POST' && path === '/api/ai/replay') {
    const body = await readJson(request);
    if (!body.draft || typeof body.draft !== 'object') {
      return sendError(response, 400, 'A scenario draft is required for a contained replay.');
    }
    try {
      return sendJson(response, 200, await runContainedDraftReplay(body.draft));
    } catch (error) {
      return sendError(response, 400, 'Contained replay could not run.', error.message);
    }
  }

  return sendError(response, 404, 'API route not found.');
}

function serveFile(response, filePath) {
  const contentType = mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream';
  response.writeHead(200, securityHeaders(contentType));
  createReadStream(filePath).pipe(response);
}

function serveStatic(request, response, url) {
  const method = request.method || 'GET';
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const decoded = decodeURIComponent(requested);
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  const filePath = join(publicRoot, relative);
  const insideRoot = filePath.startsWith(publicRoot);
  if (insideRoot && existsSync(filePath) && statSync(filePath).isFile()) {
    return serveFile(response, filePath);
  }
  // SPA fallback: an unknown extensionless route serves the app shell. A path that looks
  // like a missing asset, or anything that escapes publicRoot, keeps the JSON 404.
  const indexPath = join(publicRoot, 'index.html');
  const routeLike = insideRoot && (method === 'GET' || method === 'HEAD') && !extname(relative);
  if (routeLike && existsSync(indexPath)) return serveFile(response, indexPath);
  return sendError(response, 404, 'Page not found.');
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      applyApiCors(request, response);
      if ((request.method || 'GET') === 'OPTIONS') {
        response.writeHead(204, { 'Content-Length': '0' });
        return response.end();
      }
      await handleApi(request, response, url);
    } else serveStatic(request, response, url);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendError(response, 500, 'AgentProof could not complete the request.', error.message);
    else response.end();
  }
});

const resolvedOrigin = config.publicOrigin || process.env.RENDER_EXTERNAL_URL || `http://${config.host}:${config.port}`;

server.listen(config.port, config.host, () => {
  console.log(`AgentProof is ready at ${resolvedOrigin}`);
  console.log(`Action adapter: ${adapter.mode}`);
  console.log(`Bound to ${config.host}:${config.port}`);
  console.log(
    config.allowedOrigins.length
      ? `Cross-origin API callers allowed: ${config.allowedOrigins.join(', ')}`
      : 'Cross-origin API callers allowed: none (same-origin only)'
  );
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
