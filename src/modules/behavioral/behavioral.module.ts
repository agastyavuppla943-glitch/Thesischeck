import { Module } from '@nitrostack/core';
import { BehavioralTools } from './behavioral.tools.js';

@Module({
  name: 'behavioral',
  description: "Tracks and analyzes the investor's trade-decision history for impulsive behavioral patterns",
  controllers: [BehavioralTools]
})
export class BehavioralModule {}
