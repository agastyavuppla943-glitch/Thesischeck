import { Module } from '@nitrostack/core';
import { PortfolioTools } from './portfolio.tools.js';

@Module({
  name: 'portfolio',
  description: 'Tracks holdings/cash and computes concentration-risk impact of proposed trades',
  controllers: [PortfolioTools]
})
export class PortfolioModule {}
