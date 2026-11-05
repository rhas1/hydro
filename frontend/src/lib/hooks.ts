import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api } from "../api/client";
import type { BusinessSettings, Category, ItemMeta } from "../api/types";

export function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api<BusinessSettings>("/settings"),
    staleTime: 5 * 60_000,
  });
}

/** Currency code from business settings (falls back while loading). */
export function useCurrency() {
  return useSettings().data?.currency ?? "USD";
}

export function useItemMeta() {
  return useQuery({
    queryKey: ["items", "meta"],
    queryFn: () => api<ItemMeta>("/items/meta"),
    staleTime: 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Category[]>("/categories"),
    staleTime: 60_000,
  });
}
