import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
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
  const {
    data: unreadData,
    isError: unreadError,
    isFetching: unreadFetching,
    refetch: refetchUnread,
  } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => apiGet<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 60_000,
  });
  const unread = unreadError ? undefined : unreadData?.data?.count;
  const bellLabel = unreadError ? "Notifications (unread count unavailable)" : "Notifications";

  // Most recent notifications, fetched only while the dropdown is open.
  const {
    data: feedData,
    isLoading,
    isError: feedError,
    isFetching: feedFetching,
    refetch: refetchFeed,
  } = useQuery({
    queryKey: ["notifications", "feed", "preview"],
    queryFn: () => apiGet<PaginatedNotifications>("/notifications/feed", { page: 1, perPage: 8 }),
    enabled: open,
    staleTime: 0,
    refetchInterval: open ? 60_000 : false,
  });
  const items = feedData?.data?.data ?? [];

  const markRead = useMutation({
    mutationFn: (id: string) => apiPatch(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => {
      toast.error("Could not mark this notification as read. Please try again from Notifications.");
    },
  });

  const markAll = useMutation({
    mutationFn: () => apiPost("/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => {
      toast.error("Could not mark all notifications as read. Please try again.");
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

  function handleItemClick(n: NotificationItem) {
    if (!n.is_read) {
      markRead.mutate(n.id);
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
        title={bellLabel}
        aria-label={bellLabel}
      >
        <Bell className="h-5 w-5" />
        {unreadError ? (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
            ?
          </span>
        ) : unread !== undefined && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {unread !== undefined && unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                {markAll.isPending ? "Marking as read…" : "Mark all read"}
              </button>
            )}
          </div>

          {unreadError && (
            <div role="alert" className="border-b border-gray-100 px-4 py-3 text-sm text-red-600">
              <p>Unread count unavailable.</p>
              <button
                type="button"
                onClick={() => { void refetchUnread(); }}
                disabled={unreadFetching}
                className="mt-2 font-medium text-brand-600 hover:underline disabled:opacity-50"
              >
                Retry unread count
              </button>
            </div>
          )}

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 role="status" aria-label="Loading notifications" className="h-5 w-5 animate-spin text-gray-300" />
              </div>
            ) : feedError ? (
              <div role="alert" className="px-4 py-6 text-center text-sm text-red-600">
                <p>Unable to load notifications.</p>
                <button
                  type="button"
                  onClick={() => { void refetchFeed(); }}
                  disabled={feedFetching}
                  className="mt-2 font-medium text-brand-600 hover:underline disabled:opacity-50"
                >
                  Retry notifications
                </button>
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
            className="block w-full rounded-b-xl border-t border-gray-100 px-4 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-gray-50"
          >
            View all
          </button>
        </div>
      )}
    </div>
  );
}
