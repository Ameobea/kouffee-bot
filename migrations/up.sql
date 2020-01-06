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

CREATE TABLE `custom_commands` (
  `user_id` BIGINT NOT NULL,
  `command` VARCHAR(191) NOT NULL,
  `response` TEXT NOT NULL
) ENGINE = InnoDB;
ALTER TABLE `custom_commands` ADD UNIQUE(`command`);
ALTER TABLE `custom_commands` ADD INDEX(`command`);
