"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import { RiMoonLine, RiSunLine } from "@remixicon/react";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export interface AnimatedThemeTogglerProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  /** Duration of the radial clip-path view transition in milliseconds. */
  duration?: number;
  /** When true, renders a compact icon-only button suitable for a collapsed sidebar rail. */
  collapsed?: boolean;
  /** Optional label shown in expanded mode. */
  label?: string;
}

/**
 * Theme switcher with Magic UI's View Transitions radial clip-path animation.
 * Renders a full dynamic Sun/Moon switch when expanded and an icon button when collapsed.
 */
export function AnimatedThemeToggler({
  duration = 400,
  collapsed = false,
  label = "Theme",
  className,
  onClick,
  ...props
}: AnimatedThemeTogglerProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const isTransitioningRef = React.useRef(false);
  const activeAnimRef = React.useRef<Animation | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const cancelAnim = React.useCallback(() => {
    activeAnimRef.current?.cancel();
    activeAnimRef.current = null;
  }, []);

  React.useEffect(() => {
    return () => {
      cancelAnim();
      const root = document.documentElement;
      if (root.dataset.magicuiThemeVt !== "active") return;
      delete root.dataset.magicuiThemeVt;
      root.style.removeProperty("--magicui-theme-vt-clip-from");
    };
  }, [cancelAnim]);

  const isDark = mounted && resolvedTheme === "dark";

  const handleToggle = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;

      const button = buttonRef.current;
      if (
        !button ||
        isTransitioningRef.current ||
        document.documentElement.dataset.magicuiThemeVt === "active"
      ) {
        return;
      }

      const nextTheme = isDark ? "light" : "dark";
      const applyTheme = () => {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(nextTheme);
        setTheme(nextTheme);
      };

      const prefersReducedMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (
        prefersReducedMotion ||
        typeof document.startViewTransition !== "function"
      ) {
        applyTheme();
        return;
      }

      const viewportWidth = window.innerWidth || 1;
      const viewportHeight = window.innerHeight || 1;
      const { top, left, width, height } = button.getBoundingClientRect();
      const cx = left + width / 2;
      const cy = top + height / 2;
      const maxRadius = Math.hypot(
        Math.max(cx, viewportWidth - cx),
        Math.max(cy, viewportHeight - cy)
      );

      const point = `${(cx / viewportWidth) * 100}% ${(cy / viewportHeight) * 100}%`;
      const endRadius = `${
        (maxRadius / (Math.hypot(viewportWidth, viewportHeight) / Math.SQRT2)) *
        100
      }%`;
      const clipPath: [string, string] = [
        `circle(0% at ${point})`,
        `circle(${endRadius} at ${point})`,
      ];

      const root = document.documentElement;
      root.dataset.magicuiThemeVt = "active";
      root.style.setProperty("--magicui-theme-vt-clip-from", clipPath[0]);

      const cleanup = () => {
        isTransitioningRef.current = false;
        delete root.dataset.magicuiThemeVt;
        root.style.removeProperty("--magicui-theme-vt-clip-from");
        cancelAnim();
      };

      isTransitioningRef.current = true;
      const transition = document.startViewTransition(() => {
        flushSync(applyTheme);
      });

      if (typeof transition?.finished?.finally === "function") {
        transition.finished.finally(cleanup).catch(() => {});
      } else {
        cleanup();
      }

      const ready = transition?.ready;
      if (ready && typeof ready.then === "function") {
        ready
          .then(() => {
            const anim = document.documentElement.animate(
              { clipPath },
              {
                duration,
                easing: "ease-in-out",
                fill: "forwards",
                pseudoElement: "::view-transition-new(root)",
              }
            );
            activeAnimRef.current = anim;
          })
          .catch(() => {});
      }
    },
    [cancelAnim, duration, isDark, onClick, setTheme]
  );

  const ariaLabel = isDark ? "Switch to light mode" : "Switch to dark mode";

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              ref={buttonRef}
              type="button"
              aria-label={ariaLabel}
              aria-pressed={isDark}
              onClick={handleToggle}
              className={cn(
                "flex size-8 items-center justify-center rounded-md p-2 text-sm text-sidebar-foreground ring-sidebar-ring outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2",
                className
              )}
              {...props}
            >
              {isDark ? (
                <RiSunLine className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <RiMoonLine className="size-4 shrink-0" aria-hidden="true" />
              )}
            </button>
          }
        />
        <TooltipContent side="right" align="center">
          {ariaLabel}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={ariaLabel}
      onClick={handleToggle}
      className={cn(
        "flex h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm text-sidebar-foreground ring-sidebar-ring outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2",
        className
      )}
      {...props}
    >
      <span className="flex items-center gap-2 truncate">
        {isDark ? (
          <RiMoonLine className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          <RiSunLine className="size-4 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{label}</span>
      </span>

      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border p-0.5 transition-colors duration-200",
          isDark ? "bg-primary" : "bg-input"
        )}
      >
        <span className="flex w-full items-center justify-between px-1">
          <RiSunLine
            className={cn(
              "size-3 transition-opacity duration-200",
              isDark ? "text-primary-foreground/70 opacity-70" : "opacity-0"
            )}
          />
          <RiMoonLine
            className={cn(
              "size-3 transition-opacity duration-200",
              isDark ? "opacity-0" : "text-muted-foreground opacity-80"
            )}
          />
        </span>
        <span
          className={cn(
            "pointer-events-none absolute left-0.5 flex size-5 items-center justify-center rounded-full bg-background text-foreground shadow-xs transition-transform duration-200",
            isDark ? "translate-x-5" : "translate-x-0"
          )}
        >
          {isDark ? (
            <RiMoonLine className="size-3" />
          ) : (
            <RiSunLine className="size-3" />
          )}
        </span>
      </span>
    </button>
  );
}

