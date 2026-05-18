/**
 * Supabase Auth JWT verification middleware for Express.
 *
 * Verifies the access token issued by Supabase Auth and attaches
 * decoded claims to `req.auth`. The backend never talks to Supabase
 * directly — it only validates the JWT signature using the shared secret.
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// ── Types ───────────────────────────────────────────────────────

export interface SupabaseClaims {
  /** Supabase user UUID (the `sub` claim) */
  sub: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
    avatar_url?: string;
  };
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
}

declare global {
  namespace Express {
    interface Request {
      /** Populated by requireAuth / optionalAuth middleware */
      auth?: SupabaseClaims;
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function getJwtSecret(): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "SUPABASE_JWT_SECRET is not set. Copy it from Supabase dashboard → Settings → API → JWT Secret."
    );
  }
  return secret;
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function verifyToken(token: string): SupabaseClaims {
  const decoded = jwt.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
  }) as SupabaseClaims;
  return decoded;
}

// ── Middleware ───────────────────────────────────────────────────

/**
 * Requires a valid Supabase JWT. Returns 401 if missing or invalid.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  try {
    req.auth = verifyToken(token);
    next();
  } catch (err: any) {
    console.error("[auth] JWT verification failed:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Accepts a valid Supabase JWT if present but does not reject
 * unauthenticated requests. Use during migration when routes
 * need to support both old (localStorage) and new (JWT) sessions.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    try {
      req.auth = verifyToken(token);
    } catch {
      // Invalid token — proceed without auth (legacy session may apply)
    }
  }
  next();
}
