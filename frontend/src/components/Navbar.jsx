import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Moon, Sun, ShoppingCart, User, LogOut, LayoutDashboard, Coffee, Flame } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import logo from '../assets/logo.jpeg';

const Navbar = () => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { cartCount, setIsCartOpen } = useCart();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/'); };

  const portalLink = user?.role === 'student' ? '/student'
    : user?.role === 'guest' ? '/guest'
    : user?.role === 'staff' ? '/cashier'
    : user?.role === 'admin' ? '/admin'
    : '/';

  const roleLabel = user?.role === 'student' ? 'Student Portal'
    : user?.role === 'guest' ? 'Guest Ordering'
    : user?.role === 'staff' ? 'Cashier Console'
    : user?.role === 'admin' ? 'Management Console'
    : '';

  const showCart = ['student', 'guest'].includes(user?.role);

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        {/* Brand */}
        <Link to={portalLink} className="navbar-brand">
          <img src={logo} alt="Synapse Cafeteria" className="brand-logo-img" />
          <div>
            <span className="brand-text">Synapse Cafeteria</span>
            <span className="brand-sub">Skip the Queue</span>
          </div>
        </Link>

        {/* Right Section */}
        <div className="navbar-right">
          {user && (
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {roleLabel}
            </span>
          )}

          {/* Cart */}
          {showCart && (
            <div className="cart-btn-wrapper">
              <button id="navbar-cart-btn" className="btn btn-ghost btn-icon" onClick={() => setIsCartOpen(true)} title="View Cart">
                <ShoppingCart size={20} />
              </button>
              {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
            </div>
          )}

          {/* Profile (student only) */}
          {user?.role === 'student' && (
            <Link to="/student/profile" className="btn btn-ghost btn-icon" title="Profile">
              <User size={20} />
            </Link>
          )}

          {/* Cashier console shortcut */}
          {user?.role === 'staff' && location.pathname !== '/cashier' && (
            <Link to="/cashier" className="btn btn-ghost btn-icon" title="Cashier Console">
              <Coffee size={19} />
            </Link>
          )}

          {/* Management dashboard shortcut */}
          {user?.role === 'admin' && location.pathname !== '/admin' && (
            <Link to="/admin" className="btn btn-ghost btn-icon" title="Management Console">
              <LayoutDashboard size={20} />
            </Link>
          )}

          {/* Kitchen display shortcut */}
          {['staff', 'admin'].includes(user?.role) && location.pathname !== '/kitchen' && (
            <Link to="/kitchen" className="btn btn-ghost btn-icon" title="Kitchen Display">
              <Flame size={19} />
            </Link>
          )}

          {/* Theme toggle */}
          <button id="theme-toggle-btn" className="btn btn-ghost btn-icon" onClick={toggleTheme} title="Toggle Theme">
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {/* Logout */}
          {user ? (
            <button id="logout-btn" className="btn btn-danger btn-icon" onClick={handleLogout} title="Logout">
              <LogOut size={17} />
            </button>
          ) : (
            <Link to="/" className="btn btn-primary">Enter</Link>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
