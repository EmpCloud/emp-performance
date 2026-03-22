import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Route, ChevronRight, Loader2 } from "lucide-react";
import { apiGet } from "@/api/client";

interface CareerPath {
  id: string;
  name: string;
  description: string | null;
  department: string | null;
  is_active: boolean;
  created_at: string;
}

export function CareerPathListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["career-paths"],
    queryFn: () => apiGet<{ data: CareerPath[]; total: number }>("/career-paths"),
  });

  const paths = data?.data?.data || [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Career Paths</h1>
          <p className="mt-1 text-sm text-gray-500">
            Define career progression paths for your organization.
          </p>
        </div>
        <Link
          to="/career-paths/new"
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Create Path
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-12 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : paths.length === 0 ? (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Route className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No career paths yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create your first career path to define progression tracks.
          </p>
          <Link
            to="/career-paths/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Create Path
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paths.map((path) => (
            <Link
              key={path.id}
              to={`/career-paths/${path.id}`}
              className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
                  <Route className="h-5 w-5 text-brand-600" />
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-brand-600" />
              </div>
              <h3 className="mt-3 text-lg font-semibold text-gray-900">{path.name}</h3>
              {path.description && (
                <p className="mt-1 text-sm text-gray-500 line-clamp-2">{path.description}</p>
              )}
              <div className="mt-3 flex items-center gap-3">
                {path.department && (
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    {path.department}
                  </span>
                )}
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    path.is_active
                      ? "bg-green-50 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {path.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
