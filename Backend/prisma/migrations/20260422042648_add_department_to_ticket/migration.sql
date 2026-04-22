-- AlterTable
ALTER TABLE "AffectedSystem" ADD COLUMN     "department_id" INTEGER;

-- AlterTable
ALTER TABLE "RequestType" ADD COLUMN     "department_id" INTEGER;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "department_id" INTEGER;

-- AddForeignKey
ALTER TABLE "AffectedSystem" ADD CONSTRAINT "AffectedSystem_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestType" ADD CONSTRAINT "RequestType_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
