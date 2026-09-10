-- Initial schema for batch and jar tracking, activity history, photos, and sensor snapshots.
CREATE TABLE "Batch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchCode" TEXT NOT NULL,
  "strain" TEXT NOT NULL DEFAULT 'Cordyceps militaris',
  "dateCreated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currentStage" TEXT NOT NULL DEFAULT 'Autoclaved',
  "status" TEXT NOT NULL DEFAULT 'active',
  "currentLocation" TEXT,
  "jarCount" INTEGER NOT NULL DEFAULT 0,
  "qrToken" TEXT NOT NULL,
  "barcodeValue" TEXT NOT NULL,
  "notes" TEXT,
  "autoclaveActivityId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "Jar" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "jarCode" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sequenceNumber" INTEGER NOT NULL,
  "qrToken" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "currentLocation" TEXT,
  "currentStage" TEXT NOT NULL DEFAULT 'Autoclaved',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "movedAt" DATETIME,
  CONSTRAINT "Jar_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ActivityLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "processType" TEXT,
  "activityDateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "description" TEXT NOT NULL,
  "operator" TEXT,
  "notes" TEXT,
  "detailsJson" TEXT,
  "durationMinutes" INTEGER,
  "jarCount" INTEGER,
  "googleSyncStatus" TEXT NOT NULL DEFAULT 'pending',
  "googleSyncError" TEXT,
  "clientRequestId" TEXT,
  "batchId" TEXT,
  "jarId" TEXT,
  CONSTRAINT "ActivityLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ActivityLog_jarId_fkey" FOREIGN KEY ("jarId") REFERENCES "Jar" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "ActivityPhoto" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "activityId" TEXT NOT NULL,
  "localPath" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "batchId" TEXT,
  CONSTRAINT "ActivityPhoto_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ActivityLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActivityPhoto_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "SensorSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "activityId" TEXT NOT NULL,
  "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "roomLocation" TEXT,
  "temperatureC" REAL,
  "temperatureStatus" TEXT NOT NULL DEFAULT 'missing',
  "humidityRh" REAL,
  "humidityStatus" TEXT NOT NULL DEFAULT 'missing',
  "co2Ppm" REAL,
  "co2Status" TEXT NOT NULL DEFAULT 'missing',
  "lux" REAL,
  "luxStatus" TEXT NOT NULL DEFAULT 'missing',
  "source" TEXT NOT NULL DEFAULT 'missing',
  "batchId" TEXT,
  CONSTRAINT "SensorSnapshot_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ActivityLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SensorSnapshot_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "ContaminationEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT,
  "jarId" TEXT,
  "contaminationType" TEXT,
  "notes" TEXT,
  "lostJarCount" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContaminationEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ContaminationEvent_jarId_fkey" FOREIGN KEY ("jarId") REFERENCES "Jar" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Batch_batchCode_key" ON "Batch"("batchCode");
CREATE UNIQUE INDEX "Batch_qrToken_key" ON "Batch"("qrToken");
CREATE UNIQUE INDEX "Batch_barcodeValue_key" ON "Batch"("barcodeValue");
CREATE UNIQUE INDEX "Batch_autoclaveActivityId_key" ON "Batch"("autoclaveActivityId");
CREATE UNIQUE INDEX "Jar_jarCode_key" ON "Jar"("jarCode");
CREATE UNIQUE INDEX "Jar_qrToken_key" ON "Jar"("qrToken");
CREATE UNIQUE INDEX "Jar_batchId_sequenceNumber_key" ON "Jar"("batchId", "sequenceNumber");
CREATE UNIQUE INDEX "ActivityLog_clientRequestId_key" ON "ActivityLog"("clientRequestId");
CREATE INDEX "ActivityLog_activityDateTime_idx" ON "ActivityLog"("activityDateTime");
CREATE INDEX "ActivityLog_processType_idx" ON "ActivityLog"("processType");
