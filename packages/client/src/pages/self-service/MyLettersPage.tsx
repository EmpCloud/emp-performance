import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, Loader2, Mail } from "lucide-react";
import { apiGet } from "@/api/client";
import { getUser } from "@/lib/auth-store";
import { formatDate, cn } from "@/lib/utils";

interface PerformanceLetter {
  id: string;
  type: string;
  content: string;
  sent_at: string | null;
  created_at: string;
  cycle_id: string | null;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

const TYPE_LABELS: Record<string, string> = {
  appraisal: "Appraisal Letter",
  increment: "Increment Letter",
  promotion: "Promotion Letter",
  confirmation: "Confirmation Letter",
  warning: "Warning Letter",
};

const TYPE_COLORS: Record<string, string> = {
  appraisal: "bg-blue-100 text-blue-800",
  increment: "bg-green-100 text-green-800",
  promotion: "bg-purple-100 text-purple-800",
  confirmation: "bg-teal-100 text-teal-800",
  warning: "bg-red-100 text-red-800",
};

export function MyLettersPage() {
  const user = getUser();
  const employeeId = user?.empcloudUserId;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-letters", employeeId],
    queryFn: () =>
      apiGet<PaginatedResponse<PerformanceLetter>>("/letters/my"),
    enabled: !!employeeId,
  });

  const letters = data?.data?.data ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">My Letters</h1>
      <p className="mt-1 text-sm text-gray-500">
        View performance letters issued to you.
      </p>

      {isLoading && (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">Failed to load your letters.</p>
        </div>
      )}

      {!isLoading && !error && letters.length === 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
          <FileText className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">
            No performance letters have been issued to you yet.
          </p>
        </div>
      )}

      {letters.length > 0 && (
        <div className="mt-6 space-y-3">
          {letters.map((letter) => (
            <div
              key={letter.id}
              className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
            >
              <button
                onClick={() =>
                  setExpandedId(expandedId === letter.id ? null : letter.id)
                }
                className="flex w-full items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {TYPE_LABELS[letter.type] ?? letter.type}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        TYPE_COLORS[letter.type] ?? "bg-gray-100 text-gray-800",
                      )}
                    >
                      {letter.type}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Issued on {formatDate(letter.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {letter.sent_at && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600">
                      <Mail className="h-3 w-3" />
                      Sent
                    </span>
                  )}
                </div>
              </button>

              {expandedId === letter.id && (
                <div className="border-t border-gray-100 p-5">
                  <div
                    className="prose prose-sm max-w-none text-gray-700"
                    dangerouslySetInnerHTML={{ __html: letter.content }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
