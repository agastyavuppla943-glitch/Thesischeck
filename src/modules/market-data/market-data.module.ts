import { Module } from '@nitrostack/core';
import { MarketDataTools } from './market-data.tools.js';

@Module({
  name: 'market-data',
  description: 'Provides company fundamentals, market sentiment, and fundamentals-vs-sentiment divergence signals',
  controllers: [MarketDataTools]
})
export class MarketDataModule {}
