/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { TaskRunnerFactory } from './task_runner';
import type { ConstructorOptions } from './rule_type_registry';
import { RuleTypeRegistry } from './rule_type_registry';
import type { ActionGroup, RuleType } from './types';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import type { ILicenseState } from './lib/license_state';
import { licenseStateMock } from './lib/license_state.mock';
import { licensingMock } from '@kbn/licensing-plugin/server/mocks';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { inMemoryMetricsMock } from './monitoring/in_memory_metrics.mock';
import { alertsServiceMock } from './alerts_service/alerts_service.mock';
import { schema } from '@kbn/config-schema';
import type { RecoveredActionGroupId } from '../common';
import type { AlertingConfig } from './config';
import { TaskPriority } from '@kbn/task-manager-plugin/server';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';

const logger = loggingSystemMock.create().get();
let mockedLicenseState: jest.Mocked<ILicenseState>;
let ruleTypeRegistryParams: ConstructorOptions;

const taskManager = taskManagerMock.createSetup();
const inMemoryMetrics = inMemoryMetricsMock.create();
const alertsService = alertsServiceMock.create();

beforeEach(() => {
  jest.clearAllMocks();
  mockedLicenseState = licenseStateMock.create();
  ruleTypeRegistryParams = {
    config: {} as AlertingConfig,
    logger,
    taskManager,
    taskRunnerFactory: new TaskRunnerFactory(),
    alertsService: null,
    licenseState: mockedLicenseState,
    licensing: licensingMock.createSetup(),
    minimumScheduleInterval: { value: '1m', enforce: false },
    inMemoryMetrics,
  };
});

