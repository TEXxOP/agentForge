export function formatNumber(value, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(Number(value))}${suffix}`;
}

export function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export function formatTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value));
}

export function timeAgo(value) {
  if (!value) return '-';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function shortId(value, length = 15) {
  const text = String(value || '');
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

export function humanize(value) {
  return String(value || '').replaceAll('_', ' ');
}

export function decisionLabel(decision) {
  return {
    allowed: 'Allowed',
    blocked: 'Blocked',
    approval: 'Review',
    duplicate: 'Deduplicated',
    stale: 'Cancelled',
    failed: 'Failed safely'
  }[decision] || 'Not run';
}

export function summarizeEvent(event) {
  const payload = event.payload || {};
  if (event.event_type === 'action_proposed') {
    return `${payload.tool || 'tool'} ${JSON.stringify(payload.arguments || {})}`;
  }
  if (event.event_type === 'input_analyzed') {
    return `Risk ${payload.level || 'unknown'} · ${payload.explanation || payload.signal || ''}`;
  }
  if (event.event_type === 'policy_evaluated') {
    const rules = (payload.matches || []).map((match) => match.ruleId).join(', ');
    return `${payload.summary || 'Policy evaluated'}${rules ? ` · ${rules}` : ''}`;
  }
  if (event.event_type === 'state_revalidated' || event.event_type === 'stale_state_prevented') {
    return `${payload.reason || 'State revalidated'} · ${JSON.stringify(payload.evidence || {})}`;
  }
  if (event.event_type === 'approval_requested') {
    return `${payload.rule?.message || 'Human decision required'} · bound ${shortId(payload.binding, 10)}`;
  }
  if (event.event_type === 'approval_resolved') {
    return `${payload.reviewer || 'reviewer'} · ${payload.resolution || event.decision}`;
  }
  if (event.event_type === 'action_executed') {
    return `${payload.provider || payload.result?.provider || 'adapter'} · ${payload.result?.status || 'completed'} · ${payload.result?.externalId || ''}`;
  }
  if (event.event_type === 'action_blocked') {
    return payload.summary || payload.matches?.[0]?.message || 'Unsafe action did not reach the adapter.';
  }
  if (event.event_type === 'duplicate_prevented') {
    return `Matched existing action ${shortId(payload.idempotencyKey, 14)} · AP-009`;
  }
  if (event.event_type === 'action_failed') {
    return `${payload.message || 'Adapter failed'} · ${payload.retryPolicy || 'no blind retry'}`;
  }
  return JSON.stringify(payload).slice(0, 240);
}
