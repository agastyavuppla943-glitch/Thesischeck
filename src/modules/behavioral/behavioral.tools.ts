import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';
import { BehavioralService } from './behavioral.service.js';

const getTradeHistorySchema = z
  .object({
    ticker: z.string().optional().describe('Optional ticker filter, e.g. AAPL')
  })
  .strict();

const logTradeOutcomeSchema = z
  .object({
    decisionId: z.string().describe('The id returned when the trade decision was originally logged'),
    notes: z.string().describe('Free-text notes on the outcome'),
    regretted: z.boolean().describe('Whether the investor regrets this trade in hindsight')
  })
  .strict();

const addJournalEntrySchema = z
  .object({
    decisionId: z.string().describe('The id of the trade decision to attach this journal note to'),
    title: z.string().min(1).describe('Short title for the journal entry, e.g. "Reflecting on why I entered"'),
    body: z.string().min(1).describe('Full free-text journal note — what you learned, felt, or want to remember'),
    tags: z
      .array(z.string().min(1))
      .default([])
      .describe('Optional tags to categorise the entry, e.g. ["lesson", "fomo", "regret"]')
  })
  .strict();

const getJournalEntriesSchema = z
  .object({
    decisionId: z
      .string()
      .optional()
      .describe('Optional: filter to journal entries belonging to a specific trade decision id')
  })
  .strict();

export class BehavioralTools {
  private readonly behavioralService = new BehavioralService();

  @Tool({
    name: 'get_trade_history',
    description:
      "Get the investor's logged trade-decision history (optionally filtered by ticker), including any recorded outcomes.",
    inputSchema: getTradeHistorySchema
  })
  async getTradeHistory(rawInput: unknown, ctx: ExecutionContext) {
    // inputSchema is advertised to clients but not auto-enforced by
    // NitroStack at runtime, so validate explicitly.
    const input = getTradeHistorySchema.parse(rawInput);
    ctx.logger.info('Fetching trade history', { ticker: input.ticker });
    return { history: this.behavioralService.getHistory(input.ticker) };
  }

  @Tool({
    name: 'log_trade_outcome',
    description:
      'Record how a previously-evaluated trade turned out, including whether the investor regrets the decision. This closes the feedback loop that future behavioral analysis relies on.',
    inputSchema: logTradeOutcomeSchema
  })
  async logTradeOutcome(rawInput: unknown, ctx: ExecutionContext) {
    const input = logTradeOutcomeSchema.parse(rawInput);
    ctx.logger.info('Logging trade outcome', { decisionId: input.decisionId, regretted: input.regretted });
    const updated = this.behavioralService.recordOutcome(input.decisionId, input.notes, input.regretted);
    if (!updated) {
      throw new Error(`No trade decision found with id ${input.decisionId}`);
    }
    return updated;
  }

  @Tool({
    name: 'get_behavioral_summary',
    description:
      "Get a high-level summary of the investor's behavioral patterns: trade frequency, emotional-state breakdown, regret rate, most-traded tickers, and actionable insights.",
    inputSchema: z.object({}).strict()
  })
  async getBehavioralSummary(_input: unknown, ctx: ExecutionContext) {
    ctx.logger.info('Fetching behavioral summary');
    return this.behavioralService.getSummary();
  }

  @Tool({
    name: 'add_journal_entry',
    description:
      'Attach a rich journal note (title, body, optional tags) to a specific trade decision. Unlike log_trade_outcome — which records a single binary outcome — journal entries can be added multiple times and support freeform reflection: what you learned, what you felt, what you would do differently.',
    inputSchema: addJournalEntrySchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    }
  })
  async addJournalEntry(rawInput: unknown, ctx: ExecutionContext) {
    const input = addJournalEntrySchema.parse(rawInput);
    ctx.logger.info('Adding journal entry', { decisionId: input.decisionId, title: input.title });
    const updated = this.behavioralService.addJournalEntry(input.decisionId, input.title, input.body, input.tags);
    if (!updated) {
      throw new Error(`No trade decision found with id ${input.decisionId}`);
    }
    return updated;
  }

  @Tool({
    name: 'get_journal_entries',
    description:
      "Retrieve all journal entries across the trade history, optionally filtered to a single decision. Returns entries in reverse-chronological order with the originating ticker and action for context.",
    inputSchema: getJournalEntriesSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  })
  async getJournalEntries(rawInput: unknown, ctx: ExecutionContext) {
    const input = getJournalEntriesSchema.parse(rawInput);
    ctx.logger.info('Fetching journal entries', { decisionId: input.decisionId });
    const entries = this.behavioralService.getJournalEntries(input.decisionId);
    return { entries, total: entries.length };
  }
}
