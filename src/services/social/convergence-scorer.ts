/**
 * Convergence Scorer — Cross-signal scoring for social sentiment
 * Groups by token, weights by follower count, scores by velocity + breadth
 */

import type { SentimentResult } from './sentiment-analyzer';
import watchlist from './twitter-crypto-watchlist.json';

export interface ConvergenceSignal {
  token: string;
  score: number;
  mentionCount: number;
  uniqueAccounts: number;
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  avgConfidence: number;
  velocity: number;
  topMentioners: string[];
  updatedAt: string;
}

const followerMap = new Map<string, number>();
for (const entry of watchlist) {
  followerMap.set(entry.screen_name.toLowerCase(), entry.followers_count);
}

function getFollowerWeight(handle: string): number {
  const followers = followerMap.get(handle.toLowerCase()) || 100;
  return Math.log10(Math.max(followers, 10));
}

function aggregateSentiment(
  results: SentimentResult[]
): { sentiment: ConvergenceSignal['sentiment']; avgConfidence: number } {
  if (results.length === 0) return { sentiment: 'neutral', avgConfidence: 0 };

  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  let totalConfidence = 0;

  for (const r of results) {
    totalConfidence += r.confidence;
    if (r.sentiment === 'bullish') bullish++;
    else if (r.sentiment === 'bearish') bearish++;
    else neutral++;
  }

  const total = results.length;
  const avgConfidence = totalConfidence / total;

  if (bullish > bearish * 2 && bullish > neutral) return { sentiment: 'bullish', avgConfidence };
  if (bearish > bullish * 2 && bearish > neutral) return { sentiment: 'bearish', avgConfidence };
  if (bullish > 0 && bearish > 0 && Math.abs(bullish - bearish) < total * 0.3) return { sentiment: 'mixed', avgConfidence };
  return { sentiment: 'neutral', avgConfidence };
}

export function scoreConvergence(results: SentimentResult[]): ConvergenceSignal[] {
  if (results.length === 0) return [];

  // Group by token
  const tokenGroups = new Map<string, SentimentResult[]>();
  for (const result of results) {
    for (const token of result.tokens) {
      const upper = token.toUpperCase();
      const existing = tokenGroups.get(upper) || [];
      existing.push(result);
      tokenGroups.set(upper, existing);
    }
  }

  const now = new Date();
  const signals: ConvergenceSignal[] = [];

  for (const [token, group] of tokenGroups.entries()) {
    // Skip tokens with only 1 mention
    if (group.length < 2) continue;

    const uniqueHandles = new Set(group.map((r) => r.handle.toLowerCase()));
    const uniqueAccounts = uniqueHandles.size;
    if (uniqueAccounts < 2) continue;

    // Calculate weighted mention score
    let weightedMentions = 0;
    for (const handle of uniqueHandles) {
      weightedMentions += getFollowerWeight(handle);
    }

    // Velocity: mentions in last 4 hours vs total
    const fourHoursAgo = now.getTime() - 4 * 60 * 60 * 1000;
    const recentMentions = group.filter((r) => Date.parse(r.timestamp) > fourHoursAgo).length;
    const velocity = group.length > 0 ? recentMentions / Math.max(group.length, 1) : 0;

    // Convergence score formula
    const accountScore = Math.min(uniqueAccounts * 20, 40);
    const { sentiment, avgConfidence } = aggregateSentiment(group);
    const sentimentScore = avgConfidence * 30;
    const velocityScore = velocity * 50;

    const rawScore = accountScore + sentimentScore + velocityScore;
    const followerBoost = Math.min(weightedMentions / uniqueAccounts, 2);
    const score = Math.min(Math.round(rawScore * followerBoost), 100);

    // Top mentioners by follower count
    const sortedHandles = Array.from(uniqueHandles)
      .sort((a, b) => (followerMap.get(b) || 0) - (followerMap.get(a) || 0))
      .slice(0, 5);

    signals.push({
      token,
      score,
      mentionCount: group.length,
      uniqueAccounts,
      sentiment,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      velocity: Math.round(velocity * 100) / 100,
      topMentioners: sortedHandles,
      updatedAt: now.toISOString(),
    });
  }

  return signals.sort((a, b) => b.score - a.score);
}
