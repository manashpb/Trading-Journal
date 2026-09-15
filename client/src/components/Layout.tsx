import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Settings } from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/trades', label: 'Trade Log', icon: BookOpen },
  { to: '/configuration', label: 'Configuration', icon: Settings },
];

export default function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo">TJ</div>
          <h1>Trading Journal</h1>
        </div>
        <nav className="nav">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">Prop Firm Journaler</div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}