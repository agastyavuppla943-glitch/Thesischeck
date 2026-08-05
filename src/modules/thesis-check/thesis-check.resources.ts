import { ResourceDecorator as Resource, ExecutionContext } from '@nitrostack/core';
import { readCollection } from '../../shared/storage.js';
import type { AuditLogEntry } from './thesis-check.middleware.js';

export class ThesisCheckResources {
  @Resource({
    uri: 'thesischeck://audit-log',
    name: 'ThesisCheck Audit Log',
    description:
      'Full audit trail of every advisory-tool call (timestamps, request ids, success/failure), written by AuditLogMiddleware. Lets the investor or an auditor independently verify that ThesisCheck only ever advises and never silently does anything else.',
    mimeType: 'application/json',
    examples: {
      response: {
        entries: [
          {
            id: 'example-id',
            toolName: 'evaluate_trade_thesis',
            requestId: 'req_123',
            startedAt: '2026-07-25T10:00:00.000Z',
            completedAt: '2026-07-25T10:00:00.400Z',
            status: 'success'
          }
        ]
      }
    }
  })
  async getAuditLog(uri: string, ctx: ExecutionContext) {
    ctx.logger.info('Fetching ThesisCheck audit log');
    const entries = readCollection<AuditLogEntry>('audit_log').sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt)
    );

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ entries }, null, 2)
        }
      ]
    };
  }
}
