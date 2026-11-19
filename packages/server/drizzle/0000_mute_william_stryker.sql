CREATE TABLE `agents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`emoji` text DEFAULT '🤖' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`group_id` integer,
	`project_ids` text DEFAULT '[]' NOT NULL,
	`engine` text DEFAULT 'claude-code' NOT NULL,
	`model` text DEFAULT 'sonnet' NOT NULL,
	`draft` text DEFAULT '' NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`guardrails` text DEFAULT '{"can":[],"approval":[],"never":[]}' NOT NULL,
	`tools` text DEFAULT '[]' NOT NULL,
	`extras` text DEFAULT '{}' NOT NULL,
	`why` text DEFAULT '{}' NOT NULL,
	`weekly_capacity` integer DEFAULT 40 NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `conflict_marks` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`type` text DEFAULT '' NOT NULL,
	`user_name` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '#b6ff3b' NOT NULL,
	`emoji` text DEFAULT '🧩' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `mcps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`transport` text DEFAULT 'stdio' NOT NULL,
	`command` text DEFAULT '' NOT NULL,
	`args` text DEFAULT '[]' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`env` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_test_at` text,
	`last_test_ok` integer,
	`last_test_message` text DEFAULT '' NOT NULL,
	`discovered` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `monitors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'zabbix' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`token` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`use_for_capacity` integer DEFAULT true NOT NULL,
	`hosts` text DEFAULT '[]' NOT NULL,
	`usage_host` text DEFAULT '' NOT NULL,
	`usage_keys` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`engine` text DEFAULT 'claude-code' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer NOT NULL,
	`version` integer NOT NULL,
	`action` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`snapshot` text NOT NULL,
	`changed` text DEFAULT '[]' NOT NULL,
	`user_id` integer,
	`user_name` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rev_entity` ON `revisions` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `rev_created` ON `revisions` (`created_at`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`agent_id` integer,
	`project_id` integer,
	`prompt` text DEFAULT '' NOT NULL,
	`cron` text DEFAULT '0 9 * * 1-5' NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`required_tools` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`report` text,
	`next_run_at` text,
	`last_run_at` text,
	`last_status` text,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'Regras gerais' NOT NULL,
	`project_id` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text DEFAULT 'routine' NOT NULL,
	`routine_id` integer,
	`agent_id` integer,
	`project_id` integer,
	`title` text DEFAULT '' NOT NULL,
	`trigger` text DEFAULT 'schedule' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`scheduled_for` text,
	`started_at` text,
	`finished_at` text,
	`duration_ms` integer,
	`engine` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`output` text DEFAULT '' NOT NULL,
	`log` text DEFAULT '' NOT NULL,
	`tokens_in` integer,
	`tokens_out` integer,
	`cost_usd` text,
	`ref` text,
	`created_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `runs_created` ON `runs` (`created_at`);--> statement-breakpoint
CREATE INDEX `runs_routine` ON `runs` (`routine_id`);--> statement-breakpoint
CREATE INDEX `runs_ref` ON `runs` (`ref`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `tools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`risk` text DEFAULT 'medium' NOT NULL,
	`category` text DEFAULT 'Geral' NOT NULL,
	`capabilities` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'custom' NOT NULL,
	`mcp_id` integer,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`password_hash` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL,
	`deleted_at` text
);
