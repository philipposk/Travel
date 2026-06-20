const isProd = process.env.NODE_ENV === "production";

export const sharedCookieOptions = {
  name: "sb-6x7-auth",
  ...(isProd ? { domain: ".6x7.gr" } : {}),
  sameSite: "lax" as const,
  secure: isProd,
  path: "/",
};

export const APP_NAME = "travel";
