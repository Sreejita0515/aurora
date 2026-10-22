"""
CLI Runner for Smart Pricing Engine (Module C)
Executes deterministic scenario sensitivity analysis and saves predictions to JSON.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pricing_engine import SmartPricingEngine

def main():
    print("=" * 65)
    print("  AURORA SMART PRICING & SENSITIVITY ENGINE (MODULE C)")
    print("=" * 65)
    
    engine = SmartPricingEngine()
    print("1. Loading catalog & historical order records from SQLite...")
    df = engine.fetch_pricing_dataset()
    print(f"   [OK] Loaded {len(df)} active catalog SKUs.")
    
    print("2. Running microeconomic sensitivity & wholesale floor analysis...")
    results = engine.save_artifacts()
    
    summary = results['engineMetadata']['summary']
    print("\n" + "-" * 65)
    print("  ENGINE EXECUTION SUMMARY")
    print("-" * 65)
    print(f"  * Total Catalog SKUs Audited:        {summary['totalProducts']}")
    print(f"  * Actionable Recommendations:        {summary['actionableCount']}")
    print(f"  * Scarcity Surge Opportunities:      {summary['surgeOpportunitiesCount']}")
    print(f"  * Velocity Markdown Clearances:      {summary['markdownOpportunitiesCount']}")
    print(f"  * Projected Monthly Net Profit Lift: Rs. {summary['totalProjectedMonthlyProfitUplift']:,}")
    print(f"  * Wholesale Margin Floor Guarded:    {results['engineMetadata']['parameters']['guaranteedGrossMarginFloorPct']}% (Cost x 1.15)")
    print(f"  * Historical Price Variance Audited: {results['engineMetadata']['dataAudit']['historicalPriceVariance']}% (Transparently Disclosed)")
    print("-" * 65)
    
    print("\nTop 5 Actionable Recommendations:")
    for i, r in enumerate(results['recommendations'][:5], 1):
        delta_str = f"+Rs.{r['priceDelta']:,.0f}" if r['priceDelta'] > 0 else f"-Rs.{abs(r['priceDelta']):,.0f}" if r['priceDelta'] < 0 else "Rs.0"
        profit_str = f"+Rs.{r['monthlyProfitDelta']:,}" if r['monthlyProfitDelta'] >= 0 else f"-Rs.{abs(r['monthlyProfitDelta']):,}"
        print(f"  {i}. {r['name'][:30]:<30} Current: Rs.{r['currentPrice']:<7,.0f} Rec: Rs.{r['recommendedPrice']:<7,.0f} ({delta_str}) Strategy: {r['strategyLabel']} Profit: {profit_str}")
    
    print("\n[OK] Smart Pricing Engine execution completed successfully.")

if __name__ == '__main__':
    main()
