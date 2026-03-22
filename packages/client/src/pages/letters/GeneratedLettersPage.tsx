import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Send,
  Download,
  Loader2,
  Plus,
  Eye,
  X,
  Mail,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { cn, formatDate } from "@/lib/utils";
import type {
  GeneratedPerformanceLetter,
  PerformanceLetterTemplate,
  PaginatedResponse,
  LetterType,
} from "@emp-performance/shared";

const TYPE_COLORS: Record<string, string> = {
  appraisal: "bg-blue-100 text-blue-700",
  increment: "bg-green-100 text-green-700",
  promotion: "bg-purple-100 text-purple-700",
  confirmation: "bg-amber-100 text-amber-700",
  warning: "bg-red-100 text-red-700",
};

const TYPE_LABELS: Record<string, string> = {
  appraisal: "Appraisal",
  increment: "Increment",
  promotion: "Promotion",
  confirmation: "Confirmation",
  warning: "Warning",
};

export function GeneratedLettersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState("");
  const [showGenerate, setShowGenerate] = useState(false);
  const [viewingLetter, setViewingLetter] = useState<GeneratedPerformanceLetter | null>(null);

  // Generate form state
  const [genEmployeeId, setGenEmployeeId] = useState("");
  const [genTemplateId, setGenTemplateId] = useState("");
  const [genCycleId, setGenCycleId] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["generated-letters", page, filterType],
    queryFn: () =>
      apiGet<PaginatedResponse<GeneratedPerformanceLetter>>("/letters", {
        page,
        perPage: 20,
        ...(filterType && { type: filterType }),
      }),
  });

  const letters = data?.data?.data ?? [];
  const pagination = data?.data;

  const { data: templatesData } = useQuery({
    queryKey: ["letter-templates-all"],
    queryFn: () => apiGet<PerformanceLetterTemplate[]>("/letters/templates"),
  });

  const templates = templatesData?.data ?? [];

  const generateMutation = useMutation({
    mutationFn: (body: { employee_id: number; template_id: string; cycle_id?: string }) =>
      apiPost<GeneratedPerformanceLetter>("/letters/generate", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generated-letters"] });
      setShowGenerate(false);
      setGenEmployeeId("");
      setGenTemplateId("");
      setGenCycleId("");
    },
  });

  const sendMutation = useMutation({
    mutationFn: (letterId: string) => apiPost(`/letters/${letterId}/send`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generated-letters"] });
    },
  });

  const handleDownload = (letter: GeneratedPerformanceLetter) => {
    // Create downloadable text content
    const blob = new Blob([letter.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `letter_${letter.type}_employee_${letter.employee_id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Generated Letters</h1>
          <p className="mt-1 text-sm text-gray-500">
            View, download, and send performance letters.
          </p>
        </div>
        <button
          onClick={() => setShowGenerate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Generate Letter
        </button>
      </div>

      {/* Filter */}
      <div className="mt-4">
        <select
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All Types</option>
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Generate Form */}
      {showGenerate && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Generate Letter</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              generateMutation.mutate({
                employee_id: Number(genEmployeeId),
                template_id: genTemplateId,
                ...(genCycleId && { cycle_id: genCycleId }),
              });
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Employee ID
              </label>
              <input
                type="number"
                value={genEmployeeId}
                onChange={(e) => setGenEmployeeId(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Enter employee ID"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template
              </label>
              <select
                value={genTemplateId}
                onChange={(e) => setGenTemplateId(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Select template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({TYPE_LABELS[t.type] ?? t.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Review Cycle ID (optional)
              </label>
              <input
                type="text"
                value={genCycleId}
                onChange={(e) => setGenCycleId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="UUID of review cycle (optional)"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowGenerate(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={generateMutation.isPending || !genEmployeeId || !genTemplateId}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {generateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Generate
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Letter Preview Modal */}
      {viewingLetter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <button
              onClick={() => setViewingLetter(null)}
              className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Letter Preview</h2>
            <div className="flex items-center gap-2 mb-4">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  TYPE_COLORS[viewingLetter.type] ?? "bg-gray-100 text-gray-700",
                )}
              >
                {TYPE_LABELS[viewingLetter.type] ?? viewingLetter.type}
              </span>
              <span className="text-xs text-gray-400">
                Employee #{viewingLetter.employee_id}
              </span>
              <span className="text-xs text-gray-400">
                Generated {formatDate(viewingLetter.created_at)}
              </span>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                {viewingLetter.content}
              </pre>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => handleDownload(viewingLetter)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Download className="h-4 w-4" />
                Download
              </button>
              {!viewingLetter.sent_at && (
                <button
                  onClick={() => {
                    sendMutation.mutate(viewingLetter.id);
                    setViewingLetter(null);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <Send className="h-4 w-4" />
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Letters List */}
      <div className="mt-6 space-y-3">
        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          </div>
        )}

        {!isLoading && letters.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">
              No generated letters yet. Generate your first letter using a template.
            </p>
          </div>
        )}

        {letters.map((letter) => (
          <div
            key={letter.id}
            className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      TYPE_COLORS[letter.type] ?? "bg-gray-100 text-gray-700",
                    )}
                  >
                    {TYPE_LABELS[letter.type] ?? letter.type}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    Employee #{letter.employee_id}
                  </span>
                  {letter.sent_at && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      <Mail className="h-3 w-3" />
                      Sent {formatDate(letter.sent_at)}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Generated {formatDate(letter.created_at)} by user #{letter.generated_by}
                  {letter.cycle_id && ` | Cycle: ${letter.cycle_id.slice(0, 8)}...`}
                </p>
              </div>

              <div className="flex items-center gap-1 ml-4">
                <button
                  onClick={() => setViewingLetter(letter)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="View"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDownload(letter)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </button>
                {!letter.sent_at && (
                  <button
                    onClick={() => sendMutation.mutate(letter.id)}
                    disabled={sendMutation.isPending}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-600"
                    title="Send"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
