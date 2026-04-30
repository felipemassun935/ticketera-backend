import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
//FUNCTION
export async function nextTicketId() {
  const { value } = await prisma.counter.update({
    where: { key: 'ticket' },
    data:  { value: { increment: 1 } },
  });
  return `TK-${value}`;
}

export async function nextKbId() {
  const { value } = await prisma.counter.update({
    where: { key: 'kb' },
    data:  { value: { increment: 1 } },
  });
  return `KB-${String(value).padStart(3, '0')}`;
}
