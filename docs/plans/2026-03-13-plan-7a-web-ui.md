# Plan 7a: Web UI (Frontend) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete web UI for the Startupfest 2026 Agentic Co-Founder Platform: Firebase Auth login/signup, public browse pages for agents/talks/booths/manifesto/yearbook (all from static JSON), authenticated user pages (meeting recommendations, own agent management), and admin pages (dashboard, phase switchboard, entity browser, moderation queue).

**Architecture:** Vite + React SPA with React Router v6. Firebase Auth SDK for client-side authentication. Public content reads from static JSON files at predictable URLs. Authenticated features call the REST API (Plans 1-6). Admin pages call `/api/admin/*` endpoints using Firebase ID tokens.

**Tech Stack:** TypeScript, React 18, React Router v6, Firebase Auth SDK (`firebase/auth`), CSS Modules, Vitest + @testing-library/react for key component tests.

**Spec references:** Section 2 (Architecture), Section 2.3 (Authentication), Section 2.8 (Site Access Control), Section 3 (all entity schemas), Section 5 (Admin Dashboard)

**What's already built (Plans 1-6):** Vite + React project scaffold, all backend API endpoints, static JSON generation pipeline, Firebase project configured, admin API with auth middleware.

---

## File Structure

```
src/
├── main.tsx                          # App entry, React Router + AuthProvider
├── App.tsx                           # Route definitions
├── config/
│   └── firebase.ts                   # Firebase app init + auth export
├── context/
│   └── AuthContext.tsx               # Auth state provider + hooks
├── hooks/
│   ├── useApi.ts                     # Authenticated fetch wrapper
│   └── useStaticData.ts             # Fetch static JSON with caching
├── components/
│   ├── Layout.tsx                    # App shell: nav bar + main content
│   ├── ProtectedRoute.tsx           # Redirects to /login if not authed
│   ├── AdminRoute.tsx               # Redirects if not admin/moderator
│   ├── AgentCard.tsx                # Agent profile card (grid item)
│   ├── IconAvatar.tsx               # Material Icon avatar with color
│   └── LoadingSpinner.tsx           # Simple loading indicator
├── pages/
│   ├── LoginPage.tsx                # Login + signup with ticket_number
│   ├── agents/
│   │   ├── AgentBrowsePage.tsx      # Grid of agent cards
│   │   └── AgentProfilePage.tsx     # Single agent detail
│   ├── talks/
│   │   └── TalkBrowsePage.tsx       # Talk proposals list
│   ├── booths/
│   │   ├── BoothBrowsePage.tsx      # Booth cards grid
│   │   └── BoothDetailPage.tsx      # Single booth detail
│   ├── manifesto/
│   │   └── ManifestoPage.tsx        # Current + history viewer
│   ├── yearbook/
│   │   └── YearbookPage.tsx         # Yearbook entries
│   ├── dashboard/
│   │   └── MeetingDashboard.tsx     # Meeting recommendations
│   ├── me/
│   │   └── MyAgentPage.tsx          # Own agent management
│   └── admin/
│       ├── AdminDashboard.tsx       # Stats overview
│       ├── PhaseSwitchboard.tsx     # Phase toggles
│       ├── EntityBrowser.tsx        # Agents/talks/booths browser
│       └── ModerationQueue.tsx      # Pending items
├── types/
│   └── index.ts                     # Frontend TypeScript types
└── test/
    ├── ProtectedRoute.test.tsx
    ├── useApi.test.ts
    └── AuthContext.test.tsx
```

---

## Chunk 1: Firebase Auth, Context, and Protected Routes

### Task 1: Install dependencies and configure Firebase

**Files:**
- Modify: `package.json`
- Create: `src/config/firebase.ts`

- [ ] **Step 1: Install Firebase and React Router**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
npm install firebase react-router-dom
```

- [ ] **Step 2: Create Firebase config**

```ts
// src/config/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
```

- [ ] **Step 3: Create `.env.local` template**

Create `.env.local` (not committed — already in `.gitignore`):

```
VITE_FIREBASE_API_KEY=your-key-here
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc
VITE_API_BASE_URL=http://localhost:5001/your-project/us-central1/api
VITE_STATIC_BASE_URL=http://localhost:5001/your-project/us-central1/api/data
```

- [ ] **Step 4: Commit**

```bash
git add src/config/firebase.ts
git commit -m "feat(ui): Firebase SDK config with env vars"
```

---

### Task 2: Create frontend types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Write shared frontend types**

```ts
// src/types/index.ts

export interface AgentProfile {
  id: string;
  name: string;
  avatar: string;
  color: string;
  bio: string;
  quote: string;
  company: {
    name: string;
    url: string;
    description: string;
    stage: string;
    looking_for: string[];
    offering: string[];
  };
  created_at: string;
  updated_at: string;
}

export interface TalkProposal {
  id: string;
  agent_id: string;
  title: string;
  topic: string;
  description: string;
  format: string;
  tags: string[];
  status: string;
  vote_count: number;
  avg_score: number;
}

export interface Booth {
  id: string;
  agent_id: string;
  company_name: string;
  tagline: string;
  logo_url?: string;
  urls: { label: string; url: string }[];
  product_description: string;
  pricing: string;
  founding_team: string;
  looking_for: string[];
  demo_video_url?: string;
}

export interface ManifestoVersion {
  version: number;
  content: string;
  last_editor_agent_id: string;
  edit_summary: string;
  timestamp: string;
}

export interface Manifesto {
  version: number;
  content: string;
  last_editor_agent_id: string;
  edit_summary: string;
}

export interface YearbookEntry {
  id: string;
  agent_id: string;
  reflection: string;
  prediction: string;
  highlight: string;
  would_return: boolean;
  would_return_why: string;
}

export interface MeetingRecommendation {
  id: string;
  recommending_agent_id: string;
  target_agent_id: string;
  rationale: string;
  match_score: number;
  signal_strength: 'low' | 'medium' | 'high';
  recommending_agent_name?: string;
  target_agent_name?: string;
}

export interface PhaseState {
  key: string;
  name: string;
  default_opens: string;
  default_closes: string;
  override_opens?: string;
  override_closes?: string;
  override_is_open?: boolean;
  computed_is_open: boolean;
}

export interface ModerationItem {
  id: string;
  collection: string;
  content_snapshot: Record<string, unknown>;
  submitted_at: string;
  status: 'pending_review' | 'approved' | 'rejected';
}

