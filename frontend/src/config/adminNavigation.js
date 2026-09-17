import {
  ClipboardCheck,
  FileText,
  Gauge,
  Gift,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Lock,
  Monitor,
  Package,
  PieChart,
  Receipt,
  ShieldCheck,
  Target,
  Users,
  Waypoints,
} from 'lucide-react';

export const ADMIN_NAVIGATION = [
  {
    group: 'Overview',
    items: [
      {
        label: 'Dashboard',
        shortLabel: 'DB',
        icon: LayoutDashboard,
        path: '/admin-master/dashboard',
        permission: 'ADMIN_DASHBOARD_VIEW',
      },
      {
        label: 'Debit Request List',
        shortLabel: 'DR',
        icon: Receipt,
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
        icon: Package,
        path: '/admin-master/platform-products',
        permission: 'PLATFORM_PRODUCT_READ',
      },
      {
        label: 'Lender management',
        shortLabel: 'LM',
        icon: Landmark,
        path: '/admin-master/lenders',
        permission: 'LENDER_READ',
      },
      {
        label: 'Product & offer strategy',
        shortLabel: 'PO',
        icon: Target,
        path: '/admin-master/products',
        permission: 'PRODUCT_READ',
      },
      {
        label: 'Platform policies (BRE)',
        shortLabel: 'PP',
        icon: ShieldCheck,
        path: '/admin-master/platform-policies',
        permission: 'POLICY_READ',
      },
      {
        label: 'Multi-Lender Allocation (MLM)',
        shortLabel: 'ML',
        icon: Waypoints,
        path: '/admin-master/mlm-policies',
        permission: 'MLM_READ',
      },
      {
        label: 'Distribution Dashboard',
        shortLabel: 'DD',
        icon: PieChart,
        path: '/admin-master/mlm-distribution',
        permission: 'MLM_READ',
      },
      // {
      //   label: 'Capacity Dashboard',
      //   shortLabel: 'CD',
      //   icon: Gauge,
      //   path: '/admin-master/mlm-capacities',
      //   permission: 'MLM_CAPACITY_READ',
      // },
    ],
  },
  {
    group: 'Operations',
    items: [
      {
        label: 'Applications',
        shortLabel: 'AP',
        icon: FileText,
        path: '/admin-master/applications',
        permission: 'APPLICATION_VIEW_MASKED',
      },
      {
        label: 'Credit Review',
        shortLabel: 'CR',
        icon: ClipboardCheck,
        path: '/admin-master/credit-review',
        permission: 'APPLICATION_VIEW_MASKED',
      },
      {
        label: 'Referral Management',
        shortLabel: 'RM',
        icon: Gift,
        path: '/admin-master/referrals',
        permission: 'ADMIN_DASHBOARD_VIEW',
      },
    ],
  },
  {
    group: 'Access Management',
    items: [
      {
        label: 'Users',
        shortLabel: 'US',
        icon: Users,
        path: '/admin-master/users',
        permission: 'USER_READ',
      },
      {
        label: 'Roles',
        shortLabel: 'RL',
        icon: KeyRound,
        path: '/admin-master/roles',
        permission: 'ROLE_READ',
      },
      {
        label: 'Permissions',
        shortLabel: 'PM',
        icon: Lock,
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
        icon: Monitor,
        path: '/admin-master/sessions',
        permission: 'SESSION_READ_OWN',
      },
    ],
  },
];
