import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { BehavioralModule } from './modules/behavioral/behavioral.module.js';
import { MarketDataModule } from './modules/market-data/market-data.module.js';
import { PortfolioModule } from './modules/portfolio/portfolio.module.js';
import { ThesisCheckModule } from './modules/thesis-check/thesis-check.module.js';
import { SystemHealthCheck } from './health/system.health.js';

/**
 * Root Application Module
 *
 * This is the main module that bootstraps the MCP server.
 * It registers all feature modules and health checks.
 *
 * All feature modules are imported directly here (one level deep) rather
 * than nested inside an intermediate "features" module, since NitroStack
 * does not recurse into nested module imports when registering
 * controllers/providers.
 */
@McpApp({
  module: AppModule,
  server: {
    name: 'thesischeck-server',
    version: '1.0.0'
  },
  logging: {
    level: 'info'
  }
})
@Module({
  name: 'app',
  description: 'Root application module',
  imports: [
    ConfigModule.forRoot(),
    BehavioralModule,
    MarketDataModule,
    PortfolioModule,
    ThesisCheckModule
  ],
  providers: [
    // Health Checks
    SystemHealthCheck,
  ]
})
export class AppModule {}

