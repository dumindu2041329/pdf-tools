import ILovePDFApi from "@ilovepdf/ilovepdf-nodejs";

const ILOVEAPI_PUBLIC_KEY = process.env.ILOVEAPI_PUBLIC_KEY ?? "";
const ILOVEAPI_SECRET_KEY = process.env.ILOVEAPI_SECRET_KEY ?? "";

if (!ILOVEAPI_PUBLIC_KEY || !ILOVEAPI_SECRET_KEY) {
  console.warn("Missing iLoveAPI credentials in environment variables.");
}

const globalForILoveAPI = global as unknown as { ilovepdf: ILovePDFApi };

export const ilovepdf =
  globalForILoveAPI.ilovepdf ||
  new ILovePDFApi(ILOVEAPI_PUBLIC_KEY, ILOVEAPI_SECRET_KEY);

if (process.env.NODE_ENV !== "production") globalForILoveAPI.ilovepdf = ilovepdf;

import jwt from "jsonwebtoken";

export function getRawToken(): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: ILOVEAPI_PUBLIC_KEY,
      iat: now,
      nbf: now,
      exp: now + 7200,
    },
    ILOVEAPI_SECRET_KEY
  );
}

