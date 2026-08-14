import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import generateFile from "vite-plugin-generate-file";
import { viteSingleFile } from "vite-plugin-singlefile";
import figmaManifest from "./figma.manifest";
import pkg from "./package.json";

export default defineConfig({
  define: {
    __PLUGIN_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    root: "./src",
    target: "esnext",
    outDir: "dist",
    minify: "esbuild",
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssMinify: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: ["./src/index.html"],
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".json"],
  },
  plugins: [
    react(),
    viteSingleFile(),
    generateFile({
      type: "json",
      output: "./manifest.json",
      data: figmaManifest,
    }),
  ],
});
