import { Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import logger from '../../config/logger';
import { createX402Gate } from '../middleware/x402Gate';
import { AztecClient, buildProofInputs, normalizeProofHash } from '../../services/aztec/client';
import type { AnchorMeta, AnchorRequest, RegistryQuery } from '../../services/aztec/types';

const router = Router();
const aztecClient = new AztecClient();

const DATA_DIR = process.env.DATA_DIR || '/data';
const LEDGER_FILE = path.join(DATA_DIR, 'aztec-anchors.json');
const MAX_LEDGER_ENTRIES = 10_000;

interface AnchorLedgerEntry extends AnchorMeta {
  receiptHash: string;
  authorizedKeysHash: string;
  timestampWindowHash: string;
  proofInputHash: string;
}

interface AnchorLedgerData {
  anchors: AnchorLedgerEntry[];
  updatedAt: string | null;
}

const anchorLedger: AnchorLedgerData = {
  anchors: [],
  updatedAt: null,
};

let flushPending = false;

const anchorRequestSchema = z.object({
  receipt: z.record(z.unknown()),
  authorizedKeys: z.array(z.string().min(1)).min(1),
  timestampWindow: z.object({
    min: z.union([z.string().min(1), z.number().finite()]),
    max: z.union([z.string().min(1), z.number().finite()]),
  }),
});

function isIsoTimestamp(raw: string): boolean {
  return Number.isFinite(Date.parse(raw));
}

function parseLimit(raw: unknown): number | null {
  if (raw === undefined) return 20;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) return null;
  return parsed;
}

function parseOffset(raw: unknown): number | null {
  if (raw === undefined) return 0;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function parseSince(raw: unknown): string | null {
  if (raw === undefined) return null;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  if (!isIsoTimestamp(raw)) return null;
  return raw;
}

function parseChainFlag(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const value = raw.toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function normalizeLedgerEntry(value: unknown): AnchorLedgerEntry | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;

  const proofHash =
    typeof row.proofHash === 'string' ? normalizeProofHash(row.proofHash) : null;
  const txHash =
    typeof row.txHash === 'string' ? normalizeProofHash(row.txHash) : null;
  const block =
    typeof row.block === 'number' && Number.isInteger(row.block) && row.block >= 0
      ? row.block
      : null;
  const timestamp = typeof row.timestamp === 'string' ? row.timestamp : null;
  const anchorId = typeof row.anchorId === 'string' ? row.anchorId : null;
  const receiptHash = typeof row.receiptHash === 'string' ? row.receiptHash : null;
  const authorizedKeysHash =
    typeof row.authorizedKeysHash === 'string' ? row.authorizedKeysHash : null;
  const timestampWindowHash =
    typeof row.timestampWindowHash === 'string' ? row.timestampWindowHash : null;
  const proofInputHash = typeof row.proofInputHash === 'string' ? row.proofInputHash : null;

  if (
    !proofHash ||
    !txHash ||
    block === null ||
    !timestamp ||
    !anchorId ||
    !receiptHash ||
    !authorizedKeysHash ||
    !timestampWindowHash ||
    !proofInputHash
  ) {
    return null;
  }

  return {
    proofHash,
    txHash,
    block,
    timestamp,
    anchorId,
    receiptHash,
    authorizedKeysHash,
    timestampWindowHash,
    proofInputHash,
  };
}

function loadLedgerFromDisk(): void {
  try {
    if (!fs.existsSync(LEDGER_FILE)) return;
    const raw = fs.readFileSync(LEDGER_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AnchorLedgerData>;
    const anchors = Array.isArray(parsed.anchors) ? parsed.anchors : [];
    anchorLedger.anchors = anchors
      .map((entry) => normalizeLedgerEntry(entry))
      .filter((entry): entry is AnchorLedgerEntry => entry !== null);
    anchorLedger.updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
    logger.info({ anchors: anchorLedger.anchors.length }, 'Aztec anchor ledger loaded');
  } catch (err) {
    logger.warn({ err }, 'Failed to load Aztec anchor ledger, starting fresh');
  }
}

function flushLedgerToDisk(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(anchorLedger, null, 2), 'utf-8');
  } catch (err) {
    logger.warn({ err }, 'Failed to flush Aztec anchor ledger');
  }
}

function scheduleLedgerFlush(): void {
  if (flushPending) return;
  flushPending = true;
  setTimeout(() => {
    flushPending = false;
    flushLedgerToDisk();
  }, 500);
}

function upsertLedgerEntry(entry: AnchorLedgerEntry): void {
  const index = anchorLedger.anchors.findIndex((row) => row.proofHash === entry.proofHash);
  if (index >= 0) {
    anchorLedger.anchors[index] = entry;
  } else {
    anchorLedger.anchors.push(entry);
  }

  if (anchorLedger.anchors.length > MAX_LEDGER_ENTRIES) {
    anchorLedger.anchors = anchorLedger.anchors
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      .slice(-MAX_LEDGER_ENTRIES);
  }

  anchorLedger.updatedAt = new Date().toISOString();
  scheduleLedgerFlush();
}

function toVerifyMeta(anchor: AnchorMeta): { block: number; timestamp: string; anchorId: string } {
  return {
    block: anchor.block,
    timestamp: anchor.timestamp,
    anchorId: anchor.anchorId,
  };
}

