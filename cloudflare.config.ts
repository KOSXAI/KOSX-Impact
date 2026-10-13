import { bindings, defineConfig, triggers } from "cf/config";

/**
 * Secret-like files were detected but not read or migrated: .dev.vars, .dev.vars.example, dist/server/.dev.vars. Only `secrets.required` entries are migrated.
 * @see https://developers.cloudflare.com/workers/configuration/secrets/
 */


export default defineConfig({
	accountId: "64c1e1a5d18341cba1e6cdad962ebc46",
	worker: {
		name: "kosx-impact",
		compatibilityDate: "2026-08-01",
		compatibilityFlags: [
			"nodejs_compat",
		],
		entrypoint: "src/server.ts",
		observability: {
			enabled: true,
		},
		assets: {
			runWorkerFirst: [
				"/api/*",
				"/card/*",
				"/og.svg",
				"/og/*",
				"/robots.txt",
				"/sitemap.xml",
				"/llms.txt",
				"/feed.xml",
			],
		},
		domains: [
			"impact.kosx.ai",
		],
		triggers: [
			triggers.scheduled({
				schedule: "0 * * * *",
			}),
			triggers.scheduled({
				schedule: "30 9 * * *",
			}),
			triggers.scheduled({
				schedule: "5-59/10 * * * *",
			}),
		],
		env: {
			DB: bindings.d1({
				name: "kosx-impact",
				id: "9ff1f928-b3dc-4033-b9fb-e82b6a62ed5b",
			}),
			ASSETS: bindings.assets(),
		},
		/**
		 * TODO(@cloudflare): cf migrate: The Wrangler assets directory was not migrated. Configure static assets in the Vite project.
		 * @see https://developers.cloudflare.com/workers/wrangler/configuration/
		 */
		/**
		 * TODO(@cloudflare): cf migrate: The options `migrations_dir` at `d1_databases.0` require manual migration.
		 */
	},
});
