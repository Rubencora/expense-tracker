import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSpaceMember } from "@/lib/space-auth";

export const GET = authMiddleware(
  async (req: NextRequest, { params, userId }) => {
    const { id } = await params;

    // Verify user is a member of this space
    if (!(await isSpaceMember(id, userId))) {
      return NextResponse.json(
        { error: "No eres miembro de este espacio" },
        { status: 403 }
      );
    }

    // Get all unsettled splits for expenses in this space
    const splits = await prisma.expenseSplit.findMany({
      where: { isSettled: false, expense: { spaceId: id } },
      select: { paidByUserId: true, owedByUserId: true, amountUsd: true },
    });

    // Get all settlements for this space
    const settlements = await prisma.settlement.findMany({
      where: { spaceId: id },
      select: { fromUserId: true, toUserId: true, amountUsd: true },
    });

    // Build net balances between each pair of users
    // Key: "userA-userB" (sorted alphabetically), value: how much userA owes userB (negative = userB owes userA)
    const pairBalances = new Map<string, number>();

    function getPairKey(
      a: string,
      b: string
    ): { key: string; aIsFirst: boolean } {
      const sorted = [a, b].sort();
      return { key: `${sorted[0]}-${sorted[1]}`, aIsFirst: a === sorted[0] };
    }

    // Process splits: owedByUser owes paidByUser
    for (const split of splits) {
      if (split.owedByUserId === split.paidByUserId) continue;

      const { key, aIsFirst } = getPairKey(
        split.owedByUserId,
        split.paidByUserId
      );
      const current = pairBalances.get(key) ?? 0;

      // If owedByUser is first in the sorted pair, they owe more (positive direction)
      // If paidByUser is first, then owedByUser's debt goes in the negative direction
      if (aIsFirst) {
        // owedByUser is sorted first -> they owe more -> add
        pairBalances.set(key, current + split.amountUsd);
      } else {
        // paidByUser is sorted first -> owedByUser owes, so subtract
        pairBalances.set(key, current - split.amountUsd);
      }
    }

    // Process settlements: fromUser paid toUser (reduces debt from fromUser to toUser)
    for (const settlement of settlements) {
      if (settlement.fromUserId === settlement.toUserId) continue;

      const { key, aIsFirst } = getPairKey(
        settlement.fromUserId,
        settlement.toUserId
      );
      const current = pairBalances.get(key) ?? 0;

      // fromUser paid toUser, so fromUser's debt to toUser decreases
      if (aIsFirst) {
        // fromUser is sorted first -> their debt decreases -> subtract
        pairBalances.set(key, current - settlement.amountUsd);
      } else {
        // toUser is sorted first -> fromUser's debt goes positive direction -> add
        pairBalances.set(key, current + settlement.amountUsd);
      }
    }

    // Calculate net balance per user (positive = is owed money, negative = owes money)
    const userNetBalances = new Map<string, number>();

    for (const [key, amount] of pairBalances) {
      if (Math.abs(amount) < 0.01) continue;

      const [userA, userB] = key.split("-");
      // Positive amount means userA owes userB
      // So userA's balance decreases, userB's balance increases
      userNetBalances.set(userA, (userNetBalances.get(userA) ?? 0) - amount);
      userNetBalances.set(userB, (userNetBalances.get(userB) ?? 0) + amount);
    }

    // Greedy simplification algorithm to minimize transactions
    const creditors: { userId: string; amount: number }[] = [];
    const debtors: { userId: string; amount: number }[] = [];

    for (const [userId, balance] of userNetBalances) {
      if (balance > 0.01) {
        creditors.push({ userId, amount: balance });
      } else if (balance < -0.01) {
        debtors.push({ userId, amount: -balance }); // Store as positive
      }
    }

    // Sort descending by amount
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const simplifiedDebts: {
      fromUserId: string;
      toUserId: string;
      amount: number;
    }[] = [];

    let ci = 0;
    let di = 0;

    while (ci < creditors.length && di < debtors.length) {
      const creditor = creditors[ci];
      const debtor = debtors[di];
      const settleAmount = Math.min(creditor.amount, debtor.amount);

      if (settleAmount > 0.01) {
        simplifiedDebts.push({
          fromUserId: debtor.userId,
          toUserId: creditor.userId,
          amount: Math.round(settleAmount * 100) / 100,
        });
      }

      creditor.amount -= settleAmount;
      debtor.amount -= settleAmount;

      if (creditor.amount < 0.01) ci++;
      if (debtor.amount < 0.01) di++;
    }

    // Collect all involved user IDs
    const allUserIds = new Set<string>();
    for (const debt of simplifiedDebts) {
      allUserIds.add(debt.fromUserId);
      allUserIds.add(debt.toUserId);
    }
    for (const [userId] of userNetBalances) {
      allUserIds.add(userId);
    }

    // Get all space members with names
    const members = await prisma.spaceMember.findMany({
      where: { spaceId: id },
      include: { user: { select: { id: true, name: true } } },
    });

    const userMap = new Map<string, string>();
    for (const member of members) {
      userMap.set(member.user.id, member.user.name ?? "Sin nombre");
    }

    // Build response
    const balances = simplifiedDebts.map((debt) => ({
      from: { id: debt.fromUserId, name: userMap.get(debt.fromUserId) ?? "Desconocido" },
      to: { id: debt.toUserId, name: userMap.get(debt.toUserId) ?? "Desconocido" },
      amount: debt.amount,
    }));

    const userSummary = members.map((member) => ({
      id: member.user.id,
      name: member.user.name ?? "Sin nombre",
      netBalance: Math.round((userNetBalances.get(member.user.id) ?? 0) * 100) / 100,
    }));

    return NextResponse.json({ balances, userSummary });
  }
);
