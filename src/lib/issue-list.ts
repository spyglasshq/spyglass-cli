export interface IssueType {
  id: string;
  name: string;
}

export const ISSUES: { [id: string]: IssueType } = ([
  {
    id: 'SR1001',
    name: 'Role is missing usage permissions on a required database.',
    type: 'bugs',
  },
  {
    id: 'SR1002',
    name: 'Role is missing usage permissions on a required schema.',
    type: 'bugs',
  },
  {
    id: 'SR1003',
    name: 'Actual warehouse compute usage is less than provisioned capacity.',
    type: 'cost',
  },
  {
    id: 'SR1004',
    name: 'User has access to data but not to a warehouse.',
    type: 'bugs',
  },
  {
    id: 'SR1005',
    name: 'Role is not granted to SYSADMIN.',
    type: 'cleanup',
  },
  {
    id: 'SR1006',
    name: 'Child object is not owned by the parent database owner.',
    type: 'bugs',
  },
  {
    id: 'SR1007',
    name: 'Database-level future grants are ignored due to use of schema-level future grants.',
    type: 'bugs',
  },
  {
    id: 'SR1008',
    name: 'Re-created object is no longer accessible by same roles as before it was deleted.',
    type: 'bugs',
  },
  {
    id: 'SR1009',
    name: 'Role has overly broad permissions.',
    type: 'risks',
  },
  {
    id: 'SR1010',
    type: 'risks',
    name: 'User has role grants that they haven’t used recently.',
  },
  {
    id: 'SR1011',
    name: 'User has access to tables that they haven’t accessed recently.',
    type: 'risks',
  },
  {
    id: 'SR1012',
    name: 'Role has grants to databases, schemas, or tables that aren’t being used.',
    type: 'risks',
  },
  {
    id: 'SR1013',
    name: 'User has access to data (e.g. GDPR or PII) that they shouldn’t have.',
    type: 'risks',
  },
  {
    id: 'SR1014',
    name: 'Role is granted ACCOUNTADMIN.',
    type: 'risks',
  },
  {
    id: 'SR1015',
    name: 'User is granted ACCOUNTADMIN.',
    type: 'risks',
  },
  {
    id: 'SR1016',
    name: 'User with role ACCOUNTADMIN does not have MFA enabled.',
    type: 'risks',
  },
  {
    id: 'SR1017',
    name: 'Object is owned by ACCOUNTADMIN.',
    type: 'risks',
  },
  {
    id: 'SR1018',
    name: 'Role is a duplicate with another role.',
    type: 'cleanup',
  },
  {
    id: 'SR1019',
    name: 'Role has overlapping permissions with another.',
    type: 'cleanup',
  },
  {
    id: 'SR1020',
    name: 'Role hasn’t had any members for an extended period of time.',
    type: 'cleanup',
  },
  {
    id: 'SR1021',
    name: 'Deactivated user has role grants.',
    type: 'cleanup',
  },
  {
    id: 'SR1022',
    name: 'Role is missing ownership metadata.',
    type: 'governance',
  },
  {
    id: 'SR1023',
    name: 'Database, schema, or table that are missing ownership metadata.',
    type: 'governance',
  },
  {
    id: 'SR1024',
    name: 'Warehouse does not have any resource monitors defined.',
    type: 'cost',
  },
  {
    id: 'SR1025',
    name: 'Warehouse does not have auto-suspend enabled.',
    type: 'cost',
  },
  {
    id: 'SR1026',
    name: 'Warehouse costs could be reduced by setting a lower auto-suspend time limit.',
    type: 'cost',
  },
]).reduce((obj, issue) => ({[issue.id]: issue, ...obj}), {})
