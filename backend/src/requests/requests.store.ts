import { ConflictException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { RequestStatus, ServiceRequest } from './request-status';
import { Actor } from './dev-actor';

const withDetails = { history: { orderBy: { sequence: 'asc' as const } }, comments: { orderBy: { createdAt: 'asc' as const } } };
type StoredRequest = Prisma.ServiceRequestGetPayload<{ include: typeof withDetails }>;
export type OwnedRequest = ServiceRequest;

function toRequest(row: StoredRequest): OwnedRequest {
  return {
    id: row.id, requesterId: row.requesterId, handlerId: row.handlerId,
    department: row.department as ServiceRequest['department'],
    description: row.description, summary: row.summary, createdAt: row.createdAt.toISOString(), status: row.status,
    history: row.history.map(({ id, requestId, status, changedBy, changedAt }) => ({ id, requestId, status, changedBy, changedAt: changedAt.toISOString() })),
    comments: row.comments.map(({ id, requestId, authorId, message, createdAt }) => ({ id, requestId, authorId, message, createdAt: createdAt.toISOString() })),
  };
}

@Injectable()
export class RequestsStore implements OnModuleDestroy {
  private readonly prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL || `file:${resolve(__dirname, '../../prisma/dev.db').replaceAll('\\', '/')}` });

  async findAll(actor: Actor): Promise<OwnedRequest[]> {
    const where = actor.role === 'handler' ? { department: actor.department } : { requesterId: actor.id };
    const rows = await this.prisma.serviceRequest.findMany({ where, include: withDetails, orderBy: { id: 'asc' } });
    return rows.map(toRequest);
  }

  async findOne(id: string): Promise<OwnedRequest | null> {
    const row = await this.prisma.serviceRequest.findUnique({ where: { id }, include: withDetails });
    return row ? toRequest(row) : null;
  }

  async create(description: string, summary: string, department: ServiceRequest['department'], requesterId: string): Promise<OwnedRequest> {
    const id = `REQ-${randomUUID()}`;
    const row = await this.prisma.serviceRequest.create({
      data: { id, requesterId, department, description, summary,
        history: { create: { status: 'NEW', changedBy: requesterId } } }, include: withDetails,
    });
    return toRequest(row);
  }

  async claim(id: string, department: ServiceRequest['department'], actorId: string): Promise<OwnedRequest> {
    return this.prisma.$transaction(async tx => {
      // A conditional update prevents two handlers from claiming the same request.
      const result = await tx.serviceRequest.updateMany({ where: { id, department, handlerId: null }, data: { handlerId: actorId } });
      if (result.count !== 1) throw new ConflictException('This request is already assigned. Refresh and try again.');
      return toRequest(await tx.serviceRequest.findUniqueOrThrow({ where: { id }, include: withDetails }));
    });
  }

  async addComment(id: string, authorId: string, message: string): Promise<OwnedRequest> {
    return this.prisma.$transaction(async tx => {
      await tx.requestComment.create({ data: { requestId: id, authorId, message } });
      return toRequest(await tx.serviceRequest.findUniqueOrThrow({ where: { id }, include: withDetails }));
    });
  }

  async saveStatus(id: string, previous: RequestStatus, status: RequestStatus, actorId: string): Promise<OwnedRequest> {
    // The status and its history event commit together; a stale update returns 409.
    return this.prisma.$transaction(async tx => {
      const result = await tx.serviceRequest.updateMany({ where: { id, status: previous, handlerId: actorId }, data: { status } });
      if (result.count !== 1) throw new ConflictException('Request changed. Refresh and try again.');
      await tx.statusEvent.create({ data: { requestId: id, status, changedBy: actorId } });
      return toRequest(await tx.serviceRequest.findUniqueOrThrow({ where: { id }, include: withDetails }));
    });
  }

  async onModuleDestroy() { await this.prisma.$disconnect(); }
}
