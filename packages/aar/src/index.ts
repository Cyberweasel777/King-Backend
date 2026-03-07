// Core types
export type {
  AARReceipt,
  Action,
  ActionStatus,
  AgentIdentity,
  Cost,
  CreateReceiptOptions,
  HashAlgorithm,
  HashObject,
  KeyPair,
  Principal,
  PrincipalType,
  Scope,
  Signature,
  UnsignedReceipt,
  UnsignedSignature,
  VerifyResult,
  WellKnownAARConfiguration,
} from './types';

// Canonicalization
export { canonicalize, canonicalizeForSigning } from './canonicalize';

// Encoding
export {
  decodeBase64,
  decodeBase64Url,
  encodeBase64,
  encodeBase64Url,
  utf8Decode,
  utf8Encode,
} from './encoding';

// Hashing
export { hashInput, hashOutput, sha256 } from './hash';

// Key management & signing
export { generateKeyPair, loadSecretKey, publicKeyFromSecret, signReceipt } from './sign';

// Verification
export { verifyReceipt } from './verify';

// Receipt builder
export { createReceipt, encodeReceiptHeader, signAndFinalize } from './receipt';

// Discovery
export { buildWellKnownConfig, wellKnownHandler } from './discovery';
export type { DiscoveryOptions } from './discovery';

// Compat
export { aarToVerifiableIntent, verifiableIntentToAAR } from './compat/mastercard-vi';
export type { VerifiableIntentRecord } from './compat/mastercard-vi';
