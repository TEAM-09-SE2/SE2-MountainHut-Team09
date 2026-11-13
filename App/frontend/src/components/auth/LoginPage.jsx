import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mountain, Mail, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import InputField from '../common/InputField';
import BackToHomeLink from '../common/BackToHomeLink';
import PasswordInput from '../common/PasswordInput';
import { loginUser } from '../../services/authApi';
import { useAuth } from '../../context/AuthContext';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Pages that send the user here (e.g. "Log in to book" on the availability result) pass
  // { from: "/path?query" } so the user lands back where they were; otherwise Home
  const from = location.state?.from;
  const redirectTo = typeof from === 'string' && from.startsWith('/') ? from : '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!email || !EMAIL_REGEX.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    setLoading(true);

    try {
      const userData = await loginUser(email, password);

      setUser(userData);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || "Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 overflow-x-hidden flex flex-col justify-between">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700">
                <Mountain className="w-6 h-6" />
              </div>
              <span className="font-bold text-lg tracking-tight text-slate-900">Skyreach Hut</span>
            </Link>

            <BackToHomeLink />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xs border border-gray-100 p-6 sm:p-8">
          <div className="text-center mb-6">
            <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-2">
              Sign In
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Welcome back
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Sign in to your account to continue
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5 text-red-700 text-xs sm:text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <InputField
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              icon={Mail}
              error={!!error}
              required
            />

            <PasswordInput
              id="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={!!error}
              required
            />

            <button
              type="submit"
              disabled={loading}
              className="cursor-pointer mt-6 w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign in</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100 text-center text-xs text-slate-600">
            Don't have an account?{" "}
            <Link to="/register" state={location.state} className="font-semibold text-emerald-700 hover:underline ml-1">
              Register now
            </Link>
          </div>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-slate-400 border-t border-slate-200/60 bg-white">
        © 2026 Skyreach Hut — SE2 Mountain Hut Team 09
      </footer>
    </div>
  );
}