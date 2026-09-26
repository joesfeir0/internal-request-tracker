import { ConflictException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
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

// Refuse to start without an explicit database rather than silently using another one.
function requiredDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is not set. Configure the PostgreSQL connection before starting the backend.');
  return url;
}

// Raw SQL does not follow Prisma's ?schema= setting, so name the sequence with its schema explicitly.
function ticketSequence(url: string): string {
  const schema = new URL(url).searchParams.get('schema') || 'public';
  if (!/^[A-Za-z0-9_]+$/.test(schema)) throw new Error('Unsupported database schema name');
  return `"${schema}"."request_number_seq"`;
}

@Injectable()
export class RequestsStore implements OnModuleDestroy {
  private readonly url = requiredDatabaseUrl();
  private readonly prisma = new PrismaClient({ datasourceUrl: this.url });
  private readonly sequence = ticketSequence(this.url);

  async findAll(actor: Actor): Promise<OwnedRequest[]> {
    const where = actor.role === 'handler' ? { department: actor.department } : { requesterId: actor.id };
    const rows = await this.prisma.serviceRequest.findMany({ where, include: withDetails, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    return rows.map(toRequest);
  }

  async findOne(id: string): Promise<OwnedRequest | null> {
    const row = await this.prisma.serviceRequest.findUnique({ where: { id }, include: withDetails });
    return row ? toRequest(row) : null;
  }

  async create(description: string, summary: string, department: ServiceRequest['department'], requesterId: string): Promise<OwnedRequest> {
    return this.prisma.$transaction(async tx => {
      // The database sequence gives each ticket a short, unique number.
      const [{ next }] = await tx.$queryRaw<{ next: bigint }[]>`SELECT nextval(${this.sequence}::regclass) AS next`;
      const row = await tx.serviceRequest.create({
        data: { id: `REQ-${next}`, requesterId, department, description, summary,
          history: { create: { status: 'NEW', changedBy: requesterId } } }, include: withDetails,
      });
      return toRequest(row);
    });
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

  async saveStatus(id: string, previous: RequestStatus, status: RequestStatus, actorId: string, note?: string): Promise<OwnedRequest> {
    // The status, its history event and any note commit together; a stale update returns 409.
    return this.prisma.$transaction(async tx => {
      const result = await tx.serviceRequest.updateMany({ where: { id, status: previous, handlerId: actorId }, data: { status } });
      if (result.count !== 1) throw new ConflictException('Request changed. Refresh and try again.');
      await tx.statusEvent.create({ data: { requestId: id, status, changedBy: actorId } });
      if (note) await tx.requestComment.create({ data: { requestId: id, authorId: actorId, message: note } });
      return toRequest(await tx.serviceRequest.findUniqueOrThrow({ where: { id }, include: withDetails }));
    });
  }

  async ping() { await this.prisma.$queryRaw`SELECT 1`; }

  async onModuleDestroy() { await this.prisma.$disconnect(); }
}
