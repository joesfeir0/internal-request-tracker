PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ServiceRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requesterId" TEXT NOT NULL,
  "handlerId" TEXT,
  "department" TEXT NOT NULL DEFAULT 'IT',
  "description" TEXT NOT NULL DEFAULT '',
  "summary" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'NEW'
);
INSERT INTO "new_ServiceRequest" ("id","requesterId","handlerId","department","description","summary","createdAt","status")
SELECT "id","requesterId","handlerId", CASE "handlerId" WHEN 'handler-002' THEN 'HR' WHEN 'handler-003' THEN 'FINANCE' ELSE 'IT' END,
'', '', CURRENT_TIMESTAMP,"status" FROM "ServiceRequest";
DROP TABLE "ServiceRequest";
ALTER TABLE "new_ServiceRequest" RENAME TO "ServiceRequest";
CREATE INDEX "ServiceRequest_department_status_idx" ON "ServiceRequest"("department", "status");
CREATE TABLE "RequestComment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestComment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "RequestComment_requestId_createdAt_idx" ON "RequestComment"("requestId", "createdAt");
PRAGMA foreign_keys=ON;
