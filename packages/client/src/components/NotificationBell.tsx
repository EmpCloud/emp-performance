import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Loader2 } from "lucide-react";
import { apiGet, apiPost, apiPatch } from "@/api/client";
import { cn, formatDate } from "@/lib/utils";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

interface PaginatedNotifications {
  data: NotificationItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Unread count — polled so the badge stays fresh.
  const { data: unreadData } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => apiGet<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 60_000,
  });
  const unread = unreadData?.data?.count ?? 0;

  // Most recent notifications, fetched only while the dropdown is open.
  const { data: feedData, isLoading } = useQuery({
    queryKey: ["notifications", "feed", "preview"],
    queryFn: () => apiGet<PaginatedNotifications>("/notifications/feed", { page: 1, perPage: 8 }),
    enabled: open,
  });
  const items = feedData?.data?.data ?? [];

  const markRead = useMutation({
    mutationFn: (id: string) => apiPatch(`/notifications/${id}/read`),
  });

  const markAll = useMutation({
    mutationFn: () => apiPost("/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function handleItemClick(n: NotificationItem) {
    if (!n.is_read) {
      await markRead.mutateAsync(n.id);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
    setOpen(false);
    if (n.link) navigate(n.link);
    else navigate("/notifications");
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-4 top-16 z-50 flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-80">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                <Check className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="min-h-0 max-h-96 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">No notifications yet</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-50",
                    !n.is_read && "bg-brand-50/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900">{n.title}</span>
                    {!n.is_read && <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-brand-500" />}
                  </div>
                  {n.body && <span className="text-xs text-gray-500 line-clamp-2">{n.body}</span>}
                  <span className="text-[11px] text-gray-400">{formatDate(n.created_at)}</span>
                </button>
              ))
            )}
          </div>

          <button
            onClick={() => {
              setOpen(false);
              navigate("/notifications");
            }}
            className="block w-full shrink-0 rounded-b-xl border-t border-gray-100 px-4 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-gray-50"
          >
            View all
          </button>
        </div>
      )}
    </div>
  );
}
