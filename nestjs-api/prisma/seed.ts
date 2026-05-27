import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database…');

  const existing = await prisma.organization.findUnique({ where: { slug: 'default' } });
  if (existing) {
    console.log('Seed already applied — skipping.');
    return;
  }

  const passwordHash = await argon2.hash('Admin@12345');

  const org = await prisma.organization.create({
    data: {
      name: 'Default Organization',
      slug: 'default',
      warehouses: {
        create: { name: 'المستودع الرئيسي', code: 'MAIN' },
      },
      users: {
        create: {
          username: 'admin',
          passwordHash,
          fullName: 'System Admin',
          role: Role.admin,
          isActive: true,
        },
      },
    },
    include: { users: true },
  });

  console.log(`Created organization: ${org.name} (id=${org.id})`);
  console.log(`Created admin user: admin / Admin@12345`);
  console.log('Change the default password immediately after first login.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
