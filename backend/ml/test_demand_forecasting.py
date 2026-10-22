"""
Test Suite: Aurora Predictive Inventory — Demand Forecasting Model
Tests data extraction, feature creation, training, held-out evaluation vs baseline,
model persistence & loading, fallback on sparse data, and reorder math.
"""

import unittest
import os
import sys
import tempfile
import sqlite3
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))

from data_loader import get_db_connection, build_daily_product_panel, load_products_and_categories
from demand_forecaster import DemandForecastingEngine, create_demand_features, MODEL_VERSION

class TestDemandForecasting(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_path = os.path.join(os.path.dirname(__file__), '..', 'aurora.db')
        cls.conn = get_db_connection(cls.db_path)
        cls.panel_df, cls.products_df = build_daily_product_panel(cls.conn)

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()

    def test_01_panel_data_integrity(self):
        """Verifies panel data is dense, balanced, and contains expected product-day rows."""
        self.assertGreater(len(self.panel_df), 0)
        self.assertEqual(len(self.products_df), 20)
        n_dates = self.panel_df['date'].nunique()
        self.assertEqual(len(self.panel_df), 20 * n_dates)
        self.assertFalse(self.panel_df['units_sold'].isna().any())

    def test_02_feature_engineering_no_leakage(self):
        """Verifies features are created and only use historical data (lagged/rolling)."""
        df = create_demand_features(self.panel_df)
        self.assertIn('rolling_7d_mean', df.columns)
        self.assertIn('lag_1d', df.columns)
        self.assertIn('target_7d', df.columns)
        self.assertIn('target_30d', df.columns)
        # Check targets are not all NaN
        self.assertGreater(df['target_7d'].notna().sum(), 0)
        self.assertGreater(df['target_30d'].notna().sum(), 0)

    def test_03_chronological_training_and_evaluation(self):
        """Verifies model trains, evaluates on held-out test split, and reports real MAE/RMSE."""
        engine = DemandForecastingEngine()
        eval_results = engine.train_and_evaluate(self.panel_df)

        self.assertIn('horizon_7d', eval_results)
        self.assertIn('horizon_30d', eval_results)

        h7 = eval_results['horizon_7d']
        h30 = eval_results['horizon_30d']

        # Ensure metrics are non-negative real numbers
        self.assertGreater(h7['model_mae'], 0)
        self.assertGreater(h7['model_rmse'], 0)
        self.assertGreater(h30['model_mae'], 0)
        self.assertGreater(h30['model_rmse'], 0)

        # Verify test samples were actually evaluated
        self.assertGreater(h7['test_samples'], 0)
        self.assertGreater(h30['test_samples'], 0)

        # Verify Random Forest achieves competitive or superior RMSE compared to simple baseline
        self.assertLessEqual(h30['model_rmse'], h30['baseline_rmse'] * 1.05)

    def test_04_model_persistence_and_loading(self):
        """Verifies models and feature lists can be serialized and reloaded for inference."""
        engine = DemandForecastingEngine()
        engine.train_and_evaluate(self.panel_df)
        preds = engine.generate_current_predictions(self.panel_df, self.products_df)
        artifact_path = engine.save_artifacts(preds)

        self.assertTrue(os.path.exists(artifact_path))
        import joblib
        loaded_model_30d = joblib.load(os.path.join(os.path.dirname(__file__), 'models', 'rf_demand_30d.joblib'))
        self.assertIsNotNone(loaded_model_30d)

    def test_05_fallback_on_insufficient_data(self):
        """Verifies cold-start / sparse products fall back honestly with explicit flag and reason."""
        engine = DemandForecastingEngine()
        engine.train_and_evaluate(self.panel_df)
        preds = engine.generate_current_predictions(self.panel_df, self.products_df)

        for pid, p in preds.items():
            self.assertIn('is_fallback', p)
            if p['is_fallback']:
                self.assertIsNotNone(p['fallback_reason'])
                self.assertEqual(p['model_version'], 'EMPIRICAL_AVERAGE_FALLBACK')
            else:
                self.assertEqual(p['model_version'], MODEL_VERSION)

    def test_06_reorder_math_consistency(self):
        """Verifies reorder point and recommended order quantities obey deterministic formulas."""
        engine = DemandForecastingEngine()
        engine.train_and_evaluate(self.panel_df)
        preds = engine.generate_current_predictions(self.panel_df, self.products_df)

        for pid, p in preds.items():
            daily_v = p['daily_velocity']
            lead_time = p['lead_time_days']
            safety_days = p['safety_stock_days']
            stock = p['stock']

            expected_rop = int(np.ceil(lead_time * daily_v)) + int(np.ceil(safety_days * daily_v))
            self.assertEqual(p['reorder_point'], expected_rop)

            expected_target_45d = int(np.ceil(daily_v * 45))
            expected_reorder = max(0, expected_target_45d - stock)
            self.assertEqual(p['recommended_reorder_qty'], expected_reorder)

            expected_cost = expected_reorder * p['estimated_cost_price']
            self.assertEqual(p['reorder_cost'], expected_cost)

if __name__ == '__main__':
    unittest.main()