function listAnchors(query: RegistryQuery): AnchorMeta[] {
  const sinceMs = query.since ? Date.parse(query.since) : null;

  let anchors = anchorLedger.anchors.slice();
  if (sinceMs !== null && Number.isFinite(sinceMs)) {
    anchors = anchors.filter((anchor) => Date.parse(anchor.timestamp) >= sinceMs);
  }

  return anchors
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .map((anchor) => ({
      proofHash: anchor.proofHash,
      txHash: anchor.txHash,
      block: anchor.block,
      timestamp: anchor.timestamp,
      anchorId: anchor.anchorId,
    }));
}

function mergeAnchors(localAnchors: AnchorMeta[], remoteAnchors: AnchorMeta[]): AnchorMeta[] {
  const byProofHash = new Map<string, AnchorMeta>();

  for (const anchor of localAnchors) {
    byProofHash.set(anchor.proofHash, anchor);
  }
  for (const anchor of remoteAnchors) {
    byProofHash.set(anchor.proofHash, anchor);
  }

  return Array.from(byProofHash.values()).sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
  );
}

loadLedgerFromDisk();

router.post(
  '/aztec/aar/anchor',
  createX402Gate({ price: '$0.05', description: 'Anchor signed AAR proof to Aztec testnet (0.05 USDC)' }),
  async (req: Request, res: Response) => {
    const parsed = anchorRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid_payload',
        message: parsed.error.issues[0]?.message || 'Invalid anchor payload',
      });
      return;
    }

    const anchorRequest: AnchorRequest = parsed.data;
    let proofInputs;

    try {
      proofInputs = buildProofInputs(anchorRequest);
    } catch (error) {
      res.status(400).json({
        error: 'invalid_payload',
        message: error instanceof Error ? error.message : 'Unable to build proof inputs',
      });
      return;
    }

    try {
      const result = await aztecClient.anchorProof(anchorRequest);
      const ledgerEntry: AnchorLedgerEntry = {
        proofHash: result.proofHash,
        txHash: result.txHash,
        block: result.aztecBlock,
        timestamp: result.timestamp,
        anchorId: result.anchorId,
        receiptHash: result.receiptHash || proofInputs.receiptHash,
        authorizedKeysHash: result.authorizedKeysHash || proofInputs.authorizedKeysHash,
        timestampWindowHash: result.timestampWindowHash || proofInputs.timestampWindowHash,
        proofInputHash: result.proofInputHash || proofInputs.proofInputHash,
      };

      upsertLedgerEntry(ledgerEntry);

      res.json({
        proofHash: result.proofHash,
        txHash: result.txHash,
        aztecBlock: result.aztecBlock,
        anchorId: result.anchorId,
        timestamp: result.timestamp,
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to anchor AAR proof to Aztec');
      res.status(500).json({
        error: 'aztec_anchor_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.get('/aztec/aar/verify/:proofHash', async (req: Request, res: Response) => {
  const proofHash = normalizeProofHash(req.params.proofHash);
  if (!proofHash) {
    res.status(400).json({
      error: 'invalid_proof_hash',
      message: 'proofHash must be a 32-byte hex string',
    });
    return;
  }

  const localAnchor = anchorLedger.anchors.find((anchor) => anchor.proofHash === proofHash);
  if (localAnchor) {
    res.json({
      verified: true,
      anchorMeta: toVerifyMeta(localAnchor),
    });
    return;
  }

  try {
    const chainResult = await aztecClient.verifyProof(proofHash);
    if (chainResult.verified && chainResult.anchorMeta) {
      res.json({
        verified: true,
        anchorMeta: chainResult.anchorMeta,
      });
      return;
    }
  } catch (error) {
    logger.warn({ err: error, proofHash }, 'Aztec chain verification query failed');
  }

  res.json({
    verified: false,
    anchorMeta: null,
  });
});

router.get(
  '/aztec/aar/registry',
  createX402Gate({ price: '$0.01', description: 'Paginated Aztec AAR anchor registry (0.01 USDC)' }),
  async (req: Request, res: Response) => {
    const limit = parseLimit(req.query.limit);
    if (limit === null) {
      res.status(400).json({
        error: 'invalid_query',
        message: 'limit must be an integer between 1 and 100',
      });
      return;
    }

    const offset = parseOffset(req.query.offset);
    if (offset === null) {
      res.status(400).json({
        error: 'invalid_query',
        message: 'offset must be an integer greater than or equal to 0',
      });
      return;
    }

    const sinceRaw = req.query.since;
    const since = parseSince(sinceRaw);
    if (sinceRaw !== undefined && since === null) {
      res.status(400).json({
        error: 'invalid_query',
        message: 'since must be a valid ISO timestamp',
      });
      return;
    }

    const includeChain = parseChainFlag(req.query.chain);
    const query: RegistryQuery = {
      limit,
      offset,
      ...(since ? { since } : {}),
    };

    try {
      const localAnchors = listAnchors({ limit: 10_000, offset: 0, ...(since ? { since } : {}) });
      let allAnchors = localAnchors;

      if (includeChain) {
        try {
          const remote = await aztecClient.getAnchors({
            limit: Math.max(limit + offset, 200),
            offset: 0,
            ...(since ? { since } : {}),
          });
          allAnchors = mergeAnchors(localAnchors, remote.anchors);
        } catch (error) {
          logger.warn({ err: error }, 'Failed to query Aztec chain anchors, returning local registry');
        }
      }

      const total = allAnchors.length;
      const anchors = allAnchors.slice(query.offset, query.offset + query.limit);

      res.json({
        total,
        anchors,
        hasMore: query.offset + query.limit < total,
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch Aztec anchor registry');
      res.status(500).json({
        error: 'aztec_registry_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
