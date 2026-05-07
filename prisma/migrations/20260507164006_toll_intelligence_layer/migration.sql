-- CreateTable
CREATE TABLE "TollAuthority" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "highways" TEXT[],
    "rateScheduleUrl" TEXT NOT NULL,
    "transponders" TEXT[],
    "prepassAccepted" BOOLEAN NOT NULL DEFAULT false,
    "tollFree" BOOLEAN NOT NULL DEFAULT false,
    "lastScrapedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TollAuthority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TollSegment" (
    "id" TEXT NOT NULL,
    "authorityId" TEXT NOT NULL,
    "highway" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "entryMileMarker" DOUBLE PRECISION,
    "exitMileMarker" DOUBLE PRECISION,
    "entryPointName" TEXT NOT NULL,
    "exitPointName" TEXT NOT NULL,
    "entryLat" DOUBLE PRECISION,
    "entryLng" DOUBLE PRECISION,
    "exitLat" DOUBLE PRECISION,
    "exitLng" DOUBLE PRECISION,
    "prepassBypass" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TollSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TollRate" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "vehicleClass" TEXT NOT NULL,
    "axleCount" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "rateCents" INTEGER NOT NULL,
    "ratePerMileCents" INTEGER,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TollRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TollQueryCache" (
    "id" TEXT NOT NULL,
    "routeKey" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "confidence" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TollQueryCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TollAuthority_state_idx" ON "TollAuthority"("state");

-- CreateIndex
CREATE INDEX "TollSegment_highway_direction_idx" ON "TollSegment"("highway", "direction");

-- CreateIndex
CREATE INDEX "TollSegment_authorityId_idx" ON "TollSegment"("authorityId");

-- CreateIndex
CREATE UNIQUE INDEX "TollSegment_authorityId_highway_direction_entryPointName_ex_key" ON "TollSegment"("authorityId", "highway", "direction", "entryPointName", "exitPointName");

-- CreateIndex
CREATE INDEX "TollRate_segmentId_vehicleClass_paymentMethod_idx" ON "TollRate"("segmentId", "vehicleClass", "paymentMethod");

-- CreateIndex
CREATE UNIQUE INDEX "TollRate_segmentId_vehicleClass_paymentMethod_effectiveDate_key" ON "TollRate"("segmentId", "vehicleClass", "paymentMethod", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "TollQueryCache_routeKey_key" ON "TollQueryCache"("routeKey");

-- CreateIndex
CREATE INDEX "TollQueryCache_routeKey_expiresAt_idx" ON "TollQueryCache"("routeKey", "expiresAt");

-- AddForeignKey
ALTER TABLE "TollSegment" ADD CONSTRAINT "TollSegment_authorityId_fkey" FOREIGN KEY ("authorityId") REFERENCES "TollAuthority"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TollRate" ADD CONSTRAINT "TollRate_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "TollSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
