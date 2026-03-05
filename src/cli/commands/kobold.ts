import { Command } from "commander";
import { printKoboldBanner, getRandomKoboldQuote } from "../../ascii-kobold.js";

export const koboldCommand = new Command()
  .name("kobold")
  .alias("dragon")
  .description("🐉 Summon your digital familiar")
  .option("-q, --quote", "Get a random kobold quote")
  .option("-b, --banner", "Display the full kobold banner")
  .action((options) => {
    if (options.banner) {
      printKoboldBanner();
    } else if (options.quote) {
      console.log(getRandomKoboldQuote());
    } else {
      console.log("🐉 Summoning your digital familiar...");
      console.log(getRandomKoboldQuote());
    }
  });
