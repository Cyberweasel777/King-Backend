import fs from 'node:fs/promises';
import path from 'node:path';
import logger from '../../config/logger';
import type { AgorionProvider } from './crawler';

const REGISTRY_FILE_NAME = 'agorion-registry.json';
const REGISTRY_PATH_CANDIDATES = [
  path.join('/data', REGISTRY_FILE_NAME),
  path.join(process.cwd(), 'data', REGISTRY_FILE_NAME),
];

let loaded = false;
let activeRegistryPath: string | null = null;
const providers = new Map<string, AgorionProvider>();

function normalizeProvider(input: AgorionProvider): AgorionProvider {
  const nowIso = new Date().toISOString();

  return {
    ...input,
    id: input.id.trim(),
    name: input.name.trim(),
    url: input.url.trim(),
    description: (input.description || '').trim(),
    capabilities: Array.from(new Set((input.capabilities || []).map((cap) => cap.trim().toLowerCase()).filter(Boolean))),
    endpoints: Array.isArray(input.endpoints)
      ? input.endpoints.map((endpoint) => ({
          path: endpoint.path,
          method: endpoint.method.toUpperCase(),
          description: endpoint.description || '',
        }))
      : [],
    lastCrawled: input.lastCrawled || nowIso,
    lastHealthy: input.lastHealthy || null,
    responseTimeMs: typeof input.responseTimeMs === 'number' ? input.responseTimeMs : null,
    healthScore: Math.max(0, Math.min(100, Math.round(input.healthScore))),
    manifestUrl: input.manifestUrl || null,
    openapiUrl: input.openapiUrl || null,
  };
}

async function ensureRegistryLoaded(): Promise<void> {
  if (loaded) return;
  await loadRegistry();
}

async function resolveReadablePath(): Promise<string | null> {
  for (const filePath of REGISTRY_PATH_CANDIDATES) {
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      continue;
    }
  }

  return null;
}

async function resolveWritablePath(): Promise<string> {
  for (const filePath of REGISTRY_PATH_CANDIDATES) {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      if (!activeRegistryPath) {
        try {
          await fs.access(filePath);
        } catch {
          await fs.writeFile(filePath, '[]', 'utf-8');
        }
      }
      return filePath;
    } catch {
      continue;
    }
  }

  throw new Error('Unable to resolve writable path for Agorion registry');
}

export async function loadRegistry(): Promise<AgorionProvider[]> {
  const readablePath = await resolveReadablePath();
  activeRegistryPath = readablePath;
  providers.clear();

  if (!readablePath) {
    loaded = true;
    return [];
  }

  try {
    const raw = await fs.readFile(readablePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const provider = normalizeProvider(item as AgorionProvider);
        if (!provider.id || !provider.url) continue;
        providers.set(provider.id, provider);
      }
    }
  } catch (error) {
    logger.warn({ err: error, path: readablePath }, 'Failed to load Agorion registry; starting empty');
    providers.clear();
  }

  loaded = true;
  return Array.from(providers.values());
}

export async function saveRegistry(): Promise<void> {
  await ensureRegistryLoaded();

  const filePath = activeRegistryPath || await resolveWritablePath();
  activeRegistryPath = filePath;

  const snapshot = Array.from(providers.values()).sort((a, b) => b.healthScore - a.healthScore || a.name.localeCompare(b.name));

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
}

export async function upsert(provider: AgorionProvider): Promise<AgorionProvider> {
  await ensureRegistryLoaded();

  const normalized = normalizeProvider(provider);
  if (!normalized.id) {
    throw new Error('Cannot upsert Agorion provider without id');
  }

  providers.set(normalized.id, normalized);
  return normalized;
}

export async function getAll(): Promise<AgorionProvider[]> {
  await ensureRegistryLoaded();
  return Array.from(providers.values()).sort((a, b) => b.healthScore - a.healthScore || a.name.localeCompare(b.name));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

export async function search(query: string): Promise<AgorionProvider[]> {
  await ensureRegistryLoaded();

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return getAll();
  }

  const queryTokens = tokenize(normalizedQuery);

  const ranked = Array.from(providers.values())
    .map((provider) => {
      const name = provider.name.toLowerCase();
      const description = provider.description.toLowerCase();
      const capabilities = provider.capabilities.map((capability) => capability.toLowerCase());

      let score = 0;

      if (name.includes(normalizedQuery)) score += 40;
      if (description.includes(normalizedQuery)) score += 20;
      if (capabilities.some((capability) => capability.includes(normalizedQuery))) score += 35;

      for (const token of queryTokens) {
        if (name.includes(token)) score += 12;
        if (description.includes(token)) score += 4;
        if (capabilities.some((capability) => capability.includes(token))) score += 10;
      }

      score += Math.round(provider.healthScore / 20);
      return { provider, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.provider.healthScore - a.provider.healthScore || a.provider.name.localeCompare(b.provider.name))
    .map((entry) => entry.provider);

  return ranked;
}

export async function getHealthy(): Promise<AgorionProvider[]> {
  await ensureRegistryLoaded();

  return Array.from(providers.values())
    .filter((provider) => provider.healthScore > 50)
    .sort((a, b) => b.healthScore - a.healthScore || a.name.localeCompare(b.name));
}

export async function purgeUnhealthy(filter: (p: AgorionProvider) => boolean): Promise<number> {
  await ensureRegistryLoaded();

  let purged = 0;
  for (const [id, provider] of providers.entries()) {
    if (filter(provider)) {
      providers.delete(id);
      purged++;
    }
  }

  if (purged > 0) {
    await saveRegistry();
  }

  return purged;
}

export async function discover(capability: string): Promise<AgorionProvider[]> {
  await ensureRegistryLoaded();

  const wanted = capability.trim().toLowerCase();
  if (!wanted) return getHealthy();

  const matched = Array.from(providers.values())
    .filter((provider) => {
      if (provider.capabilities.some((item) => item.toLowerCase().includes(wanted))) return true;
      return provider.description.toLowerCase().includes(wanted) || provider.name.toLowerCase().includes(wanted);
    })
    .sort((a, b) => b.healthScore - a.healthScore || a.name.localeCompare(b.name));

  return matched;
}
