export enum RaidLocation {
  Location1,
}

export const getAvailableRaidLocations = async (userId: string): Promise<RaidLocation[]> => {
  return [RaidLocation.Location1];
};
