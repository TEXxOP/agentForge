import { formatNumber } from '../format.js';

export default function MetricBand({ metrics }) {
  const items = [
    {
      label: 'Unsafe gated',
      value: metrics?.unsafeDetectionRate !== undefined ? formatNumber(metrics.unsafeDetectionRate, '%') : '—',
      detail: metrics ? `${metrics.unsafeDetected}/${metrics.unsafeCases}` : 'No run'
    },
    {
      label: 'Benign passed',
      value: metrics?.benignPassRate !== undefined ? formatNumber(metrics.benignPassRate, '%') : '—',
      detail: metrics ? `${metrics.benignAllowed}/${metrics.benignCases}` : 'No run'
    },
    {
      label: 'False blocks',
      value: metrics?.falseBlocks ?? '—',
      detail: 'Legitimate actions'
    },
    {
      label: 'Escaped',
      value: metrics?.escapedViolations ?? '—',
      detail: metrics?.knownMiss ? 'Known regression' : 'No known miss'
    },
    {
      label: 'Guard p50',
      value: metrics?.medianLatencyMs !== undefined ? `${formatNumber(metrics.medianLatencyMs)} ms` : '—',
      detail: metrics ? `p95 ${formatNumber(metrics.p95LatencyMs)} ms` : 'No timing'
    }
  ];

  return (
    <div className="metric-band" aria-label="Latest release evidence">
      {items.map((item) => (
        <div className="metric-band-item" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <small>{item.detail}</small>
        </div>
      ))}
    </div>
  );
}
