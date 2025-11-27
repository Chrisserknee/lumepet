"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Capture pageviews on route change
    if (pathname && typeof window !== "undefined" && posthog.__loaded) {
      let url = window.origin + pathname;
      if (searchParams && searchParams.toString()) {
        url = url + `?${searchParams.toString()}`;
      }
      posthog.capture("$pageview", {
        $current_url: url,
      });
    }
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize PostHog only on client side
    if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
        loaded: (posthog) => {
          if (process.env.NODE_ENV === "development") {
            console.log("PostHog initialized");
          }
        },
        capture_pageview: false, // We'll capture pageviews manually
        session_recording: {
          // Don't mask file inputs so we can see uploaded images in session replay
          maskAllInputs: false,
          // Only mask elements with this data attribute (for sensitive text)
          maskTextSelector: '[data-posthog-mask]',
        },
      });
    }
  }, []);

  return (
    <>
      {children}
      <PostHogPageView />
    </>
  );
}

