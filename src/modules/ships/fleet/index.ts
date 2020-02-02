import { ShipProductionCostGetters } from '../economy/curves/productionUpgrades';

export type BuildableShip = 'ship1' | 'ship2' | 'ship3';

export interface Fleet {
  ship1: number;
  ship2: number;
  ship3: number;
  ship4: number;
  shipSpecial1: number;
}

export enum FleetJobType {
  BuildShip,
}

interface FleetJobBase {
  startTime: Date;
  endTime: Date;
}

export type FleetJob = {
  jobType: FleetJobType.BuildShip;
  shipType: BuildableShip;
  shipCount: number;
} & FleetJobBase;

export const buildDefaultFleet = (): Fleet => ({
  ship1: 0,
  ship2: 0,
  ship3: 0,
  ship4: 0,
  shipSpecial1: 0,
});

/**
 * Given the last checkpointed fleet state and the list of fleet jobs that were finished (or will finish) after the last
 * checkpoint time, computes the current state of the fleet.
 */
export const computeLiveFleet = (
  now: Date,
  fleet: Fleet & { checkpointTime: Date },
  applicableFleetJobs: FleetJob[]
): Fleet => {
  const liveFleet = { ...fleet };

  const nowTime = now.getTime();

  // First we handle any fleet jobs that are fully finished
  const fullyFinishedFleetJobs = applicableFleetJobs.filter(
    job => job.endTime.getTime() <= nowTime
  );
  fullyFinishedFleetJobs.forEach(job => {
    liveFleet[job.shipType] += job.shipCount;
  });

  // Then, we handle any fleet jobs that are partially finished.
  const partiallyFinishedFleetJobs = applicableFleetJobs.filter(
    job => job.startTime.getTime() < nowTime && job.endTime.getTime() > nowTime
  );
  partiallyFinishedFleetJobs.forEach(job => {
    const timePerShipMs = ShipProductionCostGetters[job.shipType].timeMs;
    const taskTimeProgressedMs = nowTime - job.startTime.getTime();
    const shipsFinished = Math.trunc(taskTimeProgressedMs / timePerShipMs);
    liveFleet[job.shipType] += shipsFinished;
  });

  return liveFleet;
};
