/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SecurityService } from '@kbn/ftr-common-functional-services';

export const usersAndRolesFactory = (security: SecurityService) => ({
  createRole: async ({ name, privileges }: { name: string; privileges: any }) => {
    await security.role.create(name, privileges);
  },
  createUser: async ({
    username,
    password,
    roles,
  }: {
    username: string;
    password: string;
    roles: string[];
  }) => {
    return await security.user.create(username, {
      password,
      roles,
      full_name: username.replace('_', ' '),
      email: `${username}@elastic.co`,
    });
  },
  deleteUser: async (username: string) => {
    return await security.user.delete(username);
  },
  deleteRole: async (name: string) => {
    return await security.role.delete(name);
  },
});
