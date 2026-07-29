import { Navigate, Route, Routes } from 'react-router-dom';

import { AdminLayout } from './components/AdminLayout';
import { PermissionRoute, ProtectedRoute } from './components/ProtectedRoute';


// Customer
import CustomerLayout from './components/layout/customer/CustomerLayout';
import CustomerSignIn from './features/auth/pages/CustomerSignIn';
import CustomerDashboard from './features/customer/pages/CustomerDashboard';
import CustomerPlaceholderPage from './features/customer/pages/CustomerPlaceholderPage';
import MyApplicationPage from './features/customer/pages/MyApplicationPage';
import PostApprovalJourneyPage from './features/customer/pages/PostApprovalJourneyPage';
import DigiLockerCallbackPage from './features/customer/pages/DigiLockerCallbackPage';

// Admin auth + core
import { LoginPage } from './features/auth/pages/LoginPage';
import { DashboardPage } from './features/dashboard/pages/DashboardPage';
import { SessionsPage } from './features/admin/pages/SessionsPage';

// Lenders
import { LendersPage } from './features/lenders/pages/LendersPage';
import { CreateLenderPage } from './features/lenders/pages/CreateLenderPage';
import { LenderDetailsPage } from './features/lenders/pages/LenderDetailsPage';
import { EditLenderPage } from './features/lenders/pages/EditLenderPage';

import PlatformPoliciesPage from './features/platform-policies/pages/PlatformPoliciesPage';
import CreatePlatformPolicyPage from './features/platform-policies/pages/CreatePlatformPolicyPage';
import PlatformPolicyDetailsPage from './features/platform-policies/pages/PlatformPolicyDetailsPage';
import EditPlatformPolicyVersionPage from './features/platform-policies/pages/EditPlatformPolicyVersionPage';

// MLM
import MlmPoliciesPage from './features/mlm/pages/MlmPoliciesPage';
import CreateMlmPolicyPage from './features/mlm/pages/CreateMlmPolicyPage';
import MlmPolicyDetailsPage from './features/mlm/pages/MlmPolicyDetailsPage';
import EditMlmPolicyVersionPage from './features/mlm/pages/EditMlmPolicyVersionPage';
import MlmDistributionDashboardPage from './features/mlm/pages/MlmDistributionDashboardPage';

// Products
import { ProductsPage } from './features/products/pages/ProductsPage';
import { CreateProductPage } from './features/products/pages/CreateProductPage';
import { ProductDetailsPage } from './features/products/pages/ProductDetailsPage';
import { EditProductVersionPage } from './features/products/pages/EditProductVersionPage';

// Permissions
import { PermissionsPage } from './features/permissions/pages/PermissionsPage';

// Platform Products
import { PlatformProductsPage } from './features/platform-products/pages/PlatformProductsPage';
import { CreatePlatformProductPage } from './features/platform-products/pages/CreatePlatformProductPage';
import { EditPlatformProductPage } from './features/platform-products/pages/EditPlatformProductPage';

// Roles
import { RolesPage } from './features/roles/pages/RolesPage';
import { CreateRolePage } from './features/roles/pages/CreateRolePage';
import { RoleDetailsPage } from './features/roles/pages/RoleDetailsPage';
import { EditRolePage } from './features/roles/pages/EditRolePage';

// Users
import { UsersPage } from './features/users/pages/UsersPage';
import { CreateUserPage } from './features/users/pages/CreateUserPage';
import { UserDetailsPage } from './features/users/pages/UserDetailsPage';
import { EditUserPage } from './features/users/pages/EditUserPage';




export default function App() {
  return (
    <Routes>
      {/* Public customer login & DigiLocker callback */}
      <Route path="/customer/login" element={<CustomerSignIn />} />
      <Route path="/customer/digilocker/callback" element={<DigiLockerCallbackPage />} />

      {/* Customer layout routes */}
      <Route element={<CustomerLayout />}>
        <Route path="/customer/dashboard" element={<CustomerDashboard />} />
        <Route path="/customer/application" element={<MyApplicationPage />} />
        <Route path="/customer/loan/:lan/post-approval" element={<PostApprovalJourneyPage />} />
        <Route
          path="/customer/loan-details"
          element={
            <CustomerPlaceholderPage
              title="Loan Details"
              description="Your approved loan amount, tenure and repayment information will appear here."
            />
          }
        />
        <Route
          path="/customer/profile"
          element={
            <CustomerPlaceholderPage
              title="My Profile"
              description="Manage your personal and contact information."
            />
          }
        />
        <Route
          path="/customer/support"
          element={
            <CustomerPlaceholderPage
              title="Help & Support"
              description="Contact the Fintree Finance customer support team."
            />
          }
        />
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

      {/* Root redirects to customer login */}
      <Route path="/" element={<Navigate to="/customer/login" replace />} />
      <Route path="*" element={<Navigate to="/customer/login" replace />} />
    </Routes>
  );
}