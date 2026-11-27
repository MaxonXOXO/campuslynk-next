"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
  Input,
} from "@academic-suite/ui";
import {
  RiBuilding2Line,
  RiCompass3Line,
  RiFlashlightLine,
  RiSearchLine,
  RiSettings4Line,
  RiUserLine,
} from "@remixicon/react";
import { STALE_TIME_LIST_MS, useApiQuery } from "@/lib/query/api-query";
import {
  buildControlPanelSettingHref,
  getSearchQuickActions,
  getWorkspaceSearchPages,
  searchControlPanelSettings,
} from "@/lib/search/search-registry";
import type { WorkspaceSlug } from "@/lib/workspaces/workspaces";

interface DirectoryUserItem {
  id: string;
  name: string;
  email?: string | null;
  status?: string | null;
}

interface DepartmentItem {
  id: string;
  name: string;
  code?: string | null;
}

export interface GlobalSearchCommandProps {
  activeSlug: WorkspaceSlug;
  workspaces: readonly WorkspaceSlug[];
}

export function GlobalSearchCommand({
  activeSlug,
  workspaces,
}: GlobalSearchCommandProps) {
  const router = useRouter();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      } else if (event.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const hasSuperAdmin = workspaces.includes("super-admin");
  const hasPrincipal = workspaces.includes("principal");
  const canSearchUsers = hasSuperAdmin || hasPrincipal;
  const canSearchDepartments = hasPrincipal;

  const trimmedQuery = query.trim().toLowerCase();

  const matchingPages = React.useMemo(() => {
    if (!trimmedQuery) return [];
    const allPages = getWorkspaceSearchPages(workspaces);
    const tokens = trimmedQuery.split(/\s+/).filter(Boolean);
    return allPages.filter((page) => {
      const haystack = [page.label, page.workspaceLabel, ...page.keywords]
        .join(" ")
        .toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [workspaces, trimmedQuery]);

  const matchingSettings = React.useMemo(() => {
    if (!hasSuperAdmin) return [];
    const matches = searchControlPanelSettings(query);
    return trimmedQuery ? matches : matches.slice(0, 5);
  }, [hasSuperAdmin, query, trimmedQuery]);

  const matchingActions = React.useMemo(() => {
    const allActions = getSearchQuickActions(workspaces);
    if (!trimmedQuery) return allActions;
    const tokens = trimmedQuery.split(/\s+/).filter(Boolean);
    return allActions.filter((action) => {
      const haystack = [action.label, action.description, ...action.keywords]
        .join(" ")
        .toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [workspaces, trimmedQuery]);

  const usersQuery = useApiQuery<{ data: DirectoryUserItem[] }>({
    queryKey: ["global-search", "users", debouncedQuery],
    staleTime: STALE_TIME_LIST_MS,
    enabled: open && canSearchUsers && debouncedQuery.length >= 2,
    queryFn: async (api) => {
      const apiUsers = api.identity?.users ?? api.users;
      if (!apiUsers?.list) {
        return { data: [] };
      }
      return apiUsers.list({ search: debouncedQuery, limit: 5 });
    },
  });

  const departmentsQuery = useApiQuery<{ data: DepartmentItem[] }>({
    queryKey: ["global-search", "departments"],
    staleTime: STALE_TIME_LIST_MS,
    enabled: open && canSearchDepartments && debouncedQuery.length >= 2,
    queryFn: async (api) => {
      const apiDepts = api.organisation?.departments;
      if (!apiDepts?.list) {
        return { data: [] };
      }
      const res = (await apiDepts.list()) as { data?: DepartmentItem[] };
      return { data: res?.data ?? [] };
    },
  });

  const liveUsers = debouncedQuery.length >= 2 ? (usersQuery.data?.data ?? []) : [];
  const liveDepartments = React.useMemo(() => {
    if (debouncedQuery.length < 2) return [];
    const q = debouncedQuery.toLowerCase();
    return (departmentsQuery.data?.data ?? [])
      .filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.code ?? "").toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [debouncedQuery, departmentsQuery.data]);

  const totalMatches =
    matchingPages.length +
    matchingSettings.length +
    matchingActions.length +
    liveUsers.length +
    liveDepartments.length;

  function navigateTo(href: string) {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(href);
  }

  const usersBaseHref =
    activeSlug === "principal" || !hasSuperAdmin
      ? "/w/principal/users"
      : "/w/super-admin/users";

  return (
    <div ref={containerRef} className="relative hidden sm:flex items-center">
      <RiSearchLine
        className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="Search..."
        aria-label="Search"
        aria-expanded={open}
        aria-controls="global-search-dropdown"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        className="h-8 w-44 pl-8 pr-12 md:w-56 lg:w-64"
      />
      {!query && (
        <kbd className="pointer-events-none absolute right-2 hidden select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground md:inline-flex">
          Ctrl K
        </kbd>
      )}

      {open && (
        <div
          id="global-search-dropdown"
          role="region"
          aria-label="Search results"
          className="absolute right-0 top-full z-50 mt-1.5 w-[24rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <Command shouldFilter={false}>
            <CommandList className="max-h-96">
              {totalMatches === 0 &&
                !usersQuery.isFetching &&
                !departmentsQuery.isFetching && (
                  <CommandEmpty>
                    No matching pages, settings, or records found.
                  </CommandEmpty>
                )}

              {matchingPages.length > 0 && (
                <CommandGroup heading="Pages">
                  {matchingPages.map((page) => (
                    <CommandItem
                      key={page.id}
                      value={page.id}
                      onSelect={() => navigateTo(page.href)}
                    >
                      <RiCompass3Line
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="truncate">{page.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {matchingSettings.length > 0 && (
                <>
                  {matchingPages.length > 0 && <CommandSeparator />}
                  <CommandGroup heading="Control Panel Settings">
                    {matchingSettings.map((setting) => (
                      <CommandItem
                        key={setting.id}
                        value={setting.id}
                        onSelect={() =>
                          navigateTo(buildControlPanelSettingHref(setting))
                        }
                      >
                        <RiSettings4Line
                          className="size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">
                            {setting.title}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {setting.description}
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className="ml-auto shrink-0 text-[10px]"
                        >
                          {setting.categoryLabel}
                        </Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {matchingActions.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Quick Actions">
                    {matchingActions.map((action) => (
                      <CommandItem
                        key={action.id}
                        value={action.id}
                        onSelect={() => navigateTo(action.href)}
                      >
                        <RiFlashlightLine
                          className="size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">
                            {action.label}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {action.description}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {liveUsers.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Users">
                    {liveUsers.map((u) => (
                      <CommandItem
                        key={u.id}
                        value={`user-${u.id}`}
                        onSelect={() =>
                          navigateTo(
                            `${usersBaseHref}?search=${encodeURIComponent(u.name)}`
                          )
                        }
                      >
                        <RiUserLine
                          className="size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">{u.name}</span>
                          {u.email && (
                            <span className="truncate text-xs text-muted-foreground">
                              {u.email}
                            </span>
                          )}
                        </div>
                        {u.status && (
                          <Badge
                            variant="secondary"
                            className="ml-auto text-[10px] capitalize"
                          >
                            {u.status}
                          </Badge>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {liveDepartments.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Departments">
                    {liveDepartments.map((dept) => (
                      <CommandItem
                        key={dept.id}
                        value={`dept-${dept.id}`}
                        onSelect={() => navigateTo("/w/principal/departments")}
                      >
                        <RiBuilding2Line
                          className="size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="truncate font-medium">{dept.name}</span>
                        {dept.code && (
                          <Badge variant="outline" className="ml-auto text-[10px]">
                            {dept.code}
                          </Badge>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}
