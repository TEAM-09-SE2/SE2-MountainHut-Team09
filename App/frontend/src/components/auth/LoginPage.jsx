import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mountain, Mail, ArrowRight, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import InputField from '../common/InputField';
import PasswordInput from '../common/PasswordInput';
import Checkbox from '../common/Checkbox';
import RoleToggle from '../common/RoleToggle';
import { loginUser, loginEmployee } from '../../services/authApi';
import { useAuth } from '../../context/AuthContext';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const [isEmployee, setIsEmployee] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const { setUser } = useAuth();
  const navigate = useNavigate();

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
      const apiCall = isEmployee ? loginEmployee : loginUser;
      const userData = await apiCall(email, password);

      setUser(userData);
      navigate('/');
    } catch (err) {
      setError(err.message || "Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 max-w-[1440px] mx-auto shadow-xl overflow-x-hidden flex flex-col justify-between">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700">
                <Mountain className="w-6 h-6" />
              </div>
              <span className="font-bold text-lg tracking-tight text-slate-900">Skyreach Hut</span>
            </Link>

            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xs border border-gray-100 p-6 sm:p-8">
          <RoleToggle isEmployee={isEmployee} onChange={(val) => { setIsEmployee(val); setError(null); }} />

          <div className="text-center mb-6">
            <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-2">
              {isEmployee ? "Staff Portal" : "Personal Area"}
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

            <div className="flex items-center justify-between mb-6">
              <Checkbox
                id="rememberMe"
                label="Remember me"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <Link to="/forgot-password" className="text-xs font-semibold text-emerald-700 hover:underline">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 ${
                isEmployee ? 'bg-slate-900 hover:bg-slate-800' : 'bg-emerald-700 hover:bg-emerald-800'
              } text-white font-semibold rounded-lg shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed`}
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
            <Link to="/register" className="font-semibold text-emerald-700 hover:underline ml-1">
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