import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
	plugins: [tailwindcss(), svelte()],
	resolve: {
		alias: {
			'$lib': path.resolve(__dirname, './src/lib')
		}
	},
	// 使用相对路径，支持灵活部署到任意目录
	base: './',
	// 开发服务器配置
	server: {
		port: 4000,
		host: true
	},
	// 预览服务器配置
	preview: {
		port: 4000,
		host: true
	}
});
