"""
Aurora ML Pipeline — Standalone Demand Forecasting Training & Prediction Runner
CLI Usage:
    python backend/ml/train_demand.py
"""

import os
import sys
import json
from data_loader import get_db_connection, build_daily_product_panel
from demand_forecaster import DemandForecastingEngine

def main():
    print("=" * 70)
    print("  AURORA PREDICTIVE INVENTORY — DEMAND FORECASTING TRAINING PIPELINE")
    print("=" * 70)

    # 1. Connect to database
    db_path = os.path.join(os.path.dirname(__file__), '..', 'aurora.db')
    print(f"\n[1/4] Connecting to SQLite database at: {os.path.abspath(db_path)}")
    conn = get_db_connection(db_path)

    # 2. Extract balanced product-day panel
    print("[2/4] Extracting historical transactions & building daily product panel...")
    panel_df, products_df = build_daily_product_panel(conn)
    print(f"      Panel built: {len(panel_df)} product-day observations across {len(products_df)} SKUs.")
    print(f"      Date range: {panel_df['date'].min().strftime('%Y-%m-%d')} to {panel_df['date'].max().strftime('%Y-%m-%d')} ({panel_df['date'].nunique()} days)")

    # 3. Train & Evaluate with chronological split
    print("\n[3/4] Training Random Forest models & evaluating against recent-average baseline...")
    engine = DemandForecastingEngine()
    eval_results = engine.train_and_evaluate(panel_df)

    split = eval_results['split']
    print(f"      Chronological Split (7d):  Train {split['train_period_7d']} | Test {split['test_period_7d']}")
    print(f"      Chronological Split (30d): Train {split['train_period_30d']} | Test {split['test_period_30d']}")

    print("\n      --- Held-Out Test Set Metrics ---")
    h7 = eval_results['horizon_7d']
    h30 = eval_results['horizon_30d']
    print(f"      [7-Day Horizon]  Baseline MAE: {h7['baseline_mae']} | RF Model MAE: {h7['model_mae']}")
    print(f"                       Baseline RMSE: {h7['baseline_rmse']} | RF Model RMSE: {h7['model_rmse']}")
    print(f"      [30-Day Horizon] Baseline MAE: {h30['baseline_mae']} | RF Model MAE: {h30['model_mae']}")
    print(f"                       Baseline RMSE: {h30['baseline_rmse']} | RF Model RMSE: {h30['model_rmse']}")

    print("\n      Top Predictive Features:")
    for f in eval_results['top_features']:
        print(f"        - {f['feature']}: {f['importance']}")

    # 4. Generate & Save Predictions
    print("\n[4/4] Generating current inventory predictions & safety stock derivations...")
    predictions = engine.generate_current_predictions(panel_df, products_df)

    artifact_path = engine.save_artifacts(predictions)
    print(f"      Artifacts saved successfully to: {os.path.abspath(artifact_path)}")
    print(f"      Model binaries saved to: {os.path.abspath(os.path.join(os.path.dirname(__file__), 'models'))}")

    # Summary table
    print("\n" + "-" * 70)
    print(f"{'SKU Name':<35} | {'Stock':<5} | {'7d Fcst':<7} | {'30d Fcst':<8} | {'ROP':<4} | {'Reorder':<7} | {'Status':<16}")
    print("-" * 70)
    for pid, p in list(predictions.items())[:8]:
        name = p['product_name'][:34]
        status_tag = p['status']
        if p['is_fallback']:
            status_tag += " [FALLBACK]"
        print(f"{name:<35} | {p['stock']:<5} | {p['forecast_7d_units']:<7} | {p['forecast_30d_units']:<8} | {p['reorder_point']:<4} | {p['recommended_reorder_qty']:<7} | {status_tag:<16}")
    print("-" * 70)
    print(f"Total products forecasted: {len(predictions)}. Model Version: {engine.version}")
    print("=" * 70 + "\n")

    conn.close()

if __name__ == '__main__':
    main()
