import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Setup 文件在测试文件的隔离存储之外运行，可能被多次执行。
// applyD1Migrations 只会应用尚未执行过的迁移，重复运行安全。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
