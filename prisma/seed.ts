import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DEFAULT_CATEGORIES = [
  { name: "Alimentacion", emoji: "🍔", color: "#EF4444", sortOrder: 0 },
  { name: "Transporte", emoji: "🚗", color: "#22C55E", sortOrder: 1 },
  { name: "Entretenimiento", emoji: "🎬", color: "#14B8A6", sortOrder: 2 },
  { name: "Compras", emoji: "🛍️", color: "#EAB308", sortOrder: 3 },
  { name: "Salud", emoji: "💊", color: "#DC2626", sortOrder: 4 },
  { name: "Servicios", emoji: "💡", color: "#3B82F6", sortOrder: 5 },
  { name: "Educacion", emoji: "📚", color: "#8B5CF6", sortOrder: 6 },
  { name: "Viajes", emoji: "✈️", color: "#0D9488", sortOrder: 7 },
  { name: "Otros", emoji: "📦", color: "#92400E", sortOrder: 8 },
];

export async function createDefaultCategories(userId: string) {
  const categories = DEFAULT_CATEGORIES.map((cat) => ({
    userId,
    name: cat.name,
    emoji: cat.emoji,
    color: cat.color,
    isDefault: true,
    isActive: true,
    sortOrder: cat.sortOrder,
  }));

  await prisma.category.createMany({ data: categories });
}

async function main() {
  // Check if test user already exists
  const existing = await prisma.user.findUnique({
    where: { email: "demo@misgastos.app" },
  });

  if (existing) {
    // Ensure space exists
    const hasSpace = await prisma.space.findFirst({
      where: { createdBy: existing.id },
    });
    if (!hasSpace) {
      const space = await prisma.space.create({
        data: {
          name: "Personal",
          inviteCode: crypto.randomBytes(4).toString("hex").toUpperCase(),
          creator: { connect: { id: existing.id } },
        },
      });
      await prisma.spaceMember.create({
        data: { userId: existing.id, spaceId: space.id, role: "OWNER" },
      });
      await prisma.user.update({
        where: { id: existing.id },
        data: { defaultSpaceId: space.id },
      });
      console.log("Space created for existing user.");
    } else {
      console.log("Test user already fully seeded.");
    }
    return;
  }

  // Create test user
  const hashedPassword = await bcrypt.hash("demo1234", 12);
  const apiToken = crypto.randomBytes(32).toString("hex");

  const user = await prisma.user.create({
    data: {
      email: "demo@misgastos.app",
      name: "Usuario Demo",
      passwordHash: hashedPassword,
      apiToken,
    },
  });

  console.log("Test user created:");
  console.log("  Email: demo@misgastos.app");
  console.log("  Password: demo1234");

  // Create default categories
  await createDefaultCategories(user.id);
  console.log("  9 default categories created");

  // Create personal space
  const space = await prisma.space.create({
    data: {
      name: "Personal",
      inviteCode: crypto.randomBytes(4).toString("hex").toUpperCase(),
      creator: { connect: { id: user.id } },
    },
  });

  await prisma.spaceMember.create({
    data: {
      userId: user.id,
      spaceId: space.id,
      role: "OWNER",
    },
  });

  // Set default space
  await prisma.user.update({
    where: { id: user.id },
    data: { defaultSpaceId: space.id },
  });

  console.log("  Personal space created and set as default");
  console.log("\nSeed completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
