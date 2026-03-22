/**
 * Community Analytics CLI Commands
 * 
 * Commands for managing community data sharing with ERC-8004 trust verification.
 */

import { Command } from "commander";
import { getCommunityAnalytics, CommunityAnalyticsService } from "../../llm/community-analytics";
import { getERC8004Bridge, scoreToLevel, levelWeight, TrustLevel } from "../../llm/erc8004-community-bridge";

export function createCommunityCommand(): Command {
  const community = new Command("community")
    .description("Manage community analytics and ERC-8004 trust verification")
    .showHelpAfterError();

  // community enable
  community
    .command("enable")
    .description("Enable anonymous stats sharing with the community")
    .option("--erc8004", "Enable ERC-8004 cryptoeconomic verification")
    .option("--min-trust <level>", "Minimum trust level: none, bronze, silver, gold, platinum", "bronze")
    .option("--chain <network>", "Blockchain: base or sepolia", "sepolia")
    .action(async (opts) => {
      const service = getCommunityAnalytics();
      service.enable();
      
      if (opts.erc8004) {
        service.setErc8004Enabled(true);
        service.setErc8004MinTrust(opts.minTrust as TrustLevel);
        service.setErc8004Chain(opts.chain as 'base' | 'sepolia');
        console.log(`✓ ERC-8004 enabled with minimum trust: ${opts.minTrust}`);
      }
      
      console.log("✓ Community analytics enabled");
      console.log("  Your model stats will be shared anonymously via Nostr");
      console.log("  No prompts, responses, or personal data is ever shared");
    });

  // community disable
  community
    .command("disable")
    .description("Disable community stats sharing")
    .action(() => {
      const service = getCommunityAnalytics();
      service.disable();
      console.log("✓ Community analytics disabled");
    });

  // community status
  community
    .command("status")
    .description("Show community sharing status and trust level")
    .action(() => {
      const service = getCommunityAnalytics();
      const isEnabled = service.isEnabled();
      
      console.log("\n=== Community Analytics Status ===\n");
      console.log(`Enabled: ${isEnabled ? "✓ Yes" : "✗ No"}`);
      
      if (isEnabled) {
        const config = (service as any).config;
        if (config) {
          console.log(`\nERC-8004 Verification: ${config.erc8004Enabled ? "✓ Enabled" : "✗ Disabled"}`);
          if (config.erc8004Enabled) {
            console.log(`Minimum Trust Level: ${config.erc8004MinTrust || 'bronze'}`);
            console.log(`Blockchain: ${config.erc8004Chain || 'sepolia'}`);
          }
        }
        
        // Show trust stats if ERC-8004 is enabled
        if (config?.erc8004Enabled) {
          const bridge = getERC8004Bridge(config.erc8004Chain || 'sepolia');
          const myTrust = bridge.getMyTrust();
          
          console.log("\n--- Your Trust Status ---\n");
          if (myTrust) {
            const level = scoreToLevel(myTrust.erc8004Score);
            const weight = levelWeight(level);
            console.log(`ERC-8004 Score: ${myTrust.erc8004Score}`);
            console.log(`Trust Level: ${level}`);
            console.log(`Community Weight: ${(weight * 100).toFixed(1)}%`);
            console.log(`Verified: ${myTrust.verified ? "✓ Yes" : "✗ No"}`);
          } else {
            console.log("No ERC-8004 identity linked");
            console.log("Run 'community link-eth <address>' to link your identity");
          }
        }
        
        // Show local stats
        const localStats = service.collectLocalStats();
        console.log(`\nLocal Models Tracked: ${localStats.length}`);
        
        if (localStats.length > 0) {
          console.log("\nTop Models by Rating:");
          localStats
            .sort((a, b) => b.avgRating - a.avgRating)
            .slice(0, 5)
            .forEach((s, i) => {
              console.log(`  ${i + 1}. ${s.modelName}: ${s.avgRating.toFixed(1)}★ (${s.usageCount} uses)`);
            });
        }
      }
      
      console.log("\nPrivacy: No prompts or responses are ever shared\n");
    });

  // community sync
  community
    .command("sync")
    .description("Sync community data from Nostr relays")
    .option("--nostr", "Fetch from Nostr (default)")
    .option("--github", "Fetch from GitHub endpoint")
    .action(async (opts) => {
      console.log("Syncing community data...\n");
      
      const service = getCommunityAnalytics();
      
      if (opts.nostr || (!opts.nostr && !opts.github)) {
        console.log("Fetching from Nostr relays...");
        const nostrData = await service.fetchFromNostr();
        
        if (nostrData) {
          console.log(`✓ Fetched data for ${nostrData.models.length} models`);
          console.log(`  Total contributors: ${nostrData.totalContributors}`);
        } else {
          console.log("✗ Failed to fetch from Nostr");
        }
      }
      
      if (opts.github) {
        console.log("\nFetching from GitHub endpoint...");
        const githubData = await service.fetchCommunityStats();
        
        if (githubData) {
          console.log(`✓ Fetched data for ${githubData.models.length} models`);
        } else {
          console.log("✗ Failed to fetch from GitHub");
        }
      }
      
      // Show merged tier list
      console.log("\n=== Community Tier List ===\n");
      const tiers = service.getCommunityTierList();
      
      for (const tier of tiers) {
        if (tier.models.length > 0) {
          console.log(`[${tier.tier} Tier]`);
          tier.models.slice(0, 5).forEach((m, i) => {
            console.log(`  ${i + 1}. ${m.modelName}: ${m.avgRating.toFixed(1)}★ (${Math.round(m.usageCount)} uses)`);
          });
          console.log("");
        }
      }
    });

  // community publish
  community
    .command("publish")
    .description("Publish your stats to Nostr (only if enabled)")
    .action(async () => {
      const service = getCommunityAnalytics();
      
      if (!service.isEnabled()) {
        console.log("✗ Community sharing is not enabled");
        console.log("  Run 'community enable' first");
        return;
      }
      
      console.log("Publishing stats to Nostr...\n");
      
      const result = await service.publishToNostr();
      
      if (result.success) {
        console.log("✓ Successfully published to Nostr");
        console.log(`  Event ID: ${result.eventId}`);
      } else {
        console.log(`✗ Failed to publish: ${result.error}`);
      }
    });

  // community link-eth
  community
    .command("link-eth <address>")
    .description("Link your Nostr identity to an Ethereum address for ERC-8004 trust")
    .option("--signature <sig>", "Signature proving ownership of the address")
    .action(async (address, opts) => {
      // Validate address
      if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
        console.log("✗ Invalid Ethereum address format");
        console.log("  Expected: 0x followed by 40 hex characters");
        return;
      }
      
      console.log(`Linking Nostr identity to ${address}...\n`);
      
      const bridge = getERC8004Bridge();
      const service = getCommunityAnalytics();
      const keypair = service.getNostrKeypair();
      
      // Link the identity
      const linked = await bridge.linkIdentity(keypair.pubkey, address, opts.signature || 'unsigned');
      
      if (linked) {
        console.log("✓ Identity linked successfully");
        console.log(`  Nostr Pubkey: ${keypair.pubkey.slice(0, 16)}...`);
        console.log(`  Ethereum: ${address.slice(0, 10)}...`);
        
        // Show trust info
        const trust = bridge.getTrustInfo(keypair.pubkey);
        if (trust) {
          const level = scoreToLevel(trust.erc8004Score);
          console.log(`\nTrust Level: ${level}`);
          console.log(`ERC-8004 Score: ${trust.erc8004Score}`);
        }
        
        console.log("\nNote: Your Ethereum address is stored locally only.");
        console.log("      Only your trust level (none/bronze/silver/gold/platinum) is published to Nostr.");
      } else {
        console.log("✗ Failed to link identity");
      }
    });

  // community trust-stats
  community
    .command("trust-stats")
    .description("Show trust statistics for verified community members")
    .action(() => {
      const bridge = getERC8004Bridge();
      const stats = bridge.getTrustStats();
      
      console.log("\n=== Community Trust Statistics ===\n");
      console.log(`Total Contributors Tracked: ${stats.total}`);
      console.log(`Average Weight: ${(stats.avgWeight * 100).toFixed(2)}%\n`);
      
      console.log("By Trust Level:");
      console.log(`  Platinum: ${stats.byLevel.platinum}`);
      console.log(`  Gold:     ${stats.byLevel.gold}`);
      console.log(`  Silver:   ${stats.byLevel.silver}`);
      console.log(`  Bronze:   ${stats.byLevel.bronze}`);
      console.log(`  None:     ${stats.byLevel.none}`);
      
      console.log("\nTrust Thresholds:");
      console.log("  Bronze:  1-39 reputation score");
      console.log("  Silver: 40-69 reputation score");
      console.log("  Gold:   70-89 reputation score");
      console.log("  Platinum: 90+ reputation score");
      
      console.log("\nWeights:");
      console.log("  Platinum: 35% max influence");
      console.log("  Gold:     25%");
      console.log("  Silver:   15%");
      console.log("  Bronze:   8%");
      console.log("  None:     3%\n");
    });

  // community export
  community
    .command("export")
    .description("Export your stats for manual sharing")
    .action(() => {
      const service = getCommunityAnalytics();
      const outputPath = service.saveSubmissionLocally();
      console.log(`✓ Stats exported to: ${outputPath}`);
    });

  // community merge
  community
    .command("merge")
    .description("Show merged community + local stats")
    .action(() => {
      const service = getCommunityAnalytics();
      const merged = service.mergeWithLocal();
      
      console.log("\n=== Merged Community Stats ===\n");
      console.log(`Models with merged data: ${merged.size}\n`);
      
      const models = Array.from(merged.values())
        .sort((a, b) => b.avgRating - a.avgRating);
      
      console.log("Top 10 Models:");
      models.slice(0, 10).forEach((m, i) => {
        const trustBadge = (m.trustScore || 0) >= 70 ? "✓" : (m.trustScore || 0) >= 40 ? "~" : "?";
        console.log(`  ${i + 1}. [${trustBadge}] ${m.modelName}: ${m.avgRating.toFixed(1)}★`);
        console.log(`      Uses: ${Math.round(m.usageCount)}, Contributors: ${m.contributorCount}`);
      });
      
      console.log("\nLegend: ✓ High trust  ~ Medium trust  ? Low/mixed trust\n");
    });

  return community;
}
