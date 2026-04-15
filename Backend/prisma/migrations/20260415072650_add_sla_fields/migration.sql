-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ticket" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "escalated_to_approval" BOOLEAN NOT NULL DEFAULT false,
    "escalated_at" DATETIME,
    "escalated_by_id" INTEGER,
    "started_at" DATETIME,
    "completed_at" DATETIME,
    "due_date" DATETIME,
    "sla_breached" BOOLEAN NOT NULL DEFAULT false,
    "breached_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "requester_id" INTEGER NOT NULL,
    "assignee_id" INTEGER,
    "request_type_id" INTEGER,
    "affected_system_id" INTEGER,
    CONSTRAINT "Ticket_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_request_type_id_fkey" FOREIGN KEY ("request_type_id") REFERENCES "RequestType" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_affected_system_id_fkey" FOREIGN KEY ("affected_system_id") REFERENCES "AffectedSystem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("affected_system_id", "assignee_id", "completed_at", "created_at", "description", "escalated_at", "escalated_by_id", "escalated_to_approval", "id", "priority", "reopen_count", "request_type_id", "requester_id", "requires_approval", "started_at", "status", "title", "updated_at") SELECT "affected_system_id", "assignee_id", "completed_at", "created_at", "description", "escalated_at", "escalated_by_id", "escalated_to_approval", "id", "priority", "reopen_count", "request_type_id", "requester_id", "requires_approval", "started_at", "status", "title", "updated_at" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
