import { useQuery } from "@tanstack/react-query";
import {
  Route,
  ArrowUp,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
} from "lucide-react";
import { apiGet } from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";

interface TrackLevel {
  id: string;
  title: string;
  level: number;
  description: string | null;
  requirements: string | null;
  min_years_experience: number | null;
}

interface CareerTrack {
  id: string;
  employee_id: number;
  career_path_id: string;
  current_level_id: string;
  target_level_id: string | null;
  path: {
    id: string;
    name: string;
    description: string | null;
    department: string | null;
  } | null;
  currentLevel: TrackLevel | null;
  targetLevel: TrackLevel | null;
}

export function MyCareerPage() {
  const user = useAuthStore((s) => s.user);

  const { data, isLoading } = useQuery({
    queryKey: ["my-career-track", user?.empcloudUserId],
    queryFn: () =>
      apiGet<CareerTrack[]>(
        `/career-paths/tracks/employee/${user?.empcloudUserId}`,
      ),
    enabled: !!user,
  });

  const tracks = data?.data || [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">My Career</h1>
      <p className="mt-1 text-sm text-gray-500">
        Your career path, current level, and next steps.
      </p>

      {isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : tracks.length === 0 ? (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Route className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No career path assigned</h3>
          <p className="mt-1 text-sm text-gray-500">
            Ask your manager or HR to assign you to a career path.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {tracks.map((track) => (
            <div
              key={track.id}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              {/* Path Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
                  <Route className="h-5 w-5 text-brand-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {track.path?.name || "Career Path"}
                  </h2>
                  {track.path?.department && (
                    <p className="text-sm text-gray-500">{track.path.department}</p>
                  )}
                </div>
              </div>

              {/* Current Level */}
              {track.currentLevel && (
                <div className="rounded-lg border-2 border-brand-200 bg-brand-50/30 p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-brand-600" />
                    <span className="text-sm font-medium text-brand-700">Current Level</span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{track.currentLevel.title}</h3>
                  <div className="flex items-center gap-1 mt-1 text-sm text-gray-500">
                    <span>Level {track.currentLevel.level}</span>
                    {track.currentLevel.min_years_experience != null && (
                      <>
                        <span className="mx-1 text-gray-300">|</span>
                        <Clock className="h-3.5 w-3.5" />
                        <span>{track.currentLevel.min_years_experience}+ years</span>
                      </>
                    )}
                  </div>
                  {track.currentLevel.description && (
                    <p className="mt-2 text-sm text-gray-600">{track.currentLevel.description}</p>
                  )}
                </div>
              )}

              {/* Arrow to next level */}
              {track.targetLevel && (
                <>
                  <div className="flex justify-center my-2">
                    <ArrowUp className="h-6 w-6 text-gray-300" />
                  </div>

                  {/* Target Level */}
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Circle className="h-5 w-5 text-gray-400" />
                      <span className="text-sm font-medium text-gray-500">Target Level</span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{track.targetLevel.title}</h3>
                    <div className="flex items-center gap-1 mt-1 text-sm text-gray-500">
                      <span>Level {track.targetLevel.level}</span>
                      {track.targetLevel.min_years_experience != null && (
                        <>
                          <span className="mx-1 text-gray-300">|</span>
                          <Clock className="h-3.5 w-3.5" />
                          <span>{track.targetLevel.min_years_experience}+ years</span>
                        </>
                      )}
                    </div>
                    {track.targetLevel.description && (
                      <p className="mt-2 text-sm text-gray-600">{track.targetLevel.description}</p>
                    )}

                    {/* Requirements / Competency Gaps */}
                    {track.targetLevel.requirements && (
                      <div className="mt-3 rounded-lg bg-white border border-gray-200 p-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                          Requirements to Reach This Level
                        </p>
                        <p className="text-sm text-gray-700">{track.targetLevel.requirements}</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
