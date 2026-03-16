// src/App.tsx
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import LoadingSpinner from './components/LoadingSpinner';
import LoginPage from './pages/LoginPage';
import { Landing } from './pages/Landing';
import AgentBrowsePage from './pages/agents/AgentBrowsePage';
import AgentProfilePage from './pages/agents/AgentProfilePage';
import TalkBrowsePage from './pages/talks/TalkBrowsePage';
import TalkDetailPage from './pages/talks/TalkDetailPage';
import BoothBrowsePage from './pages/booths/BoothBrowsePage';
import BoothDetailPage from './pages/booths/BoothDetailPage';
import ManifestoPage from './pages/manifesto/ManifestoPage';
import YearbookPage from './pages/yearbook/YearbookPage';
import MeetingDashboard from './pages/dashboard/MeetingDashboard';
import MyAgentPage from './pages/me/MyAgentPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import PhaseSwitchboard from './pages/admin/PhaseSwitchboard';
import EntityBrowser from './pages/admin/EntityBrowser';
import ModerationQueue from './pages/admin/ModerationQueue';

const AdminAgentDetail = lazy(() => import('./pages/admin/AdminAgentDetail'));
const FeedPage = lazy(() => import('./pages/feed/FeedPage'));
const KioskPage = lazy(() => import('./pages/display/KioskPage'));
const DisplayControls = lazy(() => import('./pages/admin/DisplayControls'));

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        {/* Public landing page (no auth) */}
        <Route path="/" element={<Landing />} />
        {/* Browse pages (require login per spec Section 2.8) */}
        <Route path="/agents" element={<ProtectedRoute><AgentBrowsePage /></ProtectedRoute>} />
        <Route path="/agents/:id" element={<ProtectedRoute><AgentProfilePage /></ProtectedRoute>} />
        <Route path="/talks" element={<ProtectedRoute><TalkBrowsePage /></ProtectedRoute>} />
        <Route path="/talks/:id" element={<ProtectedRoute><TalkDetailPage /></ProtectedRoute>} />
        <Route path="/booths" element={<ProtectedRoute><BoothBrowsePage /></ProtectedRoute>} />
        <Route path="/booths/:id" element={<ProtectedRoute><BoothDetailPage /></ProtectedRoute>} />
        <Route path="/manifesto" element={<ProtectedRoute><ManifestoPage /></ProtectedRoute>} />
        <Route path="/yearbook" element={<ProtectedRoute><YearbookPage /></ProtectedRoute>} />

        {/* Authenticated user pages */}
        <Route path="/dashboard" element={<ProtectedRoute><MeetingDashboard /></ProtectedRoute>} />
        <Route path="/me" element={<ProtectedRoute><MyAgentPage /></ProtectedRoute>} />

        {/* Feed page */}
        <Route path="/feed" element={<ProtectedRoute><Suspense fallback={<LoadingSpinner />}><FeedPage /></Suspense></ProtectedRoute>} />

        {/* Admin pages */}
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/phases" element={<AdminRoute><PhaseSwitchboard /></AdminRoute>} />
        <Route path="/admin/entities" element={<AdminRoute><EntityBrowser /></AdminRoute>} />
        <Route path="/admin/moderation" element={<AdminRoute><ModerationQueue /></AdminRoute>} />
        <Route path="/admin/agents/:id" element={<AdminRoute><Suspense fallback={<LoadingSpinner />}><AdminAgentDetail /></Suspense></AdminRoute>} />
        <Route path="/admin/displays" element={<AdminRoute><Suspense fallback={<LoadingSpinner />}><DisplayControls /></Suspense></AdminRoute>} />

      </Route>

      {/* Public display — outside Layout, no nav bar */}
      <Route path="/display/kiosk" element={<Suspense fallback={<LoadingSpinner />}><KioskPage /></Suspense>} />
    </Routes>
  );
}
