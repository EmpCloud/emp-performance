import { useMutation } from "@tanstack/react-query";
import { apiPost } from "./client";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export function useLogin() {
  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      apiPost<any>("/auth/login", data),
  });
}
