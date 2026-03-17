// src/components/Layout.tsx
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Layout.module.css';

export default function Layout() {
  const { user, isModerator, logout } = useAuth();
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
          {user && <Link to="/feed">Feed</Link>}
          {user && <Link to="/dashboard">Intros</Link>}
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
