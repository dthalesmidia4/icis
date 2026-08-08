import { it } from "vitest";
import { resolveFeedKind } from "./instagramFeed";
it("dbg", () => {
  console.log(JSON.stringify([resolveFeedKind({typeKey:null,typeLabel:"Stories"}), resolveFeedKind({typeKey:null,typeLabel:"Vídeo Reels"})]));
});
