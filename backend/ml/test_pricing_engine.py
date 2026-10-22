"""
Unit & Integration Tests for Aurora Smart Pricing Engine (Module C)
Verifies:
1. Data loading from SQLite (aurora.db)
2. Wholesale Cost Floor Guard (Cost × 1.15 = 15% minimum margin)
3. Inventory constraints (no markdowns on critical low-stock SKUs)
4. Microeconomic sensitivity scenario monotonicity
5. Break-even unit threshold derivation
6. Interactive simulation engine & violation flagging
7. Artifact persistence and metadata schema
"""

import unittest
import os
import json
import numpy as np

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pricing_engine import SmartPricingEngine, WHOLESALE_COST_RATIO, MIN_GROSS_MARGIN_MARKUP

class TestSmartPricingEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = SmartPricingEngine()
        cls.results = cls.engine.generate_recommendations()

    def test_catalog_coverage(self):
        """All active catalog products must be evaluated."""
        recs = self.results['recommendations']
        self.assertGreaterEqual(len(recs), 10, "Expected at least 10 products in catalog")
        for r in recs:
            self.assertIn('id', r)
            self.assertIn('name', r)
            self.assertIn('currentPrice', r)
            self.assertIn('recommendedPrice', r)
            self.assertIn('wholesaleCost', r)
            self.assertIn('costFloor', r)
            self.assertIn('scenarios', r)

    def test_wholesale_cost_floor_guard(self):
        """Every recommended price MUST be >= cost floor (guaranteeing >= 15% gross margin)."""
        recs = self.results['recommendations']
        for r in recs:
            expected_floor = round(r['wholesaleCost'] * MIN_GROSS_MARGIN_MARKUP)
            self.assertEqual(r['costFloor'], expected_floor)
            self.assertGreaterEqual(
                r['recommendedPrice'], 
                r['costFloor'],
                f"Product {r['name']} recommended ₹{r['recommendedPrice']} which violates cost floor ₹{r['costFloor']}"
            )
            # Calculation audit must say PASSED
            self.assertEqual(r['calculation']['costFloorGuard']['status'], 'PASSED')

    def test_inventory_constraints_on_markdowns(self):
        """Markdown clearance strategies must never be applied to critical low-stock SKUs."""
        recs = self.results['recommendations']
        for r in recs:
            if r['strategy'] == 'VELOCITY_MARKDOWN':
                self.assertGreater(
                    r['stock'], 
                    15, 
                    f"Product {r['name']} has low stock ({r['stock']}) but was assigned VELOCITY_MARKDOWN"
                )

    def test_sensitivity_scenario_monotonicity(self):
        """
        Under a price increase, projected demand must decrease as elasticity becomes more negative:
        Q(ε = -0.50) >= Q(ε = -1.00) >= Q(ε = -1.50).
        """
        recs = self.results['recommendations']
        surge_recs = [r for r in recs if r['priceDelta'] > 0]
        self.assertGreater(len(surge_recs), 0, "Expected at least one surge price recommendation")
        
        for r in surge_recs:
            sc = r['scenarios']
            q_inelastic = sc['inelastic']['projectedUnits']
            q_unit = sc['unit_elastic']['projectedUnits']
            q_elastic = sc['elastic']['projectedUnits']
            self.assertGreaterEqual(q_inelastic, q_unit, f"Inelastic volume should be >= Unit elastic for {r['name']}")
            self.assertGreaterEqual(q_unit, q_elastic, f"Unit elastic volume should be >= Elastic for {r['name']}")

    def test_breakeven_volume_preserves_profit(self):
        """The break-even unit count at recommended price must achieve >= baseline gross profit."""
        recs = self.results['recommendations']
        for r in recs:
            calc = r['calculation']
            baseline_profit = calc['breakevenAnalysis']['inputs']['baselineProfit']
            new_margin = calc['breakevenAnalysis']['inputs']['newUnitMargin']
            be_units = calc['breakevenAnalysis']['inputs']['breakevenUnits']
            
            if new_margin > 0 and be_units < 9000:
                achieved_profit = be_units * new_margin
                self.assertGreaterEqual(
                    achieved_profit, 
                    baseline_profit - 1, # allow 1 rupee rounding
                    f"Break-even volume {be_units} failed to preserve baseline profit for {r['name']}"
                )

    def test_simulate_price_cost_floor_violation(self):
        """Simulating a price below wholesale cost floor must trigger MARGIN_FLOOR_VIOLATION."""
        recs = self.results['recommendations']
        sample = recs[0]
        low_price = sample['costFloor'] - 500 # strictly below floor
        
        sim = self.engine.simulate_price(sample['id'], low_price)
        self.assertTrue(sim['floorViolated'])
        self.assertEqual(sim['verdict'], 'MARGIN_FLOOR_VIOLATION')
        self.assertEqual(sim['verdictBadge'], 'badge-danger')
        self.assertIn('violates', sim['verdictDescription'])

    def test_simulate_price_surge_expansion(self):
        """Simulating a modest price surge on high-rating product should yield valid scenario deltas."""
        recs = self.results['recommendations']
        sample = recs[0]
        surge_price = sample['currentPrice'] * 1.08 # +8%
        
        sim = self.engine.simulate_price(sample['id'], surge_price)
        self.assertFalse(sim['floorViolated'])
        self.assertIn('scenarios', sim)
        self.assertIn('inelastic', sim['scenarios'])
        self.assertIn('elastic', sim['scenarios'])
        self.assertIn(sim['verdict'], ['OPTIMAL_PROFIT_EXPANSION', 'MARGIN_DILUTION_RISK', 'PROFIT_NEUTRAL', 'STOCKOUT_ACCELERATION_RISK'])

    def test_metadata_and_persistence(self):
        """Artifacts must persist with data audit disclosure and engine version."""
        output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'predictions', 'test_pricing_output.json')
        try:
            self.engine.save_artifacts(output_path)
            self.assertTrue(os.path.exists(output_path))
            with open(output_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self.assertIn('engineMetadata', data)
            self.assertEqual(data['engineMetadata']['engineVersion'], 'pricing_engine_v1.0.0')
            self.assertEqual(data['engineMetadata']['dataAudit']['historicalPriceVariance'], 0.0)
            self.assertIn('Zero historical price variation', data['engineMetadata']['dataAudit']['status'])
        finally:
            if os.path.exists(output_path):
                os.remove(output_path)

if __name__ == '__main__':
    unittest.main()
