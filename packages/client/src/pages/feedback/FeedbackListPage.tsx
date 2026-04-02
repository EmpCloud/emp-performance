import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Heart,
  MessageSquare,
  Lightbulb,
  Send,
  Loader2,
  Sparkles,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface FeedbackItem {
  id: string;
  from_user_id: number;
  to_user_id: number;
  type: string;
  visibility: string;
  message: string;
  tags: string | string[] | null;
  is_anonymous: boolean;
  created_at: string;
}

const TYPE_CONFIG: Record<string, { icon: typeof Heart; color: string; label: string }> = {
  kudos: { icon: Heart, color: "bg-pink-50 text-pink-600", label: "Kudos" },
  constructive: { icon: MessageSquare, color: "bg-blue-50 text-blue-600", label: "Constructive" },
  suggestion: { icon: Lightbulb, color: "bg-amber-50 text-amber-600", label: "Suggestion" },
};

const VISIBILITY_LABELS: Record<string, string> = {
  public: "Public",
  manager_visible: "Manager Only",
  private: "Private",
};

function parseTags(tags: string | string[] | null): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  try { return JSON.parse(tags); } catch { return []; }
}

export function FeedbackListPage() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [toUserId, setToUserId] = useState("");
  const [type, setType] = useState("kudos");
  const [message, setMessage] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [tagsStr, setTagsStr] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["feedback", "all", typeFilter],
    queryFn: () =>
      apiGet<{ data: FeedbackItem[]; total: number }>(
        "/feedback",
        typeFilter !== "all" ? { type: typeFilter } : undefined,
      ),
  });

  const giveMutation = useMutation({
    mutationFn: (body: any) => apiPost("/feedback", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      toast.success("Feedback sent!");
      setToUserId("");
      setMessage("");
      setTagsStr("");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to send feedback"),
  });

  const feedbackList = data?.data?.data || [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!toUserId || !message.trim()) return;
    giveMutation.mutate({
      to_user_id: parseInt(toUserId),
      type,
      message: message.trim(),
      visibility,
      tags: tagsStr
        ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined,
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Feedback</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage all feedback across the organization.
          </p>
        </div>
      </div>

      {/* Give Feedback Form */}
      <form
        onSubmit={handleSubmit}
        className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-gray-900">Give Feedback</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Recipient (User ID)</label>
            <input
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              type="number"
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Employee ID"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="kudos">Kudos</option>
              <option value="constructive">Constructive</option>
              <option value="suggestion">Suggestion</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="public">Public</option>
              <option value="manager_visible">Manager Only</option>
              <option value="private">Private</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            required
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Write your feedback message..."
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <input
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Tags (comma-separated, e.g. teamwork, leadership)"
          />
          <button
            type="submit"
            disabled={giveMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {giveMutation.isPending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>

      {/* Type filter tabs */}
      <div className="mt-6 flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {[
          { key: "all", label: "All" },
          { key: "kudos", label: "Kudos" },
          { key: "constructive", label: "Constructive" },
          { key: "suggestion", label: "Suggestion" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTypeFilter(tab.key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              typeFilter === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Feedback List */}
      {isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : feedbackList.length === 0 ? (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No feedback yet</h3>
          <p className="mt-1 text-sm text-gray-500">Be the first to give feedback!</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {feedbackList.map((item) => {
            const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.kudos;
            const Icon = cfg.icon;
            const tags = parseTags(item.tags);
            return (
              <div
                key={item.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${cfg.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">
                        {item.is_anonymous ? "Anonymous" : `User #${item.from_user_id}`}
                      </span>
                      <span className="text-gray-300">-&gt;</span>
                      <span className="text-sm font-medium text-gray-900">
                        User #{item.to_user_id}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        {VISIBILITY_LABELS[item.visibility] || item.visibility}
                      </span>
                      <span className="ml-auto text-xs text-gray-400">
                        {formatDate(item.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-700">{item.message}</p>
                    {tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
