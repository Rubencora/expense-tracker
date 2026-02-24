import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

interface TokenPayload {
  userId: string;
  email: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
}

export type AuthenticatedRequest = NextRequest & {
  userId: string;
};

type RouteHandler = (
  req: NextRequest,
  context: { params: Promise<Record<string, string>>; userId: string }
) => Promise<NextResponse>;

export function authMiddleware(handler: RouteHandler) {
  return async (
    req: NextRequest,
    context: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Token de autorizacion requerido" },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);

    try {
      const payload = verifyAccessToken(token);
      return handler(req, { ...context, userId: payload.userId });
    } catch {
      return NextResponse.json(
        { error: "Token invalido o expirado" },
        { status: 401 }
      );
    }
  };
}

export async function authenticateByApiToken(
  req: NextRequest
): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Token de autorizacion requerido" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);
  const user = await prisma.user.findUnique({
    where: { apiToken: token },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: "API token invalido" },
      { status: 401 }
    );
  }

  return { userId: user.id };
}
