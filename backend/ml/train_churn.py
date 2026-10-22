"""
CLI Training Runner for Customer Churn Model.
Executes training offline from command line, evaluates with cross-validation,
and saves model binaries and predictions to disk.
"""

import sys
import os
import json
from churn_model import CustomerChurnModel

def main():
    print("=" * 60)
    print(" Aurora AI — Customer Churn & RFM Model Trainer")
    print("=" * 60)

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db_path = os.path.join(base_dir, "aurora.db")

    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        sys.exit(1)

    print(f"Loading customer data from: {db_path}")
    model = CustomerChurnModel(db_path=db_path)

    print("Building longitudinal customer-period panel...")
    print("Training RandomForestClassifier with Stratified 5-Fold Cross-Validation...")
    eval_results = model.train_and_evaluate()

    print("\n--- Model Cross-Validation Metrics ---")
    metrics = eval_results.get("metrics", {})
    sample = eval_results.get("sample_size", {})
    print(f"Total Observations:    {sample.get('total_observations')} ({sample.get('unique_active_customers')} active customers)")
    print(f"Class Distribution:    {sample.get('churned_instances')} churned ({sample.get('churn_rate')*100:.1f}%) | {sample.get('retained_instances')} retained")
    print(f"CV ROC-AUC:            {metrics.get('cv_roc_auc_mean'):.4f}")
    print(f"CV Recall:             {metrics.get('cv_recall_mean'):.4f}")
    print(f"CV Precision:          {metrics.get('cv_precision_mean'):.4f}")
    print(f"CV F1 Score:           {metrics.get('cv_f1_mean'):.4f}")

    print("\n--- Top Predictive Features ---")
    for feat in eval_results.get("top_features", [])[:5]:
        print(f"  {feat['feature']:<25} {feat['importance']*100:.1f}%")

    output_dir = os.path.dirname(os.path.abspath(__file__))
    saved_path = model.save_artifacts(output_dir=output_dir)
    print(f"\nArtifacts successfully written to: {saved_path}")
    print(f"Model Version: {model.VERSION}")
    print("=" * 60)

if __name__ == "__main__":
    main()
