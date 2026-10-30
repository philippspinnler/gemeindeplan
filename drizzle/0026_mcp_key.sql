ALTER TABLE `users` ADD `mcp_key_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `mcp_key_used_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_mcp_key_hash_unique` ON `users` (`mcp_key_hash`);