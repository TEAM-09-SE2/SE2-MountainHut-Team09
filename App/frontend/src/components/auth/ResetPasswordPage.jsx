import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Mountain, ArrowRight, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import BackToHomeLink from '../common/BackToHomeLink';
import PasswordInput from '../common/PasswordInput';
import { confirmPasswordReset } from '../../services/authApi';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [invalidToken, setInvalidToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setInvalidToken(true);
      setError('Reset link is missing a valid token. Please request a new one.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(token, newPassword);
      setDone(true);
    } catch (err) {
      if (err.code === 'INVALID_RESET_TOKEN') {
        setInvalidToken(true);
        setError('This reset link is invalid, expired, or has already been used.');
      } else {
        setError(err.message || 'Could not reset password. Please try again.');
      }
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
              Password Recovery
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Set a new password
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Choose a password of at least 8 characters.
            </p>
          </div>

          {done ? (
            <div className="space-y-5">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-emerald-900 text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Password updated</p>
                  <p className="text-xs sm:text-sm text-emerald-800 mt-1">
                    Your new password has been saved. You can now sign in to your account.
                  </p>
                </div>
              </div>

              <Link
                to="/login"
                className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm"
              >
                <span>Go to sign in</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : !token ? (
            <div className="space-y-5">
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5 text-red-700 text-xs sm:text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>This reset link is invalid or incomplete. Please request a new password reset email.</span>
              </div>

              <Link
                to="/forgot-password"
                className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm"
              >
                <span>Request a new reset link</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-5 p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5 text-red-700 text-xs sm:text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p>{error}</p>
                    {invalidToken && (
                      <Link
                        to="/forgot-password"
                        className="inline-block mt-1.5 font-semibold underline hover:text-red-900"
                      >
                        Request a new reset link
                      </Link>
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <PasswordInput
                  id="newPassword"
                  label="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  error={!!error}
                  required
                />

                <PasswordInput
                  id="confirmPassword"
                  label="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  error={!!error}
                  required
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="cursor-pointer mt-2 w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving password...</span>
                    </>
                  ) : (
                    <>
                      <span>Save new password</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-slate-400 border-t border-slate-200/60 bg-white">
        © 2026 Skyreach Hut — SE2 Mountain Hut Team 09
      </footer>
    </div>
  );
}