-- CreateEnum
CREATE TYPE "TruckClass" AS ENUM ('STRAIGHT', 'SEMI', 'FLATBED', 'REEFER', 'TANKER', 'LOWBOY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "homeState" TEXT,
    "truckClass" "TruckClass" NOT NULL DEFAULT 'SEMI',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteQuery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION,
    "originLng" DOUBLE PRECISION,
    "destLat" DOUBLE PRECISION,
    "destLng" DOUBLE PRECISION,
    "mileage" DOUBLE PRECISION,
    "etaMinutes" INTEGER,
    "fuelEstimate" DOUBLE PRECISION,
    "tollCost" DOUBLE PRECISION,
    "apiUsed" TEXT,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "RouteQuery_userId_createdAt_idx" ON "RouteQuery"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiCache_cacheKey_key" ON "ApiCache"("cacheKey");

-- CreateIndex
CREATE INDEX "ApiCache_cacheKey_expiresAt_idx" ON "ApiCache"("cacheKey", "expiresAt");

-- AddForeignKey
ALTER TABLE "RouteQuery" ADD CONSTRAINT "RouteQuery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
