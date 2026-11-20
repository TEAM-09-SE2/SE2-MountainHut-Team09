import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Phone,
  RefreshCcw,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import Navbar from "../components/common/Navbar";
import InputField from "../components/common/InputField";
import PasswordInput from "../components/common/PasswordInput";
import { useAuth } from "../context/AuthContext";
import { createEmployee, fetchEmployees } from "../services/staffApi";
import { HUT_TIME_ZONE } from "../utils/bookingFormat";

// Same rules as POST /api/v1/staff/employees (and POST /auth/register for the shared fields)
const employeeSchema = Yup.object({
  firstName: Yup.string()
    .trim()
    .required("First name is required.")
    .max(100, "First name cannot exceed 100 characters."),
  lastName: Yup.string()
    .trim()
    .required("Last name is required.")
    .max(100, "Last name cannot exceed 100 characters."),
  email: Yup.string()
    .trim()
    .required("Email is required.")
    .email("Please enter a valid email address.")
    .max(255, "Email cannot exceed 255 characters."),
  phone: Yup.string()
    .trim()
    .matches(/^\d*$/, "Phone number can only contain digits.")
    .max(10, "Phone number must be at most 10 digits.")
    .notRequired(),
  password: Yup.string()
    .required("Temporary password is required.")
    .min(8, "The temporary password must have at least 8 characters."),
});

const initialValues = { firstName: "", lastName: "", email: "", phone: "", password: "" };

const formatAddedOn = (isoString) =>
  new Date(isoString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: HUT_TIME_ZONE,
  });

function PasswordStatus({ mustChangePassword }) {
  return mustChangePassword ? (
    <span
      title="Has not signed in and changed the temporary password yet"
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800"
    >
      <Clock className="w-3.5 h-3.5" /> Temporary password
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
      <CheckCircle2 className="w-3.5 h-3.5" /> Password changed
    </span>
  );
}

function EmployeeRow({ employee, isNew }) {
  return (
    <li
      data-testid={`employee-${employee.id}`}
      className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4"
    >
      <div className="min-w-0">
        <p className="font-semibold text-slate-900 flex items-center gap-2">
          <span className="min-w-0 break-words">
            {employee.firstName} {employee.lastName}
          </span>
          {isNew && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-700 text-white">
              New
            </span>
          )}
        </p>
        <p className="text-sm text-slate-600 mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            {/* Wrap long emails instead of cutting them: the warden needs the full address */}
            <span className="break-all">{employee.email}</span>
          </span>
          {employee.phone && (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              {employee.phone}
            </span>
          )}
          {employee.createdAt && (
            <span className="text-xs text-slate-500">Added {formatAddedOn(employee.createdAt)}</span>
          )}
        </p>
      </div>
      <div className="flex-shrink-0">
        <PasswordStatus mustChangePassword={employee.mustChangePassword} />
      </div>
    </li>
  );
}

