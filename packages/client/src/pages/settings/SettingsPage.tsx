import { useState, useEffect } from "react";
import { Settings, Save, Bell, Star, Award, Send, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { apiGet, apiPut, apiPost } from "@/api/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationSettings {
  review_reminders_enabled: boolean;
  pip_reminders_enabled: boolean;
  meeting_reminders_enabled: boolean;
  goal_reminders_enabled: boolean;
  reminder_days_before_deadline: number;
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  review_reminders_enabled: true,
  pip_reminders_enabled: true,
  meeting_reminders_enabled: true,
  goal_reminders_enabled: true,
  reminder_days_before_deadline: 3,
};

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type SettingsTab = "general" | "notifications";

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  return (
    <div>
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-gray-400" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Configure performance module settings.</p>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <TabButton
            label="General"
            active={activeTab === "general"}
            onClick={() => setActiveTab("general")}
          />
          <TabButton
            label="Notifications"
            icon={<Bell className="h-4 w-4" />}
            active={activeTab === "notifications"}
            onClick={() => setActiveTab("notifications")}
          />
        </nav>
      </div>

      <div className="mt-6 max-w-2xl">
        {activeTab === "general" && <GeneralSettings />}
        {activeTab === "notifications" && <NotificationSettingsPanel />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Button
// ---------------------------------------------------------------------------

function TabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
        active
          ? "border-brand-600 text-brand-600"
          : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// General Settings Tab (original content)
// ---------------------------------------------------------------------------

function GeneralSettings() {
  const [ratingScale, setRatingScale] = useState("5");
  const [defaultFramework, setDefaultFramework] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load general settings from the notification settings endpoint (shared table)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<any>("/notifications/settings");
        if (!cancelled && res.data) {
          setRatingScale(String(res.data.rating_scale ?? 5));
          setDefaultFramework(res.data.default_framework ?? "");
        }
      } catch {
        // Use defaults if API fails
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPut("/notifications/settings", {
        rating_scale: Number(ratingScale),
        default_framework: defaultFramework,
      });
      toast.success("Settings saved successfully");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Rating Scale */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Star className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-gray-900">Rating Scale</h2>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Maximum Rating Value
          </label>
          <select
            value={ratingScale}
            onChange={(e) => setRatingScale(e.target.value)}
            className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="3">1-3 Scale</option>
            <option value="4">1-4 Scale</option>
            <option value="5">1-5 Scale</option>
            <option value="10">1-10 Scale</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Applied to competency and overall performance ratings.
          </p>
        </div>
      </div>

      {/* Default Framework */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Award className="h-5 w-5 text-brand-500" />
          <h2 className="text-lg font-semibold text-gray-900">Default Framework</h2>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Default Competency Framework
          </label>
          <input
            value={defaultFramework}
            onChange={(e) => setDefaultFramework(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Enter framework ID or leave blank for none"
          />
          <p className="mt-1 text-xs text-gray-500">
            This framework will be pre-selected when creating new review cycles.
          </p>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Settings
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Notification Settings Tab
// ---------------------------------------------------------------------------

function NotificationSettingsPanel() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  // Load settings from API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<NotificationSettings>("/notifications/settings");
        if (!cancelled && res.data) {
          setSettings(res.data);
        }
      } catch {
        // Use defaults if API fails
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPut("/notifications/settings", settings);
      toast.success("Notification settings saved");
    } catch {
      toast.error("Failed to save notification settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTest() {
    setSendingTest(true);
    try {
      await apiPost("/notifications/send-test-email");
      toast.success("Test email sent. Check your inbox.");
    } catch (err: any) {
      const detail =
        err?.response?.data?.error?.message ||
        err?.message ||
        "Check SMTP configuration.";
      toast.error(`Failed to send test email — ${detail}`);
    } finally {
      setSendingTest(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Email Reminder Toggles */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-purple-500" />
          <h2 className="text-lg font-semibold text-gray-900">Email Reminders</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Configure which automated email reminders are sent to employees and managers.
          Reminders run daily at 9:00 AM.
        </p>
        <div className="space-y-4">
          <ToggleRow
            label="Review Deadline Reminders"
            description="Remind reviewers about pending reviews before the cycle deadline"
            checked={settings.review_reminders_enabled}
            onChange={(val) => setSettings({ ...settings, review_reminders_enabled: val })}
          />
          <ToggleRow
            label="PIP Check-In Reminders"
            description="Weekly reminders for employees and managers with active PIPs"
            checked={settings.pip_reminders_enabled}
            onChange={(val) => setSettings({ ...settings, pip_reminders_enabled: val })}
          />
          <ToggleRow
            label="1-on-1 Meeting Reminders"
            description="Remind both parties 1 day before a scheduled 1-on-1 meeting"
            checked={settings.meeting_reminders_enabled}
            onChange={(val) => setSettings({ ...settings, meeting_reminders_enabled: val })}
          />
          <ToggleRow
            label="Goal Deadline Reminders"
            description="Alert employees when their goal deadlines are approaching"
            checked={settings.goal_reminders_enabled}
            onChange={(val) => setSettings({ ...settings, goal_reminders_enabled: val })}
          />
        </div>
      </div>

      {/* Reminder Timing */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Reminder Timing</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Days before deadline to send reminder
          </label>
          <input
            type="number"
            min={1}
            max={14}
            value={settings.reminder_days_before_deadline}
            onChange={(e) =>
              setSettings({
                ...settings,
                reminder_days_before_deadline: Math.max(1, Math.min(14, parseInt(e.target.value) || 3)),
              })
            }
            className="mt-1 block w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Applies to review deadlines and goal due dates. Range: 1-14 days.
          </p>
        </div>
      </div>

      {/* Test Email */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Test Email Configuration</h2>
        <p className="text-sm text-gray-500 mb-4">
          Send a test email to your address to verify SMTP settings are configured correctly.
        </p>
        <button
          type="button"
          onClick={handleSendTest}
          disabled={sendingTest}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sendingTest ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Send Test Email
        </button>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Notification Settings
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Shared Toggle Component
// ---------------------------------------------------------------------------

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-brand-600" : "bg-gray-200"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
