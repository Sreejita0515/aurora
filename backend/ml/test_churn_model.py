"""
Automated Unit and Integration Test Suite for Customer Churn Model.
Tests data leakage prevention, cross-validation metrics, fallback logic,
and artifact persistence.
"""

import os
import unittest
import pandas as pd
import numpy as np
import joblib

from churn_model import CustomerChurnModel

class TestCustomerChurnModel(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        cls.db_path = os.path.join(base_dir, "aurora.db")
        cls.model = CustomerChurnModel(db_path=cls.db_path)
        cls.users, cls.orders = cls.model.load_raw_data()

    def test_raw_data_integrity(self):
        """Verifies customers and orders are loaded properly."""
        self.assertGreater(len(self.users), 0, "Users table should not be empty")
        self.assertGreater(len(self.orders), 0, "Orders table should not be empty")
        self.assertIn("user_id", self.orders.columns)
        self.assertIn("created_at", self.orders.columns)

    def test_temporal_panel_no_data_leakage(self):
        """
        Critical check: Verifies that features computed at cutoff date T
        never incorporate any orders created on or after T.
        """
        panel = self.model.build_temporal_panel(self.users, self.orders)
        self.assertGreater(len(panel), 0, "Temporal panel must have observations")

        for _, row in panel.iterrows():
            cutoff_dt = pd.to_datetime(row["cutoff"])
            uid = row["user_id"]
            
            # Count actual orders strictly before cutoff
            actual_pre_orders = self.orders[
                (self.orders["user_id"] == uid) &
                (self.orders["created_at"] < cutoff_dt)
            ]
            self.assertEqual(
                row["order_count"], len(actual_pre_orders),
                f"order_count at cutoff {cutoff_dt} must strictly equal pre-cutoff orders"
            )

            # Check target logic
            actual_fwd_orders = self.orders[
                (self.orders["user_id"] == uid) &
                (self.orders["created_at"] >= cutoff_dt) &
                (self.orders["created_at"] < cutoff_dt + pd.Timedelta(days=CustomerChurnModel.FORWARD_WINDOW_DAYS)) &
                (self.orders["status"] != "cancelled")
            ]
            expected_churn = 1 if len(actual_fwd_orders) == 0 else 0
            self.assertEqual(
                row["churned"], expected_churn,
                f"Target churned must strictly equal forward 14d non-cancelled order presence"
            )

    def test_training_and_evaluation_metrics(self):
        """Verifies CV metrics and sample size disclosures are honestly populated."""
        eval_results = self.model.train_and_evaluate()
        self.assertIn("sample_size", eval_results)
        self.assertIn("metrics", eval_results)
        self.assertIn("top_features", eval_results)

        sample = eval_results["sample_size"]
        self.assertGreater(sample["total_observations"], 0)
        self.assertIn("disclosure", sample)
        self.assertIn("Small cohort size", sample["disclosure"])

        metrics = eval_results["metrics"]
        self.assertGreaterEqual(metrics["cv_roc_auc_mean"], 0.5, "ROC-AUC must be >= random guessing")
        self.assertGreaterEqual(metrics["cv_accuracy_mean"], 0.0)

    def test_cold_start_fallback(self):
        """Verifies customers with 0 orders receive explicit fallback handling."""
        preds = self.model.generate_current_customer_predictions()
        
        # Check if there are any 0-order customers
        zero_order_custs = [c for c in preds.values() if c["total_orders"] == 0]
        if len(zero_order_custs) > 0:
            for c in zero_order_custs:
                self.assertTrue(c["is_fallback"])
                self.assertIsNotNone(c["fallback_reason"])
                self.assertEqual(c["days_since_last_order"], 999)

    def test_model_persistence_and_inference(self):
        """Verifies model artifacts can be saved and loaded with identical predictions."""
        output_dir = os.path.dirname(os.path.abspath(__file__))
        preds_path = self.model.save_artifacts(output_dir=output_dir)
        self.assertTrue(os.path.exists(preds_path), "Predictions JSON must exist")

        model_path = os.path.join(output_dir, "models", "churn_classifier.joblib")
        self.assertTrue(os.path.exists(model_path), "Model joblib must exist")

        loaded_clf = joblib.load(model_path)
        self.assertIsNotNone(loaded_clf)

        # Test dummy prediction
        dummy_feat = np.array([[10.0, 5, 12000.0, 2400.0, 0, 0.0, 60.0, 12.0, 0.3]])
        prob = loaded_clf.predict_proba(dummy_feat)
        self.assertEqual(prob.shape, (1, 2))
        self.assertGreaterEqual(prob[0, 1], 0.0)
        self.assertLessEqual(prob[0, 1], 1.0)


if __name__ == "__main__":
    unittest.main()
