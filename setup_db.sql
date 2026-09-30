-- ============================================
-- family_system Database Setup Script
-- For XAMPP MySQL
-- ============================================

CREATE DATABASE IF NOT EXISTS `family_system`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `family_system`;

-- Table: users
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(100) NOT NULL,
  `name` VARCHAR(100) DEFAULT NULL,
  `budget` DECIMAL(10,2) DEFAULT 4000.00,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: transactions
CREATE TABLE IF NOT EXISTS `transactions` (
  `id` VARCHAR(100) NOT NULL,
  `date` DATETIME DEFAULT NULL,
  `amount` DECIMAL(10,2) DEFAULT NULL,
  `category` VARCHAR(100) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `user_id` VARCHAR(100) DEFAULT NULL,
  `type` VARCHAR(20) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: fixed_transactions
CREATE TABLE IF NOT EXISTS `fixed_transactions` (
  `id` VARCHAR(100) NOT NULL,
  `amount` DECIMAL(10,2) DEFAULT NULL,
  `category` VARCHAR(100) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `user_id` VARCHAR(100) DEFAULT NULL,
  `type` VARCHAR(20) DEFAULT NULL,
  `recurring_day` INT DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: stock
CREATE TABLE IF NOT EXISTS `stock` (
  `id` VARCHAR(100) NOT NULL,
  `name` VARCHAR(100) DEFAULT NULL,
  `quantity` DECIMAL(10,2) DEFAULT NULL,
  `unit` VARCHAR(50) DEFAULT NULL,
  `threshold` DECIMAL(10,2) DEFAULT NULL,
  `user_id` VARCHAR(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: reminders
CREATE TABLE IF NOT EXISTS `reminders` (
  `id` VARCHAR(100) NOT NULL,
  `date` DATE DEFAULT NULL,
  `message` TEXT DEFAULT NULL,
  `user_id` VARCHAR(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Sample Data (from data.json)
-- ============================================

INSERT IGNORE INTO `users` (`id`, `name`) VALUES
  ('USER_ID_1', 'User 1'),
  ('USER_ID_2', 'User 2');

INSERT IGNORE INTO `transactions` (`id`, `date`, `amount`, `category`, `description`, `user_id`, `type`) VALUES
  ('a5123edf-a2f7-44bf-90cb-7eff9bb207b3', '2026-09-26 13:13:55', 595.00, 'ค่าเน็ต+หนัง', 'ค่าเน็ต+หนัง', 'เก่ง', 'expense');

-- ============================================
-- Verify Tables Created
-- ============================================
SHOW TABLES;