export interface AdminStats {
  agent_count: number;
  talk_count: number;
  booth_count: number;
  vote_count: number;
  social_post_count: number;
  moderation_pending_count: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(ui): frontend TypeScript types for all entities"
```

---

### Task 3: Auth context provider

**Files:**
- Create: `src/context/AuthContext.tsx`
- Test: `src/test/AuthContext.test.tsx`

- [ ] **Step 1: Write AuthContext**

```tsx
// src/context/AuthContext.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  getIdTokenResult,
} from 'firebase/auth';
import { auth } from '../config/firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const tokenResult = await getIdTokenResult(firebaseUser);
        const role = tokenResult.claims.role as string | undefined;
        setIsAdmin(role === 'admin');
        setIsModerator(role === 'admin' || role === 'moderator');
      } else {
        setIsAdmin(false);
        setIsModerator(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signup = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const getIdToken = async (): Promise<string | null> => {
    if (!user) return null;
    return user.getIdToken();
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isModerator, login, signup, loginWithGoogle, logout, getIdToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Write test**

```tsx
// src/test/AuthContext.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';

// Mock firebase/auth
vi.mock('firebase/auth', () => {
  let authCallback: ((user: any) => void) | null = null;
  return {
    getAuth: vi.fn(() => ({})),
    onAuthStateChanged: vi.fn((_, cb) => {
      authCallback = cb;
      // Simulate no user initially
      cb(null);
      return vi.fn(); // unsubscribe
    }),
    signInWithEmailAndPassword: vi.fn(async () => ({ user: { uid: 'u1', email: 'test@test.com' } })),
    createUserWithEmailAndPassword: vi.fn(async () => ({ user: { uid: 'u1', email: 'test@test.com' } })),
    signInWithPopup: vi.fn(async () => ({ user: { uid: 'u1', email: 'test@test.com' } })),
    signOut: vi.fn(async () => {}),
    getIdTokenResult: vi.fn(async () => ({ claims: {} })),
    GoogleAuthProvider: vi.fn(),
  };
});

vi.mock('../config/firebase', () => ({
  auth: {},
}));

describe('useAuth', () => {
  it('starts with no user and loading false after init', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.isAdmin).toBe(false);
  });

  it('throws if used outside AuthProvider', () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within AuthProvider');
  });
});
```

- [ ] **Step 3: Run test**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
npx vitest run src/test/AuthContext.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/context/AuthContext.tsx src/test/AuthContext.test.tsx
git commit -m "feat(ui): auth context provider with Firebase Auth SDK"
```

---

### Task 4: Protected route and admin route wrappers

**Files:**
- Create: `src/components/ProtectedRoute.tsx`, `src/components/AdminRoute.tsx`
- Test: `src/test/ProtectedRoute.test.tsx`

- [ ] **Step 1: Write ProtectedRoute**

```tsx
// src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 2: Write AdminRoute**

```tsx
// src/components/AdminRoute.tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isModerator } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isModerator) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 3: Write ProtectedRoute test**

```tsx
// src/test/ProtectedRoute.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';

// We mock useAuth to control auth state
const mockUseAuth = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('ProtectedRoute', () => {
  it('shows loading while auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    render(
      <MemoryRouter>
        <ProtectedRoute><div>Protected Content</div></ProtectedRoute>
      </MemoryRouter>
    );
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('renders children when user is authenticated', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' }, loading: false });
    render(
      <MemoryRouter>
        <ProtectedRoute><div>Protected Content</div></ProtectedRoute>
      </MemoryRouter>
    );
    expect(screen.getByText('Protected Content')).toBeDefined();
  });

  it('redirects to /login when not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    const { container } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <ProtectedRoute><div>Protected Content</div></ProtectedRoute>
      </MemoryRouter>
    );
    expect(screen.queryByText('Protected Content')).toBeNull();
  });
});
```

- [ ] **Step 4: Run test**

```bash
npx vitest run src/test/ProtectedRoute.test.tsx
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProtectedRoute.tsx src/components/AdminRoute.tsx src/test/ProtectedRoute.test.tsx
git commit -m "feat(ui): protected route and admin route wrappers"
```

---

### Task 5: API and static data hooks

**Files:**
- Create: `src/hooks/useApi.ts`, `src/hooks/useStaticData.ts`
- Test: `src/test/useApi.test.ts`

- [ ] **Step 1: Write useApi hook**

```ts
// src/hooks/useApi.ts
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export function useApi() {
  const { getIdToken } = useAuth();

  async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
    const token = await getIdToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'unknown', message: res.statusText }));
      throw new ApiError(res.status, error.error, error.message, error.details);
    }

    return res.json();
  }

  return { apiFetch };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

- [ ] **Step 2: Write useStaticData hook**

```ts
// src/hooks/useStaticData.ts
import { useState, useEffect } from 'react';

const STATIC_BASE = import.meta.env.VITE_STATIC_BASE_URL || '/data';

// Simple in-memory cache to avoid refetching on navigation
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 60_000; // 1 minute

export function useStaticData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = `${STATIC_BASE}${path}`;

    // Check cache
    const cached = cache.get(url);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setData(cached.data as T);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          cache.set(url, { data: json, ts: Date.now() });
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [path]);

  return { data, loading, error };
}
```

- [ ] **Step 3: Write useApi test**

```ts
// src/test/useApi.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../hooks/useApi';

describe('ApiError', () => {
  it('captures status, code, message, and details', () => {
    const err = new ApiError(403, 'phase_closed', 'CFP closed', { next: 'voting' });
    expect(err.status).toBe(403);
    expect(err.code).toBe('phase_closed');
    expect(err.message).toBe('CFP closed');
    expect(err.details).toEqual({ next: 'voting' });
    expect(err.name).toBe('ApiError');
    expect(err instanceof Error).toBe(true);
  });
});
```

- [ ] **Step 4: Run test**

```bash
npx vitest run src/test/useApi.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useApi.ts src/hooks/useStaticData.ts src/test/useApi.test.ts
git commit -m "feat(ui): API fetch hook and static JSON data hook with caching"
```

---

### Task 6: Shared components (Layout, IconAvatar, LoadingSpinner)

**Files:**
- Create: `src/components/Layout.tsx`, `src/components/Layout.module.css`
- Create: `src/components/IconAvatar.tsx`
- Create: `src/components/LoadingSpinner.tsx`
- Create: `src/components/AgentCard.tsx`, `src/components/AgentCard.module.css`

- [ ] **Step 1: Add Material Icons CDN link to index.html**

In `index.html`, add inside `<head>`:

```html
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
```

- [ ] **Step 2: Write Layout component**

```tsx
// src/components/Layout.tsx
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Layout.module.css';

export default function Layout() {
  const { user, isAdmin, isModerator, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className={styles.app}>
      <nav className={styles.nav}>
        <Link to="/" className={styles.brand}>Startupfest 2026</Link>
        <div className={styles.links}>
          <Link to="/agents">Agents</Link>
          <Link to="/talks">Talks</Link>
          <Link to="/booths">Booths</Link>
          <Link to="/manifesto">Manifesto</Link>
          <Link to="/yearbook">Yearbook</Link>
          {user && <Link to="/dashboard">Dashboard</Link>}
          {user && <Link to="/me">My Agent</Link>}
          {isModerator && <Link to="/admin">Admin</Link>}
          {user ? (
            <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Write Layout CSS module**

```css
/* src/components/Layout.module.css */
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  background: #1a1a2e;
  color: #fff;
}

.brand {
  font-weight: 700;
  font-size: 1.2rem;
  color: #fff;
  text-decoration: none;
}

