import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { Overview } from "../../shared/schemas";
import { api } from "./api";
import { type UseResource, useResource } from "./hooks";

const OverviewContext = createContext<UseResource<Overview> | null>(null);

/** Overview feeds the attention strip and the unread badge; refreshed every 60 s and on demand. */
export function OverviewProvider({ children }: { children: ReactNode }) {
  const res = useResource<Overview>("overview", (signal) => api.get<Overview>("/overview", signal), {
    pollMs: 60_000,
  });
  const value = useMemo(() => res, [res]);
  return <OverviewContext.Provider value={value}>{children}</OverviewContext.Provider>;
}

export function useOverview(): UseResource<Overview> {
  const ctx = useContext(OverviewContext);
  if (!ctx) throw new Error("useOverview must be used inside OverviewProvider");
  return ctx;
}
