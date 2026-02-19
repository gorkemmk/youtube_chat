CREATE DATABASE IF NOT EXISTS strevio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE strevio;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') DEFAULT 'user',
  plan ENUM('free', 'pro', 'business') DEFAULT 'free',
  plan_expires_at DATETIME NULL,
  overlay_token VARCHAR(100) NOT NULL UNIQUE,
  youtube_channel VARCHAR(255) NULL,
  youtube_video_id VARCHAR(100) NULL,
  auto_watch TINYINT(1) DEFAULT 1,
  is_active TINYINT(1) DEFAULT 1,
  is_banned TINYINT(1) DEFAULT 0,
  last_login_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_overlay_token (overlay_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  video_id VARCHAR(100) NOT NULL,
  status ENUM('active', 'ended', 'error') DEFAULT 'active',
  total_messages INT DEFAULT 0,
  super_chats INT DEFAULT 0,
  memberships INT DEFAULT 0,
  error_message TEXT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_status (status),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS overlay_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  theme VARCHAR(50) DEFAULT 'default',
  font_size INT DEFAULT 14,
  max_messages INT DEFAULT 50,
  fade_time INT DEFAULT 60,
  show_avatars TINYINT(1) DEFAULT 1,
  show_badges TINYINT(1) DEFAULT 1,
  show_timestamps TINYINT(1) DEFAULT 0,
  bg_opacity FLOAT DEFAULT 0.55,
  animation VARCHAR(50) DEFAULT 'slide',
  custom_css TEXT NULL,
  position VARCHAR(50) DEFAULT 'bottom-left',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_overlay_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_read TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user (user_id),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(100) NOT NULL,
  details TEXT NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activity_user (user_id),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