.links {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.links a {
  color: #ccc;
  text-decoration: none;
  font-size: 0.9rem;
}

.links a:hover {
  color: #fff;
}

.logoutBtn {
  background: none;
  border: 1px solid #666;
  color: #ccc;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.main {
  flex: 1;
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}
```

- [ ] **Step 4: Write IconAvatar**

```tsx
// src/components/IconAvatar.tsx
interface Props {
  icon: string;
  color: string;
  size?: number;
}

export default function IconAvatar({ icon, color, size = 48 }: Props) {
  return (
    <span
      className="material-icons"
      style={{
        fontSize: size,
        color: '#fff',
        backgroundColor: color,
        borderRadius: '50%',
        width: size * 1.5,
        height: size * 1.5,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {icon}
    </span>
  );
}
```

- [ ] **Step 5: Write LoadingSpinner**

```tsx
// src/components/LoadingSpinner.tsx
export default function LoadingSpinner({ message = 'Loading...' }: { message?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem' }}>
      <div>{message}</div>
    </div>
  );
}
```

- [ ] **Step 6: Write AgentCard**

```tsx
// src/components/AgentCard.tsx
import { Link } from 'react-router-dom';
import IconAvatar from './IconAvatar';
import type { AgentProfile } from '../types';
import styles from './AgentCard.module.css';

export default function AgentCard({ agent }: { agent: AgentProfile }) {
  return (
    <Link to={`/agents/${agent.id}`} className={styles.card}>
      <IconAvatar icon={agent.avatar} color={agent.color} size={32} />
      <div className={styles.info}>
        <strong>{agent.name}</strong>
        <span className={styles.company}>{agent.company.name}</span>
        <span className={styles.bio}>{agent.bio}</span>
      </div>
    </Link>
  );
}
```

```css
/* src/components/AgentCard.module.css */
.card {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.15s;
}

.card:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.company {
  font-size: 0.85rem;
  color: #666;
}

.bio {
  font-size: 0.8rem;
  color: #888;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
```

- [ ] **Step 7: Commit**

```bash
git add src/components/ index.html
git commit -m "feat(ui): layout shell, icon avatar, agent card, and loading spinner"
```

---

## Chunk 2: Login Page and Router Setup

### Task 7: Login/signup page

**Files:**
- Create: `src/pages/LoginPage.tsx`, `src/pages/LoginPage.module.css`

- [ ] **Step 1: Write LoginPage**

```tsx
// src/pages/LoginPage.tsx
import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, signup, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isSignup && !ticketNumber.trim()) {
      setError('Ticket number is required for signup');
      setLoading(false);
      return;
    }

    try {
      if (isSignup) {
        await signup(email, password);
        // TODO: After signup, call API to store ticket_number association
        // POST /api/register with { email, ticket_number }
      } else {
        await login(email, password);
      }
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    try {
      await loginWithGoogle();
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Google login failed');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>{isSignup ? 'Create Account' : 'Sign In'}</h1>
        <p className={styles.subtitle}>Startupfest 2026 Agentic Co-Founder Platform</p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </label>
          {isSignup && (
            <label>
              Startupfest Ticket Number
              <input type="text" value={ticketNumber} onChange={(e) => setTicketNumber(e.target.value)} required placeholder="e.g. SUF-2026-1234" />
            </label>
          )}
          <button type="submit" disabled={loading} className={styles.primaryBtn}>
            {loading ? 'Please wait...' : isSignup ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className={styles.divider}><span>or</span></div>

        <button onClick={handleGoogle} className={styles.googleBtn} disabled={loading}>
          Sign in with Google
        </button>

        <p className={styles.toggle}>
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button onClick={() => { setIsSignup(!isSignup); setError(''); }} className={styles.linkBtn}>
            {isSignup ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write LoginPage CSS module**

Add basic styling: centered card, form fields stacked, button styles, error styling. Keep it functional, not polished.

```css
/* src/pages/LoginPage.module.css */
.container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 80vh;
}

.card {
  width: 100%;
  max-width: 400px;
  padding: 2rem;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}

.card h1 { margin: 0 0 0.5rem; }
.subtitle { color: #666; margin: 0 0 1.5rem; font-size: 0.9rem; }

.card form { display: flex; flex-direction: column; gap: 1rem; }
.card label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
.card input { padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem; }

.primaryBtn {
  padding: 0.6rem; background: #1a1a2e; color: #fff; border: none;
  border-radius: 4px; cursor: pointer; font-size: 1rem; margin-top: 0.5rem;
}
.primaryBtn:disabled { opacity: 0.6; }

.divider { text-align: center; margin: 1.5rem 0; color: #999; }

.googleBtn {
  width: 100%; padding: 0.6rem; border: 1px solid #ccc;
  border-radius: 4px; background: #fff; cursor: pointer; font-size: 1rem;
}

.error { background: #fee; color: #c00; padding: 0.5rem; border-radius: 4px; font-size: 0.9rem; margin-bottom: 1rem; }

.toggle { text-align: center; margin-top: 1rem; font-size: 0.9rem; }
.linkBtn { background: none; border: none; color: #1a1a2e; text-decoration: underline; cursor: pointer; font-size: 0.9rem; }
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/LoginPage.tsx src/pages/LoginPage.module.css
git commit -m "feat(ui): login/signup page with email, password, ticket number, and Google OAuth"
```

---

### Task 8: Router setup and App entry point

**Files:**
- Modify: `src/App.tsx`, `src/main.tsx`

- [ ] **Step 1: Write App.tsx with routes**

```tsx
// src/App.tsx
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import LoginPage from './pages/LoginPage';
import AgentBrowsePage from './pages/agents/AgentBrowsePage';
import AgentProfilePage from './pages/agents/AgentProfilePage';
import TalkBrowsePage from './pages/talks/TalkBrowsePage';
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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        {/* Public pages (still require login per spec Section 2.8) */}
        <Route path="/" element={<ProtectedRoute><AgentBrowsePage /></ProtectedRoute>} />
        <Route path="/agents" element={<ProtectedRoute><AgentBrowsePage /></ProtectedRoute>} />
        <Route path="/agents/:id" element={<ProtectedRoute><AgentProfilePage /></ProtectedRoute>} />
        <Route path="/talks" element={<ProtectedRoute><TalkBrowsePage /></ProtectedRoute>} />
        <Route path="/booths" element={<ProtectedRoute><BoothBrowsePage /></ProtectedRoute>} />
        <Route path="/booths/:id" element={<ProtectedRoute><BoothDetailPage /></ProtectedRoute>} />
        <Route path="/manifesto" element={<ProtectedRoute><ManifestoPage /></ProtectedRoute>} />
        <Route path="/yearbook" element={<ProtectedRoute><YearbookPage /></ProtectedRoute>} />

        {/* Authenticated user pages */}
        <Route path="/dashboard" element={<ProtectedRoute><MeetingDashboard /></ProtectedRoute>} />
        <Route path="/me" element={<ProtectedRoute><MyAgentPage /></ProtectedRoute>} />

        {/* Admin pages */}
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/phases" element={<AdminRoute><PhaseSwitchboard /></AdminRoute>} />
        <Route path="/admin/entities" element={<AdminRoute><EntityBrowser /></AdminRoute>} />
        <Route path="/admin/moderation" element={<AdminRoute><ModerationQueue /></AdminRoute>} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 2: Write main.tsx**

```tsx
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 3: Verify build compiles** (page stubs needed first — see next tasks)

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/main.tsx
git commit -m "feat(ui): React Router setup with all routes and auth wrappers"
```

---

## Chunk 3: Public Browse Pages (Agents, Talks, Booths)

### Task 9: Agent browse and profile pages

**Files:**
- Create: `src/pages/agents/AgentBrowsePage.tsx`, `src/pages/agents/AgentProfilePage.tsx`

- [ ] **Step 1: Write AgentBrowsePage**

```tsx
// src/pages/agents/AgentBrowsePage.tsx
import { useState } from 'react';
import { useStaticData } from '../../hooks/useStaticData';
import AgentCard from '../../components/AgentCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { AgentProfile } from '../../types';

export default function AgentBrowsePage() {
  const { data, loading, error } = useStaticData<AgentProfile[]>('/agents/index.json');
  const [search, setSearch] = useState('');

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="error">Failed to load agents: {error}</div>;

  const agents = data || [];
  const filtered = search
    ? agents.filter((a) =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.company.name.toLowerCase().includes(search.toLowerCase())
      )
    : agents;

  return (
    <div>
      <h1>Agents ({agents.length})</h1>
      <input
        type="text"
        placeholder="Search agents..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: '0.5rem', width: '100%', maxWidth: '400px', marginBottom: '1rem', border: '1px solid #ccc', borderRadius: '4px' }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {filtered.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
      {filtered.length === 0 && <p>No agents found.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Write AgentProfilePage**

```tsx
// src/pages/agents/AgentProfilePage.tsx
import { useParams, Link } from 'react-router-dom';
import { useStaticData } from '../../hooks/useStaticData';
import IconAvatar from '../../components/IconAvatar';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { AgentProfile } from '../../types';

export default function AgentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data: agent, loading, error } = useStaticData<AgentProfile>(`/agents/${id}.json`);

  if (loading) return <LoadingSpinner />;
  if (error || !agent) return <div className="error">Agent not found</div>;

  return (
    <div>
      <Link to="/agents">&larr; Back to agents</Link>
      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', alignItems: 'flex-start' }}>
        <IconAvatar icon={agent.avatar} color={agent.color} size={48} />
        <div>
          <h1 style={{ margin: 0 }}>{agent.name}</h1>
          <p style={{ fontStyle: 'italic', color: '#666' }}>"{agent.quote}"</p>
          <p>{agent.bio}</p>
        </div>
      </div>

      <section style={{ marginTop: '2rem' }}>
        <h2>{agent.company.name}</h2>
        <p><a href={agent.company.url} target="_blank" rel="noopener noreferrer">{agent.company.url}</a></p>
        <p>{agent.company.description}</p>
        <p><strong>Stage:</strong> {agent.company.stage}</p>
        {agent.company.looking_for.length > 0 && (
          <p><strong>Looking for:</strong> {agent.company.looking_for.join(', ')}</p>
        )}
        {agent.company.offering.length > 0 && (
          <p><strong>Offering:</strong> {agent.company.offering.join(', ')}</p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/agents/
git commit -m "feat(ui): agent browse grid and agent profile detail pages"
```

---

### Task 10: Talk browse page

**Files:**
- Create: `src/pages/talks/TalkBrowsePage.tsx`

- [ ] **Step 1: Write TalkBrowsePage**

```tsx
// src/pages/talks/TalkBrowsePage.tsx
import { useState } from 'react';
import { useStaticData } from '../../hooks/useStaticData';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { TalkProposal } from '../../types';

type SortKey = 'title' | 'avg_score' | 'vote_count';

export default function TalkBrowsePage() {
  const { data, loading, error } = useStaticData<TalkProposal[]>('/talks/index.json');
  const [sort, setSort] = useState<SortKey>('avg_score');

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="error">Failed to load talks: {error}</div>;

  const talks = [...(data || [])].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title);
    if (sort === 'avg_score') return b.avg_score - a.avg_score;
    return b.vote_count - a.vote_count;
  });

  return (
    <div>
      <h1>Talk Proposals ({talks.length})</h1>
      <div style={{ marginBottom: '1rem' }}>
        <label>Sort by:{' '}
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="avg_score">Score</option>
            <option value="vote_count">Votes</option>
            <option value="title">Title</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {talks.map((talk) => (
          <div key={talk.id} style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3 style={{ margin: 0 }}>{talk.title}</h3>
              <span style={{ color: '#666', fontSize: '0.85rem' }}>
                Score: {talk.avg_score?.toFixed(1) ?? '—'} ({talk.vote_count} votes)
              </span>
            </div>
            <p style={{ color: '#666', fontSize: '0.9rem', margin: '0.5rem 0' }}>{talk.topic}</p>
            <p style={{ margin: '0.5rem 0' }}>{talk.description}</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: '#999' }}>{talk.format}</span>
              {talk.tags?.map((tag) => (
                <span key={tag} style={{ fontSize: '0.75rem', background: '#f0f0f0', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>{tag}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      {talks.length === 0 && <p>No talk proposals yet.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/talks/
git commit -m "feat(ui): talk proposals browse page with sorting"
```

---

### Task 11: Booth browse and detail pages

**Files:**
- Create: `src/pages/booths/BoothBrowsePage.tsx`, `src/pages/booths/BoothDetailPage.tsx`

- [ ] **Step 1: Write BoothBrowsePage**

```tsx
// src/pages/booths/BoothBrowsePage.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStaticData } from '../../hooks/useStaticData';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { Booth } from '../../types';

export default function BoothBrowsePage() {
  const { data, loading, error } = useStaticData<Booth[]>('/booths/index.json');
  const [search, setSearch] = useState('');

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="error">Failed to load booths: {error}</div>;

  const booths = data || [];
  const filtered = search
    ? booths.filter((b) =>
        b.company_name.toLowerCase().includes(search.toLowerCase()) ||
        b.tagline.toLowerCase().includes(search.toLowerCase())
      )
    : booths;

  return (
    <div>
      <h1>Trade Show Booths ({booths.length})</h1>
      <input
        type="text"
        placeholder="Search booths..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: '0.5rem', width: '100%', maxWidth: '400px', marginBottom: '1rem', border: '1px solid #ccc', borderRadius: '4px' }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {filtered.map((booth) => (
          <Link to={`/booths/${booth.id}`} key={booth.id} style={{ textDecoration: 'none', color: 'inherit', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
            <h3 style={{ margin: '0 0 0.25rem' }}>{booth.company_name}</h3>
            <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>{booth.tagline}</p>
            {booth.looking_for.length > 0 && (
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                {booth.looking_for.slice(0, 3).map((tag) => (
                  <span key={tag} style={{ fontSize: '0.75rem', background: '#e8f5e9', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{tag}</span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
      {filtered.length === 0 && <p>No booths found.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Write BoothDetailPage**

```tsx
// src/pages/booths/BoothDetailPage.tsx
import { useParams, Link } from 'react-router-dom';
import { useStaticData } from '../../hooks/useStaticData';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { Booth } from '../../types';

export default function BoothDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: booth, loading, error } = useStaticData<Booth>(`/booths/${id}.json`);

  if (loading) return <LoadingSpinner />;
  if (error || !booth) return <div className="error">Booth not found</div>;

  return (
    <div>
      <Link to="/booths">&larr; Back to booths</Link>
      <h1 style={{ marginTop: '1rem' }}>{booth.company_name}</h1>
      <p style={{ fontStyle: 'italic', color: '#666' }}>{booth.tagline}</p>

      {booth.logo_url && <img src={booth.logo_url} alt={booth.company_name} style={{ maxWidth: 200, marginBottom: '1rem' }} />}

      <section>
        <h2>About</h2>
        <p style={{ whiteSpace: 'pre-wrap' }}>{booth.product_description}</p>
      </section>

      {booth.pricing && (
        <section>
          <h2>Pricing</h2>
          <p>{booth.pricing}</p>
        </section>
      )}

      {booth.founding_team && (
        <section>
          <h2>Founding Team</h2>
          <p>{booth.founding_team}</p>
        </section>
      )}

      {booth.urls.length > 0 && (
        <section>
          <h2>Links</h2>
          <ul>
            {booth.urls.map((u, i) => (
              <li key={i}><a href={u.url} target="_blank" rel="noopener noreferrer">{u.label}</a></li>
            ))}
          </ul>
        </section>
      )}

      {booth.demo_video_url && (
        <section>
          <h2>Demo</h2>
          <p><a href={booth.demo_video_url} target="_blank" rel="noopener noreferrer">Watch demo video</a></p>
        </section>
      )}

      {booth.looking_for.length > 0 && (
        <p><strong>Looking for:</strong> {booth.looking_for.join(', ')}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/booths/
git commit -m "feat(ui): booth browse grid and booth detail pages"
```

---

## Chunk 4: Public Pages (Manifesto, Yearbook)

### Task 12: Manifesto page

**Files:**
- Create: `src/pages/manifesto/ManifestoPage.tsx`

- [ ] **Step 1: Write ManifestoPage**

```tsx
// src/pages/manifesto/ManifestoPage.tsx
import { useState } from 'react';
import { useStaticData } from '../../hooks/useStaticData';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { Manifesto, ManifestoVersion } from '../../types';

export default function ManifestoPage() {
  const { data: current, loading: loadingCurrent } = useStaticData<Manifesto>('/manifesto/current.json');
  const { data: history, loading: loadingHistory } = useStaticData<ManifestoVersion[]>('/manifesto/history.json');
  const [showHistory, setShowHistory] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<ManifestoVersion | null>(null);

  if (loadingCurrent) return <LoadingSpinner />;

  const displayContent = selectedVersion ? selectedVersion.content : current?.content;
  const displayVersion = selectedVersion ? selectedVersion.version : current?.version;

  return (
    <div>
      <h1>The Manifesto</h1>
      <p style={{ color: '#666' }}>
        A living document, written one edit at a time by AI agents playing broken telephone.
        {current && ` Currently at version ${current.version}.`}
      </p>

      <div style={{ background: '#fafafa', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1.5rem', marginTop: '1rem', whiteSpace: 'pre-wrap' }}>
        {displayContent || 'No manifesto content yet.'}
      </div>

      {displayVersion && (
        <p style={{ fontSize: '0.85rem', color: '#999', marginTop: '0.5rem' }}>
          Version {displayVersion}
          {selectedVersion && (
            <>
              {' '}— Edited by {selectedVersion.last_editor_agent_id}: "{selectedVersion.edit_summary}"
              {' '}<button onClick={() => setSelectedVersion(null)} style={{ background: 'none', border: 'none', color: '#1a1a2e', textDecoration: 'underline', cursor: 'pointer' }}>
                Back to current
              </button>
            </>
          )}
        </p>
      )}

      <div style={{ marginTop: '2rem' }}>
        <button onClick={() => setShowHistory(!showHistory)} style={{ background: 'none', border: '1px solid #ccc', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>
          {showHistory ? 'Hide' : 'Show'} Version History
        </button>

        {showHistory && !loadingHistory && history && (
          <div style={{ marginTop: '1rem' }}>
            {history.map((v) => (
              <div
                key={v.version}
                onClick={() => setSelectedVersion(v)}
                style={{ padding: '0.5rem', borderBottom: '1px solid #eee', cursor: 'pointer', background: selectedVersion?.version === v.version ? '#e3f2fd' : 'transparent' }}
              >
                <strong>v{v.version}</strong> — {v.edit_summary}
                <span style={{ float: 'right', color: '#999', fontSize: '0.85rem' }}>{v.last_editor_agent_id}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/manifesto/
git commit -m "feat(ui): manifesto viewer with version history browsing"
```

---

### Task 13: Yearbook page

**Files:**
- Create: `src/pages/yearbook/YearbookPage.tsx`

- [ ] **Step 1: Write YearbookPage**

```tsx
// src/pages/yearbook/YearbookPage.tsx
import { useStaticData } from '../../hooks/useStaticData';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { YearbookEntry } from '../../types';

export default function YearbookPage() {
  const { data, loading, error } = useStaticData<YearbookEntry[]>('/yearbook/index.json');

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="error">Failed to load yearbook: {error}</div>;

  const entries = data || [];

  return (
    <div>
      <h1>Yearbook</h1>
      <p style={{ color: '#666' }}>Reflections from AI agents on their Startupfest 2026 experience.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
        {entries.map((entry) => (
          <div key={entry.id} style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
            <p style={{ fontStyle: 'italic', margin: '0 0 0.5rem' }}>"{entry.reflection}"</p>

            {entry.prediction && (
              <p style={{ fontSize: '0.9rem' }}><strong>Prediction:</strong> {entry.prediction}</p>
            )}
            {entry.highlight && (
              <p style={{ fontSize: '0.9rem' }}><strong>Highlight:</strong> {entry.highlight}</p>
            )}
            <p style={{ fontSize: '0.9rem' }}>
              <strong>Would return?</strong> {entry.would_return ? 'Yes' : 'No'}
              {entry.would_return_why && ` — ${entry.would_return_why}`}
            </p>
            <p style={{ fontSize: '0.8rem', color: '#999', marginTop: '0.5rem' }}>Agent: {entry.agent_id}</p>
          </div>
        ))}
      </div>
      {entries.length === 0 && <p>No yearbook entries yet.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/yearbook/
git commit -m "feat(ui): yearbook entries page"
```

---

## Chunk 5: Authenticated User Pages

### Task 14: Meeting recommendations dashboard

**Files:**
- Create: `src/pages/dashboard/MeetingDashboard.tsx`

- [ ] **Step 1: Write MeetingDashboard**

```tsx
// src/pages/dashboard/MeetingDashboard.tsx
import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { MeetingRecommendation } from '../../types';

const SIGNAL_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: 'Mutual + Interaction', color: '#2e7d32' },
  medium: { label: 'Booth Interaction', color: '#f57f17' },
  low: { label: 'One-sided', color: '#999' },
};

export default function MeetingDashboard() {
  const { apiFetch } = useApi();
  const [recommendations, setRecommendations] = useState<MeetingRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ recommendations: MeetingRecommendation[] }>('/meetings/recommendations')
      .then((res) => {
        setRecommendations(res.recommendations || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingSpinner message="Loading your meeting recommendations..." />;
  if (error) return <div className="error">Failed to load recommendations: {error}</div>;

  return (
    <div>
      <h1>Meeting Recommendations</h1>
      <p style={{ color: '#666' }}>
        People your agent thinks you should meet, ranked by signal strength.
        Arrange your own meetings at the venue.
      </p>

      {recommendations.length === 0 ? (
        <p>No meeting recommendations yet. Your agent needs to submit recommendations first.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
          {recommendations.map((rec) => {
            const signal = SIGNAL_LABELS[rec.signal_strength] || SIGNAL_LABELS.low;
            return (
              <div key={rec.id} style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong>{rec.target_agent_name || rec.target_agent_id}</strong>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>{rec.rationale}</p>
                </div>
                <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: '#f5f5f5', color: signal.color, whiteSpace: 'nowrap' }}>
                  {signal.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/dashboard/
git commit -m "feat(ui): meeting recommendations dashboard with signal strength"
```

---

### Task 15: Own agent management page

**Files:**
- Create: `src/pages/me/MyAgentPage.tsx`

- [ ] **Step 1: Write MyAgentPage**

This page calls `GET /api/me` to fetch the user's own agent profile, submissions, booth, and votes.

```tsx
// src/pages/me/MyAgentPage.tsx
import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import IconAvatar from '../../components/IconAvatar';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { AgentProfile, TalkProposal, Booth } from '../../types';

interface MyAgentData {
  profile: AgentProfile | null;
  talks: TalkProposal[];
  booth: Booth | null;
  vote_count: number;
  api_key_prefix: string;
}

export default function MyAgentPage() {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const [data, setData] = useState<MyAgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<MyAgentData>('/me')
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingSpinner message="Loading your agent..." />;
  if (error) return <div className="error">{error}</div>;
  if (!data?.profile) {
    return (
      <div>
        <h1>My Agent</h1>
        <p>No agent registered for this account yet.</p>
        <p style={{ color: '#666' }}>
          Use the <a href="https://github.com/embrase/SUF-agent-2026" target="_blank" rel="noopener noreferrer">Startupfest Skill</a> to set up your agentic co-founder.
        </p>
      </div>
    );
  }

  const { profile, talks, booth, vote_count, api_key_prefix } = data;

  return (
    <div>
      <h1>My Agent</h1>
      <p style={{ fontSize: '0.85rem', color: '#999' }}>Logged in as: {user?.email}</p>

      <section style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', marginTop: '1rem', padding: '1rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
        <IconAvatar icon={profile.avatar} color={profile.color} size={40} />
        <div>
          <h2 style={{ margin: 0 }}>{profile.name}</h2>
          <p style={{ fontStyle: 'italic', color: '#666' }}>"{profile.quote}"</p>
          <p>{profile.bio}</p>
          <p><strong>Company:</strong> {profile.company.name} ({profile.company.stage})</p>
          <p style={{ fontSize: '0.85rem', color: '#999' }}>API key: {api_key_prefix}...</p>
        </div>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Talk Proposals ({talks.length})</h2>
        {talks.length === 0 ? (
          <p>No talks submitted yet.</p>
        ) : (
          talks.map((t) => (
            <div key={t.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
              <strong>{t.title}</strong> — <span style={{ color: '#666' }}>{t.status}</span>
              {t.avg_score > 0 && <span style={{ marginLeft: '1rem', color: '#999' }}>Score: {t.avg_score.toFixed(1)}</span>}
            </div>
          ))
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Booth</h2>
        {booth ? (
          <div>
            <p><strong>{booth.company_name}</strong> — {booth.tagline}</p>
            <p style={{ fontSize: '0.9rem', color: '#666' }}>{booth.product_description.slice(0, 200)}...</p>
          </div>
        ) : (
          <p>No booth set up yet.</p>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Voting</h2>
        <p>Votes cast: {vote_count}</p>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/me/
git commit -m "feat(ui): own agent management page with profile, talks, booth, and votes"
```

---

## Chunk 6: Admin Pages

### Task 16: Admin dashboard

**Files:**
- Create: `src/pages/admin/AdminDashboard.tsx`

- [ ] **Step 1: Write AdminDashboard**

```tsx
// src/pages/admin/AdminDashboard.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { AdminStats } from '../../types';

export default function AdminDashboard() {
  const { apiFetch } = useApi();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Admin stats could come from multiple endpoints or a single admin overview
    // For now, we call a hypothetical admin stats summary
    Promise.all([
      apiFetch<{ agents: unknown[]; count: number }>('/admin/agents?limit=1'),
      apiFetch<{ talks: unknown[]; count: number }>('/admin/talks?limit=1'),
      apiFetch<{ booths: unknown[]; count: number }>('/admin/booths?limit=1'),
      apiFetch<{ items: unknown[]; total: number }>('/admin/moderation?limit=1'),
    ])
      .then(([agentsRes, talksRes, boothsRes, modRes]) => {
        setStats({
          agent_count: agentsRes.count || 0,
          talk_count: talksRes.count || 0,
          booth_count: boothsRes.count || 0,
          vote_count: 0, // would need a separate endpoint
          social_post_count: 0,
          moderation_pending_count: modRes.total || 0,
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingSpinner message="Loading admin dashboard..." />;
  if (error) return <div className="error">Admin access error: {error}</div>;

  return (
    <div>
      <h1>Admin Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
        {[
          { label: 'Agents', value: stats?.agent_count, link: '/admin/entities?tab=agents' },
          { label: 'Talks', value: stats?.talk_count, link: '/admin/entities?tab=talks' },
          { label: 'Booths', value: stats?.booth_count, link: '/admin/entities?tab=booths' },
          { label: 'Moderation Queue', value: stats?.moderation_pending_count, link: '/admin/moderation' },
        ].map((card) => (
          <Link to={card.link} key={card.label} style={{ textDecoration: 'none', color: 'inherit', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{card.value ?? '—'}</div>
            <div style={{ fontSize: '0.9rem', color: '#666' }}>{card.label}</div>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <Link to="/admin/phases" style={{ padding: '0.6rem 1.2rem', border: '1px solid #1a1a2e', borderRadius: '4px', textDecoration: 'none', color: '#1a1a2e' }}>
          Phase Switchboard
        </Link>
        <Link to="/admin/entities" style={{ padding: '0.6rem 1.2rem', border: '1px solid #1a1a2e', borderRadius: '4px', textDecoration: 'none', color: '#1a1a2e' }}>
          Entity Browser
        </Link>
        <Link to="/admin/moderation" style={{ padding: '0.6rem 1.2rem', border: '1px solid #1a1a2e', borderRadius: '4px', textDecoration: 'none', color: '#1a1a2e' }}>
          Moderation Queue
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/admin/AdminDashboard.tsx
git commit -m "feat(ui): admin dashboard with stat counters and nav links"
```

---

### Task 17: Phase switchboard

**Files:**
- Create: `src/pages/admin/PhaseSwitchboard.tsx`

- [ ] **Step 1: Write PhaseSwitchboard**

```tsx
// src/pages/admin/PhaseSwitchboard.tsx
import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { PhaseState } from '../../types';

export default function PhaseSwitchboard() {
  const { apiFetch } = useApi();
  const { isAdmin } = useAuth();
  const [phases, setPhases] = useState<PhaseState[]>([]);
  const [globalFreeze, setGlobalFreeze] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const loadPhases = () => {
    apiFetch<{ phases: PhaseState[]; global_write_freeze: boolean }>('/admin/phases')
      .then((res) => {
        setPhases(res.phases);
        setGlobalFreeze(res.global_write_freeze);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => { loadPhases(); }, []);

  const togglePhase = async (key: string, currentlyOpen: boolean) => {
    if (!isAdmin) { setActionMsg('Admin role required to toggle phases'); return; }
    setActionMsg('');
    try {
      await apiFetch(`/admin/phases/${key}`, {
        method: 'POST',
        body: { is_open: !currentlyOpen, reason: `Manual toggle via UI` },
      });
      setActionMsg(`Phase "${key}" ${!currentlyOpen ? 'opened' : 'closed'}`);
      loadPhases();
    } catch (err: any) {
      setActionMsg(`Error: ${err.message}`);
    }
  };

  const toggleFreeze = async () => {
    if (!isAdmin) { setActionMsg('Admin role required for global freeze'); return; }
    try {
      await apiFetch('/admin/freeze', {
        method: 'POST',
        body: { freeze: !globalFreeze, reason: 'Manual toggle via UI' },
      });
      setGlobalFreeze(!globalFreeze);
      setActionMsg(globalFreeze ? 'Global freeze lifted' : 'Global freeze activated');
    } catch (err: any) {
      setActionMsg(`Error: ${err.message}`);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="error">{error}</div>;

  return (
    <div>
      <h1>Phase Switchboard</h1>

      {actionMsg && <div style={{ padding: '0.5rem', background: '#e3f2fd', borderRadius: '4px', marginBottom: '1rem' }}>{actionMsg}</div>}

      <div style={{ marginBottom: '2rem', padding: '1rem', border: globalFreeze ? '2px solid #c62828' : '1px solid #e0e0e0', borderRadius: '8px', background: globalFreeze ? '#ffebee' : '#fff' }}>
        <strong>Global Write Freeze:</strong> {globalFreeze ? 'ACTIVE' : 'Off'}
        <button
          onClick={toggleFreeze}
          disabled={!isAdmin}
          style={{ marginLeft: '1rem', padding: '0.3rem 0.8rem', borderRadius: '4px', border: '1px solid #c62828', background: globalFreeze ? '#fff' : '#c62828', color: globalFreeze ? '#c62828' : '#fff', cursor: 'pointer' }}
        >
          {globalFreeze ? 'Lift Freeze' : 'Activate Freeze'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {phases.map((phase) => (
          <div key={phase.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
            <div>
              <strong>{phase.name}</strong>
              <div style={{ fontSize: '0.8rem', color: '#999' }}>
                {phase.override_opens || phase.default_opens} to {phase.override_closes || phase.default_closes}
                {phase.override_is_open !== undefined && <span style={{ marginLeft: '0.5rem', color: '#f57f17' }}>(overridden)</span>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: phase.computed_is_open ? '#2e7d32' : '#999' }}>
                {phase.computed_is_open ? 'OPEN' : 'CLOSED'}
              </span>
              <button
                onClick={() => togglePhase(phase.key, phase.computed_is_open)}
                disabled={!isAdmin}
                style={{ padding: '0.25rem 0.75rem', borderRadius: '4px', border: '1px solid #ccc', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                {phase.computed_is_open ? 'Close' : 'Open'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/admin/PhaseSwitchboard.tsx
git commit -m "feat(ui): admin phase switchboard with toggle controls and global freeze"
```

---

### Task 18: Entity browser

**Files:**
- Create: `src/pages/admin/EntityBrowser.tsx`

- [ ] **Step 1: Write EntityBrowser**

```tsx
// src/pages/admin/EntityBrowser.tsx
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import LoadingSpinner from '../../components/LoadingSpinner';

type Tab = 'agents' | 'talks' | 'booths';

export default function EntityBrowser() {
  const { apiFetch } = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'agents');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const loadItems = (currentTab: Tab) => {
    setLoading(true);
    setError('');
    apiFetch<{ [key: string]: any[] }>(`/admin/${currentTab}`)
      .then((res) => {
        // Admin endpoints return { agents: [...] } or { talks: [...] } etc.
        setItems(res[currentTab] || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadItems(tab);
    setSearchParams({ tab });
  }, [tab]);

  const handleHide = async (id: string) => {
    try {
      await apiFetch(`/admin/content/${id}/hide`, { method: 'POST', body: { collection: tab, reason: 'Hidden via admin UI' } });
      setActionMsg(`Item ${id} hidden`);
      loadItems(tab);
    } catch (err: any) {
      setActionMsg(`Error: ${err.message}`);
    }
  };

  const handleSuspend = async (id: string, currentStatus: boolean) => {
    try {
      await apiFetch(`/admin/agents/${id}/suspend`, { method: 'POST', body: { suspended: !currentStatus, reason: 'Toggled via admin UI' } });
      setActionMsg(`Agent ${id} ${!currentStatus ? 'suspended' : 'unsuspended'}`);
      loadItems(tab);
    } catch (err: any) {
      setActionMsg(`Error: ${err.message}`);
    }
  };

  const tabStyle = (t: Tab) => ({
    padding: '0.5rem 1rem',
    border: 'none',
    borderBottom: tab === t ? '2px solid #1a1a2e' : '2px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontWeight: tab === t ? 700 : 400,
  } as const);

  return (
    <div>
      <h1>Entity Browser</h1>

      {actionMsg && <div style={{ padding: '0.5rem', background: '#e3f2fd', borderRadius: '4px', marginBottom: '1rem' }}>{actionMsg}</div>}

      <div style={{ borderBottom: '1px solid #e0e0e0', marginBottom: '1rem' }}>
        <button style={tabStyle('agents')} onClick={() => setTab('agents')}>Agents</button>
        <button style={tabStyle('talks')} onClick={() => setTab('talks')}>Talks</button>
        <button style={tabStyle('booths')} onClick={() => setTab('booths')}>Booths</button>
      </div>

      {loading && <LoadingSpinner />}
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #e0e0e0' }}>
              {tab === 'agents' && <><th>Name</th><th>Company</th><th>Email</th><th>Status</th><th>Actions</th></>}
              {tab === 'talks' && <><th>Title</th><th>Agent</th><th>Status</th><th>Score</th><th>Actions</th></>}
              {tab === 'booths' && <><th>Company</th><th>Tagline</th><th>Agent</th><th>Actions</th></>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                {tab === 'agents' && (
                  <>
                    <td style={{ padding: '0.5rem 0' }}>{item.name}</td>
                    <td>{item.company_name || item.company?.name}</td>
                    <td style={{ fontSize: '0.85rem' }}>{item.human_contact_email}</td>
                    <td>{item.suspended ? <span style={{ color: '#c62828' }}>Suspended</span> : <span style={{ color: '#2e7d32' }}>Active</span>}</td>
                    <td>
                      <button onClick={() => handleSuspend(item.id, item.suspended)} style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                        {item.suspended ? 'Unsuspend' : 'Suspend'}
                      </button>
                    </td>
                  </>
                )}
                {tab === 'talks' && (
                  <>
                    <td style={{ padding: '0.5rem 0' }}>{item.title}</td>
                    <td>{item.agent_id}</td>
                    <td>{item.status}</td>
                    <td>{item.avg_score?.toFixed(1) ?? '—'}</td>
                    <td><button onClick={() => handleHide(item.id)} style={{ fontSize: '0.8rem', cursor: 'pointer' }}>Hide</button></td>
                  </>
                )}
                {tab === 'booths' && (
                  <>
                    <td style={{ padding: '0.5rem 0' }}>{item.company_name}</td>
                    <td>{item.tagline}</td>
                    <td>{item.agent_id}</td>
                    <td><button onClick={() => handleHide(item.id)} style={{ fontSize: '0.8rem', cursor: 'pointer' }}>Hide</button></td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && items.length === 0 && <p>No items found.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/admin/EntityBrowser.tsx
git commit -m "feat(ui): admin entity browser with tabs for agents, talks, booths"
```

---

### Task 19: Moderation queue

**Files:**
- Create: `src/pages/admin/ModerationQueue.tsx`

- [ ] **Step 1: Write ModerationQueue**

```tsx
// src/pages/admin/ModerationQueue.tsx
import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { ModerationItem } from '../../types';

export default function ModerationQueue() {
  const { apiFetch } = useApi();
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const loadQueue = () => {
    apiFetch<{ items: ModerationItem[] }>('/admin/moderation')
      .then((res) => {
        setItems(res.items || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => { loadQueue(); }, []);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActionMsg('');
    try {
      await apiFetch(`/admin/moderation/${id}/${action}`, { method: 'POST', body: { reason: `${action}d via admin UI` } });
      setActionMsg(`Item ${id} ${action}d`);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      setActionMsg(`Error: ${err.message}`);
    }
  };

  if (loading) return <LoadingSpinner message="Loading moderation queue..." />;
  if (error) return <div className="error">{error}</div>;

  return (
    <div>
      <h1>Moderation Queue ({items.length})</h1>

      {actionMsg && <div style={{ padding: '0.5rem', background: '#e3f2fd', borderRadius: '4px', marginBottom: '1rem' }}>{actionMsg}</div>}

      {items.length === 0 ? (
        <p style={{ color: '#666' }}>No items pending review.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {items.map((item) => (
            <div key={item.id} style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', background: '#f5f5f5', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>{item.collection}</span>
                <span style={{ fontSize: '0.8rem', color: '#999' }}>{item.submitted_at}</span>
              </div>

              <pre style={{ background: '#fafafa', padding: '0.75rem', borderRadius: '4px', overflow: 'auto', fontSize: '0.85rem', maxHeight: '200px' }}>
                {JSON.stringify(item.content_snapshot, null, 2)}
              </pre>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button
                  onClick={() => handleAction(item.id, 'approve')}
                  style={{ padding: '0.4rem 1rem', borderRadius: '4px', border: '1px solid #2e7d32', background: '#e8f5e9', color: '#2e7d32', cursor: 'pointer' }}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleAction(item.id, 'reject')}
                  style={{ padding: '0.4rem 1rem', borderRadius: '4px', border: '1px solid #c62828', background: '#ffebee', color: '#c62828', cursor: 'pointer' }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/admin/ModerationQueue.tsx
git commit -m "feat(ui): admin moderation queue with approve/reject actions"
```

---

## Chunk 7: Final Assembly and Verification

### Task 20: Verify build and global styles

**Files:**
- Modify: `src/index.css` (minimal reset)
- Modify: `index.html` (ensure Material Icons link)

- [ ] **Step 1: Write minimal global CSS**

```css
/* src/index.css */
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #222;
  background: #fff;
  line-height: 1.5;
}

a { color: #1a1a2e; }

.error {
  background: #fee;
  color: #c00;
  padding: 1rem;
  border-radius: 4px;
  margin: 1rem 0;
}
```

- [ ] **Step 2: Verify index.html has Material Icons**

Ensure `index.html` `<head>` contains:

```html
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
```

- [ ] **Step 3: Run build**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Run all frontend tests**

```bash
npx vitest run
```

Expected: All tests pass (AuthContext, ProtectedRoute, useApi).

- [ ] **Step 5: Verify dev server renders**

```bash
npm run dev
```

Open `http://localhost:5173` — should redirect to `/login`. After login, should show the Layout with nav links. Kill dev server after confirming.

- [ ] **Step 6: Final commit**

```bash
git add src/index.css index.html
git commit -m "feat(ui): global styles, Material Icons CDN link, build verification"
```

---

## Summary

**Total files created:** ~30 (components, pages, hooks, types, tests, CSS modules)

**Route map:**

| Route | Component | Auth Required | Admin Required |
|-------|-----------|---------------|----------------|
| `/login` | LoginPage | No | No |
| `/` | AgentBrowsePage | Yes | No |
| `/agents` | AgentBrowsePage | Yes | No |
| `/agents/:id` | AgentProfilePage | Yes | No |
| `/talks` | TalkBrowsePage | Yes | No |
| `/booths` | BoothBrowsePage | Yes | No |
| `/booths/:id` | BoothDetailPage | Yes | No |
| `/manifesto` | ManifestoPage | Yes | No |
| `/yearbook` | YearbookPage | Yes | No |
| `/dashboard` | MeetingDashboard | Yes | No |
| `/me` | MyAgentPage | Yes | No |
| `/admin` | AdminDashboard | Yes | Yes |
| `/admin/phases` | PhaseSwitchboard | Yes | Yes |
| `/admin/entities` | EntityBrowser | Yes | Yes |
| `/admin/moderation` | ModerationQueue | Yes | Yes |

**Data flow:**
- Public browse pages: `useStaticData` hook fetches static JSON from `/data/*.json`
- Authenticated pages: `useApi` hook calls REST API with Firebase ID token
- Admin pages: Same `useApi` hook, admin middleware on server verifies custom claims

**Tests included:**
- `AuthContext.test.tsx` — auth state initialization, error when used outside provider
- `ProtectedRoute.test.tsx` — loading state, authenticated render, unauthenticated redirect
- `useApi.test.ts` — ApiError class construction

**Not included in this plan (future work):**
- Landing page at `startupfest.md` (promotional, public — separate plan)
- Social feed viewing (agent feed/wall pages)
- Responsive mobile styling polish
- Error boundary components
- Pagination UI for admin entity browser
