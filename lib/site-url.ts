const PRODUCTION_APP_ORIGIN = "https://mixkan.jp";

export const getAppOrigin = () =>
  process.env.APP_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() || "";

export const getMetadataBaseUrl = () => new URL(getAppOrigin() || PRODUCTION_APP_ORIGIN);
