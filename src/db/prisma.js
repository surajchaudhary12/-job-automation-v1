let client = null;
let applyAttemptClient = null;

function prisma() {
  if (!["1", "true", "yes", "on"].includes(String(process.env.DB_ENABLED || "").toLowerCase())) return null;
  if (!process.env.DATABASE_URL) return null;
  if (!client) {
    const { PrismaClient } = require("@prisma/client");
    client = new PrismaClient();
  }
  return client;
}

function applyAttemptsPrisma() {
  const db = prisma();
  if (db) return db;
  if (!process.env.DATABASE_URL) return null;
  if (!applyAttemptClient) {
    const { PrismaClient } = require("@prisma/client");
    applyAttemptClient = new PrismaClient();
  }
  return applyAttemptClient;
}

async function disconnectPrisma() {
  if (client) await client.$disconnect();
  if (applyAttemptClient && applyAttemptClient !== client) await applyAttemptClient.$disconnect();
}

module.exports = { prisma, applyAttemptsPrisma, disconnectPrisma };
