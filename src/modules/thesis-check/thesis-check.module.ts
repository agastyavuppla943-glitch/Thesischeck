import { Module } from '@nitrostack/core';
import { ThesisCheckTools } from './thesis-check.tools.js';
import { ThesisCheckResources } from './thesis-check.resources.js';

@Module({
  name: 'thesis-check',
  description:
    'Core advisory agent: evaluates a trade thesis against behavioral history, market data, and portfolio risk before the trade is confirmed',
  controllers: [ThesisCheckTools, ThesisCheckResources]
})
export class ThesisCheckModule {}
