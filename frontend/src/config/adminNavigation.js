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
      {
        label: 'Debit Request List',
        shortLabel: 'DR',
        path: '/admin-master/debit-requests',
        permission: 'ADMIN_DASHBOARD_VIEW',
      },
    ],
  },
  {
    group: 'Configuration',
    items: [
      {
        label: 'Platform Products',
        shortLabel: 'PP',
        path: '/admin-master/platform-products',
        permission: 'PLATFORM_PRODUCT_READ',
      },
      {
        label: 'Lender management',
        shortLabel: 'LM',
        path: '/admin-master/lenders',
        permission: 'LENDER_READ',
      },
      {
        label: 'Product & offer strategy',
        shortLabel: 'PO',
        path: '/admin-master/products',
        permission: 'PRODUCT_READ',
      },
      {
        label: 'Platform policies (BRE)',
        shortLabel: 'PP',
        path: '/admin-master/platform-policies',
        permission: 'POLICY_READ',
      },
      {
        label: 'Multi-Lender Allocation (MLM)',
        shortLabel: 'ML',
        path: '/admin-master/mlm-policies',
        permission: 'MLM_READ',
      },
      {
        label: 'Distribution Dashboard',
        shortLabel: 'DD',
        path: '/admin-master/mlm-distribution',
        permission: 'MLM_READ',
      },
      {
        label: 'Capacity Dashboard',
        shortLabel: 'CD',
        path: '/admin-master/mlm-capacities',
        permission: 'MLM_CAPACITY_READ',
      },
    ],
  },
  {
    group: 'Operations',
    items: [
      {
        label: 'Applications',
        shortLabel: 'AP',
        path: '/admin-master/applications',
        permission: 'APPLICATION_VIEW_MASKED',
      },
      {
        label: 'Credit Review',
        shortLabel: 'CR',
        path: '/admin-master/credit-review',
        permission: 'APPLICATION_VIEW_MASKED',
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