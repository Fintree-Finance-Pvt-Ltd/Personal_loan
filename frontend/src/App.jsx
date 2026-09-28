import { Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { PermissionRoute, ProtectedRoute } from './components/ProtectedRoute';
import { Spinner } from './components/ui';
import { lazyWithRetry } from './lib/lazyWithRetry';


// Customer
import CustomerLayout from './components/layout/customer/CustomerLayout';
import CustomerSignIn from './features/auth/pages/CustomerSignIn';
import CustomerDashboard from './features/customer/pages/CustomerDashboard';
import CustomerSupportPage from './features/customer/pages/CustomerSupportPage';
import MyApplicationPage from './features/customer/pages/MyApplicationPage';
import PostApprovalJourneyPage from './features/customer/pages/PostApprovalJourneyPage';
import DigiLockerCallbackPage from './features/customer/pages/DigiLockerCallbackPage';
import MandateResultPage from './features/customer/pages/MandateResultPage';
import { CustomerLoanDetailsPage } from './features/customer/pages/CustomerLoanDetailsPage';
import { CustomerProfilePage } from './features/customer/pages/CustomerProfilePage';
import ReferralEarnPage from './features/customer/pages/ReferralEarnPage';

// Admin screens are lazy-loaded: customers never open them, so they should not download
// them. (The customer journey pages stay eagerly loaded - no flash between steps.)
const AdminLayout = lazyWithRetry(() => import('./components/AdminLayout'), 'AdminLayout');
const LoginPage = lazyWithRetry(() => import('./features/auth/pages/LoginPage'), 'LoginPage');
const DashboardPage = lazyWithRetry(() => import('./features/dashboard/pages/DashboardPage'), 'DashboardPage');
const DebitRequestsPage = lazyWithRetry(() => import('./features/admin/pages/DebitRequestsPage'), 'DebitRequestsPage');
const ReferralManagementPage = lazyWithRetry(() => import('./features/admin/pages/ReferralManagementPage'), 'ReferralManagementPage');
const MarketingPartnersPage = lazyWithRetry(() => import('./features/admin/pages/MarketingPartnersPage'), 'MarketingPartnersPage');
const SessionsPage = lazyWithRetry(() => import('./features/admin/pages/SessionsPage'), 'SessionsPage');
const LendersPage = lazyWithRetry(() => import('./features/lenders/pages/LendersPage'), 'LendersPage');
const CreateLenderPage = lazyWithRetry(() => import('./features/lenders/pages/CreateLenderPage'), 'CreateLenderPage');
const LenderDetailsPage = lazyWithRetry(() => import('./features/lenders/pages/LenderDetailsPage'), 'LenderDetailsPage');
const EditLenderPage = lazyWithRetry(() => import('./features/lenders/pages/EditLenderPage'), 'EditLenderPage');
const PlatformPoliciesPage = lazyWithRetry(() => import('./features/platform-policies/pages/PlatformPoliciesPage'));
const CreatePlatformPolicyPage = lazyWithRetry(() => import('./features/platform-policies/pages/CreatePlatformPolicyPage'));
const PlatformPolicyDetailsPage = lazyWithRetry(() => import('./features/platform-policies/pages/PlatformPolicyDetailsPage'));
const EditPlatformPolicyVersionPage = lazyWithRetry(() => import('./features/platform-policies/pages/EditPlatformPolicyVersionPage'));
const CreditReviewPage = lazyWithRetry(() => import('./features/credit-review/pages/CreditReviewPage'));
const ApplicationsPage = lazyWithRetry(() => import('./features/applications/pages/ApplicationsPage'));
const ApplicationDetailsPage = lazyWithRetry(() => import('./features/applications/pages/ApplicationDetailsPage'));
const MlmPoliciesPage = lazyWithRetry(() => import('./features/mlm/pages/MlmPoliciesPage'));
const CreateMlmPolicyPage = lazyWithRetry(() => import('./features/mlm/pages/CreateMlmPolicyPage'));
const MlmPolicyDetailsPage = lazyWithRetry(() => import('./features/mlm/pages/MlmPolicyDetailsPage'));
const EditMlmPolicyVersionPage = lazyWithRetry(() => import('./features/mlm/pages/EditMlmPolicyVersionPage'));
const MlmDistributionDashboardPage = lazyWithRetry(() => import('./features/mlm/pages/MlmDistributionDashboardPage'));
const ProductsPage = lazyWithRetry(() => import('./features/products/pages/ProductsPage'), 'ProductsPage');
const CreateProductPage = lazyWithRetry(() => import('./features/products/pages/CreateProductPage'), 'CreateProductPage');
const ProductDetailsPage = lazyWithRetry(() => import('./features/products/pages/ProductDetailsPage'), 'ProductDetailsPage');
const EditProductVersionPage = lazyWithRetry(() => import('./features/products/pages/EditProductVersionPage'), 'EditProductVersionPage');
const PermissionsPage = lazyWithRetry(() => import('./features/permissions/pages/PermissionsPage'), 'PermissionsPage');
const PlatformProductsPage = lazyWithRetry(() => import('./features/platform-products/pages/PlatformProductsPage'), 'PlatformProductsPage');
const CreatePlatformProductPage = lazyWithRetry(() => import('./features/platform-products/pages/CreatePlatformProductPage'), 'CreatePlatformProductPage');
const EditPlatformProductPage = lazyWithRetry(() => import('./features/platform-products/pages/EditPlatformProductPage'), 'EditPlatformProductPage');
const RolesPage = lazyWithRetry(() => import('./features/roles/pages/RolesPage'), 'RolesPage');
const CreateRolePage = lazyWithRetry(() => import('./features/roles/pages/CreateRolePage'), 'CreateRolePage');
const RoleDetailsPage = lazyWithRetry(() => import('./features/roles/pages/RoleDetailsPage'), 'RoleDetailsPage');
const EditRolePage = lazyWithRetry(() => import('./features/roles/pages/EditRolePage'), 'EditRolePage');
const UsersPage = lazyWithRetry(() => import('./features/users/pages/UsersPage'), 'UsersPage');
const CreateUserPage = lazyWithRetry(() => import('./features/users/pages/CreateUserPage'), 'CreateUserPage');
const UserDetailsPage = lazyWithRetry(() => import('./features/users/pages/UserDetailsPage'), 'UserDetailsPage');
const EditUserPage = lazyWithRetry(() => import('./features/users/pages/EditUserPage'), 'EditUserPage');


function RedirectToCustomerLogin() {
  const location = useLocation();
  return <Navigate to={`/customer/login${location.search}`} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<Spinner label="Loading" />}>
    <Routes>
      {/* Public customer login & DigiLocker callback */}
      <Route path="/customer/login" element={<CustomerSignIn />} />
      <Route path="/customer/digilocker/callback" element={<DigiLockerCallbackPage />} />
      <Route path="/customer/mandate/result" element={<MandateResultPage />} />

      {/* Customer layout routes */}
      <Route element={<CustomerLayout />}>
        <Route path="/customer/dashboard" element={<CustomerDashboard />} />
        <Route path="/customer/application" element={<MyApplicationPage />} />
        <Route path="/customer/loan/:lan/post-approval" element={<PostApprovalJourneyPage />} />
        <Route path="/customer/loan/:lan/details" element={<CustomerLoanDetailsPage />} />
        <Route path="/customer/loan-details" element={<CustomerLoanDetailsPage />} />
        <Route path="/customer/profile" element={<CustomerProfilePage />} />
        <Route path="/customer/referral" element={<ReferralEarnPage />} />
        <Route path="/customer/support" element={<CustomerSupportPage />} />
      </Route>

      {/* Admin public login */}
      <Route path="/admin-master/login" element={<LoginPage />} />

      {/* Admin protected layout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          {/* Dashboard */}
          <Route
            path="/admin-master/dashboard"
            element={
              <PermissionRoute permission="ADMIN_DASHBOARD_VIEW">
                <DashboardPage />
              </PermissionRoute>
            }
          />

          {/* Debit Request List */}
          <Route
            path="/admin-master/debit-requests"
            element={
              <PermissionRoute permission="ADMIN_DASHBOARD_VIEW">
                <DebitRequestsPage />
              </PermissionRoute>
            }
          />

          {/* Platform Products */}
          <Route
            path="/admin-master/platform-products"
            element={
              <PermissionRoute permission="PLATFORM_PRODUCT_READ">
                <PlatformProductsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/platform-products/new"
            element={
              <PermissionRoute permission="PLATFORM_PRODUCT_CREATE">
                <CreatePlatformProductPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/platform-products/:platformProductId/edit"
            element={
              <PermissionRoute permission="PLATFORM_PRODUCT_UPDATE">
                <EditPlatformProductPage />
              </PermissionRoute>
            }
          />

          {/* Lenders */}
          <Route
            path="/admin-master/lenders"
            element={
              <PermissionRoute permission="LENDER_READ">
                <LendersPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/lenders/new"
            element={
              <PermissionRoute permission="LENDER_CREATE">
                <CreateLenderPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/lenders/:lenderId"
            element={
              <PermissionRoute permission="LENDER_READ">
                <LenderDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/lenders/:lenderId/edit"
            element={
              <PermissionRoute permission="LENDER_UPDATE">
                <EditLenderPage />
              </PermissionRoute>
            }
          />

          {/* Credit Review */}
          <Route
            path="/admin-master/credit-review"
            element={
              <PermissionRoute permission="APPLICATION_VIEW_MASKED">
                <CreditReviewPage />
              </PermissionRoute>
            }
          />

          {/* Referral Management */}
          <Route
            path="/admin-master/referrals"
            element={
              <PermissionRoute permission="ADMIN_DASHBOARD_VIEW">
                <ReferralManagementPage />
              </PermissionRoute>
            }
          />

          {/* Marketing & Partner Management */}
          <Route
            path="/admin-master/marketing-partners"
            element={
              <PermissionRoute permission="ADMIN_DASHBOARD_VIEW">
                <MarketingPartnersPage />
              </PermissionRoute>
            }
          />

          {/* Applications */}
          <Route
            path="/admin-master/applications"
            element={
              <PermissionRoute permission="APPLICATION_VIEW_MASKED">
                <ApplicationsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/applications/:applicationId"
            element={
              <PermissionRoute permission="APPLICATION_VIEW_MASKED">
                <ApplicationDetailsPage />
              </PermissionRoute>
            }
          />

          {/* MLM Routes */}
          <Route
            path="/admin-master/mlm-policies"
            element={
              <PermissionRoute permission="MLM_READ">
                <MlmPoliciesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/mlm-policies/:policyId"
            element={
              <PermissionRoute permission="MLM_READ">
                <MlmPolicyDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/mlm-policies/create"
            element={
              <PermissionRoute permission="MLM_CREATE">
                <CreateMlmPolicyPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/mlm-policy-versions/:versionId/edit"
            element={
              <PermissionRoute permission="MLM_UPDATE">
                <EditMlmPolicyVersionPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/mlm-distribution"
            element={
              <PermissionRoute permission="MLM_READ">
                <MlmDistributionDashboardPage />
              </PermissionRoute>
            }
          />

          {/* Products */}
          <Route
            path="/admin-master/products"
            element={
              <PermissionRoute permission="PRODUCT_READ">
                <ProductsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/products/new"
            element={
              <PermissionRoute permission="PRODUCT_CREATE">
                <CreateProductPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/products/:productId"
            element={
              <PermissionRoute permission="PRODUCT_READ">
                <ProductDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/products/:productId/versions/:versionId/edit"
            element={
              <PermissionRoute permission="PRODUCT_UPDATE">
                <EditProductVersionPage />
              </PermissionRoute>
            }
          />

          {/* Platform Policies */}
          <Route path="/admin-master/platform-policies" element={
            <PermissionRoute permission="POLICY_READ">
              <PlatformPoliciesPage />
            </PermissionRoute>
          } />
          <Route path="/admin-master/platform-policies/new" element={
            <PermissionRoute permission="POLICY_CREATE">
              <CreatePlatformPolicyPage />
            </PermissionRoute>
          } />
          <Route path="/admin-master/platform-policies/:policyId" element={
            <PermissionRoute permission="POLICY_READ">
              <PlatformPolicyDetailsPage />
            </PermissionRoute>
          } />
          <Route path="/admin-master/platform-policies/:policyId/versions/:versionId/edit" element={
            <PermissionRoute permission="POLICY_UPDATE">
              <EditPlatformPolicyVersionPage />
            </PermissionRoute>
          } />

          {/* Permissions */}
          <Route
            path="/admin-master/permissions"
            element={
              <PermissionRoute permission="PERMISSION_READ">
                <PermissionsPage />
              </PermissionRoute>
            }
          />

          {/* Roles */}
          <Route
            path="/admin-master/roles"
            element={
              <PermissionRoute permission="ROLE_READ">
                <RolesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/roles/new"
            element={
              <PermissionRoute permission="ROLE_CREATE">
                <CreateRolePage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/roles/:roleId"
            element={
              <PermissionRoute permission="ROLE_READ">
                <RoleDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/roles/:roleId/edit"
            element={
              <PermissionRoute permission="ROLE_UPDATE">
                <EditRolePage />
              </PermissionRoute>
            }
          />

          {/* Users */}
          <Route
            path="/admin-master/users"
            element={
              <PermissionRoute permission="USER_READ">
                <UsersPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/users/new"
            element={
              <PermissionRoute permission="USER_CREATE">
                <CreateUserPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/users/:userId"
            element={
              <PermissionRoute permission="USER_READ">
                <UserDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/admin-master/users/:userId/edit"
            element={
              <PermissionRoute permission="USER_UPDATE">
                <EditUserPage />
              </PermissionRoute>
            }
          />

          {/* Sessions */}
          <Route
            path="/admin-master/sessions"
            element={
              <PermissionRoute permission="SESSION_READ_OWN">
                <SessionsPage />
              </PermissionRoute>
            }
          />
        </Route>
      </Route>

      {/* Root redirects to customer login while preserving query parameters */}
      <Route path="/" element={<RedirectToCustomerLogin />} />
      <Route path="*" element={<RedirectToCustomerLogin />} />
    </Routes>
    </Suspense>
  );
}