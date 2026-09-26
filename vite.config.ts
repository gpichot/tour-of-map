import { defineConfig } from "vite";
// Set BASE=/repo-name/ when deploying to GitHub Pages.
export default defineConfig({ base: process.env.BASE ?? "/" });
