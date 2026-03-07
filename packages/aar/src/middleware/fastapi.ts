/**
 * FastAPI / Python AAR Middleware Stub
 *
 * Python SDK is available separately: pip install botindex-aar
 *
 * Usage with FastAPI:
 *
 * ```python
 * from botindex_aar import AARMiddleware
 *
 * app = FastAPI()
 * app.add_middleware(AARMiddleware, agent_id="my-agent/v1", secret_key=os.environ["AAR_SECRET_KEY"])
 * ```
 *
 * The Python SDK implements the same AAR v1.0 spec:
 * - Ed25519 signing via PyNaCl
 * - JCS-SORTED-UTF8-NOWS canonicalization
 * - SHA-256 input/output hashing with base64url digests
 * - X-AAR-Receipt response header
 *
 * Spec: https://github.com/Cyberweasel777/agent-action-receipt-spec
 */

export const FASTAPI_STUB = true;
