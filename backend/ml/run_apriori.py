"""
CLI Runner for Market Basket & Apriori Association Mining Engine (Module D)
Mines transaction baskets, computes Support/Confidence/Lift, and saves bundle rules.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from apriori_mining import AprioriBasketMiner

def main():
    print("=" * 65)
    print("  AURORA MARKET BASKET & APRIORI MINING ENGINE (MODULE D)")
    print("=" * 65)
    
    miner = AprioriBasketMiner()
    print("1. Extracting transaction baskets from SQLite (aurora.db)...")
    results = miner.save_artifacts()
    
    meta = results['minerMetadata']
    ds = meta['datasetSummary']
    
    print("\n" + "-" * 65)
    print("  MARKET BASKET MINING SUMMARY")
    print("-" * 65)
    print(f"  * Total Completed Orders Audited:  {ds['totalCompletedOrders']}")
    print(f"  * Multi-Item Baskets (Size > 1):   {ds['multiItemOrders']} ({ds['multiItemRatioPct']}%)")
    print(f"  * Average Basket Size:             {ds['averageBasketSize']} items/order")
    print(f"  * Unique Frequent Itemsets Mined:  {ds['uniqueFrequentPairsMined']} pairs")
    print(f"  * Directional Cross-Sell Rules:    {ds['associationRulesGenerated']} rules")
    print(f"  * Minimum Support Threshold:       {meta['parameters']['minSupportThreshold'] * 100:.1f}%")
    print(f"  * Guaranteed Bundle Margin Floor:  {meta['parameters']['minBundleGrossMarginPct']}%")
    print("-" * 65)
    
    print("\nTop 5 Frequent Co-Purchase Pairs (Support & Lift):")
    for i, cp in enumerate(results['coPurchases'][:5], 1):
        print(f"  {i}. {cp['item1'][:28]:<28} + {cp['item2'][:28]:<28} | {cp['frequency']} orders | Supp: {cp['support']}% | Conf: {cp['confidence']}% | Lift: {cp['lift']}x")
        
    print("\nTop 5 Directional Cross-Selling Rules (A -> B):")
    for i, r in enumerate(results['crossSellingRules'][:5], 1):
        print(f"  {i}. If buy: {r['source'][:25]:<25} -> Suggest: {r['recommended'][:25]:<25} | Likelihood: {r['confidencePct']}% | Lift: {r['lift']}x")

    print("\nCurated Indian Smart Bundles (Margin Guarded):")
    for i, b in enumerate(results['smartBundles'], 1):
        print(f"  {i}. {b['name'][:36]:<36} MRP: Rs.{b['individualTotal']:<6,.0f} -> Bundle: Rs.{b['bundlePrice']:<6,.0f} (-{b['discountPercent']}%) Margin: {b['marginPercent']}%")

    print("\n[OK] Market Basket Apriori Mining completed successfully.")

if __name__ == '__main__':
    main()
