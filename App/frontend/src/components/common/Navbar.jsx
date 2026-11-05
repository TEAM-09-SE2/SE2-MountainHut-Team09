import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Mountain, LogOut, User, Menu, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isStaff = user?.role === "employee" || user?.role === "warden";

  const [logoutNotice, setLogoutNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const hideNoticeTimeoutRef = useRef(null);

  // A plain <a href="/"> reloads the page and the browser keeps the scroll position, so on the
  // home page it looked like nothing happened: go to the top instead
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  // Close the phone menu whenever the page (or the #section) changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    return () => {
      if (hideNoticeTimeoutRef.current) {
        clearTimeout(hideNoticeTimeoutRef.current);
      }
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    setLogoutNotice("You have been signed out successfully.");

    if (hideNoticeTimeoutRef.current) {
      clearTimeout(hideNoticeTimeoutRef.current);
    }

    hideNoticeTimeoutRef.current = setTimeout(() => {
      setLogoutNotice("");
      hideNoticeTimeoutRef.current = null;
    }, 3500);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 grid grid-cols-4 lg:grid-cols-12 items-center gap-4">
          <Link
            to="/"
            onClick={scrollToTop}
            className="col-span-2 lg:col-span-3 flex items-center gap-2.5"
          >
            <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700">
              <Mountain className="w-6 h-6" />
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-900">
              Skyreach Hut
            </span>
          </Link>

          <nav className="hidden lg:flex col-span-6 justify-center space-x-8">
            <a href="/" className="text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors">
              Home
            </a>
            {/* These sections exist only on the hiker home page */}
            {!isStaff && (
              <>
                <a
                  href="/#how-it-works"
                  className="text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors"
                >
                  How it works
                </a>
                <Link
                  to="/availability"
                  className="text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors"
                >
                  Availability
                </Link>
              </>
            )}
          </nav>

          <div className="col-span-2 lg:col-span-3 flex justify-end items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-700 hidden sm:inline-block bg-slate-100 px-3 py-1.5 rounded-full">
                  <User className="w-3.5 h-3.5 inline mr-1 text-emerald-700" />
                  {user.firstName} ({user.role})
                </span>
                <button
                  onClick={handleLogout}
                  className="p-2 text-slate-500 hover:text-red-600 transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => navigate("/login")}
                  className="text-sm font-medium text-slate-700 hover:text-slate-900 px-3 py-2 hidden sm:block transition-colors"
                >
                  Sign in
                </button>
                <button
                  onClick={() => navigate("/register")}
                  className="text-sm font-medium bg-emerald-700 text-white px-4 py-2 rounded-lg hover:bg-emerald-800 transition-colors shadow-xs"
                >
                  Register
                </button>
              </>
            )}

            {/* Phones and tablets: the links above are hidden, so they live in this menu */}
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="lg:hidden p-2 -mr-2 text-slate-600 hover:text-emerald-700 transition-colors"
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav id="mobile-menu" className="lg:hidden border-t border-slate-100 py-3 flex flex-col">
            <a href="/" className="px-2 py-2.5 text-sm font-medium text-slate-700 hover:text-emerald-700 transition-colors">
              Home
            </a>
            {!isStaff && (
              <>
                <a
                  href="/#how-it-works"
                  onClick={() => setMenuOpen(false)}
                  className="px-2 py-2.5 text-sm font-medium text-slate-700 hover:text-emerald-700 transition-colors"
                >
                  How it works
                </a>
                <Link
                  to="/availability"
                  className="px-2 py-2.5 text-sm font-medium text-slate-700 hover:text-emerald-700 transition-colors"
                >
                  Availability
                </Link>
              </>
            )}
            {user ? (
              <p className="sm:hidden px-2 pt-3 mt-2 border-t border-slate-100 text-xs font-semibold text-slate-500">
                Signed in as {user.firstName} ({user.role})
              </p>
            ) : (
              <Link
                to="/login"
                className="sm:hidden px-2 py-2.5 mt-2 border-t border-slate-100 text-sm font-medium text-slate-700 hover:text-emerald-700 transition-colors"
              >
                Login
              </Link>
            )}
          </nav>
        )}
        {logoutNotice && (
          <div className="pb-3 flex justify-end">
            <p
              role="status"
              className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800"
            >
              {logoutNotice}
            </p>
          </div>
        )}
      </div>
    </header>
  );
}