import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '@prisma/client';

import { hashData } from '../modules/auth/utils/hash.util';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

type SeedUser = {
  email: string;
  fullName: string;
  role: Role;
  password: string;
};

const seedUsers: SeedUser[] = [
  {
    email: 'admin@market-stock.local',
    fullName: 'Admin User',
    role: Role.ADMIN,
    password: 'ChangeMe123!',
  },
  {
    email: 'developer@market-stock.local',
    fullName: 'Developer User',
    role: Role.DEVELOPER,
    password: 'ChangeMe123!',
  },
];

async function seedUser(user: SeedUser) {
  const hashedPassword = await hashData(user.password);

  await prisma.user.upsert({
    where: { email: user.email },
    update: {
      fullName: user.fullName,
      role: user.role,
      password: hashedPassword,
      refreshToken: null,
    },
    create: {
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      password: hashedPassword,
    },
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run the seed.');
  }

  for (const user of seedUsers) {
    await seedUser(user);
  }

  console.log(`Seeded ${seedUsers.length} users successfully.`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
