/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parseExperimentalConfigValue } from '../../../common/experimental_features';
import { API_VERSIONS } from '../../../common/constants';
import type { FleetAuthzRouter } from '../../services/security';
import { SETTINGS_API_ROUTES } from '../../constants';
import {
  PutSettingsRequestSchema,
  GetSettingsRequestSchema,
  GetEnrollmentSettingsRequestSchema,
  GetSpaceSettingsRequestSchema,
  PutSpaceSettingsRequestSchema,
  SpaceSettingsResponseSchema,
  SettingsResponseSchema,
  GetEnrollmentSettingsResponseSchema,
} from '../../types';
import type { FleetConfigType } from '../../config';
import { FLEET_API_PRIVILEGES } from '../../constants/api_privileges';
import { genericErrorResponse, notFoundResponse } from '../schema/errors';

import { getEnrollmentSettingsHandler } from './enrollment_settings_handler';

import {
  getSettingsHandler,
  getSpaceSettingsHandler,
  putSettingsHandler,
  putSpaceSettingsHandler,
} from './settings_handler';

export const registerRoutes = (router: FleetAuthzRouter, config: FleetConfigType) => {
  const experimentalFeatures = parseExperimentalConfigValue(config.enableExperimental);
  if (experimentalFeatures.useSpaceAwareness) {
    router.versioned
      // @ts-ignore https://github.com/elastic/kibana/issues/203170
      .get({
        path: SETTINGS_API_ROUTES.SPACE_INFO_PATTERN,
        fleetAuthz: (authz) => {
          // TODO move to kibana authz https://github.com/elastic/kibana/issues/203170
          return (
            authz.fleet.readSettings ||
            authz.integrations.writeIntegrationPolicies ||
            authz.fleet.allAgentPolicies
          );
        },
        summary: `Get space settings`,
        options: {
          availability: {
            since: '9.1.0',
            stability: 'stable',
          },
        },
      })
      .addVersion(
        {
          version: API_VERSIONS.public.v1,
          validate: {
            request: GetSpaceSettingsRequestSchema,
            response: {
              200: {
                body: () => SpaceSettingsResponseSchema,
              },
            },
          },
        },
        getSpaceSettingsHandler
      );

    router.versioned
      .put({
        path: SETTINGS_API_ROUTES.SPACE_UPDATE_PATTERN,
        security: {
          authz: {
            requiredPrivileges: [FLEET_API_PRIVILEGES.SETTINGS.ALL],
          },
        },
        summary: `Create space settings`,
        options: {
          availability: {
            since: '9.1.0',
            stability: 'stable',
          },
        },
      })
      .addVersion(
        {
          version: API_VERSIONS.public.v1,
          validate: {
            request: PutSpaceSettingsRequestSchema,
            response: {
              200: {
                body: () => SpaceSettingsResponseSchema,
              },
            },
          },
        },
        putSpaceSettingsHandler
      );
  }

  router.versioned
    .get({
      path: SETTINGS_API_ROUTES.INFO_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [FLEET_API_PRIVILEGES.SETTINGS.READ],
        },
      },
      summary: `Get settings`,
      options: {
        tags: ['oas-tag:Fleet internals'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: GetSettingsRequestSchema,
          response: {
            200: {
              body: () => SettingsResponseSchema,
            },
            400: {
              body: genericErrorResponse,
            },
            404: {
              body: notFoundResponse,
            },
          },
        },
      },
      getSettingsHandler
    );
  router.versioned
    .put({
      path: SETTINGS_API_ROUTES.UPDATE_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [FLEET_API_PRIVILEGES.SETTINGS.ALL],
        },
      },
      summary: `Update settings`,
      options: {
        tags: ['oas-tag:Fleet internals'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: PutSettingsRequestSchema,
          response: {
            200: {
              body: () => SettingsResponseSchema,
            },
            400: {
              body: genericErrorResponse,
            },
            404: {
              body: notFoundResponse,
            },
          },
        },
      },
      putSettingsHandler
    );
  router.versioned
    .get({
      path: SETTINGS_API_ROUTES.ENROLLMENT_INFO_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [FLEET_API_PRIVILEGES.AGENTS.ALL],
        },
      },
      summary: `Get enrollment settings`,
      options: {
        tags: ['oas-tag:Fleet internals'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: GetEnrollmentSettingsRequestSchema,
          response: {
            200: {
              body: () => GetEnrollmentSettingsResponseSchema,
            },
            400: {
              body: genericErrorResponse,
            },
          },
        },
      },
      getEnrollmentSettingsHandler
    );
};
