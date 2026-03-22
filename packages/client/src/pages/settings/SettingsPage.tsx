import { useState } from "react";
import { Settings, Save, Bell, Star, Award } from "lucide-react";
import toast from "react-hot-toast";

export function SettingsPage() {
  const [ratingScale, setRatingScale] = useState("5");
  const [defaultFramework, setDefaultFramework] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [reviewReminders, setReviewReminders] = useState(true);
  const [feedbackAlerts, setFeedbackAlerts] = useState(true);
  const [goalDeadlines, setGoalDeadlines] = useState(true);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    // In a real implementation, this would save to the API
    toast.success("Settings saved successfully");
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-gray-400" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Configure performance module settings.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="mt-6 space-y-6 max-w-2xl">
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

        {/* Notification Preferences */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="h-5 w-5 text-purple-500" />
            <h2 className="text-lg font-semibold text-gray-900">Notification Preferences</h2>
          </div>
          <div className="space-y-4">
            <ToggleRow
              label="Email Notifications"
              description="Receive email notifications for important events"
              checked={emailNotifications}
              onChange={setEmailNotifications}
            />
            <ToggleRow
              label="Review Reminders"
              description="Remind reviewers about pending reviews before deadlines"
              checked={reviewReminders}
              onChange={setReviewReminders}
            />
            <ToggleRow
              label="Feedback Alerts"
              description="Notify employees when they receive new feedback"
              checked={feedbackAlerts}
              onChange={setFeedbackAlerts}
            />
            <ToggleRow
              label="Goal Deadline Alerts"
              description="Alert when goal deadlines are approaching"
              checked={goalDeadlines}
              onChange={setGoalDeadlines}
            />
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Save className="h-4 w-4" />
            Save Settings
          </button>
        </div>
      </form>
    </div>
  );
}

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
