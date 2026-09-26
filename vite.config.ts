import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Set BASE=/repo-name/ when deploying to GitHub Pages.
export default defineConfig({ base: process.env.BASE ?? "/", plugins: [react()] });
