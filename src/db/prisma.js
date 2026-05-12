let client = null;

function prisma() {
  if (!["1", "true", "yes", "on"].includes(String(process.env.DB_ENABLED || "").toLowerCase())) return null;
  if (!process.env.DATABASE_URL) return null;
  if (!client) {
    const { PrismaClient } = require("@prisma/client");
    client = new PrismaClient();
  }
  return client;
}

async function disconnectPrisma() {
  if (client) await client.$disconnect();
}

module.exports = { prisma, disconnectPrisma };
