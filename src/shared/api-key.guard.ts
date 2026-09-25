import { ApiKeyModule, type ExecutionContext, type Guard } from '@nitrostack/core';

let configured = false;

/** One-time ApiKeyModule setup (hashed keys from API_KEY_* env vars). */
export function configureApiKeyModule(): void {
  if (configured) return;
  ApiKeyModule.forRoot({
    keysEnvPrefix: 'API_KEY',
    headerName: 'x-api-key',
    hashed: true
  });
  configured = true;
}

/** Validates x-api-key / apiKey metadata and sets context.auth on success. */
export async function validateApiKeyFromContext(context: ExecutionContext): Promise<boolean> {
  const apiKey = context.metadata?.['x-api-key'] || context.metadata?.apiKey;
  if (!apiKey) {
    context.logger.warn('Blocked unauthenticated call: missing API Key header/metadata', {
      toolName: context.toolName ?? 'unknown_tool',
      requestId: context.requestId
    });
    return false;
  }

  const isValid = await ApiKeyModule.validate(apiKey as string);
  if (!isValid) {
    context.logger.warn('Blocked unauthorized call: invalid API Key supplied', {
      toolName: context.toolName ?? 'unknown_tool',
      requestId: context.requestId
    });
    return false;
  }

  context.auth = {
    subject: `apikey_${(apiKey as string).substring(0, 10)}`,
    scopes: ['*']
  };
  return true;
}

/**
 * ApiKeyGuard — always requires a valid API key.
 * Use on tools that must be authenticated regardless of THESISCHECK_REQUIRE_AUTH.
 */
export class ApiKeyGuard implements Guard {
  constructor() {
    configureApiKeyModule();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    return validateApiKeyFromContext(context);
  }
}
