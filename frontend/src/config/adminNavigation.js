export const ADMIN_NAVIGATION = [
  {
    group: 'Overview',
    items: [
      {
        label: 'Dashboard',
        shortLabel: 'DB',
        path: '/admin-master/dashboard',
        permission: 'ADMIN_DASHBOARD_VIEW',
      },
    ],
  },
  {
    group: 'Configuration',
    items: [
      {
        label: 'Lender management',
        shortLabel: 'LM',
        path: '/admin-master/lenders',
        permission: 'LENDER_READ',
      },
    ],
  },
  {
    group: 'Access Management',
    items: [
      {
        label: 'Users',
        shortLabel: 'US',
        path: '/admin-master/users',
        permission: 'USER_READ',
      },
      {
        label: 'Roles',
        shortLabel: 'RL',
        path: '/admin-master/roles',
        permission: 'ROLE_READ',
      },
      {
        label: 'Permissions',
        shortLabel: 'PM',
        path: '/admin-master/permissions',
        permission: 'PERMISSION_READ',
      },
    ],
  },
  {
    group: 'Security',
    items: [
      {
        label: 'My sessions',
        shortLabel: 'SS',
        path: '/admin-master/sessions',
        permission: 'SESSION_READ_OWN',
      },
    ],
  },
];