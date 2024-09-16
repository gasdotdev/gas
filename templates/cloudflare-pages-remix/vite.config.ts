import { cloudflareRemixDevPlugin } from "@gasdotdev/vite-plugin-cloudflare-remix-dev";
import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [
		cloudflareRemixDevPlugin(
			Number(process.env.GAS_DEV_SERVER_PORT),
			Number(process.env.VITE_SERVER_PORT),
		),
		remix({
			appDirectory: "src/app",
			future: {
				v3_fetcherPersist: true,
				v3_relativeSplatPath: true,
				v3_throwAbortReason: true,
			},
		}),
		tsconfigPaths(),
	],
	server: {
		port: Number(process.env.VITE_SERVER_PORT),
	},
});
