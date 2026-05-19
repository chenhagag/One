/**
 * Supabase Auth JWT verification middleware for Express.
 *
 * Verifies the access token issued by Supabase Auth using JWKS (ES256).
 * Falls back to HS256 with JWT secret for legacy Supabase projects.
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";

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

// ── JWKS client ────────────────────────────────────────────────

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const jwksClient = supabaseUrl
  ? jwksRsa({
      jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      cache: true,
      cacheMaxAge: 600000, // 10 min
    })
  : null;

function getSigningKey(header: jwt.JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!jwksClient) {
      // Fallback to legacy JWT secret
      const secret = process.env.SUPABASE_JWT_SECRET;
      if (secret) return resolve(secret);
      return reject(new Error("No JWKS client or JWT secret configured"));
    }
    jwksClient.getSigningKey(header.kid, (err, key) => {
      if (err) return reject(err);
      resolve(key!.getPublicKey());
    });
  });
}

async function verifyToken(token: string): Promise<SupabaseClaims> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      (header, callback) => {
        getSigningKey(header)
          .then((key) => callback(null, key))
          .catch((err) => callback(err));
      },
      { algorithms: ["ES256", "HS256"] },
      (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded as SupabaseClaims);
      }
    );
  });
}

// ── Helpers ─────────────────────────────────────────────────────

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
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

  verifyToken(token)
    .then((claims) => {
      req.auth = claims;
      next();
    })
    .catch((err: any) => {
      console.error("[auth] JWT verification failed:", err.message);
      return res.status(401).json({ error: "Invalid or expired token" });
    });
}

/**
 * Accepts a valid Supabase JWT if present but does not reject
 * unauthenticated requests. Use during migration when routes
 * need to support both old (localStorage) and new (JWT) sessions.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    verifyToken(token)
      .then((claims) => {
        req.auth = claims;
        next();
      })
      .catch(() => {
        // Invalid token — proceed without auth (legacy session may apply)
        next();
      });
  } else {
    next();
  }
}
