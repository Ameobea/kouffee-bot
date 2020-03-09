CREATE TABLE `economy_balances` (
  `user_id` BIGINT NOT NULL,
  `balance` BIGINT NOT NULL
) ENGINE = InnoDB;
ALTER TABLE `economy_balances` ADD UNIQUE(`user_id`);
ALTER TABLE `economy_balances` ADD PRIMARY KEY(`user_id`);

CREATE TABLE `economy_dailies` (
  `user_id` BIGINT NOT NULL,
  `last_claim_timestamp` TIMESTAMP NOT NULL
) ENGINE = InnoDB;
ALTER TABLE `economy_dailies` ADD UNIQUE(`user_id`);
ALTER TABLE `economy_dailies` ADD PRIMARY KEY(`user_id`);

CREATE TABLE `ships_fleets` (
  `userId` BIGINT NOT NULL,
  `checkpointTime` TIMESTAMP NOT NULL,
  `ship1` BIGINT NOT NULL,
  `ship2` BIGINT NOT NULL,
  `ship3` BIGINT NOT NULL,
  `ship4` BIGINT NOT NULL,
  `shipSpecial1` BIGINT NOT NULL
) ENGINE = InnoDB;
ALTER TABLE `ships_fleets` ADD UNIQUE(`userId`);

CREATE TABLE `ships_fleets-jobs` (
  `userId` BIGINT NOT NULL,
  `jobType` VARCHAR(191) NOT NULL,
  `startTime` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `endTime` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `shipType` VARCHAR(191) NOT NULL,
  `shipCount` BIGINT NOT NULL
) ENGINE = InnoDB;
ALTER TABLE `ships_fleets-jobs` ADD INDEX(`endTime` DESC);

CREATE TABLE `ships_production` (
  `userId` BIGINT NOT NULL,
  `checkpointTime` TIMESTAMP NOT NULL,
  `tier1Prod` BIGINT NOT NULL,
  `tier2Prod` BIGINT NOT NULL,
  `tier3Prod` BIGINT NOT NULL,
  `tier1Bal` BIGINT NOT NULL,
  `tier2Bal` BIGINT NOT NULL,
  `tier3Bal` BIGINT NOT NULL,
  `special1Bal` BIGINT NOT NULL
) ENGINE = InnoDB;
ALTER TABLE `ships_production` ADD UNIQUE(`userId`);

CREATE TABLE `ships_production-jobs` (
  `userId` BIGINT NOT NULL,
  `jobType` VARCHAR(191) NOT NULL,
  `startTime` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `endTime` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `productionType` VARCHAR(191) NOT NULL
) ENGINE = InnoDB;
ALTER TABLE `ships_production-jobs` ADD INDEX(`endTime` DESC);

CREATE TABLE `ships_notifications` (
  `userId` BIGINT NOT NULL,
  `notificationType` VARCHAR(191) NOT NULL,
  `guildId` BIGINT NOT NULL,
  `channelId` BIGINT NOT NULL,
  `notificationPayload` TEXT NOT NULL,
  `reminderTime` TIMESTAMP NOT NULL
) ENGINE = InnoDB;
ALTER TABLE `ships_notifications` ADD INDEX(`reminderTime` DESC);

CREATE TABLE `ships_inventory` (
  `userId` BIGINT NOT NULL,
  `itemId` INT NOT NULL,
  `count` BIGINT NOT NULL,
  `metadataKey` BIGINT NULL,
  `tier` TINYINT NULL
) ENGINE = InnoDB;
ALTER TABLE `ships_inventory` ADD INDEX(`userId` DESC);
ALTER TABLE `ships_inventory` ADD INDEX(`metadataKey` ASC);

CREATE TABLE `ships_inventory-checkpointTime` (
  `userId` BIGINT NOT NULL,
  `checkpointTime` TIMESTAMP NOT NULL,
  PRIMARY KEY (`userId`)
) ENGINE = InnoDB;

CREATE TABLE `ships_inventory-metadata` (
  `id` BIGINT NOT NULL,
  `data` TEXT NOT NULL,
  FOREIGN KEY (id)
    REFERENCES ships_inventory(metadataKey)
    ON DELETE CASCADE
) ENGINE = InnoDB;
ALTER TABLE `ships_inventory-metadata` ADD PRIMARY KEY(`id`);

CREATE TABLE `ships_raids` (
  `userId` BIGINT NOT NULL,
  `durationTier` TINYINT NOT NULL,
  `location` TINYINT NOT NULL,
  `departureTime` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `returnTime` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ship1` BIGINT NOT NULL,
  `ship2` BIGINT NOT NULL,
  `ship3` BIGINT NOT NULL,
  `ship4` BIGINT NOT NULL,
  `shipSpecial1` BIGINT NOT NULL,
  INDEX(`userId` DESC)
) ENGINE = InnoDB;

CREATE TABLE `ships_userLocks` (
  `userId` BIGINT NOT NULL,
  PRIMARY KEY (`userId`)
) ENGINE = InnoDB;

CREATE TABLE `ships_fleet-transactions` (
  `userId` BIGINT NOT NULL,
  `applicationTime` TIMESTAMP NOT NULL,
  `ship1` BIGINT NOT NULL,
  `ship2` BIGINT NOT NULL,
  `ship3` BIGINT NOT NULL,
  `ship4` BIGINT NOT NULL,
  `shipSpecial1` BIGINT NOT NULL,
  INDEX(`userId` DESC)
) ENGINE = InnoDB;

CREATE TABLE `ships_inventory-transactions` (
  `userId` BIGINT NOT NULL,
  `applicationTime` TIMESTAMP NOT NULL,
  `itemId` INT NOT NULL,
  `count` BIGINT NOT NULL,
  `metadataKey` BIGINT NULL,
  `tier` TINYINT NULL,
  INDEX(`userId` DESC)
) ENGINE = InnoDB;

CREATE TABLE `custom_commands` (
  `user_id` BIGINT NOT NULL,
  `command` VARCHAR(191) NOT NULL,
  `response` TEXT NOT NULL
) ENGINE = InnoDB;
ALTER TABLE `custom_commands` ADD UNIQUE(`command`);
ALTER TABLE `custom_commands` ADD INDEX(`command`);

CREATE TABLE `liked_tweets` (
  `tweet_id` BIGINT NOT NULL
) ENGINE = InnoDB;
