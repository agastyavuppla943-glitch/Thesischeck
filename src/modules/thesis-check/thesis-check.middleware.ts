import { randomUUID } from 'crypto';
import type { ExecutionContext, MiddlewareInterface } from '@nitrostack/core';
import { appendToCollection } from '../../shared/storage.js';

export interface AuditLogEntry {
  id: string;
  toolName: string;
  requestId: string;
  startedAt: string;
  completedAt: string;
  status: 'success' | 'error';
  error?: string;
}

const AUDIT_COLLECTION = 'audit_log';

/**
 * AuditLogMiddleware
 *
 * Wraps every advisory-tool call with a persisted audit record — this is
 * what backs the `thesischeck://audit-log` resource, so the evidence trail
 * ThesisCheck shows the investor is independently verifiable rather than a
 * black box. `context.toolName` is typed optional in ExecutionContext, so
 * it's always given a fallback here rather than assumed present.
 */
export class AuditLogMiddleware implements MiddlewareInterface {
  async use(context: ExecutionContext, next: () => Promise<unknown>): Promise<unknown> {
    const toolName = context.toolName ?? 'unknown_tool';
    const startedAt = new Date().toISOString();
    const id = randomUUID();

    try {
      const result = await next();
      appendToCollection<AuditLogEntry>(AUDIT_COLLECTION, {
        id,
        toolName,
        requestId: context.requestId,
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'success'
      });
      return result;
    } catch (error) {
      appendToCollection<AuditLogEntry>(AUDIT_COLLECTION, {
        id,
        toolName,
        requestId: context.requestId,
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}
