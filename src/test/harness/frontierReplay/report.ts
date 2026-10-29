/**
 * B1.1 REPLAY REPORT - prints the v7-versus-v8 comparison as Markdown.
 *
 *   npx tsx src/test/harness/frontierReplay/report.ts              # table only
 *   npx tsx src/test/harness/frontierReplay/report.ts --sequences  # + every pick sequence
 *
 * Offline and deterministic: no socket, database, model, clock or randomness.
 * The numbers it prints are the ones `orgunitFrontierReplay.test.ts` pins.
 * SYNTHETIC: precision and recall are within each fixture's own labelled
 * universe and do not establish real-world performance.
 */
import { createFrontier } from '../../../orgunits/orchestrator/frontier.js';
import { allFixtures } from './fixtures.js';
import { lostRelativeTo, measure, type ReplayMetrics } from './metrics.js';
import { replaySite } from './simulate.js';
import { FrozenV7Frontier } from './v7Frontier.js';

const pct = (x: number | null): string => (x === null ? 'n/a' : (100 * x).toFixed(1));
const pair = (a: string | number, b: string | number): string => `${a} → ${b}`;
const withSequences = process.argv.includes('--sequences');

const lines: string[] = [
  '| fixture | targets | discovered v7→v8 | fetched v7→v8 | Δ recall pp | high-rel fetched | precision % | hosts | sections | max section share | page attempts | requests | Track B selected | lost to v8 |',
  '| --- | --: | --- | --- | --: | --- | --- | --- | --- | --- | --- | --- | --- | --: |',
];
const appendix: string[] = [];

for (const site of allFixtures()) {
  const baseline = replaySite(site, new FrozenV7Frontier());
  const candidate = replaySite(site, createFrontier());
  const b: ReplayMetrics = measure(site, baseline);
  const c: ReplayMetrics = measure(site, candidate);
  const lost = lostRelativeTo(site, baseline, candidate);
  const delta =
    b.recall === null || c.recall === null ? 'n/a' : (100 * (c.recall - b.recall)).toFixed(1);
  lines.push(
    `| ${site.id} | ${b.relevantTotal} | ${pair(b.relevantDiscovered, c.relevantDiscovered)} | ${pair(b.relevantFetched, c.relevantFetched)} | ${delta} | ${pair(`${b.highRelevanceFetched}/${b.highRelevanceTotal}`, `${c.highRelevanceFetched}/${c.highRelevanceTotal}`)} | ${pair(pct(b.precision), pct(c.precision))} | ${pair(b.distinctHosts, c.distinctHosts)} | ${pair(b.distinctSections, c.distinctSections)} | ${pair(b.maxSectionShare.toFixed(2), c.maxSectionShare.toFixed(2))} | ${pair(b.pageAttempts, c.pageAttempts)} | ${pair(b.totalRequests, c.totalRequests)} | ${pair(b.trackBSelected, c.trackBSelected)} | ${lost.length} |`,
  );
  if (lost.length > 0) appendix.push(`- **${site.id}** lost: ${lost.join(', ')}`);
  if (withSequences) {
    appendix.push(`\n### ${site.id}\n\n${site.description}\n`);
    for (const [label, result] of [
      ['v7', baseline],
      ['v8', candidate],
    ] as const) {
      appendix.push(`**${label}** (${result.stopReason}):\n`);
      for (const [i, p] of result.picks.entries())
        appendix.push(`${i + 1}. \`${p.status}\` ${p.url}`);
      appendix.push('');
    }
  }
}

process.stdout.write(`${lines.join('\n')}\n\n${appendix.join('\n')}\n`);