// Warden page: creates employee accounts with a temporary password and lists the existing ones
export default function StaffEmployees() {
  const { setUser } = useAuth();

  const [employees, setEmployees] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [created, setCreated] = useState(null);
  // Only the latest list request may update the page (a create also reloads the list)
  const requestIdRef = useRef(0);

  const handleAuthError = useCallback(
    (err) => {
      if (err.code === "NOT_AUTHENTICATED") {
        // Session expired: the route guard sends the warden to the login page
        setUser(null);
        return true;
      }
      return false;
    },
    [setUser],
  );

  const loadEmployees = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setListLoading(true);
    setListError("");
    try {
      const list = await fetchEmployees();
      if (requestId === requestIdRef.current) setEmployees(list);
    } catch (err) {
      if (requestId !== requestIdRef.current || handleAuthError(err)) return;
      setListError(
        err.code === "FORBIDDEN_ROLE"
          ? "Only the warden can see the employee accounts."
          : "Unable to load the employees.",
      );
    } finally {
      if (requestId === requestIdRef.current) setListLoading(false);
    }
  }, [handleAuthError]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const formik = useFormik({
    initialValues,
    validationSchema: employeeSchema,
    onSubmit: async (values, { resetForm, setFieldError, setSubmitting }) => {
      setSubmitError("");
      setCreated(null);

      const payload = {
        email: values.email.trim(),
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        password: values.password,
      };
      const phone = values.phone.trim();
      if (phone) payload.phone = phone;

      try {
        const employee = await createEmployee(payload);
        setCreated(employee);
        resetForm();
        loadEmployees();
      } catch (err) {
        if (handleAuthError(err)) return;
        if (err.code === "EMAIL_ALREADY_USED") {
          setFieldError("email", "An account with this email already exists.");
        } else if (err.code === "FORBIDDEN_ROLE") {
          setSubmitError("Only the warden can create employee accounts.");
        } else if (err.status === 400) {
          setSubmitError("Some values are not valid. Check the form and try again.");
        } else {
          setSubmitError("We couldn't create the account right now. Please try again.");
        }
      } finally {
        setSubmitting(false);
      }
    },
  });

  const fieldError = (name) => (formik.touched[name] ? formik.errors[name] : "");
  const pendingCount = employees.filter((e) => e.mustChangePassword).length;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <Navbar />

      <main className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-6">
          <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-2">
            Warden
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight">Employees</h1>
          <p className="text-sm text-slate-600 mt-1">
            Create accounts for the hut team. Each employee signs in with the temporary password you
            give them and must change it at the first sign-in.
          </p>
        </div>

        {/* minmax(0, ...) columns: a long email in the list must not widen the page on phones */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-6 items-start">
          <section
            aria-labelledby="new-employee-title"
            className="min-w-0 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6"
          >
            <h2 id="new-employee-title" className="text-lg font-bold flex items-center gap-2 mb-4">
              <UserPlus className="w-5 h-5 text-emerald-700" /> New employee
            </h2>

            {created && (
              <div
                role="status"
                className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-emerald-800 text-sm"
              >
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="flex-1">
                  Account created for{" "}
                  <strong>
                    {created.firstName} {created.lastName}
                  </strong>
                  . Give them the temporary password in person: they will have to change it at
                  their first sign-in.
                </span>
                <button
                  type="button"
                  onClick={() => setCreated(null)}
                  aria-label="Close message"
                  className="cursor-pointer text-emerald-700 hover:text-emerald-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {submitError && (
              <div
                role="alert"
                className="mb-5 p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5 text-red-700 text-sm"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={formik.handleSubmit} noValidate>
              <div className="grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-x-4">
                <InputField
                  id="firstName"
                  label="First name"
                  icon={User}
                  value={formik.values.firstName}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={fieldError("firstName")}
                  autoComplete="off"
                  required
                />
                <InputField
                  id="lastName"
                  label="Last name"
                  icon={User}
                  value={formik.values.lastName}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={fieldError("lastName")}
                  autoComplete="off"
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
                error={fieldError("email")}
                autoComplete="off"
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
                error={fieldError("phone")}
                autoComplete="off"
                helperText="Digits only, maximum 10 characters."
              />

              <PasswordInput
                id="password"
                label="Temporary password"
                value={formik.values.password}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={fieldError("password")}
                autoComplete="new-password"
              />
              {!fieldError("password") && (
                <p className="-mt-3 mb-4 text-xs text-slate-500">
                  At least 8 characters. Give it to the employee in person.
                </p>
              )}

              <button
                type="submit"
                disabled={formik.isSubmitting}
                className="cursor-pointer mt-2 w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {formik.isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating account...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Create employee</span>
                  </>
                )}
              </button>
            </form>
          </section>

          <section
            aria-labelledby="employees-title"
            className="min-w-0 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <h2 id="employees-title" className="text-lg font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-700" /> Team
              </h2>
              {!listLoading && !listError && employees.length > 0 && (
                <p className="text-xs text-slate-500">
                  {employees.length} {employees.length === 1 ? "employee" : "employees"}
                  {pendingCount > 0 && (
                    <>
                      {" · "}
                      <span className="font-semibold text-amber-700">
                        {pendingCount} still {pendingCount === 1 ? "has" : "have"} the temporary
                        password
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>

            {listLoading && employees.length === 0 && (
              <div role="status" className="flex items-center justify-center gap-2 py-12 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading employees…
              </div>
            )}

            {!listLoading && listError && (
              <div
                role="alert"
                className="mt-2 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center justify-between gap-3 text-red-700 text-sm"
              >
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" /> {listError}
                </span>
                <button
                  type="button"
                  onClick={loadEmployees}
                  className="cursor-pointer inline-flex items-center gap-1.5 font-medium hover:underline"
                >
                  <RefreshCcw className="w-4 h-4" /> Retry
                </button>
              </div>
            )}

            {!listLoading && !listError && employees.length === 0 && (
              <div className="text-center py-12">
                <Users className="w-10 h-10 text-emerald-700 mx-auto mb-3" />
                <p className="font-semibold">No employees yet</p>
                <p className="text-sm text-slate-600 mt-1">
                  The accounts you create appear here.
                </p>
              </div>
            )}

            {!listError && employees.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {employees.map((employee) => (
                  <EmployeeRow
                    key={employee.id}
                    employee={employee}
                    isNew={created?.id === employee.id}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
