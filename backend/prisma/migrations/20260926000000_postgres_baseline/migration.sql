-- Fresh PostgreSQL baseline. The earlier SQLite migrations are in Git history.

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "handlerId" TEXT,
    "department" TEXT NOT NULL DEFAULT 'IT',
    "description" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "RequestStatus" NOT NULL DEFAULT 'NEW',

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusEvent" (
    "sequence" SERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusEvent_pkey" PRIMARY KEY ("sequence")
);

-- CreateTable
CREATE TABLE "RequestComment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceRequest_department_status_idx" ON "ServiceRequest"("department", "status");

-- CreateIndex
CREATE INDEX "ServiceRequest_requesterId_idx" ON "ServiceRequest"("requesterId");

-- CreateIndex
CREATE UNIQUE INDEX "StatusEvent_id_key" ON "StatusEvent"("id");

-- CreateIndex
CREATE INDEX "StatusEvent_requestId_sequence_idx" ON "StatusEvent"("requestId", "sequence");

-- CreateIndex
CREATE INDEX "RequestComment_requestId_createdAt_idx" ON "RequestComment"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "StatusEvent" ADD CONSTRAINT "StatusEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestComment" ADD CONSTRAINT "RequestComment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Short ticket numbers: REQ-1006, REQ-1007, ... (REQ-1001 to REQ-1005 are demo seeds).
-- The database hands out each number once, so concurrent submissions never collide.
CREATE SEQUENCE "request_number_seq" START WITH 1006;
