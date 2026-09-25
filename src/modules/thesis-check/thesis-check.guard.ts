import { type ExecutionContext, type Guard } from '@nitrostack/core';
import {
  configureApiKeyModule,
  validateApiKeyFromContext
} from '../../shared/api-key.guard.js';

/**
 * AdvisoryOnlyGuard
 *
 * Enforces API Key auth when THESISCHECK_REQUIRE_AUTH=true.
 * Validates 'x-api-key' or 'apiKey' from request metadata.
 */
export class AdvisoryOnlyGuard implements Guard {
  constructor() {
    configureApiKeyModule();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authRequired = process.env.THESISCHECK_REQUIRE_AUTH === 'true';
    if (!authRequired) {
      return true;
    }
    return validateApiKeyFromContext(context);
  }
}
