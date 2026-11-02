import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Target, Loader2 } from "lucide-react";
import { apiPost } from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import toast from "react-hot-toast";

export function RegisterPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [form, setForm] = useState({
    orgName: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiPost<{ user: any; tokens: { accessToken: string } }>(
        "/auth/register",
        form,
      );
      if (res.success && res.data) {
        login(res.data.user, res.data.tokens);
        toast.success("Account created. Welcome!");
        navigate("/dashboard");
      } else {
        toast.error(res.error?.message || "Registration failed");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
            <Target className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">EMP Performance</span>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900">Create your organization</h2>
          <p className="mt-1 text-sm text-gray-500">Set up a new workspace and admin account.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field label="Organization name" value={form.orgName} onChange={(v) => update("orgName", v)} required />
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" value={form.firstName} onChange={(v) => update("firstName", v)} required />
              <Field label="Last name" value={form.lastName} onChange={(v) => update("lastName", v)} required />
            </div>
            <Field label="Email address" type="email" value={form.email} onChange={(v) => update("email", v)} required />
            <Field
              label="Password"
              type="password"
              value={form.password}
              onChange={(v) => update("password", v)}
              required
              hint="At least 8 characters"
            />
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create account
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
