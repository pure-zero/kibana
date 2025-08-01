/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { RunAgentFn } from '@kbn/onechat-server';
import type { AgentClient } from './client';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AgentsServiceSetup {}

export interface AgentsServiceStart {
  execute: RunAgentFn;
  getScopedClient: (opts: { request: KibanaRequest }) => Promise<AgentClient>;
}
