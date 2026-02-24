import { prisma } from "./prisma";

export async function isSpaceMember(spaceId: string, userId: string): Promise<boolean> {
  const membership = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId, userId } },
  });
  return !!membership;
}
