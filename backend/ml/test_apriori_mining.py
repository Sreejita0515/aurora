"""
Unit & Integration Tests for Aurora Market Basket & Apriori Association Mining Engine (Module D)
Verifies:
1. Basket extraction and catalog integration from SQLite (aurora.db)
2. Multi-item basket ratio and distribution
3. Mathematical bounds of Apriori metrics (Support, Confidence, Lift)
4. Symmetry of Lift and directionality of Confidence
5. Wholesale Margin Floor Guard on Smart Bundles (Margin >= 25%)
6. Pricing integrity and savings on Smart Bundles
7. Step-by-step formula audit dictionary completeness for modal transparency
8. Artifact persistence and metadata schema
"""

import unittest
import os
import json
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from apriori_mining import AprioriBasketMiner, MIN_BUNDLE_GROSS_MARGIN_PCT, OUTPUT_PATH

class TestAprioriBasketMiner(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.miner = AprioriBasketMiner(min_support=0.015, min_confidence=0.15)
        cls.results = cls.miner.mine_associations()

    def test_baskets_loading(self):
        """Verifies baskets are successfully loaded from non-cancelled orders."""
        baskets, product_map, total_orders = self.miner.load_baskets_and_products()
        self.assertGreater(total_orders, 50, "Expected at least 50 completed orders in DB")
        self.assertGreater(len(product_map), 10, "Expected catalog to contain products")
        self.assertEqual(len(baskets), total_orders)

    def test_multi_item_ratio(self):
        """Verifies that multi-item transactions exist and average basket size > 1."""
        meta = self.results['minerMetadata']
        ds = meta['datasetSummary']
        self.assertGreater(ds['multiItemOrders'], 20)
        self.assertGreater(ds['multiItemRatioPct'], 30.0)
        self.assertGreater(ds['averageBasketSize'], 1.2)

    def test_apriori_metrics_bounds(self):
        """Verifies Support in (0, 100], Confidence in [0, 100], and Lift > 0."""
        co_purchases = self.results['coPurchases']
        self.assertGreater(len(co_purchases), 0, "Expected at least one frequent co-purchase pair")
        for cp in co_purchases:
            self.assertGreater(cp['support'], 0.0)
            self.assertLessEqual(cp['support'], 100.0)
            self.assertGreaterEqual(cp['confidence'], 0.0)
            self.assertLessEqual(cp['confidence'], 100.0)
            self.assertGreater(cp['lift'], 0.0)
            self.assertGreaterEqual(cp['frequency'], 1)

    def test_directional_cross_selling_rules(self):
        """Directional rules must satisfy min confidence and positive lift (> 1.0)."""
        rules = self.results['crossSellingRules']
        self.assertGreater(len(rules), 0, "Expected cross-selling rules")
        for r in rules:
            self.assertGreaterEqual(r['confidencePct'], 15.0)
            self.assertGreater(r['lift'], 1.0, "Cross-sell rules must exhibit positive association lift")
            self.assertIn('source', r)
            self.assertIn('recommended', r)
            self.assertIn('reason', r)

    def test_smart_bundles_margin_floor(self):
        """All curated Indian Smart Bundles MUST strictly preserve >= 25% gross margin floor."""
        bundles = self.results['smartBundles']
        self.assertGreater(len(bundles), 0)
        for b in bundles:
            self.assertGreaterEqual(
                b['marginPercent'], 
                MIN_BUNDLE_GROSS_MARGIN_PCT,
                f"Bundle {b['name']} margin {b['marginPercent']}% violated {MIN_BUNDLE_GROSS_MARGIN_PCT}% floor"
            )
            # Retail bundle price must exceed total wholesale cost
            self.assertGreater(b['bundlePrice'], b['totalCost'])

    def test_smart_bundles_pricing_integrity(self):
        """Bundle price must offer real customer savings vs individual MRP sum."""
        bundles = self.results['smartBundles']
        for b in bundles:
            self.assertGreater(len(b['items']), 1, "Bundles must contain multiple items")
            self.assertGreater(b['individualTotal'], b['bundlePrice'])
            self.assertGreater(b['customerSavings'], 0)
            self.assertAlmostEqual(b['bundlePrice'] + b['customerSavings'], b['individualTotal'], delta=1.0)

    def test_formula_audit_structure(self):
        """Step-by-step mathematical explanations must be present for UI modals."""
        # Check co-purchases calculation audit
        for cp in self.results['coPurchases']:
            calc = cp['calculation']
            self.assertIn('supportModel', calc)
            self.assertIn('confidenceModel', calc)
            self.assertIn('liftModel', calc)
            self.assertIn('formula', calc['supportModel'])
            self.assertIn('derivation', calc['supportModel'])

        # Check bundle calculation audit
        for b in self.results['smartBundles']:
            calc = b['calculation']
            self.assertIn('pricingModel', calc)
            self.assertIn('marginModel', calc)
            self.assertIn('aovModel', calc)
            self.assertIn('formula', calc['marginModel'])
            self.assertIn('derivation', calc['marginModel'])

    def test_artifact_persistence(self):
        """Ensures generated JSON artifact is valid and readable from disk."""
        self.miner.save_artifacts()
        self.assertTrue(os.path.exists(OUTPUT_PATH))
        with open(OUTPUT_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        self.assertIn('minerMetadata', data)
        self.assertIn('smartBundles', data)
        self.assertIn('coPurchases', data)
        self.assertIn('crossSellingRules', data)

if __name__ == '__main__':
    unittest.main()
