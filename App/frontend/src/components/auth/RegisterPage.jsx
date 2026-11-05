import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Lock,
  Mail,
  Mountain,
  Phone,
  User,
} from "lucide-react";
import InputField from "../common/InputField";
import PasswordInput from "../common/PasswordInput";
import { registerUser } from "../../services/authApi";

const registrationSchema = Yup.object({
  firstName: Yup.string()
    .trim()
    .min(2, "First name must be at least 2 characters.")
    .max(50, "First name cannot exceed 50 characters.")
    .required("First name is required."),
  lastName: Yup.string()
    .trim()
    .min(2, "Last name must be at least 2 characters.")
    .max(50, "Last name cannot exceed 50 characters.")
    .required("Last name is required."),
  email: Yup.string().trim().email("Please enter a valid email address.").required("Email is required."),
  phone: Yup.string()
    .trim()
    .matches(/^\d*$/, "Phone number can only contain digits.")
    .max(10, "Phone number must be at most 10 digits.")
    .notRequired(),
  password: Yup.string()
    .min(8, "Password must be at least 8 characters.")
    .matches(/[A-Za-z]/, "Password must include at least one letter.")
    .matches(/\d/, "Password must include at least one number.")
    .required("Password is required."),
  confirmPassword: Yup.string()
    .required("Please confirm your password.")
    .oneOf([Yup.ref("password")], "Passwords do not match."),
});

const buildRegisterErrorMessage = (error) => {
  if (!error) {
    return "Unable to register right now. Please try again.";
  }

  if (error.code === "EMAIL_ALREADY_USED" || error.code === "EMAIL_ALREADY_EXISTS" || error.status === 409) {
    return "This email is already registered. Try logging in or use a different email.";
  }

  if (error.code === "INVALID_INPUT" || error.code === "MISSING_BODY" || error.status === 400) {
    return "Some input values are invalid. Please review the form and try again.";
  }

  if (error.status === 500) {
    return "Server error while creating your account. Please try again in a moment.";
  }

  return error.message || "Unable to register right now. Please try again.";
};

const initialValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const formik = useFormik({
    initialValues,
    validationSchema: registrationSchema,
    validateOnMount: true,
    onSubmit: async (values, { setSubmitting }) => {
      setSubmitError("");

      const payload = {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        password: values.password,
      };

      const normalizedPhone = values.phone.trim();
      if (normalizedPhone) {
        payload.phone = normalizedPhone;
      }

      try {
        await registerUser(payload);
        setSubmitSuccess(true);
      } catch (error) {
        setSubmitError(buildRegisterErrorMessage(error));
      } finally {
        setSubmitting(false);
      }
    },
  });

  const canSubmit = useMemo(
    () => !formik.isSubmitting && formik.isValid && formik.dirty,
    [formik.isSubmitting, formik.isValid, formik.dirty]
  );

  if (submitSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900 max-w-[1440px] mx-auto shadow-xl overflow-x-hidden flex flex-col">
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="h-16 flex items-center justify-between">
              <Link to="/" className="flex items-center gap-2.5">
                <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700">
                  <Mountain className="w-6 h-6" />
                </div>
                <span className="font-bold text-lg tracking-tight text-slate-900">Skyreach Hut</span>
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xs border border-emerald-100 p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Account created successfully</h1>
            <p className="text-sm text-slate-600 mb-6">
              Your account is ready. You can now sign in and start booking your mountain hut experience.
            </p>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm"
            >
              <span>Go to sign in</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 max-w-[1440px] mx-auto shadow-xl overflow-x-hidden flex flex-col">
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
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to sign in</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto h-full">
          <div className="grid lg:grid-cols-[340px_1fr] gap-5 h-full">
            <aside className="hidden lg:flex flex-col justify-between rounded-2xl bg-gradient-to-b from-emerald-950 to-emerald-900 text-emerald-50 p-8 shadow-lg overflow-hidden relative">
              <div className="relative z-10">
                <span className="inline-flex items-center gap-1.5 bg-emerald-100/10 text-emerald-100 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border border-emerald-200/20">
                  <Circle className="w-2.5 h-2.5 fill-current" />
                  Mountain Hut
                </span>
                <h2 className="mt-5 text-4xl leading-tight font-semibold">Your next mountain memory starts here.</h2>
                <p className="mt-4 text-emerald-100/90 text-sm leading-relaxed">
                  Create your account to manage reservations, save preferences and speed up future bookings.
                </p>
              </div>

              <div className="relative z-10 space-y-3 text-sm text-emerald-100/95">
                <p>• Book tables quickly and securely</p>
                <p>• Track reservations in one place</p>
                <p>• Get updates for your upcoming visits</p>
              </div>
            </aside>

            <section className="rounded-2xl bg-white border border-slate-100 shadow-xs p-5 sm:p-8 lg:p-10">
              <div className="mb-6 sm:mb-8">
                <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-3">
                  Registration
                </span>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Create your account</h1>
                <p className="text-sm sm:text-base text-slate-600 mt-2">
                  Enter your details to join Skyreach Hut and start planning your next stay.
                </p>
              </div>

              {submitError && (
                <div className="mb-5 p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5 text-red-700 text-xs sm:text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={formik.handleSubmit} noValidate>
                <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
                  <InputField
                    id="firstName"
                    label="First name"
                    icon={User}
                    placeholder="e.g. Emma"
                    value={formik.values.firstName}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.firstName ? formik.errors.firstName : ""}
                    autoComplete="given-name"
                    required
                  />
                  <InputField
                    id="lastName"
                    label="Last name"
                    icon={User}
                    placeholder="e.g. Brown"
                    value={formik.values.lastName}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.lastName ? formik.errors.lastName : ""}
                    autoComplete="family-name"
                    required
                  />
                </div>

                <InputField
                  id="email"
                  label="Email"
                  type="email"
                  icon={Mail}
                  placeholder="name@example.com"
                  value={formik.values.email}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={formik.touched.email ? formik.errors.email : ""}
                  autoComplete="email"
                  required
                />

                <InputField
                  id="phone"
                  label="Phone (optional)"
                  type="tel"
                  icon={Phone}
                  placeholder="e.g. 3330000000"
                  value={formik.values.phone}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={formik.touched.phone ? formik.errors.phone : ""}
                  autoComplete="tel"
                  helperText="Digits only, maximum 10 characters."
                />

                <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
                  <div>
                    <PasswordInput
                      id="password"
                      label="Password"
                      value={formik.values.password}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      error={formik.touched.password ? formik.errors.password : ""}
                      autoComplete="new-password"
                      required
                    />
                    {!formik.errors.password && (
                      <p className="mt-1 text-xs text-slate-500">
                        Use at least 8 characters, including letters and numbers.
                      </p>
                    )}
                  </div>

                  <PasswordInput
                    id="confirmPassword"
                    label="Confirm password"
                    value={formik.values.confirmPassword}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.confirmPassword ? formik.errors.confirmPassword : ""}
                    autoComplete="new-password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="mt-6 w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span>{formik.isSubmitting ? "Creating account..." : "Create my account"}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-gray-100 text-center text-xs text-slate-600">
                Already have an account?{" "}
                <Link to="/login" className="font-semibold text-emerald-700 hover:underline ml-1">
                  Sign in
                </Link>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
