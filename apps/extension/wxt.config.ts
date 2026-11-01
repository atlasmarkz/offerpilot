import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "OfferPilot",
    description: "校招岗位自动填表助手：填好后由你确认提交",
    permissions: ["storage", "activeTab"],
  },
});
