import { lazy, Suspense } from "react";
import { Navigate, Route, BrowserRouter as Router, Routes, useParams } from "react-router";
import { ScrollToTop } from "./components/common/ScrollToTop";
import { GreenLoopStoreProvider } from "./store/GreenLoopStore";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PublicLanding from "./pages/site/PublicLanding";

function OfferNegotiationRedirect() {
  const { offerId } = useParams();
  return <Navigate to={`/app/negotiations/${offerId || ""}`} replace />;
}

function OrderWorkspaceRedirect() {
  const { orderId } = useParams();
  return <Navigate to={`/app/orders/${orderId || ""}`} replace />;
}

const AppLayout = lazy(() => import("./layout/AppLayout"));
const SignIn = lazy(() => import("./pages/AuthPages/SignIn"));
const SignUp = lazy(() => import("./pages/AuthPages/SignUp"));
const ForgotPassword = lazy(() => import("./pages/AuthPages/ForgotPassword"));
const Onboarding = lazy(() => import("./pages/AuthPages/Onboarding"));
const Allocations = lazy(() => import("./pages/app/Allocations"));
const Dashboard = lazy(() => import("./pages/app/Dashboard/Dashboard"));
const Materials = lazy(() => import("./pages/app/Materials"));
const NewSurvey = lazy(() => import("./pages/app/NewSurvey"));
const Projects = lazy(() => import("./pages/app/Projects"));
const ProjectDetails = lazy(() => import("./pages/app/ProjectDetails"));
const Verification = lazy(() => import("./pages/app/Verification"));
const Explore = lazy(() => import("./pages/app/Explore"));
const MarketDemand = lazy(() => import("./pages/app/MarketDemand"));
const Auctions = lazy(() => import("./pages/app/Auctions"));
const NegotiationPage = lazy(() => import("./pages/app/NegotiationPage"));
const Profile = lazy(() => import("./pages/app/Profile"));
const Support = lazy(() => import("./pages/app/Support"));
const Settings = lazy(() => import("./pages/app/Settings"));
const MaterialPassport = lazy(() => import("./pages/app/MaterialPassport"));
const AuditTrail = lazy(() => import("./pages/app/AuditTrail"));
const BookingsDeliveries = lazy(
  () => import("./pages/app/BookingsDeliveries"),
);
const ProcurementAssistantPage = lazy(
  () => import("./pages/app/ProcurementAssistantPage"),
);
const NotFound = lazy(() => import("./pages/OtherPage/NotFound"));
const ReceiverOverview = lazy(() => import("./pages/app/receiver/Overview"));
const ReceiverDemand = lazy(() => import("./pages/app/receiver/Demand"));
const ReceiverIncomingRequests = lazy(
  () => import("./pages/app/receiver/IncomingRequests"),
);
const ReceiverVerificationPage = lazy(
  () => import("./pages/app/receiver/ReceiverVerification"),
);
const ReceiverProviders = lazy(() => import("./pages/app/receiver/Providers"));
const ProviderMaterialDetails = lazy(
  () => import("./pages/app/receiver/ProviderMaterialDetails"),
);
const ReceiverInventory = lazy(
  () => import("./pages/app/receiver/Inventory"),
);
const WorkspaceSelector = lazy(
  () => import("./pages/app/WorkspaceSelector"),
);
const PhonePaymentApproval = lazy(
  () => import("./pages/app/PhonePaymentApproval"),
);
const AdminProtectedRoute = lazy(() => import("./components/admin/AdminProtectedRoute"));
const AdminRoleRoute = lazy(() => import("./components/admin/AdminRoleRoute"));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminSupport = lazy(() => import("./pages/admin/AdminSupport"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminHealth = lazy(() => import("./pages/admin/AdminHealth"));
const AdminMonetization = lazy(() => import("./pages/admin/AdminMonetization"));

function PageLoadingFallback() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-gray-50 px-6 dark:bg-gray-950"
    >
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-white px-10 py-8 text-center shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        <span
          aria-hidden="true"
          className="size-9 animate-spin rounded-full border-4 border-loop-600 border-t-transparent"
        />
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
          Loading GreenLoop…
        </span>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <GreenLoopStoreProvider>
        <Router>
          <ScrollToTop />
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              <Route element={<AdminProtectedRoute />}>
                <Route element={<AdminLayout />}>
                  <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
                  <Route path="/admin/overview" element={<AdminOverview />} />
                  <Route element={<AdminRoleRoute roles={["super_admin"]} />}><Route path="/admin/users" element={<AdminUsers />} /></Route>
                  <Route element={<AdminRoleRoute roles={["super_admin", "support_admin"]} />}><Route path="/admin/support" element={<AdminSupport />} /></Route>
                  <Route element={<AdminRoleRoute roles={["super_admin", "operations_admin"]} />}><Route path="/admin/orders" element={<AdminOrders />} /></Route>
                  <Route element={<AdminRoleRoute roles={["super_admin", "operations_admin"]} />}><Route path="/admin/health" element={<AdminHealth />} /></Route>
                  <Route element={<AdminRoleRoute roles={["super_admin", "operations_admin"]} />}><Route path="/admin/monetization" element={<AdminMonetization />} /></Route>
                </Route>
              </Route>
              {/* Experience 1 — public editorial website */}
              <Route index path="/" element={<PublicLanding />} />
              <Route path="/platform" element={<Navigate to="/app" replace />} />

              {/* Experience 2 — GreenLoop platform under AppLayout */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/app" element={<WorkspaceSelector />} />

                  {/* Provider Routes */}
                  <Route path="/app/explore" element={<Explore />} />
                  <Route path="/app/dashboard" element={<Dashboard />} />
                  <Route path="/app/operations" element={<Navigate to="/app/dashboard" replace />} />
                  <Route path="/app/projects/:id" element={<ProjectDetails />} />
                  <Route path="/app/projects" element={<Projects />} />
                  <Route path="/app/materials/new" element={<NewSurvey />} />
                  <Route path="/app/materials/:id" element={<MaterialPassport />} />
                  <Route path="/app/materials" element={<Materials />} />
                  <Route path="/app/receivers" element={<Navigate to="/app/market-demand?view=receivers" replace />} />
                  <Route path="/app/allocations" element={<Allocations />} />
                  <Route path="/app/bookings-deliveries" element={<BookingsDeliveries />} />
                  <Route path="/app/orders/:orderId" element={<BookingsDeliveries />} />
                  <Route path="/app/orders" element={<BookingsDeliveries />} />
                  <Route path="/app/orders-deliveries" element={<Navigate to="/app/orders" replace />} />
                  <Route path="/app/orders-deliveries/:orderId" element={<OrderWorkspaceRedirect />} />
                  <Route path="/app/receiver/orders" element={<Navigate to="/app/orders" replace />} />
                  <Route path="/app/receiver/orders/:orderId" element={<OrderWorkspaceRedirect />} />
                  <Route path="/app/bookings" element={<Navigate to="/app/bookings-deliveries" replace />} />
                  <Route path="/app/deliveries" element={<Navigate to="/app/bookings-deliveries" replace />} />
                  <Route path="/app/verification" element={<Verification />} />
                  <Route path="/app/reports" element={<Navigate to="/app/dashboard" replace />} />
                  <Route path="/app/market-demand" element={<MarketDemand />} />
                  <Route path="/app/auctions" element={<Auctions />} />
                  <Route path="/app/negotiations/:offerId" element={<NegotiationPage />} />
                  <Route path="/app/negotiation/:offerId" element={<OfferNegotiationRedirect />} />
                  <Route path="/app/negotiations" element={<Navigate to="/app/market-demand" replace />} />
                  <Route path="/app/negotiation" element={<Navigate to="/app/market-demand" replace />} />
                  <Route path="/app/profile" element={<Profile />} />
                  <Route path="/app/support" element={<Support />} />
                  <Route path="/app/settings" element={<Settings />} />
                  <Route path="/app/audit-trail" element={<AuditTrail />} />
                  <Route path="/app/assistant" element={<ProcurementAssistantPage />} />
                  <Route path="/app/procurement" element={<Navigate to="/app/receiver/providers" replace />} />
                  <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
                  <Route path="/profile" element={<Navigate to="/app/profile" replace />} />

                  {/* Receiver Routes */}
                  <Route path="/app/receiver/assistant" element={<ProcurementAssistantPage />} />
                  <Route path="/app/receiver/overview" element={<ReceiverOverview />} />
                  <Route path="/app/receiver/demand" element={<ReceiverDemand />} />
                  <Route path="/app/receiver/providers/:materialId" element={<ProviderMaterialDetails />} />
                  <Route path="/app/receiver/providers" element={<ReceiverProviders />} />
                  <Route path="/app/receiver/inventory" element={<ReceiverInventory />} />
                  <Route path="/app/receiver/capacity" element={<Navigate to="/app/receiver/demand?capacity=1" replace />} />
                  <Route path="/app/receiver/incoming-requests" element={<ReceiverIncomingRequests />} />
                  <Route path="/app/receiver/incoming" element={<Navigate to="/app/receiver/incoming-requests" replace />} />
                  <Route path="/app/receiver/deliveries" element={<Navigate to="/app/bookings-deliveries" replace />} />
                  <Route path="/app/receiver/verification" element={<ReceiverVerificationPage />} />
                </Route>
              </Route>

              {/* Public Phone UPI Payment Approval */}
              <Route path="/pay/:reference" element={<PhonePaymentApproval />} />

              {/* Auth */}
              <Route path="/sign-in" element={<SignIn />} />
              <Route path="/sign-up" element={<SignUp />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<Navigate to="/forgot-password" replace />} />
              <Route path="/onboarding" element={<Onboarding />} />

              {/* Fallback */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </Router>
      </GreenLoopStoreProvider>
    </AuthProvider>
  );
}
