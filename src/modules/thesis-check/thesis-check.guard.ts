import type { ExecutionContext, Guard } from '@nitrostack/core';

/**
 * AdvisoryOnlyGuard
 *
 * NitroStack guards only ever see the ExecutionContext (request metadata,
 * auth, logger) — never the raw tool input. So this guard cannot, and does
 * not try to, inspect trade arguments for "execution intent" fields; that
 * kind of input-shape validation belongs in the Zod input schema itself
 * (see the `.strict()` schema on evaluate_trade_thesis, which already
 * rejects any unexpected field outright).
 *
 * What this guard actually enforces: when THESISCHECK_REQUIRE_AUTH=true is
 * set (e.g. because this server is deployed behind ApiKeyModule/JWTModule
 * auth), every call to the advisory tool must carry a valid auth context.
 * With no auth configured (the zero-config default), the guard is a no-op
 * so the server keeps working out of the box.
 */
export class AdvisoryOnlyGuard implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authRequired = process.env.THESISCHECK_REQUIRE_AUTH === 'true';
    if (!authRequired) {
      return true;
    }

    if (!context.auth) {
      context.logger.warn('Blocked unauthenticated call to advisory-only tool', {
        toolName: context.toolName ?? 'unknown_tool',
        requestId: context.requestId
      });
      return false;
    }

    return true;
  }
}
