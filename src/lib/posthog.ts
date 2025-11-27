import posthog from "posthog-js";

// Helper function to safely capture events
export const captureEvent = (eventName: string, properties?: Record<string, any>) => {
  if (typeof window !== "undefined" && posthog.__loaded) {
    posthog.capture(eventName, properties);
  }
};

// Helper function to identify users
export const identifyUser = (userId: string, properties?: Record<string, any>) => {
  if (typeof window !== "undefined" && posthog.__loaded) {
    posthog.identify(userId, properties);
  }
};

// Helper function to set user properties
export const setUserProperties = (properties: Record<string, any>) => {
  if (typeof window !== "undefined" && posthog.__loaded) {
    posthog.setPersonProperties(properties);
  }
};

// Helper to get PostHog instance (for advanced usage)
export const getPostHog = () => {
  if (typeof window !== "undefined" && posthog.__loaded) {
    return posthog;
  }
  return null;
};



