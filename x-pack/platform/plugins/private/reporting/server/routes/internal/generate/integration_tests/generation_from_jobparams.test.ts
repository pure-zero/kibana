/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import rison from '@kbn/rison';
import { BehaviorSubject } from 'rxjs';
import supertest from 'supertest';

import { SetupServerReturn, setupServer } from '@kbn/core-test-helpers-test-utils';
import { coreMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { licensingMock } from '@kbn/licensing-plugin/server/mocks';
import { INTERNAL_ROUTES } from '@kbn/reporting-common';
import { PdfExportType } from '@kbn/reporting-export-types-pdf';
import { createMockConfigSchema } from '@kbn/reporting-mocks-server';
import { ExportTypesRegistry } from '@kbn/reporting-server/export_types_registry';
import { IUsageCounter } from '@kbn/usage-collection-plugin/server/usage_counters/usage_counter';

import { ReportingCore } from '../../../..';
import { ReportingStore } from '../../../../lib';
import { Report } from '../../../../lib/store';
import { reportingMock } from '../../../../mocks';
import {
  createMockPluginSetup,
  createMockPluginStart,
  createMockReportingCore,
} from '../../../../test_helpers';
import { ReportingRequestHandlerContext } from '../../../../types';
import { EventTracker } from '../../../../usage';
import { registerGenerationRoutesInternal } from '../generate_from_jobparams';

describe(`POST ${INTERNAL_ROUTES.GENERATE_PREFIX}`, () => {
  const reportingSymbol = Symbol('reporting');
  let server: SetupServerReturn['server'];
  let registerRouteHandlerContext: SetupServerReturn['registerRouteHandlerContext'];
  let usageCounter: IUsageCounter;
  let eventTracker: EventTracker;
  let createRouter: SetupServerReturn['createRouter'];
  let mockExportTypesRegistry: ExportTypesRegistry;
  let reportingCore: ReportingCore;
  let store: ReportingStore;

  const coreSetupMock = coreMock.createSetup();
  const mockConfigSchema = createMockConfigSchema({
    queue: { indexInterval: 'year', timeout: 10000, pollEnabled: true },
  });

  const mockLogger = loggingSystemMock.createLogger();
  const mockCoreSetup = coreMock.createSetup();

  const mockPdfExportType = new PdfExportType(
    mockCoreSetup,
    mockConfigSchema,
    mockLogger,
    coreMock.createPluginInitializerContext(mockConfigSchema)
  );

  beforeEach(async () => {
    ({ server, createRouter, registerRouteHandlerContext } = await setupServer(reportingSymbol));
    registerRouteHandlerContext<ReportingRequestHandlerContext, 'reporting'>(
      reportingSymbol,
      'reporting',
      () => reportingMock.createStart()
    );

    const mockSetupDeps = createMockPluginSetup({
      security: { license: { isEnabled: () => true, getFeature: () => true } },
      router: createRouter(''),
    });

    const mockStartDeps = await createMockPluginStart(
      {
        licensing: {
          ...licensingMock.createStart(),
          license$: new BehaviorSubject({
            isActive: true,
            isAvailable: true,
            type: 'gold',
            getFeature: () => true,
          }),
        },
        securityService: {
          authc: {
            apiKeys: { areAPIKeysEnabled: () => true },
            getCurrentUser: () => ({ id: '123', roles: ['superuser'], username: 'Tom Riddle' }),
          },
        },
      },
      mockConfigSchema
    );

    reportingCore = await createMockReportingCore(mockConfigSchema, mockSetupDeps, mockStartDeps);

    usageCounter = {
      domainId: 'abc123',
      incrementCounter: jest.fn(),
    };
    jest.spyOn(reportingCore, 'getUsageCounter').mockReturnValue(usageCounter);

    eventTracker = new EventTracker(coreSetupMock.analytics, 'jobId', 'exportTypeId', 'appId');
    jest.spyOn(reportingCore, 'getEventTracker').mockReturnValue(eventTracker);

    mockExportTypesRegistry = new ExportTypesRegistry();
    mockExportTypesRegistry.register(mockPdfExportType);

    store = await reportingCore.getStore();
    store.addReport = jest.fn().mockImplementation(async (opts) => {
      return new Report({
        ...opts,
        _id: 'foo',
        _index: 'foo-index',
      });
    });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('returns 400 if there are no job params', async () => {
    registerGenerationRoutesInternal(reportingCore, mockLogger);

    await server.start();

    await supertest(server.listener)
      .post(`${INTERNAL_ROUTES.GENERATE_PREFIX}/printablePdfV2`)
      .expect(400)
      .then(({ body }) =>
        expect(body.message).toMatchInlineSnapshot(
          '"A jobParams RISON string is required in the querystring or POST body"'
        )
      );
  });

  it('returns 400 if job params query is invalid', async () => {
    registerGenerationRoutesInternal(reportingCore, mockLogger);

    await server.start();

    await supertest(server.listener)
      .post(`${INTERNAL_ROUTES.GENERATE_PREFIX}/printablePdfV2?jobParams=foo:`)
      .expect(400)
      .then(({ body }) => expect(body.message).toMatchInlineSnapshot('"invalid rison: foo:"'));
  });

  it('returns 400 if job params body is invalid', async () => {
    registerGenerationRoutesInternal(reportingCore, mockLogger);

    await server.start();

    await supertest(server.listener)
      .post(`${INTERNAL_ROUTES.GENERATE_PREFIX}/printablePdfV2`)
      .send({ jobParams: `foo:` })
      .expect(400)
      .then(({ body }) => expect(body.message).toMatchInlineSnapshot('"invalid rison: foo:"'));
  });

  it('returns 400 export type is invalid', async () => {
    registerGenerationRoutesInternal(reportingCore, mockLogger);

    await server.start();

    await supertest(server.listener)
      .post(`${INTERNAL_ROUTES.GENERATE_PREFIX}/TonyHawksProSkater2`)
      .send({ jobParams: rison.encode({ title: `abc` }) })
      .expect(400)
      .then(({ body }) =>
        expect(body.message).toMatchInlineSnapshot('"Invalid export-type of TonyHawksProSkater2"')
      );
  });

  it('returns 400 on invalid browser timezone', async () => {
    registerGenerationRoutesInternal(reportingCore, mockLogger);

    await server.start();

    await supertest(server.listener)
      .post(`${INTERNAL_ROUTES.GENERATE_PREFIX}/printablePdfV2`)
      .send({ jobParams: rison.encode({ browserTimezone: 'America/Amsterdam', title: `abc` }) })
      .expect(400)
      .then(({ body }) =>
        expect(body.message).toMatchInlineSnapshot(`"Invalid timezone \\"America/Amsterdam\\"."`)
      );
  });

  it('returns 500 if job handler throws an error', async () => {
    store.addReport = jest.fn().mockRejectedValue('silly');

    registerGenerationRoutesInternal(reportingCore, mockLogger);

    await server.start();

    await supertest(server.listener)
      .post(`${INTERNAL_ROUTES.GENERATE_PREFIX}/printablePdfV2`)
      .send({ jobParams: rison.encode({ title: `abc` }) })
      .expect(500);
  });

  it(`returns 200 if job handler doesn't error`, async () => {
    registerGenerationRoutesInternal(reportingCore, mockLogger);

    await server.start();

    await supertest(server.listener)
      .post(`${INTERNAL_ROUTES.GENERATE_PREFIX}/printablePdfV2`)
      .send({
        jobParams: rison.encode({
          title: `abc`,
          layout: { id: 'test' },
          objectType: 'canvas workpad',
        }),
      })
      .expect(200)
      .then(({ body }) => {
        expect(body).toMatchObject({
          job: {
            attempts: 0,
            created_by: 'Tom Riddle',
            id: 'foo',
            index: 'foo-index',
            jobtype: 'printable_pdf_v2',
            payload: {
              forceNow: expect.any(String),
              isDeprecated: false,
              layout: {
                id: 'test',
              },
              objectType: 'canvas workpad',
              title: 'abc',
              version: '7.14.0',
            },
            status: 'pending',
          },
          path: '/mock-server-basepath/api/reporting/jobs/download/foo',
        });
      });
  });

  describe('telemetry', () => {
    it('increments generation api counter', async () => {
      registerGenerationRoutesInternal(reportingCore, mockLogger);

      await server.start();

      await supertest(server.listener)
        .post(`${INTERNAL_ROUTES.GENERATE_PREFIX}/printablePdfV2`)
        .send({
          jobParams: rison.encode({
            title: `abc`,
            layout: { id: 'test' },
            objectType: 'canvas workpad',
          }),
        })
        .expect(200);

      expect(usageCounter.incrementCounter).toHaveBeenCalledTimes(1);
      expect(usageCounter.incrementCounter).toHaveBeenCalledWith({
        counterName: `post /internal/reporting/generate/printablePdfV2`,
        counterType: 'reportingApi',
      });
    });
  });

  it(`supports event tracking`, async () => {
    registerGenerationRoutesInternal(reportingCore, mockLogger);

    await server.start();

    await supertest(server.listener)
      .post(`${INTERNAL_ROUTES.GENERATE_PREFIX}/printablePdfV2`)
      .send({
        jobParams: rison.encode({
          title: `abc`,
          layout: { id: 'test' },
          objectType: 'canvas workpad',
        }),
      });

    expect(eventTracker.createReport).toHaveBeenCalledTimes(1);
  });
});
