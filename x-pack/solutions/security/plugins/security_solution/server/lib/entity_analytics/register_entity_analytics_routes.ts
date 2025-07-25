/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { registerAssetCriticalityRoutes } from './asset_criticality/routes';
import { registerRiskScoreRoutes } from './risk_score/routes';
import { registerRiskEngineRoutes } from './risk_engine/routes';
import type { EntityAnalyticsRoutesDeps } from './types';
import { registerEntityStoreRoutes } from './entity_store/routes';
import { registerPrivilegeMonitoringRoutes } from './privilege_monitoring/routes/register_privilege_monitoring_routes';
import { registerMigrationsRoutes } from './migrations/routes';

export const registerEntityAnalyticsRoutes = (routeDeps: EntityAnalyticsRoutesDeps) => {
  registerAssetCriticalityRoutes(routeDeps);
  registerRiskScoreRoutes(routeDeps);
  registerRiskEngineRoutes(routeDeps);
  registerMigrationsRoutes(routeDeps);
  if (!routeDeps.config.experimentalFeatures.entityStoreDisabled) {
    registerEntityStoreRoutes(routeDeps);
  }

  if (!routeDeps.config.experimentalFeatures.privilegedUserMonitoringDisabled) {
    registerPrivilegeMonitoringRoutes(routeDeps);
  }
};
