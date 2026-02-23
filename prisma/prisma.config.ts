import { defineConfig } from 'prisma';

export default defineConfig({
  datasource: {
    provider: 'postgresql',
    directUrl: process.env.DATABASE_URL,
  },
});