describe('Create Lifecycle', () => {
  describe('has()', () => {
    test('returns false for unregistered rule types', () => {
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      expect(registry.has('foo')).toEqual(false);
    });

    test('returns true for registered rule types', () => {
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register({
        id: 'foo',
        name: 'Foo',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: schema.any(),
        },
      });
      expect(registry.has('foo')).toEqual(true);
    });
  });

  describe('register()', () => {
    test('throws if RuleType Id contains invalid characters', () => {
      const ruleType: RuleType<never, never, never, never, never, 'default', 'recovered', {}> = {
        id: 'test',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: { validate: (params) => params },
        },
      };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);

      const invalidCharacters = [' ', ':', '*', '*', '/'];
      for (const char of invalidCharacters) {
        expect(() =>
          registry.register({ ...ruleType, id: `${ruleType.id}${char}` })
        ).toThrowErrorMatchingInlineSnapshot(
          `"expected RuleType Id not to include invalid character: ${char}"`
        );
      }

      const [first, second] = invalidCharacters;
      expect(() =>
        registry.register({ ...ruleType, id: `${first}${ruleType.id}${second}` })
      ).toThrowErrorMatchingInlineSnapshot(
        `"expected RuleType Id not to include invalid characters: ${first}, ${second}"`
      );
    });

    test('throws if RuleType Id isnt a string', () => {
      const ruleType: RuleType<never, never, never, never, never, 'default', 'recovered', {}> = {
        id: 123 as unknown as string,
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: { validate: (params) => params },
        },
      };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);

      expect(() => registry.register(ruleType)).toThrowErrorMatchingInlineSnapshot(
        `"expected value of type [string] but got [number]"`
      );
    });

    test('throws if RuleType ruleTaskTimeout is not a valid duration', () => {
      const ruleType: RuleType<never, never, never, never, never, 'default', 'recovered', {}> = {
        id: '123',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        ruleTaskTimeout: '23 milisec',
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: { validate: (params) => params },
        },
      };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);

      expect(() => registry.register(ruleType)).toThrowError(
        new Error(
          `Rule type \"123\" has invalid timeout: string is not a valid duration: 23 milisec.`
        )
      );
    });

    test('throws if defaultScheduleInterval isnt valid', () => {
      const ruleType: RuleType<never, never, never, never, never, 'default', 'recovered', {}> = {
        id: '123',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],

        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        defaultScheduleInterval: 'foobar',
        validate: {
          params: { validate: (params) => params },
        },
      };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);

      expect(() => registry.register(ruleType)).toThrowError(
        new Error(
          `Rule type \"123\" has invalid default interval: string is not a valid duration: foobar.`
        )
      );
    });

    test('logs warning if defaultScheduleInterval is less than configured minimumScheduleInterval and enforce = false', () => {
      const ruleType: RuleType<never, never, never, never, never, 'default', 'recovered', {}> = {
        id: '123',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        defaultScheduleInterval: '10s',
        validate: {
          params: { validate: (params) => params },
        },
      };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register(ruleType);

      expect(logger.warn).toHaveBeenCalledWith(
        `Rule type "123" has a default interval of "10s", which is less than the configured minimum of "1m".`
      );
    });

    test('logs warning and updates default if defaultScheduleInterval is less than configured minimumScheduleInterval and enforce = true', () => {
      const ruleType: RuleType<never, never, never, never, never, 'default', 'recovered', {}> = {
        id: '123',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],

        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        defaultScheduleInterval: '10s',
        validate: {
          params: { validate: (params) => params },
        },
      };
      const registry = new RuleTypeRegistry({
        ...ruleTypeRegistryParams,
        minimumScheduleInterval: { value: '1m', enforce: true },
      });
      registry.register(ruleType);

      expect(logger.warn).toHaveBeenCalledWith(
        `Rule type "123" cannot specify a default interval less than the configured minimum of "1m". "1m" will be used.`
      );
      expect(registry.get('123').defaultScheduleInterval).toEqual('1m');
    });

    test('throws if RuleType action groups contains reserved group id', () => {
      const ruleType: RuleType<
        never,
        never,
        never,
        never,
        never,
        'default' | 'NotReserved',
        'recovered',
        {}
      > = {
        id: 'test',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
          /**
           * The type system will ensure you can't use the `recovered` action group
           * but we also want to ensure this at runtime
           */
          {
            id: 'recovered',
            name: 'Recovered',
          } as unknown as ActionGroup<'NotReserved'>,
        ],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: { validate: (params) => params },
        },
      };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);

      expect(() => registry.register(ruleType)).toThrowError(
        new Error(
          `Rule type [id="${ruleType.id}"] cannot be registered. Action groups [recovered] are reserved by the framework.`
        )
      );
    });

    test('throws if RuleType action groups contain duplicate severity levels', () => {
      const ruleType: RuleType<
        never,
        never,
        never,
        never,
        never,
        'high' | 'medium' | 'low' | 'nodata',
        'recovered',
        {}
      > = {
        id: 'test',
        name: 'Test',
        actionGroups: [
          {
            id: 'high',
            name: 'Default',
            severity: { level: 3 },
          },
          {
            id: 'medium',
            name: 'Default',
            severity: { level: 0 },
          },
          {
            id: 'low',
            name: 'Default',
            severity: { level: 0 },
          },
          {
            id: 'nodata',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'medium',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: { validate: (params) => params },
        },
      };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);

      expect(() => registry.register(ruleType)).toThrowError(
        new Error(
          `Rule type [id="${ruleType.id}"] cannot be registered. Action group definitions cannot contain duplicate severity levels.`
        )
      );
    });

    test('allows an RuleType to specify a custom recovery group', () => {
      const ruleType: RuleType<never, never, never, never, never, 'default', 'backToAwesome', {}> =
        {
          id: 'test',
          name: 'Test',
          actionGroups: [
            {
              id: 'default',
              name: 'Default',
            },
          ],
          defaultActionGroupId: 'default',
          recoveryActionGroup: {
            id: 'backToAwesome',
            name: 'Back To Awesome',
          },
          executor: jest.fn(),
          category: 'test',
          producer: 'alerts',
          solution: 'stack',
          minimumLicenseRequired: 'basic',
          isExportable: true,
          validate: {
            params: { validate: (params) => params },
          },
        };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register(ruleType);
      expect(registry.get('test').actionGroups).toMatchInlineSnapshot(`
              Array [
                Object {
                  "id": "default",
                  "name": "Default",
                },
                Object {
                  "id": "backToAwesome",
                  "name": "Back To Awesome",
                },
              ]
          `);
    });

    test('allows an RuleType to specify a custom rule task timeout', () => {
      const ruleType: RuleType<never, never, never, never, never, 'default', 'backToAwesome', {}> =
        {
          id: 'test',
          name: 'Test',
          actionGroups: [
            {
              id: 'default',
              name: 'Default',
            },
          ],
          defaultActionGroupId: 'default',
          ruleTaskTimeout: '13m',
          executor: jest.fn(),
          category: 'test',
          producer: 'alerts',
          solution: 'stack',
          minimumLicenseRequired: 'basic',
          isExportable: true,
          validate: {
            params: { validate: (params) => params },
          },
        };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register(ruleType);
      expect(registry.get('test').ruleTaskTimeout).toBe('13m');
    });

    test('allows RuleType action groups to specify severity levels', () => {
      const actionGroups: Array<ActionGroup<'high' | 'medium' | 'low' | 'nodata'>> = [
        {
          id: 'high',
          name: 'Default',
          severity: { level: 2 },
        },
        {
          id: 'medium',
          name: 'Default',
          severity: { level: 1 },
        },
        {
          id: 'low',
          name: 'Default',
          severity: { level: 0 },
        },
        {
          id: 'nodata',
          name: 'Default',
        },
      ];
      const ruleType: RuleType<
        never,
        never,
        never,
        never,
        never,
        'high' | 'medium' | 'low' | 'nodata',
        'recovered',
        {}
      > = {
        id: 'test',
        name: 'Test',
        actionGroups,
        defaultActionGroupId: 'medium',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: { validate: (params) => params },
        },
      };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register(ruleType);
      expect(registry.get('test').actionGroups).toEqual([
        ...actionGroups,
        { id: 'recovered', name: 'Recovered' },
      ]);
    });

    test('allows RuleType to specify a priority', () => {
      const ruleType: RuleType<never, never, never, never, never, 'default', 'backToAwesome', {}> =
        {
          id: 'test',
          name: 'Test',
          actionGroups: [
            {
              id: 'default',
              name: 'Default',
            },
          ],
          defaultActionGroupId: 'default',
          recoveryActionGroup: {
            id: 'backToAwesome',
            name: 'Back To Awesome',
          },
          priority: TaskPriority.NormalLongRunning,
          executor: jest.fn(),
          category: 'test',
          producer: 'alerts',
          solution: 'stack',
          minimumLicenseRequired: 'basic',
          isExportable: true,
          validate: {
            params: { validate: (params) => params },
          },
        };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register(ruleType);
      expect(registry.get('test').priority).toEqual(TaskPriority.NormalLongRunning);

      expect(taskManager.registerTaskDefinitions).toHaveBeenCalledTimes(1);
      expect(taskManager.registerTaskDefinitions.mock.calls[0][0]).toMatchObject({
        'alerting:test': {
          title: 'Test',
          priority: TaskPriority.NormalLongRunning,
        },
      });
    });

    test('throws if RuleType priority provided is invalid', () => {
      const ruleType: RuleType<never, never, never, never, never, 'default', 'backToAwesome', {}> =
        {
          id: 'test',
          name: 'Test',
          actionGroups: [
            {
              id: 'default',
              name: 'Default',
            },
          ],
          defaultActionGroupId: 'default',
          recoveryActionGroup: {
            id: 'backToAwesome',
            name: 'Back To Awesome',
          },
          priority: TaskPriority.Low as TaskPriority.Normal, // Have to cast to force this error case
          executor: jest.fn(),
          category: 'test',
          producer: 'alerts',
          solution: 'stack',
          minimumLicenseRequired: 'basic',
          isExportable: true,
          validate: {
            params: { validate: (params) => params },
          },
        };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      expect(() => registry.register(ruleType)).toThrowError(
        new Error(`Rule type \"test\" has invalid priority: 1.`)
      );
    });

    test('throws if the custom recovery group is contained in the RuleType action groups', () => {
      const ruleType: RuleType<
        never,
        never,
        never,
        never,
        never,
        'default' | 'backToAwesome',
        'backToAwesome',
        {}
      > = {
        id: 'test',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
          {
            id: 'backToAwesome',
            name: 'Back To Awesome',
          },
        ],
        recoveryActionGroup: {
          id: 'backToAwesome',
          name: 'Back To Awesome',
        },
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: { validate: (params) => params },
        },
      };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);

      expect(() => registry.register(ruleType)).toThrowError(
        new Error(
          `Rule type [id="${ruleType.id}"] cannot be registered. Action group [backToAwesome] cannot be used as both a recovery and an active action group.`
        )
      );
    });

    test('registers the executor with the task manager', () => {
      const ruleType: RuleType<never, never, never, never, never, 'default', 'recovered', {}> = {
        id: 'test',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        ruleTaskTimeout: '20m',
        validate: {
          params: { validate: (params) => params },
        },
      };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register(ruleType);
      expect(taskManager.registerTaskDefinitions).toHaveBeenCalledTimes(1);
      expect(taskManager.registerTaskDefinitions.mock.calls[0][0]).toMatchObject({
        'alerting:test': {
          timeout: '20m',
          title: 'Test',
        },
      });
    });

    test('injects custom cost for certain rule types', () => {
      const ruleType: RuleType<never, never, never, never, never, 'default', 'recovered', {}> = {
        id: 'siem.indicatorRule',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        ruleTaskTimeout: '20m',
        validate: {
          params: { validate: (params) => params },
        },
      };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register(ruleType);
      expect(taskManager.registerTaskDefinitions).toHaveBeenCalledTimes(1);
      expect(taskManager.registerTaskDefinitions.mock.calls[0][0]).toMatchObject({
        'alerting:siem.indicatorRule': {
          timeout: '20m',
          title: 'Test',
          cost: 10,
        },
      });
    });

    test('shallow clones the given rule type', () => {
      const ruleType: RuleType<never, never, never, never, never, 'default', 'recovered', {}> = {
        id: 'test',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: { validate: (params) => params },
        },
      };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register(ruleType);
      ruleType.name = 'Changed';
      expect(registry.get('test').name).toEqual('Test');
    });

    test('should throw an error if type is already registered', () => {
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register({
        id: 'test',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: { validate: (params) => params },
        },
      });
      expect(() =>
        registry.register({
          id: 'test',
          name: 'Test',
          actionGroups: [
            {
              id: 'default',
              name: 'Default',
            },
          ],
          defaultActionGroupId: 'default',
          minimumLicenseRequired: 'basic',
          isExportable: true,
          executor: jest.fn(),
          category: 'test',
          producer: 'alerts',
          solution: 'stack',
          validate: {
            params: { validate: (params) => params },
          },
        })
      ).toThrowErrorMatchingInlineSnapshot(`"Rule type \\"test\\" is already registered."`);
    });

    test('should initialize alerts as data resources if AlertsService is defined and alert definition is registered', () => {
      const registry = new RuleTypeRegistry({ ...ruleTypeRegistryParams, alertsService });
      registry.register({
        id: 'test',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        alerts: {
          context: 'test',
          mappings: { fieldMap: { field: { type: 'keyword', required: false } } },
        },
        validate: {
          params: { validate: (params) => params },
        },
      });

      expect(alertsService.register).toHaveBeenCalledWith({
        context: 'test',
        mappings: { fieldMap: { field: { type: 'keyword', required: false } } },
      });
    });

    test('should not initialize alerts as data resources if no alert definition is registered', () => {
      const registry = new RuleTypeRegistry({ ...ruleTypeRegistryParams, alertsService });
      registry.register({
        id: 'test',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: schema.any(),
        },
      });

      expect(alertsService.register).not.toHaveBeenCalled();
    });

    test('registers rule with no overwrite on producer', () => {
      const ruleType: RuleType<never, never, never, never, never, 'default', 'recovered', {}> = {
        id: 'test',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        ruleTaskTimeout: '20m',
        validate: {
          params: { validate: (params) => params },
        },
      };
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register(ruleType);
      expect(registry.get('test').producer).toEqual('alerts');
    });

    test('registers rule if cancelAlertsOnRuleTimeout: true and autoRecoverAlerts: true', () => {
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register({
        id: 'foo',
        name: 'Foo',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: schema.any(),
        },

        cancelAlertsOnRuleTimeout: true,
        autoRecoverAlerts: true,
      });
      expect(registry.has('foo')).toEqual(true);
    });

    test('registers rule if cancelAlertsOnRuleTimeout: false and autoRecoverAlerts: false', () => {
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register({
        id: 'foo',
        name: 'Foo',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: schema.any(),
        },

        cancelAlertsOnRuleTimeout: false,
        autoRecoverAlerts: false,
      });
      expect(registry.has('foo')).toEqual(true);
    });
  });

  describe('register() with overwriteProducer', () => {
    test('registers rule and overwrite producer', () => {
      const ruleType: RuleType<never, never, never, never, never, 'default', 'recovered', {}> = {
        id: 'test',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        ruleTaskTimeout: '20m',
        validate: {
          params: { validate: (params) => params },
        },
      };
      const registry = new RuleTypeRegistry({
        ...ruleTypeRegistryParams,
        config: { rules: { overwriteProducer: 'observability' } } as unknown as AlertingConfig,
      });
      registry.register(ruleType);
      expect(registry.get('test').producer).toEqual('observability');
    });
  });

  describe('get()', () => {
    test('should return registered type', () => {
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register({
        id: 'test',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: { validate: (params) => params },
        },
      });
      const ruleType = registry.get('test');
      expect(ruleType).toMatchInlineSnapshot(`
        Object {
          "actionGroups": Array [
            Object {
              "id": "default",
              "name": "Default",
            },
            Object {
              "id": "recovered",
              "name": "Recovered",
            },
          ],
          "actionVariables": Object {
            "context": Array [],
            "params": Array [],
            "state": Array [],
          },
          "category": "test",
          "defaultActionGroupId": "default",
          "executor": [MockFunction],
          "id": "test",
          "isExportable": true,
          "minimumLicenseRequired": "basic",
          "name": "Test",
          "producer": "alerts",
          "recoveryActionGroup": Object {
            "id": "recovered",
            "name": "Recovered",
          },
          "solution": "stack",
          "validLegacyConsumers": Array [],
          "validate": Object {
            "params": Object {
              "validate": [Function],
            },
          },
        }
      `);
    });

    test(`should throw an error if type isn't registered`, () => {
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      expect(() => registry.get('test')).toThrowErrorMatchingInlineSnapshot(
        `"Rule type \\"test\\" is not registered."`
      );
    });
  });

  describe('list()', () => {
    test('should return empty when nothing is registered', () => {
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      const result = registry.list();
      expect(result).toMatchInlineSnapshot(`Map {}`);
    });

    test('should return registered types', () => {
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register({
        id: 'test',
        name: 'Test',
        actionGroups: [
          {
            id: 'testActionGroup',
            name: 'Test Action Group',
          },
        ],
        defaultActionGroupId: 'testActionGroup',
        doesSetRecoveryContext: false,
        isExportable: true,
        ruleTaskTimeout: '20m',
        minimumLicenseRequired: 'basic',
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: schema.any(),
        },
        alerts: {
          context: 'test',
          mappings: { fieldMap: { foo: { type: 'keyword', required: false } } },
        },
        autoRecoverAlerts: false,
      });
      const result = registry.list();
      expect(result).toMatchInlineSnapshot(`
        Map {
          "test" => Object {
            "actionGroups": Array [
              Object {
                "id": "testActionGroup",
                "name": "Test Action Group",
              },
              Object {
                "id": "recovered",
                "name": "Recovered",
              },
            ],
            "actionVariables": Object {
              "context": Array [],
              "params": Array [],
              "state": Array [],
            },
            "alerts": Object {
              "context": "test",
              "mappings": Object {
                "fieldMap": Object {
                  "foo": Object {
                    "required": false,
                    "type": "keyword",
                  },
                },
              },
            },
            "autoRecoverAlerts": false,
            "category": "test",
            "defaultActionGroupId": "testActionGroup",
            "defaultScheduleInterval": undefined,
            "doesSetRecoveryContext": false,
            "enabledInLicense": false,
            "hasAlertsMappings": true,
            "id": "test",
            "isExportable": true,
            "minimumLicenseRequired": "basic",
            "name": "Test",
            "producer": "alerts",
            "recoveryActionGroup": Object {
              "id": "recovered",
              "name": "Recovered",
            },
            "ruleTaskTimeout": "20m",
            "solution": "stack",
            "validLegacyConsumers": Array [],
          },
        }
      `);
    });

    test('should return action variables state and empty context', () => {
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register(ruleTypeWithVariables('x', '', 's'));
      const ruleType = registry.get('x');
      expect(ruleType.actionVariables).toBeTruthy();

      const context = ruleType.actionVariables!.context;
      const state = ruleType.actionVariables!.state;

      expect(context).toBeTruthy();
      expect(context!.length).toBe(0);

      expect(state).toBeTruthy();
      expect(state!.length).toBe(1);
      expect(state![0]).toEqual({ name: 's', description: 'x state' });
    });

    test('should return action variables context and empty state', () => {
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register(ruleTypeWithVariables('x', 'c', ''));
      const ruleType = registry.get('x');
      expect(ruleType.actionVariables).toBeTruthy();

      const context = ruleType.actionVariables!.context;
      const state = ruleType.actionVariables!.state;

      expect(state).toBeTruthy();
      expect(state!.length).toBe(0);

      expect(context).toBeTruthy();
      expect(context!.length).toBe(1);
      expect(context![0]).toEqual({ name: 'c', description: 'x context' });
    });
  });

  describe('getAllTypes()', () => {
    test('should return empty when nothing is registered', () => {
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      const result = registry.getAllTypes();
      expect(result).toEqual([]);
    });

    test('should return list of registered type ids', () => {
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register({
        id: 'test',
        name: 'Test',
        actionGroups: [
          {
            id: 'testActionGroup',
            name: 'Test Action Group',
          },
        ],
        defaultActionGroupId: 'testActionGroup',
        doesSetRecoveryContext: false,
        isExportable: true,
        ruleTaskTimeout: '20m',
        minimumLicenseRequired: 'basic',
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: schema.any(),
        },
      });
      const result = registry.getAllTypes();
      expect(result).toEqual(['test']);
    });
  });

  describe('getAllTypesForCategory()', () => {
    test('should return empty when nothing is registered', () => {
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      expect(
        registry.getAllTypesForCategories([
          DEFAULT_APP_CATEGORIES.management.id,
          DEFAULT_APP_CATEGORIES.observability.id,
          DEFAULT_APP_CATEGORIES.security.id,
        ])
      ).toEqual([]);
    });

    test('should return list of registered type ids for a category', () => {
      const registry = new RuleTypeRegistry(ruleTypeRegistryParams);
      registry.register({
        id: 'test',
        name: 'Test',
        actionGroups: [
          {
            id: 'testActionGroup',
            name: 'Test Action Group',
          },
        ],
        defaultActionGroupId: 'testActionGroup',
        doesSetRecoveryContext: false,
        isExportable: true,
        ruleTaskTimeout: '20m',
        minimumLicenseRequired: 'basic',
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: schema.any(),
        },
      });
      registry.register({
        id: 'test2',
        name: 'Test',
        actionGroups: [
          {
            id: 'testActionGroup',
            name: 'Test Action Group',
          },
        ],
        defaultActionGroupId: 'testActionGroup',
        doesSetRecoveryContext: false,
        isExportable: true,
        ruleTaskTimeout: '20m',
        minimumLicenseRequired: 'basic',
        executor: jest.fn(),
        category: 'test2',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: schema.any(),
        },
      });
      registry.register({
        id: 'test3',
        name: 'Test',
        actionGroups: [
          {
            id: 'testActionGroup',
            name: 'Test Action Group',
          },
        ],
        defaultActionGroupId: 'testActionGroup',
        doesSetRecoveryContext: false,
        isExportable: true,
        ruleTaskTimeout: '20m',
        minimumLicenseRequired: 'basic',
        executor: jest.fn(),
        category: 'test3',
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: schema.any(),
        },
      });
      const result = registry.getAllTypesForCategories(['test', 'test2']);
      expect(result).toEqual(['test', 'test2']);
    });
  });

  describe('ensureRuleTypeEnabled', () => {
    let ruleTypeRegistry: RuleTypeRegistry;

    beforeEach(() => {
      ruleTypeRegistry = new RuleTypeRegistry(ruleTypeRegistryParams);
      ruleTypeRegistry.register({
        id: 'test',
        name: 'Test',
        actionGroups: [
          {
            id: 'default',
            name: 'Default',
          },
        ],
        defaultActionGroupId: 'default',
        executor: jest.fn(),
        category: 'test',
        producer: 'alerts',
        solution: 'stack',
        isExportable: true,
        minimumLicenseRequired: 'basic',
        recoveryActionGroup: { id: 'recovered', name: 'Recovered' },
        validate: {
          params: schema.any(),
        },
      });
    });

    test('should call ensureLicenseForAlertType on the license state', async () => {
      ruleTypeRegistry.ensureRuleTypeEnabled('test');
      expect(mockedLicenseState.ensureLicenseForRuleType).toHaveBeenCalled();
    });

    test('should throw when ensureLicenseForAlertType throws', async () => {
      mockedLicenseState.ensureLicenseForRuleType.mockImplementation(() => {
        throw new Error('Fail');
      });
      expect(() =>
        ruleTypeRegistry.ensureRuleTypeEnabled('test')
      ).toThrowErrorMatchingInlineSnapshot(`"Fail"`);
    });
  });
});

function ruleTypeWithVariables<ActionGroupIds extends string>(
  id: ActionGroupIds,
  context: string,
  state: string
): RuleType<never, never, {}, never, never, ActionGroupIds, RecoveredActionGroupId, {}> {
  const baseAlert: RuleType<
    never,
    never,
    {},
    never,
    never,
    ActionGroupIds,
    RecoveredActionGroupId,
    {}
  > = {
    id,
    name: `${id}-name`,
    actionGroups: [],
    defaultActionGroupId: id,
    isExportable: true,
    minimumLicenseRequired: 'basic',
    async executor() {
      return { state: {} };
    },
    category: 'test',
    producer: 'alerts',
    solution: 'stack',
    validate: {
      params: { validate: (params) => params },
    },
  };

  if (!context && !state) return baseAlert;

  return {
    ...baseAlert,
    actionVariables: {
      ...(context ? { context: [{ name: context, description: `${id} context` }] } : {}),
      ...(state ? { state: [{ name: state, description: `${id} state` }] } : {}),
    },
  };
}
