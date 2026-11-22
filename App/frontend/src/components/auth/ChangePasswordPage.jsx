import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  Mountain,
} from "lucide-react";
import PasswordInput from "../common/PasswordInput";
import BackToHomeLink from "../common/BackToHomeLink";
import { changePassword } from "../../services/authApi";
import { useAuth } from "../../context/AuthContext";

// Same password rule as the API: at least 8 characters, different from the current one.
// The "different" check only compares the two typed fields, so its message talks about what was
// typed: whether the current password is right is only known after the API call.
const MIN_PASSWORD_LENGTH = 8;

// Pages that make no sense to go back to once the password is changed
const AUTH_PAGES = ["/login", "/register", "/change-password"];

const safeRedirect = (from) => {
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return "/";
  const path = from.split(/[?#]/)[0];
  return AUTH_PAGES.includes(path) ? "/" : from;
};

const buildSchema = (currentLabel) =>
  Yup.object({
    currentPassword: Yup.string().required(`Enter your ${currentLabel}.`),
    newPassword: Yup.string()
      .required("Choose a new password.")
      .min(MIN_PASSWORD_LENGTH, `The new password must have at least ${MIN_PASSWORD_LENGTH} characters.`)
      .notOneOf(
        [Yup.ref("currentPassword")],
        `The new password is the same as the ${currentLabel} you entered. Choose a different one.`,
      ),
    confirmPassword: Yup.string()
      .required("Repeat the new password.")
      .oneOf([Yup.ref("newPassword")], "The passwords do not match."),
  });

export default function ChangePasswordPage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Read once: after the change the flag is cleared, but the success screen still belongs to
  // the forced flow (temporary password set by the warden or by staff)
  const [forced] = useState(() => Boolean(user?.mustChangePassword));
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  const currentLabel = forced ? "temporary password" : "current password";
  const redirectTo = safeRedirect(location.state?.from);

  const formik = useFormik({
    initialValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    validationSchema: buildSchema(currentLabel),
    onSubmit: async (values, { setFieldError, setSubmitting }) => {
      setSubmitError("");
      try {
        await changePassword(values.currentPassword, values.newPassword);
        // The session cookie stays valid: the backend reads the flag from the database
        setUser((current) => (current ? { ...current, mustChangePassword: false } : current));
        setDone(true);
      } catch (err) {
        if (err.code === "INVALID_CREDENTIALS") {
          setFieldError("currentPassword", `The ${currentLabel} is not correct.`);
        } else if (err.code === "NOT_AUTHENTICATED") {
          // Session expired: the route guard sends the user to the login page
          setUser(null);
        } else if (err.status === 400) {
          setSubmitError(
            `Check the new password: it needs at least ${MIN_PASSWORD_LENGTH} characters and must be different from the ${currentLabel}.`,
          );
        } else {
          setSubmitError("We couldn't change your password right now. Please try again.");
        }
      } finally {
        setSubmitting(false);
      }
    },
  });

  const handleSignOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const fieldError = (name) => (formik.touched[name] ? formik.errors[name] : "");

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

            {/* With a temporary password the rest of the app is closed: signing out is the only way out */}
            {forced && !done ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="cursor-pointer inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-red-600 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign out</span>
              </button>
            ) : (
              <BackToHomeLink />
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        {done ? (
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xs border border-emerald-100 p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Password changed</h1>
            <p className="text-sm text-slate-600 mb-6">
              {forced
                ? "Your new password is saved and your account is ready to use."
                : "Your new password is saved. Use it the next time you sign in."}
            </p>
            <button
              type="button"
              onClick={() => navigate(redirectTo, { replace: true })}
              className="cursor-pointer w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xs border border-gray-100 p-6 sm:p-8">
            <div className="text-center mb-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <KeyRound className="w-6 h-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {forced ? "Choose your password" : "Change password"}
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {forced
                  ? `Hi ${user?.firstName ?? ""}, you signed in with a temporary password. Choose a new one to continue.`
                  : "Enter your current password, then choose a new one."}
              </p>
            </div>

            {submitError && (
              <div
                role="alert"
                className="mb-5 p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5 text-red-700 text-xs sm:text-sm"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={formik.handleSubmit} noValidate>
              <PasswordInput
                id="currentPassword"
                label={forced ? "Temporary password" : "Current password"}
                value={formik.values.currentPassword}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={fieldError("currentPassword")}
                autoComplete="current-password"
              />

              <PasswordInput
                id="newPassword"
                label="New password"
                value={formik.values.newPassword}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={fieldError("newPassword")}
                autoComplete="new-password"
              />
              {!fieldError("newPassword") && (
                <p className="-mt-3 mb-4 text-xs text-slate-500 text-left">
                  At least {MIN_PASSWORD_LENGTH} characters, different from the {currentLabel}.
                </p>
              )}

              <PasswordInput
                id="confirmPassword"
                label="Confirm new password"
                value={formik.values.confirmPassword}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={fieldError("confirmPassword")}
                autoComplete="new-password"
              />

              <button
                type="submit"
                disabled={formik.isSubmitting}
                className="cursor-pointer mt-2 w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {formik.isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>Save new password</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </main>

      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-200/60 bg-white">
        © 2026 Skyreach Hut — SE2 Mountain Hut Team 09
      </footer>
    </div>
  );
}
