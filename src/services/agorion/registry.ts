import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import logger from '../../config/logger';

const DATA_DIR = process.env.DATA_DIR || '/data';
const REGISTRY_FILE = path.join(DATA_DIR, 'agorion-registry.json');
const FETCH_TIMEOUT_MS = 10_000;

const serviceSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    endpoint: z.string().optional(),
    capabilities: z.array(z.string().min(1)).default([]),
    auth: z
      .object({
        type: z.string().optional(),
        price: z.union([z.string(), z.number()]).optional(),
        network: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const manifestInputSchema = z
  .object({
    schemaVersion: z.string().optional(),
    schema_version: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    services: z.array(serviceSchema).default([]),
  })
  .passthrough();

export type AgentService = z.infer<typeof serviceSchema>;

export interface AgentServicesManifest extends Omit<z.infer<typeof manifestInputSchema>, 'schema_version' | 'schemaVersion'> {
  schemaVersion: 'agent-services/v1';
}

export interface RegistryProvider {
  url: string;
  contact?: string;
  manifest: AgentServicesManifest;
  registeredAt: string;
  lastCrawledAt: string;
  status: 'active' | 'unreachable';
}

export interface AgorionRegistry {
  providers: RegistryProvider[];
  updatedAt: string;
}

export interface DiscoverFilters {
  capability?: string;
  maxPrice?: number;
  network?: string;
  limit?: number;
}

export interface DiscoveredService {
  providerUrl: string;
  providerContact?: string;
  providerStatus: RegistryProvider['status'];
  providerLastCrawledAt: string;
  parsedPrice: number | null;
  service: AgentService;
}

interface CrawlSummary {
  totalProviders: number;
  refreshedProviders: number;
  unreachableProviders: number;
  updatedAt: string;
}

function getEmptyRegistry(): AgorionRegistry {
  return {
    providers: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeProviderUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Provider URL is required');

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Provider URL must use http or https');
  }

  parsed.search = '';
  parsed.hash = '';
  parsed.pathname = '/';
  return parsed.toString().replace(/\/$/, '');
}

function validateManifest(rawManifest: unknown): AgentServicesManifest {
  const parsed = manifestInputSchema.parse(rawManifest);
  const schemaVersion = parsed.schemaVersion ?? parsed.schema_version;
  if (schemaVersion !== 'agent-services/v1') {
    throw new Error('Manifest schemaVersion must be "agent-services/v1"');
  }

  const { schema_version: _unused, schemaVersion: _unused2, ...rest } = parsed;
  return {
    ...rest,
    schemaVersion: 'agent-services/v1',
  };
}

async function fetchManifest(providerUrl: string): Promise<AgentServicesManifest> {
  const manifestUrl = new URL('/.well-known/agent-services.json', `${providerUrl}/`).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(manifestUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: HTTP ${response.status}`);
    }

    let rawManifest: unknown;
    try {
      rawManifest = await response.json();
    } catch (_error) {
      throw new Error('Provider manifest is not valid JSON');
    }

    return validateManifest(rawManifest);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Manifest fetch timed out after 10s');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parsePrice(price: unknown): number | null {
  if (typeof price === 'number') {
    return Number.isFinite(price) ? price : null;
  }

  if (typeof price !== 'string') {
    return null;
  }

  const normalized = price.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'free') return 0;

  const match = normalized.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesCapability(service: AgentService, capability?: string): boolean {
  if (!capability) return true;
  const normalized = capability.trim().toLowerCase();
  if (!normalized) return true;
  return service.capabilities.some((item) => item.toLowerCase() === normalized);
}

function matchesNetwork(service: AgentService, network?: string): boolean {
  if (!network) return true;
  const normalized = network.trim().toLowerCase();
  if (!normalized) return true;
  const serviceNetwork = service.auth?.network;
  if (typeof serviceNetwork !== 'string') return false;
  return serviceNetwork.trim().toLowerCase() === normalized;
}

function matchesMaxPrice(service: AgentService, maxPrice?: number): boolean {
  if (maxPrice === undefined) return true;
  const price = parsePrice(service.auth?.price);
  if (price === null) return false;
  return price <= maxPrice;
}

function validateRegistry(rawRegistry: unknown): AgorionRegistry {
  if (!rawRegistry || typeof rawRegistry !== 'object') {
    return getEmptyRegistry();
  }

  const input = rawRegistry as Record<string, unknown>;
  const providers = Array.isArray(input.providers) ? input.providers : [];
  const normalizedProviders: RegistryProvider[] = [];

  for (const provider of providers) {
    if (!provider || typeof provider !== 'object') continue;
    const row = provider as Record<string, unknown>;

    if (typeof row.url !== 'string' || !row.url.trim()) continue;

    let manifest: AgentServicesManifest;
    try {
      manifest = validateManifest(row.manifest);
    } catch (_error) {
      continue;
    }

    normalizedProviders.push({
      url: row.url,
      contact: typeof row.contact === 'string' ? row.contact : undefined,
      manifest,
      registeredAt:
        typeof row.registeredAt === 'string' ? row.registeredAt : new Date().toISOString(),
      lastCrawledAt:
        typeof row.lastCrawledAt === 'string' ? row.lastCrawledAt : new Date().toISOString(),
      status: row.status === 'unreachable' ? 'unreachable' : 'active',
    });
  }

  return {
    providers: normalizedProviders,
    updatedAt:
      typeof input.updatedAt === 'string' ? input.updatedAt : new Date().toISOString(),
  };
}

export async function loadRegistry(): Promise<AgorionRegistry> {
  try {
    const raw = await readFile(REGISTRY_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return validateRegistry(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return getEmptyRegistry();
    }

    logger.warn({ err: error }, 'Failed to load Agorion registry, using empty state');
    return getEmptyRegistry();
  }
}

export async function saveRegistry(registry: AgorionRegistry): Promise<void> {
  const payload: AgorionRegistry = {
    providers: registry.providers,
    updatedAt: new Date().toISOString(),
  };

  await mkdir(path.dirname(REGISTRY_FILE), { recursive: true });
  await writeFile(REGISTRY_FILE, JSON.stringify(payload, null, 2), 'utf-8');
}

export async function registerProvider(url: string, contact?: string): Promise<RegistryProvider> {
  const normalizedUrl = normalizeProviderUrl(url);
  const manifest = await fetchManifest(normalizedUrl);
  const now = new Date().toISOString();
  const registry = await loadRegistry();
  const existingIndex = registry.providers.findIndex((provider) => provider.url === normalizedUrl);

  const existing = existingIndex >= 0 ? registry.providers[existingIndex] : null;
  const provider: RegistryProvider = {
    url: normalizedUrl,
    contact: contact ?? existing?.contact,
    manifest,
    registeredAt: existing?.registeredAt ?? now,
    lastCrawledAt: now,
    status: 'active',
  };

  if (existingIndex >= 0) {
    registry.providers[existingIndex] = provider;
  } else {
    registry.providers.push(provider);
  }

  await saveRegistry(registry);
  logger.info({ providerUrl: normalizedUrl }, 'Agorion provider registered');
  return provider;
}

export async function discoverServices(filters: DiscoverFilters): Promise<DiscoveredService[]> {
  const registry = await loadRegistry();
  const limit = Math.max(1, Math.min(filters.limit ?? 25, 200));
  const out: DiscoveredService[] = [];

  for (const provider of registry.providers) {
    for (const service of provider.manifest.services) {
      if (!matchesCapability(service, filters.capability)) continue;
      if (!matchesNetwork(service, filters.network)) continue;
      if (!matchesMaxPrice(service, filters.maxPrice)) continue;

      out.push({
        providerUrl: provider.url,
        providerContact: provider.contact,
        providerStatus: provider.status,
        providerLastCrawledAt: provider.lastCrawledAt,
        parsedPrice: parsePrice(service.auth?.price),
        service,
      });

      if (out.length >= limit) {
        return out;
      }
    }
  }

  return out;
}

export async function crawlAll(): Promise<CrawlSummary> {
  const registry = await loadRegistry();
  const now = new Date().toISOString();
  let refreshedProviders = 0;
  let unreachableProviders = 0;

  await Promise.all(
    registry.providers.map(async (provider) => {
      try {
        const manifest = await fetchManifest(provider.url);
        provider.manifest = manifest;
        provider.status = 'active';
        provider.lastCrawledAt = now;
        refreshedProviders += 1;
      } catch (error) {
        provider.status = 'unreachable';
        provider.lastCrawledAt = now;
        unreachableProviders += 1;
        logger.warn({ err: error, providerUrl: provider.url }, 'Agorion provider crawl failed');
      }
    })
  );

  await saveRegistry(registry);

  return {
    totalProviders: registry.providers.length,
    refreshedProviders,
    unreachableProviders,
    updatedAt: now,
  };
}

export async function getStats(): Promise<{
  totalProviders: number;
  totalServices: number;
  servicesByCapability: Record<string, number>;
  servicesByNetwork: Record<string, number>;
}> {
  const registry = await loadRegistry();
  const servicesByCapability: Record<string, number> = {};
  const servicesByNetwork: Record<string, number> = {};
  let totalServices = 0;

  for (const provider of registry.providers) {
    for (const service of provider.manifest.services) {
      totalServices += 1;

      for (const capability of service.capabilities) {
        servicesByCapability[capability] = (servicesByCapability[capability] ?? 0) + 1;
      }

      const network = typeof service.auth?.network === 'string' ? service.auth.network : null;
      if (network) {
        servicesByNetwork[network] = (servicesByNetwork[network] ?? 0) + 1;
      }
    }
  }

  return {
    totalProviders: registry.providers.length,
    totalServices,
    servicesByCapability,
    servicesByNetwork,
  };
}

export function getOwnManifest(baseUrl: string): AgentServicesManifest {
  return {
    schemaVersion: 'agent-services/v1',
    name: 'BotIndex',
    description:
      'AI-native signal intelligence API for sports, crypto, commerce, and market structure.',
    services: [
      {
        id: 'botindex-signals-discovery',
        name: 'BotIndex Discovery',
        description: 'Discover all BotIndex signal endpoints and pricing.',
        endpoint: `${baseUrl}/api/botindex/v1/`,
        capabilities: ['discovery', 'api_catalog'],
        auth: { type: 'x402', price: 'FREE', network: 'base' },
      },
      {
        id: 'botindex-sports-odds',
        name: 'Sports Odds',
        description: 'Live sports odds across NFL, NBA, UFC, NHL.',
        endpoint: `${baseUrl}/api/botindex/v1/sports/odds`,
        capabilities: ['sports_odds', 'sports_intelligence'],
        auth: { type: 'x402', price: '$0.02', network: 'base' },
      },
      {
        id: 'botindex-crypto-tokens',
        name: 'Crypto Token Universe',
        description: 'Token universe with correlation-ready pricing data.',
        endpoint: `${baseUrl}/api/botindex/v1/crypto/tokens`,
        capabilities: ['crypto_data', 'correlation_analysis'],
        auth: { type: 'x402', price: '$0.02', network: 'base' },
      },
      {
        id: 'botindex-token-graduation',
        name: 'Token Graduation Signals',
        description: 'Catapult and Genesis graduation/launch signals.',
        endpoint: `${baseUrl}/api/botindex/v1/crypto/graduating`,
        capabilities: ['token_graduation', 'launch_monitoring'],
        auth: { type: 'x402', price: '$0.02', network: 'base' },
      },
      {
        id: 'botindex-commerce-compare',
        name: 'Agentic Commerce Compare',
        description: 'Compare offers across ACP, UCP, and x402 protocols.',
        endpoint: `${baseUrl}/api/botindex/v1/commerce/compare`,
        capabilities: ['agentic_commerce', 'price_comparison'],
        auth: { type: 'x402', price: '$0.05', network: 'base' },
      },
      {
        id: 'botindex-hyperliquid-whales',
        name: 'Hyperliquid Whale Alerts',
        description: 'Whale positioning and large trade flow intelligence.',
        endpoint: `${baseUrl}/api/botindex/hyperliquid/whale-alerts`,
        capabilities: ['whale_alerts', 'market_structure'],
        auth: { type: 'x402', price: 'FREE', network: 'base' },
      },
    ],
  };
}

