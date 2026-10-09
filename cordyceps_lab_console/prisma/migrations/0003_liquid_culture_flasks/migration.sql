CREATE TABLE "CultureFlask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flaskCode" TEXT NOT NULL,
    "capacityMl" INTEGER NOT NULL DEFAULT 500,
    "strain" TEXT NOT NULL DEFAULT 'Cordyceps militaris',
    "sourceCulture" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Not recorded',
    "preparedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "CultureFlask_flaskCode_key" ON "CultureFlask"("flaskCode");

CREATE TABLE "CultureFlaskLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flaskId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CultureFlaskLog_flaskId_fkey" FOREIGN KEY ("flaskId") REFERENCES "CultureFlask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CultureFlaskLog_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ActivityLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CultureFlaskLog_activityId_key" ON "CultureFlaskLog"("activityId");
CREATE INDEX "CultureFlaskLog_flaskId_idx" ON "CultureFlaskLog"("flaskId");

WITH RECURSIVE flask_numbers(value) AS (
    SELECT 1
    UNION ALL SELECT value + 1 FROM flask_numbers WHERE value < 46
)
INSERT INTO "CultureFlask" ("id", "flaskCode", "capacityMl", "strain", "status", "createdAt", "updatedAt")
SELECT
    'culture-flask-' || printf('%03d', value),
    'LC-' || printf('%03d', value),
    500,
    'Cordyceps militaris',
    'Not recorded',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM flask_numbers;