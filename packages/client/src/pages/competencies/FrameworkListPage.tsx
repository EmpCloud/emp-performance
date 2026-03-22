import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Award, ChevronRight, Layers } from "lucide-react";
import { apiGet } from "@/api/client";
import type { CompetencyFramework } from "@emp-performance/shared";
import { formatDate } from "@/lib/utils";

export function FrameworkListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["frameworks"],
    queryFn: () => apiGet<CompetencyFramework[]>("/competencies"),
  });

  const frameworks = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Competency Frameworks</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage competency frameworks and their competencies.
          </p>
        </div>
        <Link
          to="/competencies/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Framework
        </Link>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : frameworks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
          <Award className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-2 text-sm font-medium text-gray-900">No frameworks yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Create your first competency framework to define evaluation criteria.
          </p>
          <Link
            to="/competencies/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Create Framework
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {frameworks.map((fw) => (
            <Link
              key={fw.id}
              to={`/competencies/${fw.id}`}
              className="group rounded-lg border border-gray-200 bg-white p-5 hover:border-brand-200 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-brand-600">
                      {fw.name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Created {formatDate(fw.created_at)}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-brand-400" />
              </div>
              {fw.description && (
                <p className="mt-3 text-sm text-gray-500 line-clamp-2">{fw.description}</p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    fw.is_active
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {fw.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
