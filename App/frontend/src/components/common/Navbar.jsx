import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mountain, LogOut, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 grid grid-cols-4 lg:grid-cols-12 items-center gap-4">
          <Link to="/" className="col-span-2 lg:col-span-3 flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700">
              <Mountain className="w-6 h-6" />
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-900">Skyreach Hut</span>
          </Link>

          <nav className="hidden lg:flex col-span-6 justify-center space-x-8">
            <a href="/" className="text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors">Home</a>
            <a href="#how-it-works" className="text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors">How it works</a>
            <a href="#availability" className="text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors">Availability</a>
          </nav>

          <div className="col-span-2 lg:col-span-3 flex justify-end items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-700 hidden sm:inline-block bg-slate-100 px-3 py-1.5 rounded-full">
                  <User className="w-3.5 h-3.5 inline mr-1 text-emerald-700" />
                  {user.firstName} ({user.role})
                </span>
                <button
                  onClick={logout}
                  className="p-2 text-slate-500 hover:text-red-600 transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="text-sm font-medium text-slate-700 hover:text-slate-900 px-3 py-2 hidden sm:block transition-colors"
                >
                  Login
                </button>
                <button
                  onClick={() => navigate('/register')}
                  className="text-sm font-medium bg-emerald-700 text-white px-4 py-2 rounded-lg hover:bg-emerald-800 transition-colors shadow-xs"
                >
                  Register
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}