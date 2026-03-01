import bcrypt from "bcrypt";
import crypto from "crypto";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../http/http-error";
import { env } from "../../env";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function refreshExpiryDate() {
  const ms = env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

export async function registerUser(input: { email: string; password: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new HttpError(409, "Email already in use");

  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email: input.email, password: passwordHash },
      select: { id: true, email: true },
    });

    const wallet = await tx.wallet.create({
      data: { userId: created.id },
      select: { id: true },
    });

    await tx.balance.createMany({
      data: [
        { walletId: wallet.id, token: "BRL" },
        { walletId: wallet.id, token: "BTC" },
        { walletId: wallet.id, token: "ETH" },
      ],
    });

    return created;
  });

  return user;
}

export async function loginUser(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new HttpError(401, "Invalid credentials");

  const ok = await bcrypt.compare(input.password, user.password);
  if (!ok) throw new HttpError(401, "Invalid credentials");

  const accessToken = (globalThis as any).__app.jwt.sign(
    { sub: user.id, typ: "access" },
    { expiresIn: env.ACCESS_TOKEN_TTL }
  );

  const refreshToken = (globalThis as any).__app.jwt.sign(
    { sub: user.id, typ: "refresh" },
    { expiresIn: `${env.REFRESH_TOKEN_DAYS}d` }
  );

  const tokenHash = sha256(refreshToken);

  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await tx.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: refreshExpiryDate(),
      },
    });
  });

  return { accessToken, refreshToken };
}

export async function rotateRefreshToken(input: { refreshToken: string }) {
  let payload: any;
  try {
    payload = (globalThis as any).__app.jwt.verify(input.refreshToken);
  } catch {
    throw new HttpError(401, "Invalid refresh token");
  }

  const userId = payload?.sub as string | undefined;
  const typ = payload?.typ as string | undefined;

  if (!userId || typ !== "refresh") throw new HttpError(401, "Invalid refresh token");

  const tokenHash = sha256(input.refreshToken);

  const stored = await prisma.refreshToken.findFirst({
    where: { userId, tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
  });

  if (!stored) throw new HttpError(401, "Invalid refresh token");

  const accessToken = (globalThis as any).__app.jwt.sign(
    { sub: userId, typ: "access" },
    { expiresIn: env.ACCESS_TOKEN_TTL }
  );

  const refreshToken = (globalThis as any).__app.jwt.sign(
    { sub: userId, typ: "refresh" },
    { expiresIn: `${env.REFRESH_TOKEN_DAYS}d` }
  );

  const newHash = sha256(refreshToken);

  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    await tx.refreshToken.create({
      data: {
        userId,
        tokenHash: newHash,
        expiresAt: refreshExpiryDate(),
      },
    });
  });

  return { accessToken, refreshToken };
}