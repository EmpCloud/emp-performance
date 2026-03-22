import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  Heart,
  Lightbulb,
  Send,
  Loader2,
} from "lucide-react";
import { apiGet } from "@/api/client";
import { formatDate } from "@/lib/utils";

interface FeedbackItem {
  id: string;
  from_user_id: number;
  to_user_id: number;
  type: string;
  visibility: string;
  message: string;
  tags: string | null;
  is_anonymous: boolean;
  created_at: string;
}

const TYPE_ICONS: Record<string, typeof Heart> = {
  kudos: Heart,
  constructive: MessageSquare,
  suggestion: Lightbulb,
};

const TYPE_COLORS: Record<string, string> = {
  kudos: "bg-pink-50 text-pink-600",
  constructive: "bg-blue-50 text-blue-600",
  suggestion: "bg-amber-50 text-amber-600",
};

export function MyFeedbackPage() {
  const [tab, setTab] = useState<"received" | "given">("received");

  const { data: receivedData, isLoading: receivedLoading } = useQuery({
    queryKey: ["feedback", "received"],
    queryFn: () => apiGet<{ data: FeedbackItem[]; total: number }>("/feedback/received"),
    enabled: tab === "received",
  });

  const { data: givenData, isLoading: givenLoading } = useQuery({
    queryKey: ["feedback", "given"],
    queryFn: () => apiGet<{ data: FeedbackItem[]; total: number }>("/feedback/given"),
    enabled: tab === "given",
  });

  const feedbackList = tab === "received"
    ? receivedData?.data?.data || []
    : givenData?.data?.data || [];
  const isLoading = tab === "received" ? receivedLoading : givenLoading;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Feedback</h1>
          <p className="mt-1 text-sm text-gray-500">Feedback you have received and given.</p>
        </div>
        <Link
          to="/feedback/give"
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Send className="h-4 w-4" />
          Give Feedback
        </Link>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        <button
          onClick={() => setTab("received")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "received"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Received
        </button>
        <button
          onClick={() => setTab("given")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "given"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Given
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : feedbackList.length === 0 ? (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No feedback {tab} yet
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {tab === "received"
              ? "Feedback from colleagues will appear here."
              : "Feedback you give will appear here."}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {feedbackList.map((item) => {
            const Icon = TYPE_ICONS[item.type] || MessageSquare;
            const colorClass = TYPE_COLORS[item.type] || TYPE_COLORS.constructive;
            const tags: string[] = item.tags ? JSON.parse(item.tags) : [];

            return (
              <div
                key={item.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colorClass}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
                        {item.type}
                      </span>
                      <span className="text-xs text-gray-400">
                        {tab === "received"
                          ? `from ${item.is_anonymous ? "Anonymous" : `User #${item.from_user_id}`}`
                          : `to User #${item.to_user_id}`}
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
