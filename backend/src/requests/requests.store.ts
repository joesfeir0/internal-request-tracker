import { ConflictException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';
import { RequestStatus, ServiceRequest } from './request-status';

const withHistory = { history: { orderBy: { sequence: 'asc' as const } } };
type StoredRequest = Prisma.ServiceRequestGetPayload<{ include: typeof withHistory }>;
export type OwnedRequest = ServiceRequest & { requesterId: string; handlerId: string };

function toRequest(row: StoredRequest): OwnedRequest {
  return {
    id: row.id, requesterId: row.requesterId, handlerId: row.handlerId, status: row.status,
    history: row.history.map(({ id, requestId, status, changedBy, changedAt }) => ({
      id, requestId, status, changedBy, changedAt: changedAt.toISOString(),
    })),
  };
}

@Injectable()
export class RequestsStore implements OnModuleDestroy {
  private readonly prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL || `file:${resolve(__dirname, '../../prisma/dev.db').replaceAll('\\', '/')}`,
  });

  async findAll(actorId: string): Promise<OwnedRequest[]> {
    const rows = await this.prisma.serviceRequest.findMany({
      where: { OR: [{ requesterId: actorId }, { handlerId: actorId }] },
      include: withHistory, orderBy: { id: 'asc' },
    });
    return rows.map(toRequest);
  }

  async findOne(id: string): Promise<OwnedRequest | null> {
    const row = await this.prisma.serviceRequest.findUnique({ where: { id }, include: withHistory });
    return row ? toRequest(row) : null;
  }

  async saveStatus(id: string, previous: RequestStatus, status: RequestStatus, actorId: string): Promise<OwnedRequest> {
    return this.prisma.$transaction(async (tx) => {
      // Reject a stale write before it can append a duplicate transition.
      const result = await tx.serviceRequest.updateMany({
        where: { id, status: previous, handlerId: actorId }, data: { status },
      });
      if (result.count !== 1) throw new ConflictException('Request changed. Refresh and try again.');
      await tx.statusEvent.create({ data: { requestId: id, status, changedBy: actorId } });
      return toRequest(await tx.serviceRequest.findUniqueOrThrow({ where: { id }, include: withHistory }));
    });
  }

  async onModuleDestroy() { await this.prisma.$disconnect(); }
}
